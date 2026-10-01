import type { Aggregate } from '../../shared/model.ts';
import logo from '../../onlyoffice-plugin/icon@2x.png';
const palette = ['#635baf', '#748598', '#a8894c'];
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
      ctx.fillStyle = palette[i % 3];
      ctx.fillRect(70, y + 12, (1460 * p.percentage) / 100, barHeight);
    });
    contentBottom = top + results.poll.length * rowHeight + 35;
  } else {
    const words = results.words.slice(0, 24);
    const max = Math.max(1, ...words.map((w) => w.count));
    const top = (options.chartOnly ? 70 : 205) + headerHeight;
    type Item = { label: string; size: number; x: number; color: string };
    let rows: { height: number; items: Item[] }[] = [];
    // Fit complete rows to the canvas, including long custom labels. Each row shares a baseline.
    for (let scale = 1; scale >= 0.18; scale *= 0.9) {
      rows = [{ height: 0, items: [] }];
      let x = 85;
      words.forEach((w, i) => {
        const label = options.chartOnly ? w.word : `${w.word} (${w.count})`;
        let size = Math.max(14, (28 + 44 * Math.sqrt(w.count / max)) * scale);
        ctx.font = `bold ${size}px "Manrope Variable", Arial`;
        const measured = ctx.measureText(label).width;
        if (measured > 1430) {
          size *= 1430 / measured;
          ctx.font = `bold ${size}px "Manrope Variable", Arial`;
        }
        const width = ctx.measureText(label).width + 30;
        if (x + width > 1545 && rows.at(-1)!.items.length) {
          rows.push({ height: 0, items: [] });
          x = 85;
        }
        const row = rows.at(-1)!;
        row.items.push({
          label,
          size,
          x,
          color: options.textColor === '#ffffff' ? '#ffffff' : palette[i % 3],
        });
        row.height = Math.max(row.height, size * 1.2);
        x += width;
      });
      if (rows.reduce((sum, row) => sum + row.height + 18, 0) <= canvas.height - 65 - top) break;
    }
    let y = top;
    for (const row of rows) {
      y += row.height;
      for (const item of row.items) {
        ctx.font = `bold ${item.size}px "Manrope Variable", Arial`;
        ctx.fillStyle = item.color;
        ctx.fillText(item.label, item.x, y);
      }
      y += 18;
    }
    if (results.words.length > 24) {
      ctx.font = '18px "Manrope Variable", Arial';
      ctx.fillStyle = '#62627b';
      ctx.fillText(
        '24 mots les plus fréquents · toutes les fréquences dans l’export CSV',
        85,
        canvas.height - 35,
      );
    }
    if (!results.words.length) {
      ctx.font = '32px "Manrope Variable", Arial';
      ctx.fillStyle = '#62627b';
      ctx.fillText('Aucun mot sélectionné.', 85, 360);
    }
    contentBottom = results.words.length > 24 ? 900 : results.words.length ? y + 25 : 390;
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
