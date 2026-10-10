import { getDb } from "@/lib/db/client";
import type { EntityType } from "@/lib/kb/schema";
import { contentTokens, normalize } from "@/lib/text";
import { getAliasIndex } from "./entities";
import { canonicalizeQuery } from "./glossary";
import type { EntityMatch, EntityRef } from "./types";

/**
 * Entity resolution beyond exact aliases. Decides, for the words of a question, between:
 *   A) a named entity found with high confidence      → nothing to do here (alias match);
 *   B) a near-miss name (typo)                         → `corrections` (resolved, but reported to the user);
 *   C) a name the user gives that the KB does not have → `unresolved` (+ similar names when there are some);
 *   D) a generic noun with several plausible referents → `ambiguous` (ask instead of choosing silently).
 * "Not found" always means "not in this knowledge base", never "does not exist in the game".
 */

const TYPE_NOUNS: Array<{ re: RegExp; type: EntityType; label: { pt: string; en: string }; byContent: boolean }> = [
  { re: /\b(missao|missoes|missions?)\b/, type: "mission", label: { pt: "uma missão", en: "a mission" }, byContent: false },
  { re: /\b(personagem|personagens|characters?)\b/, type: "character", label: { pt: "um personagem", en: "a character" }, byContent: false },
  { re: /\b(easter eggs?|segredos?|secrets?)\b/, type: "easter_egg", label: { pt: "um easter egg", en: "an easter egg" }, byContent: true },
  { re: /\b(veiculos?|vehicles?)\b/, type: "vehicle", label: { pt: "um veículo", en: "a vehicle" }, byContent: false },
  { re: /\b(armas?|weapons?)\b/, type: "weapon", label: { pt: "uma arma", en: "a weapon" }, byContent: false },
  { re: /\b(heists?|assaltos?)\b/, type: "heist", label: { pt: "um assalto", en: "a heist" }, byContent: false },
  { re: /\b(random events?)\b/, type: "random_event", label: { pt: "um random event", en: "a random event" }, byContent: false },
];

/** Words that end a name span ("missão X com o Trevor", "egg do dragão no Mount Josiah"). */
const SPAN_END = new Set(("com with no na nos nas em in on at para pra for e and ou or onde where como how que that quando when se if por depois after antes before " +
  "existe existem exists exist is sao are tem has funciona works aparece appears fica fico acontece happens comeca starts posso pode podem consigo can i does").split(" "));
/** Leading connectors inside a span ("do dragão", "called X"). */
const SPAN_LEAD = new Set("do da dos das de of the o a os as chamad chamada chamado called named um uma an".split(" "));
/** Words that describe WHICH one rather than naming it ("a primeira missão", "missão do Trevor"). */
const NOT_A_NAME = new Set(("primeira primeiro first ultima ultimo last proxima proximo next seguinte anterior previous final principal main " +
  "mais most melhor best facil easy dificil hard dele dela his her sua seu this that essa esse esta este qual which quais " +
  "assalto assaltos heist golpe historia story secundaria side extra extras opcional optional pode podem posso can").split(" "));

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] as number;
      prev[j] = Math.min((prev[j] as number) + 1, (prev[j - 1] as number) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length] as number;
}
/** 0..1 similarity; a leading "the " on either side is ignored ("paleto scor" ≈ "the paleto score"). */
export function nameSimilarity(a: string, b: string): number {
  const strip = (s: string) => s.replace(/^the /, "");
  const x = strip(a);
  const y = strip(b);
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length, 1);
}

function covered(start: number, end: number, matches: EntityMatch[]): boolean {
  return matches.some((m) => m.start < end && m.end > start);
}

interface Resolution {
  unresolved: Array<{ span: string; type: string; typeLabel: { pt: string; en: string }; suggestions: EntityRef[] }>;
  corrections: Array<{ from: string; to: EntityRef }>;
  ambiguous?: { noun: string; candidates: EntityRef[] };
  places?: EntityRef[];
  /** The one referent a generic noun names in a place the user named (D'). */
  referents: EntityRef[];
}

/**
 * Name spans introduced by a type noun: "missão Operação Tempestade do Deserto", "easter egg do dragão". `proper` says
 * the span is written as a name (a capitalised word in the user's text, "chamada X" / "called X", or — for secrets —
 * "do X" / "of X"); only such spans may be reported as "not found". Lower-case spans ("cada personagem ganha…",
 * "essa missão não apareceu") are ordinary words and can at most be a confident typo correction.
 */
