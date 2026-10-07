import type { Db } from "@/lib/db/client";
import type { EntityType } from "@/lib/kb/schema";
import { gameToMap } from "@/lib/map/projection";
import { PROTAGONIST_HOMES, PROTAGONIST_IDS, type Goal, type Plan, type Protagonist } from "./planner";
import type { Candidate, CardData, Lang } from "./types";

/**
 * Structured executors for planned questions. Each returns:
 *  - candidates: evidence blocks (one per source) that go through the normal rerank → context → citation path;
 *  - cards: structured UI (item lists, relationship, completion checklist, map with markers);
 *  - answer: a deterministic, cited answer when the question is a pure lookup (no LLM needed).
 * Every row keeps its own provenance (source id + URL from the `evidence` table).
 */
export interface ExecResult {
  candidates: Candidate[];
  cards: CardData[];
  /** Deterministic answer lines; `[S1]`-style markers refer to `candidates` order. */
  answer?: string[];
  focus: string[];
}

interface SourceInfo { source_id: string; url: string; title: string | null; name: string; authority: number; source_type: string }

const EMPTY: ExecResult = { candidates: [], cards: [], focus: [] };
let synthetic = 1000;

function block(entityId: string, entityType: EntityType, entityName: string, content: string, src: SourceInfo, verification = "curated", confidence = 0.75): Candidate {
  return {
    chunkId: -(synthetic++), entityId, entityType, entityName, contentType: "list", content,
    sourceId: src.source_id, sourceName: src.name, sourceType: src.source_type, sourceUrl: src.url, authority: src.authority,
    confidence, verification, spoilerLevel: 0, versions: [], semantic: 0, keyword: 0, entityScore: 1, via: ["entity"], score: 0,
  };
}

/** First evidence row (primary source) for each entity id. */
async function sourcesOf(db: Db, ids: string[]): Promise<Map<string, SourceInfo>> {
  if (!ids.length) return new Map();
  const rows = await db.query<SourceInfo & { entity_id: string }>(
    `select distinct on (ev.entity_id) ev.entity_id, ev.source_id, ev.url, ev.title, s.name, s.authority, s.source_type
       from evidence ev join sources s on s.id = ev.source_id where ev.entity_id = any($1::text[]) order by ev.entity_id, ev.id`, [ids]);
  return new Map(rows.map((r) => [r.entity_id, r]));
}

/** Groups rows by their source so each evidence block cites exactly one source. */
function bySource<T extends { entity_id: string }>(rows: T[], srcs: Map<string, SourceInfo>): Array<{ src: SourceInfo; rows: T[] }> {
  const groups = new Map<string, { src: SourceInfo; rows: T[] }>();
  for (const r of rows) {
    const s = srcs.get(r.entity_id);
    if (!s) continue;
    const g = groups.get(s.url) ?? { src: s, rows: [] };
    g.rows.push(r);
    groups.set(s.url, g);
  }
  return [...groups.values()];
}

async function anchorPoint(db: Db, plan: Plan): Promise<{ x: number; y: number; label: string; precision: string } | undefined> {
  const ids = plan.area ? [plan.area.id] : plan.protagonist ? PROTAGONIST_HOMES[plan.protagonist] : [];
  for (const id of ids) {
    const r = (await db.query<{ game_x: number | null; game_y: number | null; precision: string; name: string }>(
      "select g.game_x, g.game_y, g.precision, e.name from geo_points g join entities e on e.id = g.entity_id where g.entity_id = $1", [id]))[0];
    if (r?.game_x != null && r.game_y != null) return { x: r.game_x, y: r.game_y, label: r.name, precision: r.precision };
  }
  return undefined;
}

interface ItemRow {
  entity_id: string; name: string; number: number | null; area: string | null; region: string | null; summary: string;
  game_x: number | null; game_y: number | null; game_z: number | null; precision: string | null; d?: number; position_only: boolean;
}

const ITEM_SELECT = `
  select ci.entity_id, e.name, ci.number, ci.area, ci.region, e.summary, g.game_x, g.game_y, g.game_z, g.precision,
         coalesce((ci.details->>'position_only')::boolean, false) as position_only
    from collectible_items ci join entities e on e.id = ci.entity_id left join geo_points g on g.entity_id = ci.entity_id`;

function fmtItem(r: ItemRow, lang: Lang): string {
  const where = [r.area, r.region].filter(Boolean).join(", ");
  const coords = r.game_x != null && r.game_y != null ? ` (x ${r.game_x.toFixed(0)}, y ${r.game_y.toFixed(0)}${r.game_z != null ? `, z ${r.game_z.toFixed(0)}` : ""})` : "";
  const dist = r.d != null ? ` — ${Math.round(r.d)} m` : "";
  const noText = r.position_only || /No written description is available/.test(r.summary);
  const desc = noText
    ? (lang === "pt" ? "Sem descrição escrita na base — apenas a coordenada (numeração do dataset comunitário, não oficial)." : "No written description in the KB — coordinate only (community dataset numbering, not official).")
    : r.summary.replace(/^[^:]+:\s*/, "");
  return `${r.name}${dist}: ${where}${coords}. ${desc}`;
}

function markersOf(rows: ItemRow[]): Array<{ id: string; name: string; mapX: number; mapY: number }> {
  return rows.filter((r) => r.game_x != null && r.game_y != null).slice(0, 25).map((r) => {
    const m = gameToMap(r.game_x as number, r.game_y as number);
    return { id: r.entity_id, name: r.name, mapX: m.x, mapY: m.y };
  });
}

function mapOf(title: string, rows: ItemRow[], anchor?: { x: number; y: number; label: string }): CardData | undefined {
  const markers = markersOf(rows);
  if (!markers.length) return undefined;
  const center = anchor ? gameToMap(anchor.x, anchor.y) : { x: markers[0]?.mapX ?? 0.5, y: markers[0]?.mapY ?? 0.5 };
  const all = anchor ? [{ id: "anchor", name: anchor.label, mapX: center.x, mapY: center.y }, ...markers] : markers;
  return { kind: "map", entityId: rows[0]?.entity_id ?? "map", name: title, mapX: center.x, mapY: center.y, precision: "community", markers: all };
}

function itemsCard(title: string, rows: ItemRow[], note?: string): CardData {
  return {
    kind: "items", title, note,
    rows: rows.slice(0, 50).map((r) => ({ id: r.entity_id, label: r.name, area: [r.area, r.region].filter(Boolean).join(", "), detail: r.position_only ? "" : r.summary.replace(/^[^:]+:\s*/, ""), precision: r.precision ?? "area", distance: r.d != null ? Math.round(r.d) : undefined })),
  };
}

