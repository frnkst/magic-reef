import type { DrawingKind } from './reef.ts';

export interface Point {
  x: number;
  y: number;
}

export interface FishAnalysis {
  found: boolean;
  confidence: number;
  reason: string;
  outline: Point[];
  head: Point;
  tail: Point;
  back: Point;
  kind: DrawingKind;
}

const pointSchema = {
  type: 'object',
  properties: {
    x: { type: 'number', description: 'Horizontal coordinate, 0 at left and 1 at right.' },
    y: { type: 'number', description: 'Vertical coordinate, 0 at top and 1 at bottom.' },
  },
  required: ['x', 'y'],
  additionalProperties: false,
};

export const analysisSchema = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'True if one complete fish, submarine, or underwater plant drawing can be identified.' },
    kind: { type: 'string', enum: ['fish', 'submarine', 'plant'], description: 'The actual subject: fish, submarine, or stationary underwater plant.' },
    confidence: { type: 'number', description: 'Confidence from 0 to 1 in the contour and landmarks.' },
    reason: { type: 'string', description: 'Brief explanation, or actionable photography advice if no supported drawing is found.' },
    outline: {
      type: 'array',
      description: 'Exactly four clockwise corners of an axis-aligned bounding rectangle around the entire drawing, including fins, periscopes, propellers, leaves, roots, and ink outline. Order: top-left, top-right, bottom-right, bottom-left. Include a small margin of plain paper (about 3 percent of subject size) on every side. Empty if not found.',
      items: pointSchema,
    },
    head: { ...pointSchema, description: 'Fish: nose tip; submarine: front/bow opposite the propeller; plant: uppermost tip of its growth.' },
    tail: { ...pointSchema, description: 'Fish: center of tail end; submarine: back/stern at the propeller; plant: center of base or roots.' },
    back: { ...pointSchema, description: 'Fish: dorsal/top side; submarine: top of hull/periscope; plant: a leaf or branch on the right side when upright.' },
  },
  required: ['found', 'kind', 'confidence', 'reason', 'outline', 'head', 'tail', 'back'],
  additionalProperties: false,
};

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return typeof point.x === 'number' && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1
    && typeof point.y === 'number' && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1;
}

export function parseAnalysis(value: unknown): FishAnalysis {
  if (!value || typeof value !== 'object') throw new Error('AI returned an invalid drawing crop. Try another photo.');
  const result = value as Record<string, unknown>;
  if (typeof result.found !== 'boolean' || typeof result.reason !== 'string' || result.reason.length > 1000
    || typeof result.confidence !== 'number' || !Number.isFinite(result.confidence)
    || result.confidence < 0 || result.confidence > 1
    || !Array.isArray(result.outline) || result.outline.length > 160
    || !result.outline.every(isPoint)
    || !isPoint(result.head) || !isPoint(result.tail) || !isPoint(result.back)
    || (result.kind !== 'fish' && result.kind !== 'submarine' && result.kind !== 'plant')) {
    throw new Error('AI returned an invalid drawing crop. Try another photo.');
  }
  if (!result.found) throw new Error(`AI could not find one complete drawing. ${result.reason.trim() || 'Photograph a single fish, submarine, or plant clearly from above.'}`);
  if (result.confidence < 0.65 || result.outline.length !== 4) {
    throw new Error('AI could not confidently isolate the drawing. Try a clearer photo with the whole subject visible.');
  }
  const outline = result.outline as Point[];
  const [topLeft, topRight, bottomRight, bottomLeft] = outline;
  const close = (a: number, b: number) => Math.abs(a - b) < 0.002;
  if (!close(topLeft.y, topRight.y) || !close(bottomLeft.y, bottomRight.y)
    || !close(topLeft.x, bottomLeft.x) || !close(topRight.x, bottomRight.x)
    || topRight.x <= topLeft.x || bottomLeft.y <= topLeft.y) {
    throw new Error('AI returned an invalid photo crop. Try a clearer photo.');
  }
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(area) / 2 < 0.002 || Math.hypot(result.head.x - result.tail.x, result.head.y - result.tail.y) < 0.03) {
    throw new Error('AI found a drawing that is too small to extract. Take a closer photo.');
  }
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    for (let j = i + 2; j < outline.length; j++) {
      if (i === 0 && j === outline.length - 1) continue;
      const c = outline[j];
      const d = outline[(j + 1) % outline.length];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) {
        throw new Error('AI returned a tangled drawing outline. Try again with a clearer photo.');
      }
    }
  }
  return {
    found: result.found, confidence: result.confidence, reason: result.reason,
    outline, head: result.head, tail: result.tail, back: result.back, kind: result.kind,
  };
}