function typedSpans(query: string, n: string, matches: EntityMatch[]): Array<{ span: string; type: (typeof TYPE_NOUNS)[number]; start: number; end: number; proper: boolean }> {
  const tokens = n.split(" ");
  // Per normalised token: written capitalised (not as the first word of a sentence), and whether a sentence or clause
  // ends after it ("Essa missão não apareceu. O que faço?" — "O" starts a sentence, it is not a name).
  const caps: boolean[] = [];
  const ends: boolean[] = [];
  let sentenceStart = true;
  for (const w of query.split(/\s+/)) {
    const parts = normalize(w).split(" ").filter(Boolean);
    parts.forEach((_t, k) => {
      caps.push(/^[A-ZÀ-Ý]/.test(w) && !sentenceStart);
      ends.push(k === parts.length - 1 && /[.?!,;:]$/.test(w));
    });
    if (parts.length) sentenceStart = /[.?!]$/.test(w);
  }
  const out: Array<{ span: string; type: (typeof TYPE_NOUNS)[number]; start: number; end: number; proper: boolean }> = [];
  for (const t of TYPE_NOUNS) {
    const m = t.re.exec(n);
    if (!m) continue;
    const nounEnd = n.slice(0, m.index + m[0].length).split(" ").length;
    let i = nounEnd;
    let named = false;
    let of = false;
    while (i < tokens.length && SPAN_LEAD.has((tokens[i] as string).replace(/s$/, "")) ) {
      if (/^(chamad|called|named)/.test(tokens[i] as string)) named = true;
      if (/^(do|da|dos|das|of)$/.test(tokens[i] as string)) of = true;
      i++;
    }
    const start = i;
    while (i < tokens.length && i - start < 6 && !SPAN_END.has(tokens[i] as string)) {
      i++;
      if (ends[i - 1]) break;
    }
    const words = tokens.slice(start, i).filter((w) => w.length > 1);
    if (!words.length || words.every((w) => NOT_A_NAME.has(w) || /^\d+$/.test(w))) continue;
    // The capitalised word must be in the part no other entity explains ("uses the Duster": Duster is the vehicle).
    const free = (k: number) => !matches.some((m) => k >= m.start && k < m.end);
    const capitalised = caps.length === tokens.length && start > 0 && Array.from({ length: i - start }, (_, k) => start + k).some((k) => caps[k] && free(k));
    out.push({ span: words.join(" "), type: t, start, end: i, proper: capitalised || named || (t.byContent && of) });
  }
  return out;
}

/**
 * Resolves the words of a question that no alias matched. `matches` are the alias matches over the normalised
 * ORIGINAL question (token positions refer to it); `entities` are all entities already resolved.
 */
