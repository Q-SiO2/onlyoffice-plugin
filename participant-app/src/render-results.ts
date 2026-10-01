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
export async function resultsPng(results: Aggregate, title: string, kind: 'poll' | 'words') {
  const icon = new Image();
  icon.src = logo;
  await icon.decode();
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f6f6f8';
  ctx.fillRect(0, 0, 1600, 900);
  ctx.drawImage(icon, 60, 52, 48, 48);
  ctx.fillStyle = '#242744';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('PALO ALTO LIVE', 124, 88);
  ctx.textAlign = 'right';
  ctx.font = '24px Arial';
  ctx.fillText(`${results.total} participations`, 1530, 88);
  ctx.textAlign = 'left';
  ctx.font = 'bold 40px Arial';
  const headerHeight = wrap(ctx, title, 70, 160, 1460, 48, 3);
  if (kind === 'poll') {
    const top = 180 + headerHeight;
    const rowHeight = Math.min(130, (820 - top) / Math.max(1, results.poll.length));
    results.poll.forEach((p, i) => {
      const y = top + i * rowHeight;
      ctx.fillStyle = '#242744';
      ctx.font = 'bold 25px Arial';
      wrap(ctx, p.label, 70, y, 1000, 27, 1);
      ctx.textAlign = 'right';
      ctx.font = '24px Arial';
      ctx.fillText(`${p.count} votes · ${p.percentage} %`, 1530, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#eae8f2';
      ctx.fillRect(70, y + 12, 1460, Math.min(32, rowHeight - 34));
      ctx.fillStyle = palette[i % 3];
      ctx.fillRect(70, y + 12, (1460 * p.percentage) / 100, Math.min(32, rowHeight - 34));
    });
  } else {
    const words = results.words.slice(0, 24);
    const max = Math.max(1, ...words.map((w) => w.count));
    const top = 205 + headerHeight;
    type Item = { label: string; size: number; x: number; color: string };
    let rows: { height: number; items: Item[] }[] = [];
    // Fit complete rows to the canvas, including long custom labels. Each row shares a baseline.
    for (let scale = 1; scale >= 0.18; scale *= 0.9) {
      rows = [{ height: 0, items: [] }];
      let x = 85;
      words.forEach((w, i) => {
        const label = `${w.word} (${w.count})`;
        let size = Math.max(14, (28 + 44 * Math.sqrt(w.count / max)) * scale);
        ctx.font = `bold ${size}px Arial`;
        const measured = ctx.measureText(label).width;
        if (measured > 1430) {
          size *= 1430 / measured;
          ctx.font = `bold ${size}px Arial`;
        }
        const width = ctx.measureText(label).width + 30;
        if (x + width > 1545 && rows.at(-1)!.items.length) {
          rows.push({ height: 0, items: [] });
          x = 85;
        }
        const row = rows.at(-1)!;
        row.items.push({ label, size, x, color: palette[i % 3] });
        row.height = Math.max(row.height, size * 1.2);
        x += width;
      });
      if (rows.reduce((sum, row) => sum + row.height + 18, 0) <= 835 - top) break;
    }
    let y = top;
    for (const row of rows) {
      y += row.height;
      for (const item of row.items) {
        ctx.font = `bold ${item.size}px Arial`;
        ctx.fillStyle = item.color;
        ctx.fillText(item.label, item.x, y);
      }
      y += 18;
    }
    if (results.words.length > 24) {
      ctx.font = '18px Arial';
      ctx.fillStyle = '#62627b';
      ctx.fillText('24 mots les plus fréquents · toutes les fréquences dans l’export CSV', 85, 865);
    }
    if (!results.words.length) {
      ctx.font = '32px Arial';
      ctx.fillStyle = '#62627b';
      ctx.fillText('Aucun mot sélectionné.', 85, 360);
    }
  }
  return canvas.toDataURL('image/png');
}
