# Code, data and licences

This repository contains three kinds of material. They are kept in separate places so that each one keeps its own
terms.

| Material | Where | Licence |
|---|---|---|
| **Application code and documentation** written for this project | `src/`, `scripts/`, `tests/`, `eval/`, configuration files, `docs/`, `README.md`, `public/` | **No licence assigned yet: all rights reserved by the author.** See [Project licence](#project-licence). Exception: the two scripts that generate the GPL dataset are **GPL-3.0-only** (see [Scripts that generate the GPL dataset](#scripts-that-generate-the-gpl-dataset)). |
| **The project's own knowledge base**: facts reworded in the author's own words, with a link to each source | `data/kb/`, `data/gazetteer.json` | Same as the code (no licence assigned yet). |
| **Third-party datasets** | `datasets/` | Each keeps its upstream licence (below). See [`datasets/README.md`](datasets/README.md). |

Nothing here is affiliated with or endorsed by Rockstar Games or Take-Two Interactive. Game names and trademarks
belong to their owners. No game asset (artwork, map tiles, models, audio) is included.

## Third-party datasets

| Dataset | Files | Source | Licence | Obligations met by |
|---|---|---|---|---|
| Grand Theft Wiki extracts | `datasets/grandtheftwiki/` (`extracted/*.json`, `entities.json`, `completion.json`, `import-report.json`) | [Grand Theft Wiki](https://www.grandtheftwiki.com) contributors; every record links its page | **CC BY-SA 3.0 Unported** ([licence](https://creativecommons.org/licenses/by-sa/3.0/)) | [`LICENSE.md`](datasets/grandtheftwiki/LICENSE.md): licence URI, credit, list of changes. Page-level source links in every record and every answer. UI footer and `/api/map` link the licence. |
| esx_collectables coordinates | `datasets/esx-collectables/` (`coordinates.json`, `land.json`) | [Mobius1/esx_collectables](https://github.com/Mobius1/esx_collectables) `config.lua` | **GPL-3.0** ([`COPYING`](datasets/esx-collectables/COPYING); same text in [`licenses/`](licenses/esx_collectables-GPL-3.0.txt)) | [`NOTICE.md`](datasets/esx-collectables/NOTICE.md): source, notice of modification with date, no-warranty notice. Data kept in its editable form (JSON). Licence and source sent with the data by `/api/map` and shown on the map. |

### Why the datasets are not mixed

**CC BY-SA 3.0 and GPL-3.0 are not compatible.** Creative Commons lists no non-CC licence as compatible with BY-SA
3.0, and declares GPLv3 compatible only with BY-SA 4.0, one-way.

So no file combines the two:
- A collectible with a wiki description *and* a community coordinate is stored in two parts:
  - the description, in the CC BY-SA file;
  - the coordinate, as an attachment keyed by entity id, in the GPL file.
- The two parts are joined only inside the local database when it is seeded. That database (`.data/`) is not committed.

### Why the code is not under these licences

- **CC BY-SA 3.0.** ShareAlike applies to *Adaptations* of the licensed work. Section 1 of the licence says a
  *Collection*, in which the work is included unmodified alongside other works, is not an Adaptation. The application
  code is not an adaptation of the wiki text. It is a separate work that reads the dataset files as input.
- **GPL-3.0.** Section 5 says that including a covered work in an *aggregate* with "separate and independent works"
  does not cause the licence to apply to the other parts. The GPL FAQ treats modules that share one executable or one
  address space as one program.
  - To stay clearly on the "separate work" side, **no dataset file is imported by client code or compiled into the
    JavaScript bundle**. The server reads them as data files.
  - `npm run audit:secrets` checks the built bundle for dataset content, and a unit test checks the import graph of
    every client module.
  - The application also runs **without** the datasets, on its own knowledge base only (tested).

### Base map

- **`public/maps/san-andreas.svg`** and the map drawn in chat cards (`src/lib/map/svg.ts`) are an **original
  schematic drawing by the project author**: a hand-placed outline, lake, mountain and city block. They are not game
  artwork and are not derived from third-party data. This is the same drawing as in the first public version.
- **`datasets/esx-collectables/land.json`** is a more detailed coastline traced from the GPL coordinates
  (`scripts/dev/build-land.ts`). It is therefore **GPL-3.0**.
  - It is not bundled.
  - `/api/map` serves it at runtime with the licence notice.
  - The interactive map draws it as a dashed overlay labelled with its source and licence.

### Scripts that generate the GPL dataset

`land.json` is a traced and simplified output, not hand-editable data. As a conservative reading of GPL-3.0's
"Corresponding Source", the two scripts that produce it are licensed **GPL-3.0-only**, as stated in their file headers:
- `scripts/sources/extract/coords-esx.ts`
- `scripts/dev/build-land.ts`

No other script is licensed this way. The reasons and the remaining open question are in
[`datasets/esx-collectables/NOTICE.md`](datasets/esx-collectables/NOTICE.md).

### Answers that combine both datasets

This section is a **technical compliance description, not a legal opinion**.

- **On disk, the datasets stay physically separate.** No file holds both CC BY-SA 3.0 and GPL-3.0 material.
- **They are combined only while processing:**
  - when the local database is seeded;
  - at request time, when an answer, a card or the map is assembled.
- **Every piece of information keeps its origin.**
  - Each answer block is tied to the source it came from: the wiki page, or `esx_collectables`.
  - Cited answers list each source separately.
  - The UI footer and `/api/map` name both datasets and link both licences.
- **One answer can show information from both datasets.** Example: for a collectible, the wiki-derived description
  (CC BY-SA 3.0) and a community coordinate (GPL-3.0) can appear next to each other, each cited to its own source.
- **Showing them together does not apply one licence to the other.** The project does not relicense either dataset.
  Each item stays under the licence of the dataset it came from.
- **This question is not settled.** It may depend on legal interpretation in a given case:
  - whether every combined presentation is a *Collection* or an *Adaptation* under CC BY-SA 3.0;
  - how GPL-3.0's rules on *conveying* (section 0) apply to it.

  The analysis here does not try to settle it. What the project has done is:
  - kept the files separate;
  - kept the GPL data out of the client bundle;
  - kept attribution next to each fact.

  **The project does not claim this arrangement carries zero risk.**

## How the data was collected

- **Polite fetching only** (`scripts/sources/fetch.ts`):
  - host allow-list;
  - `robots.txt` obeyed: Grand Theft Wiki asks for a 10-second crawl delay and disallows `api.php`, and both are respected;
  - one request at a time, with an identifying User-Agent;
  - a local cache, so pages are never re-requested.

  Pages behind anti-bot challenges are recorded as **blocked** and never retried.
- **Not used:**
  - GTA Fandom wiki and Grand Theft Wiki's raw-text endpoint (Cloudflare challenge, not circumvented);
  - IGN (refuses automated access);
  - any paywalled or login-only content;
  - game data dumps (no licence).
- **Not redistributed:** the cached HTML (`.cache/`, git-ignored).

## Project licence

**PROJECT LICENSE: NOT ASSIGNED.** The separation above means the author can choose a licence for the code and for
`data/kb/` without being bound by the copyleft terms of the datasets. Until a licence is added, all rights are
reserved. Choosing one is the author's decision.

The datasets keep their own licences whatever is chosen for the code.