async function evidenceBlocks(db: Db, rows: ItemRow[], header: string, lang: Lang, entityId: string, entityName: string): Promise<Candidate[]> {
  const srcs = await sourcesOf(db, rows.map((r) => r.entity_id));
  return bySource(rows, srcs).map((g) => block(entityId, "collectible", entityName, `${header}\n${g.rows.map((r) => `- ${fmtItem(r, lang)}`).join("\n")}`, g.src));
}

/* ───────────── goals ───────────── */

async function nearest(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  const cat = plan.category;
  if (!cat) return EMPTY;
  const anchor = await anchorPoint(db, plan);
  if (!anchor) return EMPTY;
  const withCoords = await db.query<ItemRow>(
    `${ITEM_SELECT} where ci.category_id = $1 and g.game_x is not null
      order by sqrt(power(g.game_x - $2, 2) + power(g.game_y - $3, 2)) limit $4`, [cat.id, anchor.x, anchor.y, plan.limit]);
  let rows = withCoords.map((r) => ({ ...r, d: Math.hypot((r.game_x as number) - anchor.x, (r.game_y as number) - anchor.y) }));
  let precisionNote = lang === "pt"
    ? "Distâncias em linha reta calculadas a partir de coordenadas medidas pela comunidade (dataset esx_collectables) e de um ponto de referência aproximado."
    : "Straight-line distances computed from community-measured coordinates (esx_collectables dataset) and an approximate reference point.";
  if (!rows.length) {
    // Category without coordinates: rank by the approximate centre of each item's named area.
    const areaRows = await db.query<ItemRow & { ax: number; ay: number }>(
      `select ci.entity_id, e.name, ci.number, ci.area, ci.region, e.summary, null::real as game_x, null::real as game_y, null::real as game_z, 'area' as precision, false as position_only,
              ag.game_x as ax, ag.game_y as ay
         from collectible_items ci join entities e on e.id = ci.entity_id
         join relationships r on r.from_id = ci.entity_id and r.predicate = 'located_in'
         join geo_points ag on ag.entity_id = r.to_id and ag.game_x is not null
        where ci.category_id = $1
        order by sqrt(power(ag.game_x - $2, 2) + power(ag.game_y - $3, 2)) limit $4`, [cat.id, anchor.x, anchor.y, plan.limit]);
    rows = areaRows.map((r) => ({ ...r, d: Math.hypot(r.ax - anchor.x, r.ay - anchor.y) }));
    precisionNote = lang === "pt"
      ? "Não há coordenadas individuais para esta categoria na base: a ordem usa o centro aproximado da área de cada item."
      : "There are no per-item coordinates for this category in the knowledge base: the order uses the approximate centre of each item's area.";
  }
  if (!rows.length) return EMPTY;
  const title = lang === "pt" ? `${cat.name}: ${rows.length} mais próximos de ${anchor.label}` : `${cat.name}: ${rows.length} closest to ${anchor.label}`;
  const header = `${title}. ${precisionNote}`;
  const candidates = await evidenceBlocks(db, rows, header, lang, cat.id, cat.name);
  const cards = [itemsCard(title, rows, precisionNote), mapOf(title, rows, anchor)].filter(Boolean) as CardData[];
  const answer = [`**${title}**`, ...rows.map((r, i) => `${i + 1}. ${fmtItem(r, lang)} [S${candidates.findIndex((c) => c.content.includes(r.name)) + 1}]`), "", `_${precisionNote}_`];
  return { candidates, cards, answer, focus: [cat.id, ...rows.slice(0, 2).map((r) => r.entity_id)] };
}

async function inArea(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  const cat = plan.category;
  const area = plan.area;
  if (!cat || !area) return EMPTY;
  const rows = await db.query<ItemRow>(
    `${ITEM_SELECT} where ci.category_id = $1 and (lower(ci.area) = lower($2) or exists (select 1 from relationships r where r.from_id = ci.entity_id and r.predicate = 'located_in' and r.to_id = $3))
      order by ci.number nulls last, e.name`, [cat.id, area.name, area.id]);
  const title = lang === "pt" ? `${cat.name} em ${area.name}` : `${cat.name} in ${area.name}`;
  if (!rows.length) {
    return { ...EMPTY, answer: [lang === "pt" ? `Não encontrei ${cat.name} registrados em ${area.name} na base de conhecimento.` : `I found no ${cat.name} recorded in ${area.name} in the knowledge base.`], focus: [cat.id] };
  }
  const candidates = await evidenceBlocks(db, rows, `${title} (${rows.length}):`, lang, cat.id, cat.name);
  const cards = [itemsCard(title, rows), mapOf(title, rows)].filter(Boolean) as CardData[];
  const answer = [`**${title} (${rows.length})**`, ...rows.map((r) => `- ${fmtItem(r, lang)} [S${candidates.findIndex((c) => c.content.includes(r.name)) + 1}]`)];
  return { candidates, cards, answer, focus: [cat.id, area.id] };
}

async function listItems(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  const cat = plan.category;
  if (!cat) return EMPTY;
  const rows = await db.query<ItemRow>(`${ITEM_SELECT} where ci.category_id = $1 order by position_only, ci.number nulls last, e.name`, [cat.id]);
  if (!rows.length) return EMPTY;
  const described = rows.filter((r) => !r.position_only);
  const positions = rows.filter((r) => r.position_only);
  const total = (await db.query<{ total: number | null; counts_for_100: boolean | null; details: Record<string, unknown> }>("select total, counts_for_100, details from collectibles where entity_id = $1", [cat.id]))[0];
  const title = lang === "pt" ? `${cat.name}: ${described.length || rows.length} itens na base` : `${cat.name}: ${described.length || rows.length} items in the knowledge base`;
  const note = [
    total?.total ? (lang === "pt" ? `Total do jogo segundo a base: ${total.total}.` : `Game total according to the KB: ${total.total}.`) : "",
    positions.length && described.length ? (lang === "pt" ? `${positions.length} posições comunitárias adicionais não puderam ser associadas a uma descrição com segurança.` : `${positions.length} additional community positions could not be safely matched to a description.`) : "",
  ].filter(Boolean).join(" ");
  const shown = described.length ? described : rows;
  const candidates = await evidenceBlocks(db, shown, `${title}. ${note}`, lang, cat.id, cat.name);
  const cards = [itemsCard(title, shown, note), mapOf(title, rows)].filter(Boolean) as CardData[];
  const answer = [`**${title}**`, note ? `_${note}_` : "", ...shown.map((r) => `- ${fmtItem(r, lang)} [S${candidates.findIndex((c) => c.content.includes(r.name)) + 1}]`)].filter(Boolean);
  return { candidates, cards, answer, focus: [cat.id] };
}

