import type { ImportanceMap, Point } from "./models";

export function buildImportanceMap(source: HTMLImageElement, columns = 32, rows = 32): ImportanceMap {
  const canvas = document.createElement("canvas"); canvas.width = columns; canvas.height = rows;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas برای تحلیل تصویر در دسترس نیست.");
  context.drawImage(source, 0, 0, columns, rows);
  const pixels = context.getImageData(0, 0, columns, rows).data; const values: number[] = [];
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const i = (y * columns + x) * 4;
    const alpha = pixels[i + 3] / 255;
    // Fully transparent pixels get zero importance — no puzzle piece should be generated here
    if (alpha < 0.05) { values.push(0); continue; }
    const luminance = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 765;
    const right = x < columns - 1 ? pixels[i + 4] : pixels[i]; const down = y < rows - 1 ? pixels[i + columns * 4] : pixels[i];
    const alphaFactor = Math.min(1, alpha * 1.2); // scale importance by alpha
    values.push(Math.min(1, (0.25 + Math.abs(pixels[i] - right) / 255 * 0.4 + Math.abs(pixels[i] - down) / 255 * 0.4 + luminance * 0.15) * alphaFactor));
  }
  return { width: columns, height: rows, values, average: values.reduce((a, b) => a + b, 0) / values.length };
}
export function importanceAt(map: ImportanceMap, point: Point, width: number, height: number): number {
  const x = Math.max(0, Math.min(map.width - 1, Math.floor(point.x / width * map.width)));
  const y = Math.max(0, Math.min(map.height - 1, Math.floor(point.y / height * map.height)));
  return map.values[y * map.width + x] ?? map.average;
}
