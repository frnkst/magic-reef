import { createClient } from '@supabase/supabase-js';
import { ownerRequest } from './auth';

export type DrawingKind = 'fish' | 'submarine' | 'plant';
export type DrawingSize = 'small' | 'medium' | 'large';
export type DrawingMovement = 'swim' | 'walk';

export interface Fish {
  id: string;
  name: string;
  image: string;
  aspect: number;
  facing: 'left' | 'right';
  kind?: DrawingKind;
  child?: string;
  size?: DrawingSize;
  movement?: DrawingMovement;
}

interface FishSummary {
  id: string;
  name: string;
  aspect: number;
  facing: 'left' | 'right';
  kind: DrawingKind;
  child: string;
  size: DrawingSize;
  movement: DrawingMovement;
}

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
const client = configured ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}) : null;

const DEMO_KEY = 'magic-reef-demo-fish';
export const MAX_FISH = 40;

export function readDemoFish(): Fish[] {
  const raw = localStorage.getItem(DEMO_KEY);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || !value.every(isFish)) {
      throw new Error('The saved demo aquarium is damaged. Clear this site’s storage to reset it.');
    }
    return value;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('The saved demo aquarium could not be read. Clear this site’s storage to reset it.');
    }
    throw error;
  }
}

function isFish(value: unknown): value is Fish {
  if (!value || typeof value !== 'object') return false;
  const fish = value as Record<string, unknown>;
  return typeof fish.id === 'string' && typeof fish.name === 'string'
    && typeof fish.image === 'string' && fish.image.startsWith('data:image/png;base64,')
    && typeof fish.aspect === 'number' && fish.aspect >= 0.2 && fish.aspect <= 5
    && (fish.facing === 'left' || fish.facing === 'right')
    && (fish.kind === undefined || fish.kind === 'fish' || fish.kind === 'submarine' || fish.kind === 'plant')
    && (fish.child === undefined || (typeof fish.child === 'string' && fish.child.length <= 40))
    && (fish.size === undefined || fish.size === 'small' || fish.size === 'medium' || fish.size === 'large')
    && (fish.movement === undefined || fish.movement === 'swim' || fish.movement === 'walk');
}

export async function createTank(): Promise<string> {
  if (!client) throw new Error('Connect Supabase to create a shared aquarium. The local demo works without it.');
  const result = await ownerRequest('/api/tanks', {});
  if (!result || typeof result !== 'object' || !('token' in result) || typeof result.token !== 'string') {
    throw new Error('The server returned an invalid aquarium link.');
  }
  return result.token;
}

export async function loadFish(token: string, previous: Fish[]): Promise<Fish[]> {
  if (!client) throw new Error('Supabase is not configured. Add the environment variables and redeploy.');
  const { data, error } = await client.rpc('list_reef_drawings', { tank_token: token });
  if (error) throw new Error(`Could not sync the aquarium: ${error.message}`);
  if (!Array.isArray(data) || !data.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as Record<string, unknown>;
    return typeof value.id === 'string' && typeof value.name === 'string'
      && typeof value.aspect === 'number' && value.aspect >= 0.2 && value.aspect <= 5
      && (value.facing === 'left' || value.facing === 'right')
      && (value.kind === 'fish' || value.kind === 'submarine' || value.kind === 'plant')
      && typeof value.child === 'string' && value.child.length <= 40
      && (value.size === 'small' || value.size === 'medium' || value.size === 'large')
      && (value.movement === 'swim' || value.movement === 'walk');
  })) throw new Error('The server returned an invalid drawing list.');
  const summaries = data as FishSummary[];
  const known = new Map(previous.map((fish) => [fish.id, fish]));
  return Promise.all(summaries.map(async (summary) => {
    const existing = known.get(summary.id);
    if (existing) return { ...existing, kind: summary.kind, child: summary.child, size: summary.size, movement: summary.movement };
    const result = await client.rpc('get_fish_image', { tank_token: token, fish_id: summary.id });
    if (result.error) throw new Error(`Could not load ${summary.name}: ${result.error.message}`);
    const fish = { ...summary, image: result.data };
    if (!isFish(fish)) throw new Error('The server returned an invalid fish drawing.');
    return fish;
  }));
}

export async function releaseFish(token: string | null, fish: Omit<Fish, 'id'>, demo: boolean): Promise<void> {
  if (demo) {
    const existing = readDemoFish();
    if (existing.length >= MAX_FISH) throw new Error('This aquarium is full (40 drawings).');
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify([...existing, { ...fish, id: crypto.randomUUID() }]));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        throw new Error('This browser’s demo storage is full. A Supabase aquarium has room for more drawings.');
      }
      throw error;
    }
    return;
  }
  if (!client || !token) throw new Error('This upload link is not connected to an aquarium.');
  const result = await ownerRequest('/api/drawings', {
    token, name: fish.name, image: fish.image, aspect: fish.aspect,
    facing: fish.facing, kind: fish.kind ?? 'fish', childName: fish.child ?? '', size: fish.size ?? 'medium',
    movement: fish.movement ?? 'swim',
  });
  if (!result || typeof result !== 'object' || !('saved' in result) || result.saved !== true) {
    throw new Error('The server did not confirm the drawing was saved.');
  }
}

export function reefLink(token: string | null, demo: boolean, upload = false, child = ''): string {
  const link = new URL(window.location.origin);
  if (demo) link.searchParams.set('demo', '1');
  else if (token) link.searchParams.set('tank', token);
  if (upload) link.searchParams.set('view', 'upload');
  else if (child) link.searchParams.set('child', child);
  return link.toString();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
