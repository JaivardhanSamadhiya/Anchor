/** Normalized original-page coordinates locate evidence, without validating
 * dates or inferring checked boxes. Never highlight an approximate match. */
export interface SourceBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface SourcePage {
  page: number;
  width: number;
  height: number;
  words: SourceBox[];
}
const tokens = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
export function locateSource(
  layout: SourcePage[],
  quote: string,
): { page: number; boxes: SourceBox[] } | null {
  const wanted = tokens(quote).filter((word) => word !== 'x');
  // A bounded search may abstain, but must never call a clipped prefix an
  // exact match for the full quoted sentence.
  if (wanted.length < 2 || wanted.length > 100) return null;
  for (const page of (Array.isArray(layout) ? layout : []).slice(0, 10)) {
    const sequence = page.words
      .filter(
        (box) =>
          [box.x, box.y, box.w, box.h].every(Number.isFinite) &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.w > 0 &&
          box.h > 0 &&
          box.x < 1 &&
          box.y < 1,
      )
      .slice(0, 10_000)
      .flatMap((box) =>
        tokens(box.text)
          .filter((word) => word !== 'x')
          .map((word) => ({ word, box })),
      );
    for (let start = 0; start <= sequence.length - wanted.length; start++) {
      if (wanted.every((word, index) => sequence[start + index].word === word))
        return {
          page: page.page,
          boxes: [...new Set(sequence.slice(start, start + wanted.length).map((item) => item.box))],
        };
    }
  }
  return null;
}
