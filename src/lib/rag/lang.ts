import { tokenize } from "@/lib/text";
import type { Lang } from "./types";

const PT = new Set("o a os as um uma de do da dos das em no na nos nas por para com sem que qual quais como onde quando porque eu meu minha seu sua isso essa esse esta este nao sim fica fazer faco posso preciso missao missoes liberar melhor mostre mostra me voce ele ela tem ser sao foi aqui la tambem mais muito pra pro obrigado ola oi quero onde quanto quantos".split(" "));
const EN = new Set("the is are was were of to in on at for with and or what which where when why how can do does did my me you your it this that there their about from by if so any all get got tell show best who i".split(" "));

export function detectLang(text: string): Lang {
  const raw = text.toLowerCase();
  let pt = /[ãõçáéíóúâêô]/.test(raw) ? 2 : 0;
  let en = 0;
  for (const t of tokenize(text)) {
    if (PT.has(t)) pt++;
    if (EN.has(t)) en++;
  }
  return pt > en ? "pt" : en > pt ? "en" : /[ãõç]/.test(raw) ? "pt" : "en";
}
