export const pollPalette = ['#ffc83d', '#3452f5', '#ffb8c6', '#f65a45'] as const;
export const cloudFont = '"Ink Free", "Segoe Print", "Comic Sans MS", cursive';
export const wordPalette = ['#3452f5', '#f65a45', '#e83e72', '#d18b00'];

// Seed the shuffle from the choices, never their vote counts. Every view and PNG
// gives an option the same color throughout live updates, resets and reloads.
export function pollColors(options: readonly { id: string; label: string }[]) {
  let seed = 2166136261;
  for (const char of JSON.stringify(options.map(({ id, label }) => [id, label]))) {
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const shuffled: string[] = [...pollPalette];
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 4294967296) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return options.map((_, i) => shuffled[i % shuffled.length]);
}

type Word = { word: string; count: number };
type Glyph = { left: number; right: number; ascent: number; descent: number };
export type CloudPlacement = {
  word: string;
  size: number;
  x: number;
  baseline: number;
  bounds: { x: number; y: number; width: number; height: number };
};

// Use the same lobes for the visible silhouette and the word placement boundary.
const cloudLobes = [
  [0.23, 0.57, 0.22, 0.28],
  [0.45, 0.38, 0.26, 0.34],
  [0.68, 0.43, 0.23, 0.31],
  [0.83, 0.59, 0.15, 0.24],
  [0.5, 0.64, 0.43, 0.25],
];
export const cloudShapePath = cloudLobes
  .map(
    ([cx, cy, rx, ry]) =>
      `M ${cx + rx} ${cy} a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 a ${rx} ${ry} 0 1 0 ${2 * rx} 0 Z`,
  )
  .join(' ');
export function cloudContains(x: number, y: number) {
  return cloudLobes.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
}

export function measureCloudWord(ctx: CanvasRenderingContext2D, word: string, size: number): Glyph {
  ctx.font = `${size}px ${cloudFont}`;
  const glyph = ctx.measureText(word);
  return {
    left: Math.max(0, glyph.actualBoundingBoxLeft),
    right: Math.max(glyph.width, glyph.actualBoundingBoxRight),
    ascent: Math.max(size * 0.75, glyph.actualBoundingBoxAscent, glyph.fontBoundingBoxAscent || 0),
    descent: Math.max(
      size * 0.25,
      glyph.actualBoundingBoxDescent,
      glyph.fontBoundingBoxDescent || 0,
    ),
  };
}

// Place measured glyph boxes on a golden-angle spiral inside the silhouette.
// Keep explicit gutters; reduce visible words rather than collide or use tiny text.
export function layoutCloud(
  words: readonly Word[],
  area: { x: number; y: number; width: number; height: number },
  measure: (word: string, size: number) => Glyph,
  sizing: { minSize: number; baseSize: number; growth: number; gapX: number; gapY: number } = {
    minSize: 32,
    baseSize: 40,
    growth: 52,
    gapX: 34,
    gapY: 24,
  },
): { items: CloudPlacement[]; hidden: number } {
  const { minSize, baseSize, growth, gapX, gapY } = sizing;
  const max = Math.max(1, ...words.map((word) => word.count));
  let best: CloudPlacement[] = [];
  const candidates = words.slice(0, 24);
  for (let step = 0; candidates.length && step <= 12; step++) {
    const scale = 1 - step * 0.05;
    const items: CloudPlacement[] = [];
    for (const [index, word] of candidates.entries()) {
      let size =
        minSize + (baseSize - minSize + growth * Math.sqrt(Math.max(0, word.count) / max)) * scale;
      let glyph = measure(word.word, size);
      const fit = Math.min(
        1,
        (area.width * 0.72) / (glyph.left + glyph.right),
        (area.height * 0.68) / (glyph.ascent + glyph.descent),
      );
      if (fit < 1) {
        size = Math.max(minSize, size * fit);
        glyph = measure(word.word, size);
      }
      const { left, right, ascent, descent } = glyph;
      const width = left + right;
      const height = ascent + descent;
      if (width > area.width || height > area.height) continue;
      for (let n = 0; n < 1600; n++) {
        const radius = Math.sqrt(n / 1600);
        const angle = (n + index * 19) * 2.399963229728653;
        const anchorX = index ? 0.12 + ((index * 0.61803398875) % 1) * 0.76 : 0.5;
        const anchorY = index ? 0.13 + ((index * 0.75487766625) % 1) * 0.69 : 0.53;
        const x = area.x + area.width * (anchorX + radius * 0.5 * Math.cos(angle)) - width / 2;
        const y = area.y + area.height * (anchorY + radius * 0.5 * Math.sin(angle)) - height / 2;
        if (
          x < area.x ||
          y < area.y ||
          x + width > area.x + area.width ||
          y + height > area.y + area.height
        )
          continue;
        if (
          items.some(
            ({ bounds: box }) =>
              !(
                x + width + gapX <= box.x ||
                box.x + box.width + gapX <= x ||
                y + height + gapY <= box.y ||
                box.y + box.height + gapY <= y
              ),
          )
        )
          continue;
        // Sample the whole perimeter so no word bridges outside a lobe.
        let inside = true;
        for (let edge = 0; edge <= 6 && inside; edge++) {
          const fraction = edge / 6;
          inside = [
            [x + width * fraction, y],
            [x + width * fraction, y + height],
            [x, y + height * fraction],
            [x + width, y + height * fraction],
          ].every(([px, py]) =>
            cloudContains((px - area.x) / area.width, (py - area.y) / area.height),
          );
        }
        if (!inside) continue;
        items.push({
          word: word.word,
          size,
          x: x + left,
          baseline: y + ascent,
          bounds: { x, y, width, height },
        });
        break;
      }
    }
    // Keep the most frequent word whenever it can fit at the minimum size.
    if (items.length > best.length && items[0]?.word === candidates[0].word) best = items;
    if (best.length === candidates.length) break;
  }
  return { items: best, hidden: words.length - best.length };
}
