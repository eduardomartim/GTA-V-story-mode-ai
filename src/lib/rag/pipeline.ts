import { randomUUID } from "node:crypto";
import { getAIProvider, ProviderError, type AIProvider } from "@/lib/ai/provider";
import { getDb, type Db } from "@/lib/db/client";
import { isDebug } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { contentTokens, normalize, tokenize } from "@/lib/text";
import { planCards } from "./cards";
import { resolveCitations } from "./citations";
import { clarificationFor, needsClarification } from "./clarify";
import { composeDemoAnswer } from "./demo";
import { expandQuery } from "./glossary";
import { suggestFollowUps } from "./followups";
import { t, tf } from "./messages";
import { SYSTEM_PROMPT, assembleContext, buildUserTurn } from "./prompt";
import { assessEvidence, hybridRetrieve, rerank, topicalTerms } from "./retrieval";
import { structuredLookups } from "./structured";
import type { Candidate, CardData, ChatResult, ChatTurn, EntityRef, QueryAnalysis } from "./types";
import { analyzeQuery } from "./understanding";

export interface ChatInput {
  message: string;
  history?: ChatTurn[];
  /** UI toggle: the user opted in to story spoilers. */
  allowSpoilers?: boolean;
  requestId?: string;
  /** Observability/eval hook: receives the final ranked context actually sent to the generator. */
  onTrace?: (trace: { analysis: QueryAnalysis; context: Candidate[]; evidence: { sufficient: boolean; reason: string } }) => void;
  /** Test seam: inject a provider (null forces demo mode). Defaults to the configured provider. */
  provider?: AIProvider | null;
}

const TOP_K = 8;
const PER_ENTITY = 3;
const SPOILER_CARD_LEVEL = 2;

/** One-time per process: backlog items are tiny and rarely change. */
let backlogCache: Array<{ topic: string; note: string; entity_id: string | null; norm: string }> | undefined;
async function backlog(db: Db) {
  if (!backlogCache) {
    const rows = await db.query<{ topic: string; note: string; entity_id: string | null }>("select topic, note, entity_id from kb_backlog where status <> 'done'");
    backlogCache = rows.map((r) => ({ ...r, norm: normalize(`${r.topic} ${r.note}`) }));
  }
  return backlogCache;
}
export function resetPipelineCaches(): void {
  backlogCache = undefined;
}

async function matchingBacklog(db: Db, analysis: QueryAnalysis): Promise<Array<{ topic: string; note: string }>> {
  const WEAK = new Set(["mission", "missions", "story", "mode", "game", "unlock", "requirements", "location", "where", "tell", "show", "vehicle"]);
  const terms = [...new Set(contentTokens(expandQuery(analysis.original)).filter((t) => t.length >= 4 && !WEAK.has(t)))];
  const ids = new Set([...analysis.entities, ...analysis.inheritedEntities].map((e) => e.id));
  const items = await backlog(db);
  // A gap is relevant when it is attached to a discussed entity, or when at least two question terms occur in it (one stray word is not enough).
  return items
    .filter((b) => (b.entity_id && ids.has(b.entity_id)) || terms.filter((t) => b.norm.includes(t)).length >= 2)
    .slice(0, 3)
    .map((b) => ({ topic: b.topic, note: b.note }));
}

/** Spoiler policy: level>=2 chunks are shown only if asked for, or if they belong to an entity the user is already discussing. */
function filterSpoilers(cands: Candidate[], allowAll: boolean, allowedEntities: Set<string>): Candidate[] {
  return allowAll ? cands : cands.filter((c) => c.spoilerLevel < SPOILER_CARD_LEVEL || allowedEntities.has(c.entityId));
}

function whereText(card: CardData & { kind: "location" }): string {
  return [card.district, card.region].filter(Boolean).join(", ") || card.region || "San Andreas";
}

