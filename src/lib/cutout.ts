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

export async function prepareFish(image: HTMLImageElement, token: string | null, demo: boolean): Promise<Omit<Fish, 'id' | 'name'>> {
  const photo = makePhoto(image);
  const encoded = photo.toDataURL('image/jpeg', 0.85);
  if (encoded.length > 3_000_000) throw new Error('This photo is too detailed. Take a closer photo of just the drawing.');
  let response: Response;
  try {
    response = await fetch('/api/analyze-fish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: encoded, token, demo }),
      signal: AbortSignal.timeout(55_000),
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
  return extractDrawing(image, parseAnalysis(data));
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
  const facing = backY > 0 ? 'left' : 'right';
  if (backY > 0) angle += Math.PI;
  const rotate = (point: Point) => {
    const x = point.x * width - center.x;
    const y = point.y * height - center.y;
    return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
  };
  const points = analysis.outline.map(rotate);
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
  if (aspect < 0.2 || aspect > 5) throw new Error('AI found an unusual fish shape. Try a clearer photo of the whole drawing.');
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
  return { image: result, aspect: canvas.width / canvas.height, facing };
}

function removePaper(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  const brightness: number[] = [];
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    if (data[offset + 3] === 0) continue;
    const min = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    const max = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    if (max - min < 40 && min > 140) brightness.push(min);
  }
  if (brightness.length === 0) {
    throw new Error('The drawing needs a plain, light paper background. Take a well-lit photo on white paper.');
  }
  brightness.sort((a, b) => a - b);
  const threshold = Math.max(145, brightness[Math.floor(brightness.length * 0.85)] - 65);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let start = 0;
  let end = 0;
  const enqueue = (index: number) => {
    if (visited[index]) return;
    visited[index] = 1;
    const offset = index * 4;
    const min = Math.min(data[offset], data[offset + 1], data[offset + 2]);
    const max = Math.max(data[offset], data[offset + 1], data[offset + 2]);
    if (data[offset + 3] === 0 || (min >= threshold && max - min < 45)) queue[end++] = index;
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
  let visible = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 0) visible++;
  if (visible < width * height * 0.015) {
    throw new Error('Too much of the drawing disappeared. Try a well-lit photo with a closed, dark fish outline.');
  }
  context.putImageData(pixels, 0, 0);
}