async function itemLookup(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  const rows = plan.item
    ? await db.query<ItemRow>(`${ITEM_SELECT} where ci.entity_id = $1`, [plan.item.id])
    : plan.category ? await db.query<ItemRow>(`${ITEM_SELECT} where ci.category_id = $1 and ci.number = $2`, [plan.category.id, plan.limit]) : [];
  const r = rows[0];
  if (!r) return EMPTY;
  const candidates = await evidenceBlocks(db, [r], r.name, lang, r.entity_id, r.name);
  // All evidence rows for this item (description source and coordinate source cite separately).
  const ev = await db.query<SourceInfo & { entity_id: string; section: string }>(
    "select ev.entity_id, ev.section, ev.source_id, ev.url, ev.title, s.name, s.authority, s.source_type from evidence ev join sources s on s.id = ev.source_id where ev.entity_id = $1 order by ev.id", [r.entity_id]);
  for (const e of ev.slice(1)) candidates.push(block(r.entity_id, "collectible_item", r.name, `${r.name}: ${e.source_id === "esx-collectables" ? `in-game coordinates x ${r.game_x?.toFixed(1)}, y ${r.game_y?.toFixed(1)}, z ${r.game_z?.toFixed(1)} (community-measured)` : r.summary}`, e));
  const answer = [`**${r.name}**`, `${fmtItem(r, lang)} [S1]${candidates.length > 1 ? " [S2]" : ""}`];
  if (r.precision === "community") answer.push(lang === "pt" ? "_Coordenadas medidas pela comunidade; o pareamento descrição↔coordenada é automático e não verificado de forma independente._" : "_Community-measured coordinates; the description↔coordinate pairing is automatic and not independently verified._");
  return { candidates, cards: [itemsCard(r.name, [r]), mapOf(r.name, [r])].filter(Boolean) as CardData[], answer, focus: [r.entity_id] };
}

async function romance(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  const pt = lang === "pt";
  const rows = await db.query<{ from_id: string; to_id: string; name: string; summary: string; props: Record<string, unknown>; status: string; home: string | null }>(
    `select r.from_id, r.to_id, e.name, e.summary, r.props, r.knowledge_status as status, c.details->>'home' as home
       from relationships r join entities e on e.id = r.from_id left join characters c on c.entity_id = e.id
      where r.predicate = 'hookup_with' order by e.name`);
  const target = plan.protagonist ? PROTAGONIST_IDS[plan.protagonist] : undefined;
  const srcs = await sourcesOf(db, [...new Set(rows.map((r) => r.from_id))]);
  const who = (id: string) => (Object.entries(PROTAGONIST_IDS) as Array<[Protagonist, string]>).find(([, v]) => v === id)?.[0] ?? id;
  const people = new Map<string, { name: string; summary: string; home: string | null; with: string[]; evidence: string; kind: string }>();
  for (const r of rows) {
    const p = people.get(r.from_id) ?? { name: r.name, summary: r.summary, home: r.home, with: [], evidence: String(r.props.evidence ?? ""), kind: String(r.props.kind ?? "relationship") };
    p.with.push(who(r.to_id));
    people.set(r.from_id, p);
  }
  const candidates: Candidate[] = [];
  const lines: string[] = [];
  const cite = () => `[S${candidates.length}]`;

  // 1. People with an explicit booty-call relationship on their own page.
  for (const [id, p] of people) {
    const src = srcs.get(id);
    if (!src) continue;
    const met = await db.query<{ name: string; summary: string; type: string }>(
      "select e.name, e.summary, e.type from relationships r join entities e on e.id = r.to_id where r.from_id = $1 and r.predicate = 'appears_in'", [id]);
    candidates.push(block(id, "character", p.name,
      `${p.name} — ${p.kind}; protagonists who can meet her/him: ${p.with.join(", ")}.${p.home ? ` Home: ${p.home}.` : ""}${met.length ? ` Met in: ${met.map((m) => `${m.name} (${m.summary.slice(0, 160)})`).join("; ")}.` : ""} Evidence: ${p.evidence}`, src));
    const forTarget = !plan.protagonist || p.with.includes(plan.protagonist);
    // The "take home → phone number" step is stated only when this character's own evidence says it.
    const she = /\b(she|her)\b/i.test(p.evidence);
    const phone = /home/i.test(p.evidence) && /phone number/i.test(p.evidence);
    lines.push(pt
      ? `- **${p.name}** — *booty call* (encontro casual), não namoro. Só ${p.with.join(" ou ")} pode ${she ? "conhecê-la" : "conhecer essa pessoa"}${met.length ? ` (no encontro aleatório ${met.map((m) => m.name).join(", ")})` : ""}${phone ? `; depois de ${she ? "levá-la" : "levar a pessoa"} para casa, ${she ? "ela" : "a pessoa"} passa o telefone e pode ser chamada como booty call` : ""}.${p.home ? ` Mora: ${p.home}.` : ""}${forTarget ? "" : ` _(não disponível para ${plan.protagonist})_`} ${cite()}`
      : `- **${p.name}** — a *booty call* (casual hook-up), not dating. Only ${p.with.join(" or ")} can meet ${she ? "her" : "them"}${met.length ? ` (random encounter ${met.map((m) => m.name).join(", ")})` : ""}${phone ? `; after you take ${she ? "her" : "them"} home, ${she ? "she gives you her" : "they give you their"} number and can be called as a booty call` : ""}.${p.home ? ` Home: ${p.home}.` : ""}${forTarget ? "" : ` _(not available to ${plan.protagonist})_`} ${cite()}`);
  }

  // 2. General rules recorded on places (e.g. Vanilla Unicorn strippers).
  const rules = await db.query<{ entity_id: string; entity_name: string; entity_type: EntityType; content: string; source_id: string; source_url: string; source_title: string | null; name: string; authority: number; source_type: string }>(
    `select c.entity_id, e.name as entity_name, c.entity_type, c.content, c.source_id, c.source_url, c.source_title, s.name, s.authority, s.source_type
       from chunks c join entities e on e.id = c.entity_id join sources s on s.id = c.source_id
      where c.content_type = 'relationship' and c.online_only = false and c.entity_type <> 'character' and c.content ilike '%booty call%' limit 4`);
  for (const r of rules) {
    candidates.push(block(r.entity_id, r.entity_type, r.entity_name, r.content, { source_id: r.source_id, url: r.source_url, title: r.source_title, name: r.name, authority: r.authority, source_type: r.source_type }));
    // The summary sentence is only used when the cited text states exactly that; otherwise the source text is shown.
    const strippers = /strippers? home/i.test(r.content) && /like/i.test(r.content) && /(private dances?|flirt)/i.test(r.content);
    lines.push(strippers
      ? (pt
        ? `- **${r.entity_name}** (strippers) — é possível levar certas strippers para casa como booty call, aumentando o "like" delas com danças privadas e flerte. ${cite()}`
        : `- **${r.entity_name}** (strippers) — certain strippers can be taken home as a booty call by raising their "like" with private dances and flirting. ${cite()}`)
      : `- **${r.entity_name}** — ${r.content.replace(/^[^:\n]+: /, "").slice(0, 280)} ${cite()}`);
  }

  // 3. What of this counts for 100%.
  const reqs = await db.query<{ label: string; source_id: string; source_url: string; name: string; authority: number; source_type: string }>(
    `select cr.label, cr.source_id, cr.source_url, s.name, s.authority, s.source_type from completion_requirements cr join sources s on s.id = cr.source_id
      where cr.label ilike '%booty call%' or cr.label ilike '%prostitute%' or cr.label ilike '%private dance%'`);
  if (reqs.length) {
    const r0 = reqs[0] as (typeof reqs)[number];
    candidates.push(block("completion:100-percent", "completion", "100% Completion", `100% checklist items related to relationships: ${reqs.map((r) => r.label).join("; ")}.`, { source_id: r0.source_id, url: r0.source_url, title: null, name: r0.name, authority: r0.authority, source_type: r0.source_type }));
    lines.push(pt
      ? `- **Para 100%**: o checklist inclui ${reqs.map((r) => `"${r.label}"`).join(", ")}. Contratar uma prostituta é um serviço pago, não um relacionamento. ${cite()}`
      : `- **For 100%**: the checklist includes ${reqs.map((r) => `"${r.label}"`).join(", ")}. Hiring a prostitute is a paid service, not a relationship. ${cite()}`);
  }
  if (!candidates.length) return EMPTY;

  const head = pt
    ? `**Relacionamentos no Modo História${plan.protagonist ? ` (${plan.protagonist})` : ""}** — nenhuma fonte da base descreve um sistema de namoro/namorada formal; o que as fontes descrevem são *booty calls* (encontros casuais):`
    : `**Relationships in Story Mode${plan.protagonist ? ` (${plan.protagonist})` : ""}** — no source in the knowledge base describes a formal dating/girlfriend system; what the sources describe are *booty calls* (casual hook-ups):`;
  const cards: CardData[] = [...people.entries()].filter(([, p]) => !plan.protagonist || p.with.includes(plan.protagonist)).map(([id, p]) => ({
    kind: "relationship" as const, entityId: id, name: p.name, relation: p.kind, protagonists: p.with, evidence: p.evidence, home: p.home ?? undefined,
  }));
  void target;
  return { candidates, cards, answer: [head, ...lines], focus: [...people.keys()].slice(0, 3) };
}