export async function resolveMentions(query: string, matches: EntityMatch[], entities: readonly EntityRef[]): Promise<Resolution> {
  const n = normalize(query);
  const tokens = n.split(" ");
  const index = await getAliasIndex();
  const db = await getDb();
  const res: Resolution = { unresolved: [], corrections: [], referents: [] };
  const aliasesOfType = (type: string) => [...index.byAlias.entries()].flatMap(([alias, refs]) => refs.filter((r) => r.type === type && !r.onlineOnly).map((r) => ({ alias, ref: r })));

  // C/B — typed mentions ("missão X") that no alias resolved.
  for (const s of typedSpans(query, n, matches)) {
    // Only a match of the kind the noun names settles the span ("missão Paleto Scor": "paleto" → the town does not).
    const sameKind = matches.filter((m) => m.refs.some((r) => r.type === s.type.type || (s.type.type === "heist" && r.type === "mission")));
    if (covered(s.start, s.end, sameKind)) continue;
    // Entirely made of other entities ("missões do Lester"): a constraint on the noun, not an unknown name.
    if (Array.from({ length: s.end - s.start }, (_, k) => s.start + k).every((i) => matches.some((m) => i >= m.start && i < m.end) || SPAN_LEAD.has(tokens[i] as string))) continue;
    if (entities.some((e) => e.type === s.type.type)) continue;
    // What is left once other entities and kind nouns are removed ("missão Hood Safari" → nothing): no unknown name.
    const KIND_WORDS = /^(missao|missoes|mission|missions|personagem|character|veiculo|vehicle|arma|weapon|assalto|heist|evento|event|local|place)$/;
    const leftover = Array.from({ length: s.end - s.start }, (_, k) => s.start + k)
      .filter((i) => !matches.some((m) => i >= m.start && i < m.end) && !SPAN_LEAD.has(tokens[i] as string) && !KIND_WORDS.test(tokens[i] as string));
    if (!leftover.length) continue;
    const terms = contentTokens(canonicalizeQuery(s.span)).filter((t) => t.length >= 3);
    if (!terms.length) continue;
    // Present in the KB under another wording (name or, for secrets, the description)? One name containing every
    // word of the span is that entity ("missão Fair" → Fair Game); several, or a description hit, are left to retrieval.
    const col = s.type.byContent ? "lower(e.name || ' ' || e.summary)" : "lower(e.name)";
    const found = await db.query<{ id: string; type: EntityType; name: string; spoiler_level: number; in_name: boolean }>(
      `select e.id, e.type, e.name, e.spoiler_level, ${terms.map((_, i) => `lower(e.name) like $${i + 2}`).join(" and ")} as in_name
         from entities e where e.type = $1 and e.online_only = false and ${terms.map((_, i) => `${col} like $${i + 2}`).join(" and ")} limit 6`,
      [s.type.type, ...terms.map((t) => `%${t}%`)]);
    // Several names contain the words ("The Paleto Score", "Paleto Score Setup"): the closest one wins if clearly closest.
    const named = found.filter((f) => f.in_name).map((f) => ({ ...f, sim: nameSimilarity(normalize(s.span), normalize(f.name)) })).sort((a, b) => b.sim - a.sim);
    const top = named[0];
    if (top && (named.length === 1 || (top.sim >= 0.8 && top.sim - (named[1]?.sim ?? 0) >= 0.1))) {
      const f = top;
      res.corrections.push({ from: s.span, to: { id: f.id, type: f.type, name: f.name, onlineOnly: false, spoilerLevel: f.spoiler_level } });
      continue;
    }
    // Equally good names ("Exercising Demons - Franklin / - Michael / - Trevor"): ask which one.
    if (named.length >= 2 && !res.ambiguous && s.proper) {
      res.ambiguous = { noun: s.span, candidates: named.map((f) => ({ id: f.id, type: f.type, name: f.name, onlineOnly: false, spoilerLevel: f.spoiler_level })) };
      continue;
    }
    if (found.length) continue;
    const scored = aliasesOfType(s.type.type)
      .map((a) => ({ ref: a.ref, sim: nameSimilarity(s.span, a.alias) }))
      .sort((a, b) => b.sim - a.sim);
    const best = scored[0];
    const second = scored.find((x) => x.ref.id !== best?.ref.id);
    if (best && best.sim >= 0.82 && (!second || second.sim < best.sim - 0.08)) {
      res.corrections.push({ from: s.span, to: best.ref });
      continue;
    }
    if (!s.proper) continue;
    const suggestions: EntityRef[] = [];
    for (const x of scored) if (x.sim >= 0.55 && !suggestions.some((r) => r.id === x.ref.id) && suggestions.length < 3) suggestions.push(x.ref);
    res.unresolved.push({ span: s.span, type: s.type.type, typeLabel: s.type.label, suggestions });
  }

  // B — untyped near-miss names when nothing was resolved at all ("Onde fica o Vanila Unicorn?").
  if (!entities.length && !res.corrections.length && !res.unresolved.length) {
    const free = tokens.map((t, i) => ({ t, i })).filter(({ i }) => !matches.some((m) => i >= m.start && i < m.end));
    const all = [...index.byAlias.entries()].filter(([alias]) => alias.length >= 8);
    let best: { from: string; ref: EntityRef; sim: number } | undefined;
    for (let len = 3; len >= 1; len--) {
      for (let k = 0; k + len <= free.length; k++) {
        const win = free.slice(k, k + len);
        if (win.some((w, j) => j > 0 && w.i !== (win[j - 1] as { i: number }).i + 1)) continue;
        const phrase = win.map((w) => w.t).join(" ");
        if (phrase.length < 8) continue;
        for (const [alias, refs] of all) {
          if (Math.abs(alias.length - phrase.length) > 2) continue;
          const sim = nameSimilarity(phrase, alias);
          const ref = refs.find((r) => !r.onlineOnly);
          if (ref && sim >= 0.86 && sim < 1 && (!best || sim > best.sim)) best = { from: phrase, ref, sim };
        }
      }
    }
    if (best) res.corrections.push({ from: best.from, to: best.ref });
  }

  // Place families: a word that is not itself a place but names several ("em Vinewood" → East/West/Downtown Vinewood,
  // Vinewood Hills). Only when no place was resolved, so "Vinewood Hills" stays one place.
  if (!entities.some((e) => e.type === "location")) {
    const free = tokens.filter((t, i) => t.length >= 5 && !matches.some((m) => i >= m.start && i < m.end) && !/^\d+$/.test(t));
    for (const word of free) {
      const rows = await db.query<{ id: string; name: string; spoiler_level: number }>(
        "select e.id, e.name, e.spoiler_level from entities e where e.type = 'location' and e.online_only = false and lower(e.name) ~ $1 order by e.name limit 9",
        [String.raw`\m${word}\M`]);
      if (rows.length >= 2 && rows.length <= 8) {
        res.places = rows.map((r) => ({ id: r.id, type: "location" as EntityType, name: r.name, onlineOnly: false, spoilerLevel: r.spoiler_level }));
        break;
      }
    }
  }

  // D' — a generic noun tied to a place the user named ("o fantasma do Mount Gordo"): the one referent in that place.
  const placeNamed = entities.filter((e) => e.type === "location");
  if (placeNamed.length && !res.corrections.length) {
    const c = canonicalizeQuery(query);
    for (const r of REFERENTS) {
      if (!r.re.test(c) || !r.words.length) continue;
      const rows = await db.query<{ id: string; type: EntityType; name: string; spoiler_level: number }>(
        `select e.id, e.type, e.name, e.spoiler_level from entities e where e.type = $1 and e.online_only = false
           and (${r.words.map((_, i) => `lower(e.name) ~ $${i + 3}`).join(" or ")})
           and (lower(e.name || ' ' || e.summary) like any($2::text[]) or exists (select 1 from relationships x where x.from_id = e.id and x.to_id = any($${r.words.length + 3}::text[])))
         limit 3`,
        [r.type, placeNamed.map((p) => `%${p.name.toLowerCase()}%`), ...r.words.map((w) => String.raw`\m${w}\M`), placeNamed.map((p) => p.id)]);
      if (rows.length === 1) {
        const x = rows[0] as (typeof rows)[number];
        res.referents.push({ id: x.id, type: x.type, name: x.name, onlineOnly: false, spoilerLevel: x.spoiler_level });
      }
      break;
    }
  }

  // D — a generic noun used as if it named one thing ("onde fica a casa?", "como faço o assalto?").
  if (!entities.length && !res.corrections.length && !res.unresolved.length && contentTokens(n).length <= 5) {
    const c = canonicalizeQuery(query);
    for (const r of REFERENTS) {
      if (!r.re.test(c)) continue;
      // Whole words only: "house" must not match "Lighthouse".
      const like = r.words.length ? `and (${r.words.map((_, i) => `lower(e.name) ~ $${i + 2}`).join(" or ")})` : "";
      const rows = await db.query<{ id: string; type: EntityType; name: string; spoiler_level: number }>(
        `select e.id, e.type, e.name, e.spoiler_level from entities e where e.type = $1 and e.online_only = false and e.name not ilike '%overview%' ${like} order by e.name limit 9`,
        [r.type, ...r.words.map((w) => String.raw`\m${w}\M`)]);
      const refs: EntityRef[] = rows.map((x) => ({ id: x.id, type: x.type, name: x.name, onlineOnly: false, spoilerLevel: x.spoiler_level }));
      if (refs.length === 1) res.corrections.push({ from: r.noun, to: refs[0] as EntityRef });
      else if (refs.length >= 2 && refs.length <= 8) res.ambiguous = { noun: r.noun, candidates: refs };
      break;
    }
  }
  return res;
}

/** Generic nouns that users treat as names, with the entity kind and name words that make a candidate plausible. */
const REFERENTS: Array<{ re: RegExp; noun: string; type: EntityType; words: string[] }> = [
  { re: /\b(a|da|na|the|my) (casa|house|safehouse)\b/, noun: "casa / house", type: "location", words: ["house", "safehouse"] },
  { re: /\b(o|do|no|the) (banco|bank)\b/, noun: "banco / bank", type: "location", words: ["bank", "depository"] },
  { re: /\b(o|do|no|the) (assalto|golpe|heist)\b/, noun: "assalto / heist", type: "heist", words: [] },
  { re: /\b(o|do|the) ghost\b/, noun: "fantasma / ghost", type: "easter_egg", words: ["ghost"] },
  { re: /\b(a|da|the) (peca|part|piece)\b/, noun: "peça / part", type: "collectible", words: ["parts", "pieces"] },
];
