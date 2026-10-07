import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyEsxDataset, DATASETS_DIR, ESX_SOURCE, loadEsxDataset, loadGtwDataset, splitByLicence } from "@/lib/kb/datasets";
import { loadKnowledgeBase } from "@/lib/kb/load";
import { validateKnowledgeBase } from "@/lib/kb/quality";

const gtw = loadGtwDataset();
const esx = loadEsxDataset();

describe("third-party datasets are separated by licence", () => {
  it("both datasets are present", () => {
    expect(gtw.entities.length).toBeGreaterThan(900);
    expect(esx?.entities.length).toBeGreaterThan(100);
    expect(esx?.attachments.length).toBeGreaterThan(0);
  });

  it("the CC BY-SA file holds no GPL material", () => {
    for (const e of gtw.entities) {
      expect(e.sources.some((s) => s.source === ESX_SOURCE)).toBe(false);
      expect(e.location?.coord_source).not.toBe(ESX_SOURCE);
      expect(e.attrs).not.toHaveProperty("coordinate_pairing");
    }
    expect(fs.readFileSync(path.join(DATASETS_DIR, "grandtheftwiki", "entities.json"), "utf8")).not.toMatch(/esx/i);
  });

  it("the GPL file holds only esx_collectables material", () => {
    for (const e of esx?.entities ?? []) expect(e.sources.every((s) => s.source === ESX_SOURCE)).toBe(true);
    for (const a of esx?.attachments ?? []) {
      expect(a.source.source).toBe(ESX_SOURCE);
      expect(gtw.entities.some((e) => e.id === a.entity_id)).toBe(true);
    }
  });

  it("splitting the combined records gives back exactly the two files (lossless, order kept)", () => {
    const combined = applyEsxDataset(gtw.entities, esx);
    const again = splitByLicence(combined);
    expect(again.gtw).toEqual(gtw.entities);
    expect(again.esx.entities).toEqual(esx?.entities);
    expect(again.esx.attachments).toEqual(esx?.attachments);
    expect(again.esx.after).toEqual(esx?.after);
  });

  it("each dataset carries its licence notice", () => {
    expect(fs.readFileSync(path.join(DATASETS_DIR, "grandtheftwiki", "LICENSE.md"), "utf8")).toMatch(/CC BY-SA 3\.0|Attribution-ShareAlike 3\.0/);
    expect(fs.readFileSync(path.join(DATASETS_DIR, "esx-collectables", "COPYING"), "utf8")).toMatch(/GNU GENERAL PUBLIC LICENSE\s+Version 3/);
    expect(fs.readFileSync(path.join(DATASETS_DIR, "esx-collectables", "NOTICE.md"), "utf8")).toMatch(/Prominent notice of modification/);
  });
});

describe("the application does not depend on the third-party datasets", () => {
  const withOnly = (dirs: string[]) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datasets-"));
    for (const d of dirs) fs.cpSync(path.join(DATASETS_DIR, d), path.join(tmp, d), { recursive: true });
    return tmp;
  };

  it("loads and validates without the GPL dataset (no community coordinates)", () => {
    const kb = loadKnowledgeBase(undefined, withOnly(["grandtheftwiki"]));
    expect(kb.entities.some((e) => e.location?.coord_source === ESX_SOURCE)).toBe(false);
    expect(kb.entities.length).toBe(loadKnowledgeBase().entities.length - (esx?.entities.length ?? 0));
    expect(validateKnowledgeBase(kb).filter((i) => i.level === "error")).toEqual([]);
  });

  it("loads and validates without any third-party dataset", () => {
    const kb = loadKnowledgeBase(undefined, withOnly([]));
    // Only the project's own records (they may cite a wiki page as a link, but hold no dataset content).
    const own = fs.readdirSync(path.join(process.cwd(), "data", "kb")).filter((f) => f.startsWith("entities-"))
      .flatMap((f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "kb", f), "utf8")) as Array<{ id: string }>);
    expect(kb.entities.map((e) => e.id).sort()).toEqual(own.map((e) => e.id).sort());
    expect(kb.entities.some((e) => e.sources.some((s) => s.source === ESX_SOURCE))).toBe(false);
    expect(kb.completion).toEqual([]);
    expect(validateKnowledgeBase(kb).filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("client code never imports a dataset", () => {
  const SRC = path.join(process.cwd(), "src");
  const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    return null;
  };
  const clientEntries = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return clientEntries(f);
    return /\.tsx?$/.test(e.name) && /^["']use client["']/.test(fs.readFileSync(f, "utf8").trimStart()) ? [f] : [];
  });

  it("no module reachable from a 'use client' file reads datasets/ or the filesystem", () => {
    const seen = new Set<string>();
    const queue = clientEntries(SRC);
    expect(queue.length).toBeGreaterThan(3);
    while (queue.length) {
      const f = queue.pop() as string;
      if (seen.has(f)) continue;
      seen.add(f);
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g)) {
        const spec = (m[1] ?? m[2]) as string;
        // Type-only imports are erased at build time.
        if (/^\s*(import|export)\s+type\b/.test(m[0])) continue;
        expect(`${path.relative(SRC, f)} → ${spec}`).not.toMatch(/datasets|land\.json|node:fs|^fs$/);
        const r = resolve(f, spec);
        if (r) queue.push(r);
      }
    }
    expect([...seen].some((f) => f.endsWith(path.join("map", "svg.ts")))).toBe(true);
  });
});
