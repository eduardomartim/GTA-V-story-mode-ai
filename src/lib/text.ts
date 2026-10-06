/** Lowercase + strip diacritics + collapse whitespace. Used for aliases, FTS and entity matching. */
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre e ou que qual quais como onde quando " +
    "porque pq eu me meu minha seu sua isso essa esse esta este aquela aquele ser sao foi tem ter posso pode fazer faco " +
    "the an of to in on at for with and or is are was were be do does did how what which where when why can i my me you your " +
    "it this that there their about from by as if so any all get got tell show mostre mostra me diga"
  ).split(" "),
);

export function tokenize(input: string): string[] {
  return normalize(input).split(/[\s/-]+/).filter(Boolean);
}

export function contentTokens(input: string): string[] {
  return tokenize(input).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function slugify(input: string): string {
  return normalize(input).replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}
