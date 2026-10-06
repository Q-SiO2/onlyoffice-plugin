import type { Aggregate } from '../../shared/model.ts';
import '@fontsource/comic-neue/400.css';
import logo from '../../onlyoffice-plugin/icon@2x.png';
import {
  cloudFont,
  layoutCloud,
  measureCloudWord,
  pollColors,
  wordPalette,
} from './result-style.ts';
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  maxLines = 3,
) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  lines.push(line);
  lines
    .slice(0, maxLines)
    .forEach((s, i) =>
      ctx.fillText(
        i === maxLines - 1 && lines.length > maxLines ? s + '…' : s,
        x,
        y + i * lineHeight,
        width,
      ),
    );
  return Math.min(lines.length, maxLines) * lineHeight;
}
export type ResultImageOptions = {
  transparent?: boolean;
  chartOnly?: boolean;
  textColor?: string;
  crop?: boolean;
  height?: number;
};
export async function resultsPng(
  results: Aggregate,
  title: string,
  kind: 'poll' | 'words',
  options: ResultImageOptions = {},
) {
  const icon = new Image();
  icon.src = logo;
  await icon.decode();
  if (kind === 'words') await document.fonts.load(`40px ${cloudFont}`);
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = options.chartOnly ? Math.max(320, Math.min(900, options.height || 900)) : 900;
  const ctx = canvas.getContext('2d')!;
  if (!options.transparent) {
    ctx.fillStyle = '#f6f6f8';
    ctx.fillRect(0, 0, 1600, 900);
  }
  ctx.fillStyle = options.textColor || '#242744';
  let headerHeight = 0;
  let contentBottom = 900;
  if (!options.chartOnly) {
    ctx.drawImage(icon, 60, 52, 48, 48);
    ctx.font = 'bold 26px "Manrope Variable", Arial';
    ctx.fillText('PALO ALTO LIVE', 124, 88);
    ctx.textAlign = 'right';
    ctx.font = '24px "Manrope Variable", Arial';
    ctx.fillText(`${results.total} participations`, 1530, 88);
    ctx.textAlign = 'left';
    ctx.font = 'bold 40px "Manrope Variable", Arial';
    headerHeight = wrap(ctx, title, 70, 160, 1460, 48, 3);
  }
  if (kind === 'poll') {
    const colors = pollColors(results.poll);
    const top = (options.chartOnly ? 80 : 180) + headerHeight;
    const rowHeight = Math.min(130, (canvas.height - 80 - top) / Math.max(1, results.poll.length));
    results.poll.forEach((p, i) => {
      const y = top + i * rowHeight;
      ctx.fillStyle = options.textColor || '#242744';
      ctx.font = `bold ${Math.min(options.chartOnly ? 56 : 25, rowHeight * 0.45)}px "Manrope Variable", Arial`;
      wrap(ctx, p.label, 70, y, 1000, 27, 1);
      ctx.textAlign = 'right';
      ctx.font = `${Math.min(options.chartOnly ? 42 : 24, rowHeight * 0.36)}px "Manrope Variable", Arial`;
      ctx.fillText(`${p.count} votes · ${p.percentage} %`, 1530, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = options.textColor === '#ffffff' ? '#ffffff30' : '#24274418';
      const barHeight = Math.min(32, rowHeight * 0.24);
      ctx.fillRect(70, y + 12, 1460, barHeight);
      ctx.fillStyle = colors[i];
      ctx.fillRect(70, y + 12, (1460 * p.percentage) / 100, barHeight);
    });
    contentBottom = top + results.poll.length * rowHeight + 35;
  } else {
    const top = (options.chartOnly ? 40 : 205) + headerHeight;
    const area = { x: 85, y: top, width: 1430, height: Math.max(0, canvas.height - top - 85) };
    const cloud = layoutCloud(results.words, area, (word, size) =>
      measureCloudWord(ctx, word, size),
    );
    cloud.items.forEach((item, i) => {
      ctx.font = `${item.size}px ${cloudFont}`;
      ctx.fillStyle =
        options.textColor === '#ffffff' ? '#ffffff' : wordPalette[i % wordPalette.length];
      ctx.fillText(item.word, item.x, item.baseline);
    });
    if (cloud.hidden) {
      ctx.font = '18px "Manrope Variable", Arial';
      ctx.fillStyle = options.textColor || '#62627b';
      ctx.fillText(
        `${cloud.items.length} mots affichés · ${cloud.hidden} autres dans l’export CSV`,
        85,
        canvas.height - 35,
      );
    }
    if (!results.words.length) {
      ctx.font = '32px "Manrope Variable", Arial';
      ctx.fillStyle = options.textColor || '#62627b';
      ctx.fillText('Aucun mot sélectionné.', 85, top + (canvas.height - top - 85) / 2);
    }
    contentBottom = cloud.hidden
      ? canvas.height
      : cloud.items.length
        ? Math.max(...cloud.items.map((item) => item.bounds.y + item.bounds.height)) + 40
        : top + (canvas.height - top - 85) / 2 + 40;
  }
  if (options.chartOnly && options.crop !== false) {
    const cropped = document.createElement('canvas');
    cropped.width = canvas.width;
    cropped.height = Math.min(canvas.height, Math.max(160, Math.ceil(contentBottom)));
    cropped.getContext('2d')!.drawImage(canvas, 0, 0);
    return cropped.toDataURL('image/png');
  }
  return canvas.toDataURL('image/png');
}
