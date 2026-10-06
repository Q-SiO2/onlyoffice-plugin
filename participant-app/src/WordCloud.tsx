import { useEffect, useRef, useState } from 'react';
import {
  cloudFont,
  cloudShapePath,
  layoutCloud,
  measureCloudWord,
  wordPalette,
  type CloudPlacement,
} from './result-style.ts';

export function WordCloud({ words }: { words: { word: string; count: number }[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(460);
  const [cloud, setCloud] = useState<{
    items: (CloudPlacement & { label: string })[];
    hidden: number;
    width: number;
    height: number;
  } | null>(null);
  const height = Math.max(260, Math.min(460, width * 0.8));
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(160, Math.round(entry.contentRect.width))),
    );
    observer.observe(container.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    void document.fonts.load(`40px ${cloudFont}`).then(() => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const labels = new Map<string, string>();
      // Narrow screens abbreviate an oversized word in the middle. Full labels
      // and frequencies remain in the accessible description and word tooltips.
      for (const { word } of words) {
        let label = word;
        for (let length = word.length - 1; length >= 6; length--) {
          const glyph = measureCloudWord(ctx, label, 18);
          if (glyph.left + glyph.right <= (width - 24) * 0.7) break;
          const tail = Math.floor(length / 3);
          label = `${word.slice(0, length - tail)}…${word.slice(-tail)}`;
        }
        labels.set(word, label);
      }
      const layout = layoutCloud(
        words,
        { x: 12, y: 12, width: width - 24, height: height - 24 },
        (word, size) => measureCloudWord(ctx, labels.get(word)!, size),
        { minSize: 18, baseSize: 24, growth: 30, gapX: 6, gapY: 5 },
      );
      if (!cancelled)
        setCloud({
          ...layout,
          width,
          height,
          items: layout.items.map((item) => ({ ...item, label: labels.get(item.word)! })),
        });
    });
    return () => {
      cancelled = true;
    };
  }, [words, width, height]);
  return (
    <div className="word-cloud" ref={container}>
      {words.length ? (
        <>
          <svg
            className="cloud-graphic"
            viewBox={`0 0 ${cloud?.width ?? width} ${cloud?.height ?? height}`}
            role="img"
            aria-label="Nuage de mots et fréquences"
          >
            <desc>{words.map(({ word, count }) => `${word} : ${count}`).join(' ; ')}</desc>
            <path
              d={cloudShapePath}
              transform={`translate(12 12) scale(${(cloud?.width ?? width) - 24} ${(cloud?.height ?? height) - 24})`}
              fill="#e9eeff"
              aria-hidden="true"
            />
            {cloud?.items.map((item, i) => (
              <text
                key={item.word}
                className="word"
                x={item.x}
                y={item.baseline}
                fontSize={item.size}
                fill={wordPalette[i % wordPalette.length]}
              >
                <title>
                  {item.word} : {words.find((word) => word.word === item.word)?.count}
                </title>
                {item.label}
              </text>
            ))}
          </svg>
          {!!cloud?.hidden && (
            <p className="fine muted">
              {cloud.items.length} mots affichés · {cloud.hidden} autres dans l’export CSV.
            </p>
          )}
        </>
      ) : (
        <p className="muted">Les mots apparaîtront ici.</p>
      )}
    </div>
  );
}
