import { parseAnalysis } from './analysis';
import type { FishAnalysis, Point } from './analysis';
import type { Fish } from './reef';

export async function openPhoto(file: File): Promise<HTMLImageElement> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo or image of your drawing.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a photo smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new Error('This photo format could not be opened. Try a JPEG or PNG (or take a new photo).');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makePhoto(image: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser does not support photo processing.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function prepareFish(image: HTMLImageElement, token: string | null, demo: boolean, interpretation = 0): Promise<Omit<Fish, 'id' | 'name'>> {
  const photo = makePhoto(image);
  const encoded = photo.toDataURL('image/jpeg', 0.85);
  if (encoded.length > 3_000_000) throw new Error('This photo is too detailed. Take a closer photo of just the drawing.');
  let response: Response;
  try {
    response = await fetch('/api/analyze-fish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: encoded, token, demo, interpretation }),
      signal: AbortSignal.timeout(115_000),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('AI preparation timed out. Please try again.');
    }
    throw new Error('Could not reach the AI preparation service. Check your connection and try again.');
  }
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The AI endpoint is unavailable. Use npm run dev locally or deploy the Vercel API function.');
  }
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error : 'AI preparation failed. Please try again.';
    throw new Error(message);
  }
  if (interpretation === 0) return extractDrawing(image, parseAnalysis(data));
  if (!data || typeof data !== 'object' || !('image' in data) || !('analysis' in data)
    || typeof data.image !== 'string' || data.image.length > 4_000_000
    || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.image)) {
    throw new Error('AI returned an invalid edited image. Try again or select Keep my drawing.');
  }
  const edited = new Image();
  edited.src = data.image;
  try { await edited.decode(); }
  catch { throw new Error('The AI-edited image could not be opened. Try again or select Keep my drawing.'); }
  return extractDrawing(edited, parseAnalysis(data.analysis));
}

