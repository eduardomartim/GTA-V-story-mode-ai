# esx_collectables coordinates — GPL-3.0

The files in this directory are a **modified version** of data from **Mobius1/esx_collectables**
(<https://github.com/Mobius1/esx_collectables>, file `config.lua`, retrieved 2026-10-06). That data is licensed
under the **GNU General Public License version 3** (full text in [`COPYING`](COPYING), identical to the upstream
`LICENSE` file). The upstream repository has no per-file copyright header; the work is attributed to its author,
Mobius1, as listed on GitHub.

## Prominent notice of modification (GPL-3.0, section 5a)

Modified by Eduardo Martim on 2026-10-06/07:
- the in-game coordinates in `config.lua` were converted to JSON;
- each point was assigned an entity id and the nearest named area;
- where the pairing was unambiguous, a point was paired with a collectible described in another dataset;
- a coastline was traced (`land.json`, by `scripts/dev/build-land.ts`):
  - **land samples:** the points above water, plus the project's own area reference points (`data/gazetteer.json`) and location points (`data/kb/`);
  - **water samples:** the points below water.

The pairing and area names are automatic and not independently verified.

## Licence of this directory

`coordinates.json` and `land.json` are distributed under **GPL-3.0**. This includes the modifications listed above and
the project-owned reference points that the coastline trace incorporates. `coordinates.json` is plain, editable data,
and is itself the preferred form for making changes to it.

## Generator scripts (conservative Corresponding Source)

`land.json` is a traced and simplified output, so the scripts that produce it are treated conservatively as part of
its Corresponding Source. They are licensed **GPL-3.0-only**, as stated in their headers:
- `scripts/sources/extract/coords-esx.ts`: parses `config.lua`;
- `scripts/dev/build-land.ts`: traces the coastline.

`scripts/kb/pipeline.ts`, which assigns ids and areas and does the pairing, is not licensed under GPL-3.0. It is a
general multi-source pipeline whose output (`coordinates.json`) is already in source form. It uses only a *type* from
`coords-esx.ts`, which is erased at compile time.

`scripts/kb/import.ts` calls `coords-esx.ts` to read the cached file. Licensing these two files under GPL-3.0 does not,
by itself, change the terms of the files that call them. Whether the import tooling as a whole should also be offered
under GPL-3.0 if it is ever redistributed apart from this repository is left to the copyright holder; it is not
decided here.

THERE IS NO WARRANTY FOR THIS DATA, TO THE EXTENT PERMITTED BY APPLICABLE LAW (GPL-3.0, sections 15–16).

## How the application uses it

The application reads these files as **input data**, when the database is seeded and in `/api/map`:
- no client code imports them, and they are not compiled into the JavaScript bundle;
- the application also runs without this directory, just without community coordinates and without the traced coastline.

When `/api/map` sends coordinates and the coastline to a browser, it sends this notice's licence and source link
with them (`attribution` field), and the map shows them.