async function completion(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  const reqs = await db.query<{ id: string; category: string; label: string; required_count: number | null; total_count: number | null; protagonists: string[]; target_ids: string[]; source_id: string; source_url: string; knowledge_status: string; notes: string | null }>(
    "select id, category, label, required_count, total_count, protagonists, target_ids, source_id, source_url, knowledge_status, notes from completion_requirements order by position");
  if (!reqs.length) return EMPTY;
  const src = (await db.query<SourceInfo>("select id as source_id, $1::text as url, null as title, name, authority, source_type from sources where id = $2", [reqs[0]?.source_url, reqs[0]?.source_id]))[0];
  if (!src) return EMPTY;
  let scoped = reqs.filter((r) => r.category !== "not_required");
  let focusNote = "";
  if (plan.protagonist) {
    const pid = PROTAGONIST_IDS[plan.protagonist];
    // Targets available to this protagonist (missions, random events…) via the graph.
    const avail = new Set((await db.query<{ from_id: string }>("select from_id from relationships where predicate = 'available_to' and to_id = $1", [pid])).map((r) => r.from_id));
    const specific = scoped.filter((r) => r.protagonists.includes(plan.protagonist as string) || r.target_ids.some((t) => avail.has(t)));
    const sfMissions = await db.query<{ name: string; for: string | null }>(
      `select e.name, m.details->>'for' as for from missions m join entities e on e.id = m.entity_id
        where m.mission_type = 'stranger' and exists (select 1 from relationships r where r.from_id = m.entity_id and r.predicate = 'available_to' and r.to_id = $1)
        order by e.name`, [pid]);
    const events = await db.query<{ name: string }>(
      `select e.name from random_events re join entities e on e.id = re.entity_id where exists (select 1 from relationships r where r.from_id = re.entity_id and r.predicate = 'available_to' and r.to_id = $1) order by e.name`, [pid]);
    const reRule = reqs.find((r) => r.category === "random_events" && r.required_count != null);
    // Required S&F = names listed in the "strangers_and_freaks" requirements; playable ≠ required.
    const requiredNames = new Set(scoped.filter((r) => r.category === "strangers_and_freaks").flatMap((r) => r.label.split(" — ")[1]?.split(/,\s*|\s+and\s+/) ?? []).map((x) => x.replace(/\s*\(.*$/, "").replace(/\.$/, "").trim().toLowerCase()));
    const required = sfMissions.filter((m) => requiredNames.has(m.name.toLowerCase()));
    const optional = sfMissions.filter((m) => !requiredNames.has(m.name.toLowerCase()));
    focusNote = lang === "pt"
      ? `${plan.protagonist}: Strangers and Freaks EXIGIDAS para 100% que ele joga: ${required.map((m) => m.name).join(", ") || "nenhuma registrada na base"}. Jogáveis com ele mas NÃO exigidas: ${optional.map((m) => m.name).join(", ") || "nenhuma"}. Random events disponíveis para ${plan.protagonist}: ${events.length} ${reRule ? `(o 100% exige ${reRule.required_count})` : ""}. Requisitos que citam ${plan.protagonist} diretamente: ${specific.map((r) => r.label).join("; ") || "nenhum"}.`
      : `${plan.protagonist}: Strangers and Freaks REQUIRED for 100% that he plays: ${required.map((m) => m.name).join(", ") || "none recorded"}. Playable as him but NOT required: ${optional.map((m) => m.name).join(", ") || "none"}. Random events available to ${plan.protagonist}: ${events.length} ${reRule ? `(100% needs ${reRule.required_count})` : ""}. Requirements that name ${plan.protagonist} directly: ${specific.map((r) => r.label).join("; ") || "none"}.`;
    scoped = scoped.length ? scoped : reqs;
  }
  const groups = new Map<string, typeof scoped>();
  for (const r of scoped) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  const fmt = (r: (typeof scoped)[number]) => `${r.label}${r.required_count != null ? ` — required: ${r.required_count}${r.total_count != null ? ` of ${r.total_count}` : ""}` : ""}${r.notes ? ` (${r.notes})` : ""}`;
  const content = [...groups].map(([cat, rs]) => `${cat.replace(/_/g, " ")}:\n${rs.map((r) => `- ${fmt(r)}`).join("\n")}`).join("\n");
  const candidates = [block("completion:100-percent", "completion", "100% Completion", `100% completion checklist (required items vs. totals):\n${content}${focusNote ? `\n${focusNote}` : ""}`, src)];
  const cards: CardData[] = [{
    kind: "completion", protagonist: plan.protagonist,
    groups: [...groups].map(([cat, rs]) => ({ category: cat, items: rs.map((r) => ({ label: r.label, required: r.required_count ?? undefined, total: r.total_count ?? undefined })) })),
    note: focusNote || undefined,
  }];
  const pt = lang === "pt";
  const CAT: Record<string, [string, string]> = {
    missions: ["Missões", "Missions"], strangers_and_freaks: ["Strangers and Freaks", "Strangers and Freaks"], random_events: ["Random events", "Random events"],
    hobbies_and_pastimes: ["Hobbies e passatempos", "Hobbies and pastimes"], miscellaneous: ["Diversos", "Miscellaneous"],
  };
  const answer = [pt ? `**Checklist de 100%** (o que é exigido × quantos existem) [S1]` : `**100% checklist** (what is required × how many exist) [S1]`];
  if (focusNote) answer.push(`- **${plan.protagonist}**: ${focusNote.replace(/^[A-Z][a-z]+: /, "")} [S1]`);
  for (const [cat, rs] of groups) {
    if (cat === "not_required") continue;
    const short = rs.slice(0, 8).map((r) => `${r.label.replace(/\.$/, "")}${r.required_count != null ? ` (${r.required_count}${r.total_count != null && r.total_count !== r.required_count ? `/${r.total_count}` : ""})` : ""}`).join("; ");
    answer.push(`- **${(CAT[cat] ?? [cat, cat])[pt ? 0 : 1]}**: ${short}${rs.length > 8 ? "…" : ""}`);
  }
  // An example from the data where the requirement is smaller than the total.
  const partial = reqs.find((r) => r.category !== "not_required" && r.required_count != null && r.total_count != null && r.required_count < r.total_count);
  if (partial) {
    const label = partial.label.replace(/\.$/, "");
    answer.push(pt ? `_Totais e exigidos podem diferir: ex. "${label}" (${partial.required_count} de ${partial.total_count})._` : `_Required and total can differ: e.g. "${label}" (${partial.required_count} of ${partial.total_count})._`);
  }
  return { candidates, cards, answer, focus: ["completion:100-percent"] };
}

async function graphAround(db: Db, id: string, name: string, outPreds: string[], inPreds: string[], lang: Lang, heading: string): Promise<ExecResult> {
  const out = await db.query<{ predicate: string; id: string; name: string; type: EntityType }>(
    "select r.predicate, e.id, e.name, e.type from relationships r join entities e on e.id = r.to_id where r.from_id = $1 and r.predicate = any($2::text[]) and e.online_only = false", [id, outPreds]);
  const inbound = await db.query<{ predicate: string; id: string; name: string; type: EntityType }>(
    "select r.predicate, e.id, e.name, e.type from relationships r join entities e on e.id = r.from_id where r.to_id = $1 and r.predicate = any($2::text[]) and e.online_only = false", [id, inPreds]);
  if (!out.length && !inbound.length) return EMPTY;
  const srcs = await sourcesOf(db, [id, ...out.map((o) => o.id), ...inbound.map((i) => i.id)]);
  const src = srcs.get(id) ?? [...srcs.values()][0];
  if (!src) return EMPTY;
  const verb = (p: string) => {
    const pt: Record<string, string> = { unlocks: "desbloqueia", requires: "requer", next: "vem antes de", setup_for: "é preparação para" };
    const en: Record<string, string> = { unlocks: "unlocks", requires: "requires", next: "comes before", setup_for: "is a setup for" };
    return (lang === "pt" ? pt : en)[p] ?? p;
  };
  const typeLabel = (t: string) => (lang === "pt" ? ({ mission: "missão", location: "local", activity: "atividade", vehicle: "veículo", collectible: "colecionável", property: "propriedade" } as Record<string, string>)[t] ?? t : t);
  const lines = [
    ...out.map((o) => `${name} ${verb(o.predicate)} **${o.name}** (${typeLabel(o.type)})`),
    ...inbound.map((i) => `**${i.name}** (${typeLabel(i.type)}) ${verb(i.predicate)} ${name}`),
  ];
  const answer = [`**${heading}**`, ...lines.map((l) => `- ${l} [S1]`)];
  return { candidates: [block(id, "mission", name, `${heading}\n${lines.map((l) => `- ${l}`).join("\n")}`, src)], cards: [], answer, focus: [id, ...out.slice(0, 2).map((o) => o.id)] };
}

async function characterLocation(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  const pt = lang === "pt";
  const c = plan.character ?? (plan.focusCharacter ? { id: plan.focusCharacter, name: plan.focusCharacter } : undefined);
  if (!c) return EMPTY;
  const ent = (await db.query<{ name: string; home: string | null }>("select e.name, ch.details->>'home' as home from entities e left join characters ch on ch.entity_id = e.id where e.id = $1", [c.id]))[0];
  if (!ent) return EMPTY;
  // Where they live, and the encounters / missions they appear in, with each encounter's own place and conditions.
  const places = await db.query<{ predicate: string; name: string }>(
    `select r.predicate, e.name from relationships r join entities e on e.id = r.to_id where r.from_id = $1 and r.predicate in ('lives_at','located_in','located_at')`, [c.id]);
  const encounters = await db.query<{ id: string; name: string; type: string; summary: string; location: string | null; available: string | null; reward: string | null; start: string | null }>(
    `select e.id, e.name, e.type, e.summary, re.details->>'location' as location, re.details->>'available_for' as available, re.details->>'reward' as reward,
            (select p.name from relationships s join entities p on p.id = s.to_id where s.from_id = e.id and s.predicate in ('starts_at','located_in') limit 1) as start
       from relationships r join entities e on e.id = r.to_id left join random_events re on re.entity_id = e.id
      where r.from_id = $1 and r.predicate = 'appears_in' order by (e.type = 'random_event') desc, e.name limit 8`, [c.id]);
  if (!places.length && !encounters.length && !ent.home) return EMPTY;
  const srcs = await sourcesOf(db, [c.id, ...encounters.map((e) => e.id)]);
  const candidates: Candidate[] = [];
  const lines: string[] = [pt ? `**Onde encontrar ${ent.name}**` : `**Where to find ${ent.name}**`];
  const own = srcs.get(c.id);
  if (own) {
    candidates.push(block(c.id, "character", ent.name, `${ent.name}: home ${ent.home ?? "not stated"}; ${places.map((p) => `${p.predicate.replace("_", " ")} ${p.name}`).join("; ")}.`, own));
    if (ent.home || places.length) lines.push(pt ? `- Mora: ${ent.home ?? places.map((p) => p.name).join(", ")}. [S${candidates.length}]` : `- Home: ${ent.home ?? places.map((p) => p.name).join(", ")}. [S${candidates.length}]`);
  }
  for (const e of encounters) {
    const src = srcs.get(e.id);
    if (!src) continue;
    const where = e.location ?? e.start;
    candidates.push(block(e.id, e.type as EntityType, e.name, `${e.name}${where ? ` — at ${where}` : ""}${e.available ? `; available for: ${e.available}` : ""}${e.reward ? `; reward: ${e.reward}` : ""}. ${e.summary.slice(0, 300)}`, src));
    const kind = e.type === "random_event" ? (pt ? "encontro aleatório" : "random encounter") : (pt ? "missão" : "mission");
    lines.push(pt
      ? `- ${kind} **${e.name}**${where ? ` — ${where}` : ""}${e.available ? `; disponível para: ${e.available}` : ""}${e.reward ? `; recompensa: ${e.reward}` : ""}. [S${candidates.length}]`
      : `- ${kind} **${e.name}**${where ? ` — ${where}` : ""}${e.available ? `; available for: ${e.available}` : ""}${e.reward ? `; reward: ${e.reward}` : ""}. [S${candidates.length}]`);
  }
  return { candidates, cards: [], answer: lines, focus: [c.id] };
}


/** Collectibles of every type around an anchor, grouped by category, with each category's 100% rule. */
async function nearbyCollectibles(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  const anchor = await anchorPoint(db, plan);
  if (!anchor) return EMPTY;
  const radius = 1500;
  const rows = await db.query<ItemRow & { category_id: string; category: string }>(
    `${ITEM_SELECT.replace("select ci.entity_id,", "select ci.category_id, c.name as category, ci.entity_id,")}
       join entities c on c.id = ci.category_id
      where g.game_x is not null and sqrt(power(g.game_x - $1, 2) + power(g.game_y - $2, 2)) <= $3
      order by sqrt(power(g.game_x - $1, 2) + power(g.game_y - $2, 2)) limit 40`, [anchor.x, anchor.y, radius]);
  if (!rows.length) return EMPTY;
  const withD = rows.map((r) => ({ ...r, d: Math.hypot((r.game_x as number) - anchor.x, (r.game_y as number) - anchor.y) }));
  const cats = [...new Set(withD.map((r) => r.category_id))];
  const rules = await db.query<{ category_id: string; label: string; required_count: number | null; total_count: number | null; category: string }>(
    `select t as category_id, cr.label, cr.required_count, cr.total_count, cr.category from completion_requirements cr, unnest(cr.target_ids) t where t = any($1::text[]) order by cr.position`, [cats]);
  const ruleText = (cid: string) => {
    const r = rules.find((x) => x.category_id === cid && x.category !== "not_required");
    if (r) return lang === "pt" ? `conta para 100% (${r.label}${r.required_count != null ? ` — exigidos ${r.required_count}${r.total_count != null ? ` de ${r.total_count}` : ""}` : ""})` : `counts for 100% (${r.label}${r.required_count != null ? ` — ${r.required_count}${r.total_count != null ? ` of ${r.total_count}` : ""} required` : ""})`;
    const nr = rules.find((x) => x.category_id === cid);
    if (nr) return lang === "pt" ? "não é exigido para 100%" : "not required for 100%";
    return lang === "pt" ? "relação com 100% não registrada na base" : "100% relevance not recorded in the KB";
  };
  const title = lang === "pt" ? `Colecionáveis num raio de ${(radius / 1000).toFixed(1)} km de ${anchor.label}` : `Collectibles within ${(radius / 1000).toFixed(1)} km of ${anchor.label}`;
  const byCat = new Map<string, typeof withD>();
  for (const r of withD) byCat.set(r.category_id, [...(byCat.get(r.category_id) ?? []), r]);
  const header = `${title}:\n${[...byCat].map(([cid, rs]) => `${rs[0]?.category}: ${rs.length} — ${ruleText(cid)}`).join("\n")}`;
  const candidates = await evidenceBlocks(db, withD, header, lang, cats[0] as string, rows[0]?.category ?? "Collectibles");
  // Who can collect each category, from the item records (the source page's statement); unknown when not stated.
  const who = new Map((await db.query<{ category_id: string; ps: string[] }>(
    "select category_id, array(select distinct unnest(array_agg(p)) order by 1) as ps from collectible_items ci, unnest(ci.protagonists) p where category_id = any($1::text[]) group by category_id", [cats])).map((r) => [r.category_id, r.ps]));
  const whoText = (cid: string) => {
    const ps = who.get(cid);
    if (!ps?.length) return lang === "pt" ? "quem pode coletar: não informado na base" : "who can collect: not stated in the KB";
    const forP = plan.protagonist ? (ps.includes(plan.protagonist) ? (lang === "pt" ? ` — ${plan.protagonist} pode` : ` — ${plan.protagonist} can`) : (lang === "pt" ? ` — ${plan.protagonist} não` : ` — not ${plan.protagonist}`)) : "";
    return `${lang === "pt" ? "coletável por" : "collectable by"} ${ps.join(", ")}${forP}`;
  };
  const lines = [`**${title}**`, ...[...byCat].map(([cid, rs]) => `- **${rs[0]?.category}** (${rs.length}) — ${ruleText(cid)}; ${whoText(cid)}: ${rs.slice(0, 4).map((r) => `${r.name} (${Math.round(r.d)} m)`).join("; ")}${rs.length > 4 ? "…" : ""} [S${candidates.findIndex((c) => rs.some((r) => c.content.includes(r.name))) + 1}]`)];
  lines.push("", lang === "pt"
    ? "_Só aparecem colecionáveis com coordenadas na base (categorias apenas com área, como Peyote e Under the Bridge, ficam de fora deste raio)._"
    : "_Only collectibles with coordinates in the KB are included (area-only categories such as Peyote and Under the Bridge are not in this radius search)._");
  return { candidates, cards: [itemsCard(title, withD), mapOf(title, withD, anchor)].filter(Boolean) as CardData[], answer: lines, focus: cats.slice(0, 3) };
}

/**
 * Lists of one kind of entity from the typed tables, with optional filters. When the question needs data the
 * knowledge base does not have (vehicle spawn points / rarity), the answer says so explicitly instead of
 * listing unrelated rows.
 */
/** Required count of a 100% requirement, read from the checklist (never a constant in code). */
async function requiredFor(db: Db, category: string, label: string): Promise<number | null> {
  const r = await db.query<{ n: number | null }>("select required_count as n from completion_requirements where category = $1 and label ilike $2 and required_count is not null order by position limit 1", [category, label]);
  return r[0]?.n ?? null;
}

async function listType(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  const listing = plan.listing;
  if (!listing) return EMPTY;
  const pt = lang === "pt";
  type Row = { id: string; name: string; summary: string; detail: string | null };
  let rows: Row[] = [];
  let title = "";
  let note: string | undefined;
  const area = plan.area;
  const inArea = area ? `and exists (select 1 from relationships r where r.from_id = e.id and r.predicate in ('located_in','starts_at','located_at','takes_place_at') and r.to_id = $1)` : "";
  const params = area ? [area.id] : [];
  switch (listing.type) {
    case "random_event":
      rows = await db.query<Row>(`select e.id, e.name, e.summary, re.details->>'available_for' as detail from random_events re join entities e on e.id = re.entity_id where e.online_only = false ${inArea} order by e.name`, params);
      title = pt ? "Random events na base" : "Random events in the knowledge base";
      { const n = await requiredFor(db, "random_events", "%random event%"); note = n == null ? undefined : pt ? `Para 100% são exigidos ${n} random events.` : `${n} random events are required for 100%.`; }
      break;
    case "property": {
      const all = await db.query<Row & { income: string | null; price: string | null; buyers: string | null }>(
        `select e.id, e.name, e.summary, null as detail, p.details->>'weekly_income' as income, p.details->>'price' as price, p.details->>'buyable_by' as buyers
           from properties p join entities e on e.id = p.entity_id where e.online_only = false and e.name not ilike '%overview%' and e.name not ilike '%(list)%' order by e.name`);
      const withIncome = all.filter((r) => r.income);
      const props100 = await requiredFor(db, "miscellaneous", "%propert%");
      rows = (listing.filter === "income" ? withIncome : all).map((r) => ({
        ...r, detail: [r.price ? `${pt ? "preço" : "price"} ${String(r.price).startsWith("$") ? r.price : `$${Number(r.price).toLocaleString("en-US")}`}` : "", r.income ? `${pt ? "renda" : "income"} ${r.income}/${pt ? "semana" : "week"}` : "", r.buyers ? `${pt ? "compra" : "buyer"}: ${JSON.parse(r.buyers).join(", ")}` : ""].filter(Boolean).join(" · ") || null,
      }));
      title = listing.filter === "income" ? (pt ? "Propriedades com renda semanal documentada" : "Properties with a documented weekly income") : (pt ? "Propriedades e negócios na base" : "Properties and businesses in the knowledge base");
      note = pt
        ? `A base não tem a tabela completa de propriedades: estes são os registros com dados de fonte${listing.filter === "income" ? " que citam renda semanal" : ""}.${props100 == null ? "" : ` Para 100% são exigidas ${props100} propriedades.`}`
        : `The knowledge base does not have the full property table: these are the records with sourced data${listing.filter === "income" ? " that state a weekly income" : ""}.${props100 == null ? "" : ` ${props100} properties are required for 100%.`}`;
      break;
    }
    case "weapon": {
      const all = await db.query<Row & { cost: string | null; release: string | null }>(
        `select e.id, e.name, e.summary, w.details->>'weapon_class' as detail, w.details->>'cost' as cost, w.details->>'release' as release
           from weapons w join entities e on e.id = w.entity_id where e.online_only = false order by e.name`);
      if (listing.filter === "free") {
        rows = all.filter((r) => /^(free|not available to purchase)/i.test(r.cost ?? "")).map((r) => ({ ...r, detail: `${r.cost}${r.release && !/base game/i.test(r.release) ? ` · ${r.release}` : ""}` }));
        title = pt ? "Armas que não se compram (gratuitas ou fora da Ammu-Nation)" : "Weapons you do not buy (free or not sold at Ammu-Nation)";
        note = pt ? "\"Not available to purchase\" significa que a fonte não lista a arma à venda; como obtê-la (pickups, missões) não está detalhado na base." : "\"Not available to purchase\" means the source does not list it for sale; how to obtain it (pickups, missions) is not detailed in the knowledge base.";
      } else {
        rows = all.map((r) => ({ ...r, detail: [r.detail, r.cost].filter(Boolean).join(" · ") }));
        title = pt ? "Armas na base" : "Weapons in the knowledge base";
      }
      break;
    }
    case "vehicle": {
      if (listing.filter === "location") {
        // Only vehicles with a sourced position / acquisition place. The roster has no spawn data.
        rows = await db.query<Row>(
          `select e.id, e.name, e.summary, string_agg(distinct p.name, ', ') as detail
             from vehicles v join entities e on e.id = v.entity_id
             join relationships r on r.from_id = e.id and r.predicate in ('located_at','found_at','located_in','starts_at')
             join entities p on p.id = r.to_id
            where e.online_only = false ${area ? "and r.to_id = $1" : ""} group by e.id, e.name, e.summary order by e.name`, params);
        title = pt ? "Veículos com local documentado" : "Vehicles with a documented location";
        note = pt
          ? `Não tenho evidência suficiente para indicar veículos raros ou pontos de spawn${area ? ` perto de ${area.name}` : ""}: as fontes usadas listam os veículos do jogo (classe, fabricante), mas não onde aparecem. Esse dado está registrado como pendência.`
          : `I don't have enough evidence to point to rare vehicles or spawn points${area ? ` near ${area.name}` : ""}: the sources used list the game's vehicles (class, maker) but not where they spawn. This gap is logged.`;
        if (!rows.length) return { candidates: [], cards: [{ kind: "warning", tone: "unvalidated", title: pt ? "Sem dados de spawn" : "No spawn data", text: note }], answer: [note], focus: [] };
      } else {
        rows = await db.query<Row>(`select e.id, e.name, e.summary, v.vehicle_class as detail from vehicles v join entities e on e.id = v.entity_id where e.online_only = false order by v.vehicle_class nulls last, e.name`);
        title = pt ? "Veículos na base (roster do jogo)" : "Vehicles in the knowledge base (game roster)";
      }
      break;
    }
    case "easter_egg":
      rows = await db.query<Row>(`select e.id, e.name, e.summary, null as detail from entities e where e.type = 'easter_egg' and e.online_only = false ${inArea} order by e.name`, params);
      title = area ? (pt ? `Easter eggs e segredos em ${area.name}` : `Easter eggs and secrets at ${area.name}`) : (pt ? "Easter eggs e segredos na base" : "Easter eggs and secrets in the knowledge base");
      break;
    case "stranger_mission":
      rows = await db.query<Row>(`select e.id, e.name, e.summary, m.details->>'for' as detail from missions m join entities e on e.id = m.entity_id where m.mission_type = 'stranger' order by m.details->>'for' nulls last, e.name`);
      title = "Strangers and Freaks";
      break;
  }
  if (!rows.length) {
    const msg = pt ? `Não encontrei ${title.toLowerCase()} registrados na base.` : `I found no ${title.toLowerCase()} recorded in the knowledge base.`;
    return { candidates: [], cards: [], answer: [msg], focus: [] };
  }
  const srcs = await sourcesOf(db, rows.map((r) => r.id));
  const groups = bySource(rows.map((r) => ({ ...r, entity_id: r.id })), srcs);
  const fmt = (r: Row) => `${r.name}${r.detail ? ` (${r.detail})` : ""}`;
  const candidates = groups.map((g) => block(g.rows[0]?.id ?? "list", "activity", title, `${title}${note ? `. ${note}` : ""}\n${g.rows.map((r) => `- ${fmt(r)}: ${r.summary.slice(0, 160)}`).join("\n")}`, g.src));
  const cite = (r: Row) => `[S${candidates.findIndex((c) => c.content.includes(`- ${fmt(r)}:`)) + 1}]`;
  const shown = rows.slice(0, 40);
  const answer = [`**${title} (${rows.length})**`, ...(note ? [`_${note}_`] : []), ...shown.map((r) => `- ${fmt(r)} ${cite(r)}`), ...(rows.length > shown.length ? [`… +${rows.length - shown.length}`] : [])];
  const cards: CardData[] = [{ kind: "items", title, note, rows: shown.map((r) => ({ id: r.id, label: r.name, area: r.detail ?? "", detail: r.summary.slice(0, 140), precision: "area" })) }];
  return { candidates, cards, answer, focus: rows.slice(0, 3).map((r) => r.id) };
}

export async function executePlan(db: Db, plan: Plan, lang: Lang): Promise<ExecResult> {
  switch (plan.goal) {
    case "nearest": return nearest(db, plan, lang);
    case "in_area": return inArea(db, plan, lang);
    case "list_items": return listItems(db, plan, lang);
    case "item_lookup": return itemLookup(db, plan, lang);
    case "romance": return romance(db, plan, lang);
    case "completion": return completion(db, plan, lang);
    case "after_mission":
      return plan.mission ? graphAround(db, plan.mission.id, plan.mission.name, ["unlocks", "next"], ["requires"], lang, lang === "pt" ? `O que abre depois de ${plan.mission.name}` : `What opens up after ${plan.mission.name}`) : EMPTY;
    case "unlocked_by": {
      const target = plan.mission ?? plan.item ?? plan.category ?? plan.character;
      return target ? graphAround(db, target.id, target.name, ["requires"], ["unlocks", "next"], lang, lang === "pt" ? `O que leva a ${target.name}` : `What leads to ${target.name}`) : EMPTY;
    }
    case "character_location": return characterLocation(db, plan, lang);
    case "nearby_collectibles": return nearbyCollectibles(db, plan, lang);
    case "list_type": return listType(db, plan, lang);
    case "practical_plan": return practicalPlan(db, lang);
    default: return EMPTY;
  }
}

/** The curated practical order for 100% (its own entity, with sources). */
async function practicalPlan(db: Db, lang: Lang): Promise<ExecResult> {
  const rows = await db.query<{ content: string; content_type: string; source_id: string; source_url: string; source_title: string | null; name: string; authority: number; source_type: string }>(
    `select c.content, c.content_type, c.source_id, c.source_url, c.source_title, s.name, s.authority, s.source_type
       from chunks c join sources s on s.id = c.source_id where c.entity_id = 'completion:practical-plan' order by c.position`);
  const steps = rows.find((r) => r.content_type === "steps") ?? rows[0];
  if (!steps) return EMPTY;
  const cand = block("completion:practical-plan", "completion", "100%: practical order", steps.content, { source_id: steps.source_id, url: steps.source_url, title: steps.source_title, name: steps.name, authority: steps.authority, source_type: steps.source_type }, "curated");
  const body = steps.content.replace(/^[\s\S]*?Plan:\s*/, "");
  return { candidates: [cand], cards: [], answer: [lang === "pt" ? "**Ordem prática sugerida (derivada das fontes)**" : "**Suggested practical order (derived from the sources)**", `${body} [S1]`], focus: ["completion:practical-plan"] };
}

/**
 * Runs the primary goal and the secondary goals of a composite question and merges their evidence. Citation
 * markers of later results are renumbered so every [S#] still points at the right evidence block.
 */
export async function executeComposite(db: Db, plan: Plan, secondary: Goal[], lang: Lang): Promise<ExecResult> {
  let acc = await executePlan(db, plan, lang);
  for (const goal of secondary) {
    const next = await executePlan(db, { ...plan, goal, focusCharacter: acc.focus.find((id) => id.startsWith("character:")) }, lang);
    if (!next.candidates.length && !next.answer?.length) continue;
    const offset = acc.candidates.length;
    const shift = (line: string) => line.replace(/\[S(\d+)\]/g, (_m, n: string) => `[S${Number(n) + offset}]`);
    acc = {
      candidates: [...acc.candidates, ...next.candidates],
      cards: [...acc.cards, ...next.cards.filter((c) => !acc.cards.some((x) => x.kind === c.kind && JSON.stringify(x) === JSON.stringify(c)))],
      answer: acc.answer || next.answer ? [...(acc.answer ?? []), ...(next.answer?.length ? ["", ...next.answer.map(shift)] : [])] : undefined,
      focus: [...new Set([...acc.focus, ...next.focus])],
    };
  }
  return acc;
}

/** Goals whose answer is a pure data lookup: answered deterministically, without the LLM (cost + exactness). */
export const LOOKUP_GOALS = new Set(["nearest", "in_area", "list_items", "item_lookup", "nearby_collectibles", "list_type"]);
/**
 * Goals whose evidence is structured but whose answer benefits from synthesis: with an AI provider the LLM writes the
 * answer over that evidence; without one (demo mode) the structured, cited answer is returned as is.
 */
export const SYNTH_GOALS = new Set(["romance", "character_location", "completion", "after_mission", "unlocked_by"]);
