/** Crop metrics are diagnostics, not new recognition gates. */
export function cropMetrics(canvas: HTMLCanvasElement, box: { x: number; y: number; width: number; height: number }) {
  const x = Math.max(0, Math.floor(box.x)), y = Math.max(0, Math.floor(box.y));
  const width = Math.min(canvas.width - x, Math.floor(box.width));
  const height = Math.min(canvas.height - y, Math.floor(box.height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || width < 3 || height < 3) return { blur: null, luminance: null };
  const rgba = ctx.getImageData(x, y, width, height).data;
  const gray = new Float32Array(width * height);
  let luminance = 0;
  for (let i = 0; i < gray.length; i++) {
    gray[i] = rgba[i * 4] * .299 + rgba[i * 4 + 1] * .587 + rgba[i * 4 + 2] * .114;
    luminance += gray[i];
  }
  let sum = 0, squares = 0;
  for (let row = 1; row < height - 1; row++) for (let col = 1; col < width - 1; col++) {
    const i = row * width + col;
    const lap = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
    sum += lap; squares += lap * lap;
  }
  const n = (width - 2) * (height - 2);
  return { blur: squares / n - (sum / n) ** 2, luminance: luminance / gray.length };
}