export async function runChat(input: ChatInput): Promise<ChatResult> {
  const started = Date.now();
  const requestId = input.requestId ?? randomUUID();
  const history = input.history ?? [];
  let db: Db;
  try {
    db = await getDb();
  } catch (err) {
    log("error", "db_unavailable", { requestId, error: (err as Error).message });
    throw new AppError("database_unavailable");
  }

  const analysis = await analyzeQuery(input.message, history).catch((err) => {
    log("error", "understanding_failed", { requestId, error: (err as Error).message });
    throw new AppError("database_unavailable");
  });
  if (input.allowSpoilers) analysis.wantsSpoilers = true;
  const lang = analysis.lang;
  const base = (over: Partial<ChatResult> & Pick<ChatResult, "answer" | "mode">): ChatResult => ({
    requestId, lang, cards: [], sources: [], followUps: [], spoiler: false,
    meta: { intents: analysis.intents, entities: [], retrievalCount: 0, latencyMs: Date.now() - started },
    ...over,
  });

  // ── Story Mode vs Online gate: question is ONLY about Online-only content → deterministic answer, no LLM, no retrieval.
  // Generic mechanics ("making money", stock market, 100%...) do not make a question a Story Mode question when it explicitly names GTA Online content.
  const SPECIFIC = new Set(["mission", "heist", "character", "vehicle", "weapon", "collectible", "location", "ending"]);
  if (analysis.onlineBoundary.length && !analysis.entities.some((e) => SPECIFIC.has(e.type))) {
    const first = analysis.onlineBoundary[0] as EntityRef;
    const answer = `**${t("online", lang)}**\n\n${tf("onlineBody", lang)(first.name)}`;
    const cards: CardData[] = [{ kind: "warning", tone: "online", title: t("online", lang), text: analysis.onlineBoundary.map((e) => e.name).join(", ") }];
    const res = base({ mode: "online-boundary", answer, cards });
    res.meta.latencyMs = Date.now() - started;
    log("info", "chat", { requestId, mode: res.mode, intents: analysis.intents, latencyMs: res.meta.latencyMs, onlineBoundary: first.id });
    return res;
  }

  // ── Under-specified question → ask for context instead of guessing (no retrieval, no LLM)
  if (needsClarification(analysis)) {
    const c = clarificationFor(lang);
    const res = base({ mode: "clarify", answer: c.answer, followUps: c.followUps });
    res.meta.latencyMs = Date.now() - started;
    log("info", "chat", { requestId, mode: res.mode, intents: analysis.intents, latencyMs: res.meta.latencyMs });
    return res;
  }

  // ── Hybrid retrieval
  let candidates: Candidate[];
  let counts = { keyword: 0, vector: 0, entity: 0, graph: 0 };
  let timings = { keywordMs: 0, vectorMs: 0, structuredMs: 0 };
  try {
    const [hybrid, listed] = await Promise.all([hybridRetrieve(db, analysis), structuredLookups(db, analysis)]);
    candidates = [...listed, ...hybrid.candidates];
    counts = hybrid.counts;
    timings = hybrid.timings;
  } catch (err) {
    log("error", "retrieval_failed", { requestId, error: (err as Error).message });
    throw new AppError("retrieval_failed");
  }

  const allowAllSpoilers = analysis.wantsSpoilers || analysis.intents.includes("ending");
  const discussed = new Set([...analysis.entities, ...analysis.inheritedEntities].filter((e) => e.spoilerLevel >= SPOILER_CARD_LEVEL).map((e) => e.id));
  candidates = filterSpoilers(candidates, allowAllSpoilers, discussed);
  const ranked = rerank(candidates, analysis.intents, analysis.original);
  const evidence = assessEvidence(analysis, ranked);
  // When the user pinned down one or two entities, let each contribute more sections (gold medals, failure, location…).
  const focused = analysis.entities.length + analysis.inheritedEntities.length <= 2 && analysis.entities.length + analysis.inheritedEntities.length > 0;
  const context = assembleContext(ranked, { k: focused ? 10 : TOP_K, perEntity: focused ? 6 : PER_ENTITY });
  input.onTrace?.({ analysis, context, evidence });

  const noteOnline = analysis.onlineBoundary.length
    ? `\n\n> **${t("online", lang)}** (${analysis.onlineBoundary.map((e) => e.name).join(", ")})`
    : "";
  const onlineCards: CardData[] = analysis.onlineBoundary.length
    ? [{ kind: "warning", tone: "online", title: t("online", lang), text: analysis.onlineBoundary.map((e) => e.name).join(", ") }]
    : [];

  // ── Hallucination guard: no evidence → refuse to answer from the model's memory.
  if (!evidence.sufficient || context.length === 0) {
    const gapItems = await matchingBacklog(db, analysis);
    const gaps = gapItems.map((g) => g.topic);
    const lines = [t("noEvidence", lang)];
    if (gaps.length) lines.push(`${t("notValidated", lang)} (${t("backlogPrefix", lang)}: ${gaps.join(", ")}.)`);
    lines.push("", t("noEvidenceHint", lang));
    const res = base({ mode: "no-evidence", answer: lines.join("\n\n").replace("\n\n\n\n", "\n\n") + noteOnline, cards: [...(gaps.length ? [{ kind: "warning" as const, tone: "unvalidated" as const, title: t("notValidated", lang), text: gaps.join(", ") }] : []), ...onlineCards] });
    res.meta.retrievalCount = candidates.length;
    res.meta.latencyMs = Date.now() - started;
    log("info", "chat", { requestId, mode: res.mode, intents: analysis.intents, reason: evidence.reason, retrieved: candidates.length, latencyMs: res.meta.latencyMs });
    return res;
  }

  const ctxText = normalize(context.map((c) => c.content).join(" "));
  const unmatched = topicalTerms(analysis.original).filter((w) => !ctxText.includes(w) && !ctxText.includes(w.slice(0, 5))).slice(0, 6);

  // Known gaps (the backlog): things we deliberately did not invent. They are handed to the model and surfaced in the answer.
  const gapItems = await matchingBacklog(db, analysis).catch(() => []);

  // ── Version clarification: if retrieved facts are version-scoped and the user did not say which version they play, ask.
  // Only the user's own words count (assistant answers mention "PC code" etc.), and "one" only as part of "Xbox One".
  const mentionsVersion = /\b(ps ?[345]|playstation|xbox|series [xs]|360|pc|enhanced|legacy|steam|epic|rockstar launcher|next-?gen|current-?gen)\b/i.test(
    [input.message, ...history.filter((h) => h.role === "user").map((h) => h.content)].join(" "),
  );
  const versionSensitive = context.some((c) => c.versions.length > 0);
  const askVersion = versionSensitive && !mentionsVersion;
  const noteVersion = askVersion ? `

${t("askVersion", lang)}` : "";
  const versionCards: CardData[] = askVersion ? [{ kind: "warning", tone: "version", title: t("versionTitle", lang), text: [...new Set(context.flatMap((c) => c.versions))].join(" · ") }] : [];

  // ── Cards (always from structured rows, never from model output)
  const refs: EntityRef[] = [...analysis.entities, ...analysis.inheritedEntities];
  if (refs.length === 0) {
    // No explicit entity: only promote the single strongest retrieved entity when it clearly dominates.
    const top = ranked[0];
    if (top && top.score >= 0.55 && top.contentType !== "list" && ["mission", "heist", "character", "vehicle", "weapon", "collectible", "location"].includes(top.entityType)) refs.push({ id: top.entityId, type: top.entityType, name: top.entityName, onlineOnly: false, spoilerLevel: top.spoilerLevel });
  }
  const plan = await planCards(db, refs, analysis.intents).catch(() => ({ cards: [] as CardData[], focus: [] as string[] }));
  const spoiler = context.some((c) => c.spoilerLevel >= SPOILER_CARD_LEVEL);

  // ── Structured answer (no LLM): plain location/map lookups resolved entirely from the database
  const DEEP_INTENTS = ["mission_walkthrough", "mission_requirements", "mission_reward", "mission_unlock", "troubleshooting", "money", "ending", "version_difference", "100_percent_completion"];
  const onlyLocationIntents = ["location_lookup", "map_request"].includes(analysis.intents[0] ?? "") && !analysis.intents.some((i) => DEEP_INTENTS.includes(i));
  const locCard = plan.cards.find((c): c is CardData & { kind: "location" } => c.kind === "location");
  const short = tokenize(analysis.original).length <= 9;
  if (onlyLocationIntents && locCard && (locCard.district || locCard.mapX !== undefined) && short && analysis.intents.some((i) => i === "location_lookup" || i === "map_request")) {
    const where = whereText(locCard);
    const lines = [tf("locationLine", lang)(locCard.name, where)];
    if (locCard.mapX !== undefined) lines.push(t("approxNote", lang));
    const cite = context.find((c) => c.entityId === locCard.entityId) ?? context[0];
    const citations = resolveCitations(`${lines.join(" ")} [S${cite ? context.indexOf(cite) + 1 : 1}]`, context);
    const entityFocus = plan.focus.length ? plan.focus : [locCard.entityId];
    const focusRef = refs.find((r) => r.id === entityFocus[0]) ?? refs[0];
    const res = base({
      mode: "structured", answer: citations.text + noteVersion + noteOnline, cards: [...plan.cards, ...versionCards, ...onlineCards], sources: citations.sources,
      followUps: suggestFollowUps(focusRef && { id: focusRef.id, type: focusRef.type, name: focusRef.name }, analysis.intents, lang),
    });
    res.meta.entities = entityFocus.slice(0, 3);
    res.meta.retrievalCount = candidates.length;
    res.meta.latencyMs = Date.now() - started;
    log("info", "chat", { requestId, mode: res.mode, intents: analysis.intents, retrieved: candidates.length, latencyMs: res.meta.latencyMs });
    return res;
  }

  // ── Generation: real provider, or clearly-labelled demo mode
  const provider = input.provider === undefined ? getAIProvider() : input.provider;
  let answerText: string;
  let mode: ChatResult["mode"] = "llm";
  let usage: ChatResult["meta"]["usage"];
  if (provider) {
    try {
      const out = await provider.generate({
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserTurn(analysis, context, history, lang, unmatched, gapItems) }],
        maxTokens: 900,
        temperature: 0.2,
      });
      answerText = out.text.trim();
      usage = out.usage;
      if (!answerText) throw new ProviderError("Empty completion");
    } catch (err) {
      log("error", "ai_failed", { requestId, provider: provider.id, model: provider.model, error: (err as Error).message });
      throw new AppError("ai_unavailable");
    }
  } else {
    mode = "demo";
    answerText = composeDemoAnswer(context, lang, gapItems.map((g) => g.topic));
  }

  const citations = resolveCitations(answerText, context);
  const focusIds = (plan.focus.length ? plan.focus : [...new Set(context.map((c) => c.entityId))]).slice(0, 3);
  const focusRef = refs.find((r) => r.id === focusIds[0]) ?? (ranked[0] ? { id: ranked[0].entityId, type: ranked[0].entityType, name: ranked[0].entityName } : undefined);

  const result: ChatResult = {
    requestId, lang, mode,
    answer: citations.text + noteVersion + noteOnline,
    cards: [...plan.cards, ...versionCards, ...onlineCards],
    sources: citations.sources,
    followUps: suggestFollowUps(focusRef && { id: focusRef.id, type: focusRef.type, name: focusRef.name }, analysis.intents, lang),
    spoiler,
    meta: {
      intents: analysis.intents, entities: focusIds, retrievalCount: candidates.length, latencyMs: Date.now() - started, unmatchedTerms: unmatched, gaps: gapItems.map((g) => g.topic), cited: citations.cited,
      provider: provider?.id, model: provider?.model, usage,
      ...(isDebug() ? { debug: { evidence, counts, timings, context: context.map((c) => ({ id: c.entityId, type: c.contentType, score: Number(c.score.toFixed(3)), via: c.via })) } } : {}),
    },
  };
  log("info", "chat", {
    requestId, mode, intents: analysis.intents, retrieved: candidates.length, context: context.length, sources: citations.sources.length,
    cited: citations.cited, provider: provider?.id, model: provider?.model, tokens: usage, latencyMs: result.meta.latencyMs, followUp: analysis.isFollowUp,
    queryLength: input.message.length,
  });
  return result;
}
