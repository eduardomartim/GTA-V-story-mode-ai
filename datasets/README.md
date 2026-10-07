# Third-party datasets

This directory holds the data this project derived from **third-party sources**. It is kept apart from the
application code (`src/`, `scripts/`, `tests/`) and from the project's own knowledge base (`data/`). Each
subdirectory is a separate dataset with its own licence. **No file here mixes material under two licences.**

| Directory | Licence | Contents | Notice |
|---|---|---|---|
| [`grandtheftwiki/`](grandtheftwiki/) | **CC BY-SA 3.0 Unported** | Records extracted and adapted from Grand Theft Wiki pages: `extracted/*.json` (per-extractor drafts), `entities.json` (merged records), `completion.json` (100% checklist), `import-report.json` (build log) | [`grandtheftwiki/LICENSE.md`](grandtheftwiki/LICENSE.md) |
| [`esx-collectables/`](esx-collectables/) | **GPL-3.0** | Community-measured coordinates from Mobius1/esx_collectables, converted to JSON: `coordinates.json` (position-only items and coordinate attachments), `land.json` (coastline traced from those coordinates) | [`esx-collectables/NOTICE.md`](esx-collectables/NOTICE.md), [`esx-collectables/COPYING`](esx-collectables/COPYING) |

## How the application uses them

- **Seeding.** `npm run db:seed` reads `data/kb/` (the project's own records) and then these datasets as input files (`src/lib/kb/load.ts`, `src/lib/kb/datasets.ts`). They are combined only inside the local database (`.data/`, not committed).
- **Both datasets are optional.** Without them the application still runs, on the project's own knowledge base. This is covered by a test.
- **A described collectible that also has a community coordinate is split in two:**
  - its description stays in the CC BY-SA file;
  - its coordinate goes into the GPL file as an *attachment* keyed by the entity id.

  Loading the two puts the record back together. A test checks that this reproduces exactly the pipeline output.
- **No dataset file is imported by client code.**
  - The GPL coastline is read on the server and sent by `/api/map` at runtime, together with the licence notices.
  - The base map bundled with the app is the project's own hand-drawn outline.
  - `npm run audit:secrets` fails the build check if dataset content is found in the client bundle.
- **Answers show attribution.** Each answer cites the source page of every fact it shows, and the UI footer links both licences.

## Regenerating

```bash
npm run sources:extract   # cached pages → grandtheftwiki/extracted/*.json
npm run kb:import         # → grandtheftwiki/{entities,completion,import-report}.json + esx-collectables/coordinates.json
npm run kb:land           # → esx-collectables/land.json
```
