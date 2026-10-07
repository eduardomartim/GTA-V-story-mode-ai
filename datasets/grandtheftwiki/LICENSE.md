# Grand Theft Wiki dataset — CC BY-SA 3.0 Unported

The files in this directory are an **Adaptation** of content from **Grand Theft Wiki**
(<https://www.grandtheftwiki.com>), by **Grand Theft Wiki contributors**. That content is licensed under the
**Creative Commons Attribution-ShareAlike 3.0 Unported** licence. This is the licence the wiki's own pages declare
(`/Grand_Theft_Wiki:Licensing`).

- **Licence:** <https://creativecommons.org/licenses/by-sa/3.0/> (legal code: <https://creativecommons.org/licenses/by-sa/3.0/legalcode>)
- **Title / source of each item:** every record lists the wiki page it came from (`sources[].url`, `sources[].title`), and the application cites that page next to every fact it shows.

## Changes made (credit identifying the use of the Work)

Wiki pages were fetched politely (robots.txt, crawl delay, cache) between 2026-10-06 and 2026-10-07. They were then
transformed by the scripts in `scripts/sources/` and `scripts/kb/`:
- text extracted from the HTML;
- sentences clipped and selected;
- content normalised into structured records (missions, characters, collectibles, random events, places, the 100% checklist);
- records linked to each other;
- records merged with records of this project's own knowledge base;
- sentences about GTA Online removed.

The cached HTML is not redistributed.

## ShareAlike

These files are distributed under **CC BY-SA 3.0** as a whole. This includes the project author's own contributions
merged into them (text from `data/kb/` copied into `entities.json`).

ShareAlike applies to these dataset files. It does not reach the separate application code that reads them as input,
or the project's own `data/kb/` files.

No technological measures or additional terms are applied.