export function extractDrawing(image: HTMLImageElement, analysis: FishAnalysis): Omit<Fish, 'id' | 'name'> {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const center = {
    x: (analysis.head.x + analysis.tail.x) * width / 2,
    y: (analysis.head.y + analysis.tail.y) * height / 2,
  };
  let angle = -Math.atan2((analysis.head.y - analysis.tail.y) * height, (analysis.head.x - analysis.tail.x) * width);
  const backY = (analysis.back.x * width - center.x) * Math.sin(angle)
    + (analysis.back.y * height - center.y) * Math.cos(angle);
  // Keep the dorsal side up with rotation, never by mirroring the child's drawing.
  const facing = analysis.kind !== 'plant' && backY > 0 ? 'left' : 'right';
  if (analysis.kind === 'plant') angle -= Math.PI / 2;
  else if (backY > 0) angle += Math.PI;
  const rotate = (point: Point) => {
    const x = point.x * width - center.x;
    const y = point.y * height - center.y;
    return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
  };
  // Vision models can hug the body too closely and miss small fins. Add a
  // paper safety margin in photo pixels before rotating and removing paper.
  const [topLeft, topRight, bottomRight] = analysis.outline;
  const margin = Math.max((topRight.x - topLeft.x) * width, (bottomRight.y - topLeft.y) * height) * 0.1;
  const left = Math.max(0, topLeft.x - margin / width);
  const right = Math.min(1, topRight.x + margin / width);
  const top = Math.max(0, topLeft.y - margin / height);
  const bottom = Math.min(1, bottomRight.y + margin / height);
  const points = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }].map(rotate);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const sourceWidth = maxX - minX;
  const sourceHeight = maxY - minY;
  if (sourceWidth < 12 || sourceHeight < 12) throw new Error('The drawing is too small. Take a closer photo.');
  const scale = Math.min(1, 594 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(sourceWidth * scale) + 6;
  canvas.height = Math.ceil(sourceHeight * scale) + 6;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser does not support photo processing.');
  context.beginPath();
  points.forEach((point, index) => {
    const x = (point.x - minX) * scale + 3;
    const y = (point.y - minY) * scale + 3;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.clip();
  context.translate(3 - minX * scale, 3 - minY * scale);
  context.scale(scale, scale);
  context.rotate(angle);
  context.translate(-center.x, -center.y);
  context.drawImage(image, 0, 0);
  removePaper(canvas, context);
  const aspect = canvas.width / canvas.height;
  if (aspect < 0.2 || aspect > 5) throw new Error('AI found an unusual shape. Try a clearer photo of the whole drawing.');
  let result = canvas.toDataURL('image/png');
  // Reduce resolution, not colors, when a textured photo exceeds the storage limit.
  while (result.length > 700_000 && canvas.width > 160 && canvas.height > 80) {
    const smaller = document.createElement('canvas');
    smaller.width = Math.round(canvas.width * 0.8);
    smaller.height = Math.round(canvas.height * 0.8);
    const smallerContext = smaller.getContext('2d');
    if (!smallerContext) throw new Error('Your browser does not support photo processing.');
    smallerContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    canvas.width = smaller.width;
    canvas.height = smaller.height;
    context.drawImage(smaller, 0, 0);
    result = canvas.toDataURL('image/png');
  }
  if (result.length > 700_000) throw new Error('The cutout is too large to save. Try a better-lit photo.');
  return { image: result, aspect: canvas.width / canvas.height, facing, kind: analysis.kind };
}

function removePaper(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  const paper: { brightness: number; red: number; blue: number }[] = [];
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    if (data[offset + 3] === 0) continue;
    const min = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    const max = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    const x = index % width;
    const y = Math.floor(index / width);
    const onEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1
      || data[(index - 1) * 4 + 3] === 0 || data[(index + 1) * 4 + 3] === 0
      || data[(index - width) * 4 + 3] === 0 || data[(index + width) * 4 + 3] === 0;
    if (onEdge && max - min < 40 && min > 65) {
      paper.push({ brightness: min, red: data[offset] - data[offset + 1], blue: data[offset + 2] - data[offset + 1] });
    }
  }
  if (paper.length < 8) {
    throw new Error('The drawing needs a plain, light paper background. Take a well-lit photo on white paper.');
  }
  paper.sort((a, b) => a.brightness - b.brightness);
  const background = paper[Math.floor(paper.length * 0.5)];
  const threshold = Math.max(55, paper[Math.floor(paper.length * 0.1)].brightness - 25);
  const isPaper = new Uint8Array(width * height);
  const barrier = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    const min = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    const neutral = Math.abs(data[offset] - data[offset + 1] - background.red) < 22
      && Math.abs(data[offset + 2] - data[offset + 1] - background.blue) < 22;
    isPaper[index] = data[offset + 3] === 0 || (min >= threshold && neutral) ? 1 : 0;
  }
  // Seal small breaks in pencil/crayon outlines before flood filling. This mask
  // only protects interiors; the saved colors still come from the original photo.
  const radius = 6;
  for (let index = 0; index < width * height; index++) {
    if (isPaper[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) {
          barrier[(y + dy) * width + x + dx] = 1;
        }
      }
    }
  }
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let start = 0;
  let end = 0;
  const enqueue = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    if (isPaper[index] && !barrier[index]) queue[end++] = index;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  // Only edge-connected paper is removed; closed white details remain intact.
  while (start < end) {
    const index = queue[start++];
    data[index * 4 + 3] = 0;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y < height - 1) enqueue(index + width);
  }
  barrier.fill(0);
  for (let index = 0; index < end; index++) barrier[queue[index]] = 1;
  // Remove the thin paper margin introduced by the protective mask without
  // erasing ink or letting the flood escape into enclosed pale coloring.
  for (let index = 0; index < width * height; index++) {
    if (!isPaper[index] || barrier[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    let outside = false;
    for (let dy = -radius; dy <= radius && !outside; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height
          && barrier[(y + dy) * width + x + dx]) {
          outside = true;
          break;
        }
      }
    }
    if (outside) data[index * 4 + 3] = 0;
  }
  let visible = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 0) visible++;
  if (visible < width * height * 0.015) {
    throw new Error('Too much of the drawing disappeared. Try a well-lit photo with a closed, dark outline.');
  }
  context.putImageData(pixels, 0, 0);
}
