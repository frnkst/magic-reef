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
    found: { type: 'boolean', description: 'True if one complete fish drawing or illustration can be isolated.' },
    confidence: { type: 'number', description: 'Confidence from 0 to 1 in the contour and landmarks.' },
    reason: { type: 'string', description: 'Brief explanation, or actionable photography advice if no fish is found.' },
    outline: {
      type: 'array',
      description: 'A single clockwise polygon precisely tracing the outside of the actual drawing, including every fin, tail, and dark outline. Use 40–100 ordered vertices, fewer on straight edges. No bounding boxes or generic fish shapes. Empty if not found.',
      items: pointSchema,
    },
    head: { ...pointSchema, description: 'Tip of the nose/mouth, not the eye.' },
    tail: { ...pointSchema, description: 'Center of the end of the tail opposite the head.' },
    back: { ...pointSchema, description: 'A point on the dorsal/top side of the fish, used to keep it upright.' },
  },
  required: ['found', 'confidence', 'reason', 'outline', 'head', 'tail', 'back'],
  additionalProperties: false,
};

function isPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return typeof point.x === 'number' && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1
    && typeof point.y === 'number' && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1;
}

export function parseAnalysis(value: unknown): FishAnalysis {
  if (!value || typeof value !== 'object') throw new Error('AI returned an invalid fish outline. Try another photo.');
  const result = value as Record<string, unknown>;
  if (typeof result.found !== 'boolean' || typeof result.reason !== 'string' || result.reason.length > 1000
    || typeof result.confidence !== 'number' || !Number.isFinite(result.confidence)
    || result.confidence < 0 || result.confidence > 1
    || !Array.isArray(result.outline) || result.outline.length > 160
    || !result.outline.every(isPoint)
    || !isPoint(result.head) || !isPoint(result.tail) || !isPoint(result.back)) {
    throw new Error('AI returned an invalid fish outline. Try another photo.');
  }
  if (!result.found) throw new Error(`AI could not find one complete fish. ${result.reason.trim() || 'Photograph a single drawing clearly from above.'}`);
  if (result.confidence < 0.65 || result.outline.length < 6) {
    throw new Error('AI could not confidently isolate the drawing. Try a clearer photo with the whole fish visible.');
  }
  const outline = result.outline as Point[];
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (Math.abs(area) / 2 < 0.002 || Math.hypot(result.head.x - result.tail.x, result.head.y - result.tail.y) < 0.03) {
    throw new Error('AI found a fish that is too small to extract. Take a closer photo.');
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
        throw new Error('AI returned a tangled fish outline. Try again with a clearer photo.');
      }
    }
  }
  return {
    found: result.found, confidence: result.confidence, reason: result.reason,
    outline, head: result.head, tail: result.tail, back: result.back,
  };
}
