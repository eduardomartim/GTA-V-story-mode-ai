/**
 * Licence notices for the third-party datasets, shown wherever their material reaches the user (map, API, chat
 * footer). Plain data with no imports, so client code can use it without pulling any dataset into the bundle.
 */
export interface DatasetNotice {
  dataset: "grandtheftwiki" | "esx-collectables";
  source: string;
  sourceUrl: string;
  licence: string;
  licenceUrl: string;
  covers: string;
}

export const DATASET_NOTICES: DatasetNotice[] = [
  {
    dataset: "grandtheftwiki",
    source: "Grand Theft Wiki contributors",
    sourceUrl: "https://www.grandtheftwiki.com",
    licence: "CC BY-SA 3.0",
    licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    covers: "Extracted and adapted wiki text and facts (each answer links the page it came from)",
  },
  {
    dataset: "esx-collectables",
    source: "Mobius1/esx_collectables",
    sourceUrl: "https://github.com/Mobius1/esx_collectables",
    licence: "GPL-3.0",
    licenceUrl: "https://www.gnu.org/licenses/gpl-3.0.html",
    covers: "Community-measured collectible coordinates and the coastline traced from them (modified: converted to JSON, paired with items, traced)",
  },
];
