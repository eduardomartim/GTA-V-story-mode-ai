import { describe, expect, it } from "vitest";
import { expandQuery } from "@/lib/rag/glossary";
import { classifyIntents } from "@/lib/rag/intents";
import { detectLang } from "@/lib/rag/lang";
import { contentTokens, normalize, slugify } from "@/lib/text";

describe("text utilities", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalize("Joalheria — Vangelico’s Ação!")).toBe("joalheria vangelicos acao");
  });
  it("drops stopwords in both languages", () => {
    expect(contentTokens("Como faço a missão Blitz Play?")).toEqual(["missao", "blitz", "play"]);
    expect(contentTokens("How do I unlock the Space Docker")).toEqual(["unlock", "space", "docker"]);
  });
  it("slugifies", () => {
    expect(slugify("The Jewel Store Job")).toBe("the-jewel-store-job");
  });
});

describe("glossary expansion", () => {
  it("adds English terms for Portuguese questions", () => {
    const out = expandQuery("Onde fica a joalheria?");
    expect(out).toContain("jewel");
    expect(out).toContain("location");
  });
  it("leaves English questions untouched", () => {
    expect(expandQuery("Where is the Space Docker")).toBe("Where is the Space Docker");
  });
});

describe("language detection", () => {
  it.each([
    ["Como faço a missão Blitz Play?", "pt"],
    ["How do I get 100% completion?", "en"],
    ["Onde fica o Space Docker", "pt"],
    ["Show me all Lester missions", "en"],
  ])("%s → %s", (text, lang) => expect(detectLang(text)).toBe(lang));
});

describe("intent classification (multi-label)", () => {
  const c = (q: string) => classifyIntents(q, []);
  it("detects unlock questions", () => expect(c("O que preciso fazer para liberar a missão?")).toContain("mission_unlock"));
  it("detects heist strategy", () => expect(c("Qual é a melhor abordagem sutil ou obvia?")).toContain("heist_strategy"));
  it("detects cheats", () => expect(c("What is the cheat code for invincibility?")).toContain("cheat"));
  it("detects locations and maps together", () => {
    const i = c("Onde fica e mostre no mapa");
    expect(i).toContain("location_lookup");
    expect(i).toContain("map_request");
  });
  it("detects 100% completion", () => expect(c("Como conseguir 100%?")).toContain("100_percent_completion"));
  it("detects troubleshooting", () => expect(c("Essa missão não apareceu")).toContain("troubleshooting"));
  it("detects stock market and money", () => {
    expect(c("Como funciona o mercado de ações?")).toContain("stock_market");
    expect(c("Como fazer dinheiro?")).toContain("money");
  });
  it("detects version questions", () => expect(c("Is it different on PS5 and PC?")).toContain("version_difference"));
  it("falls back to general_question", () => expect(c("hmm")).toEqual(["general_question"]));
  it("returns several intents for compound questions", () => {
    expect(c("Onde fica o Peyote e qual a recompensa?").length).toBeGreaterThanOrEqual(2);
  });
});
