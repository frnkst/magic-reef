import { createClient } from '@supabase/supabase-js';

export interface Fish {
  id: string;
  name: string;
  image: string;
  aspect: number;
  facing: 'left' | 'right';
}

interface FishSummary {
  id: string;
  name: string;
  aspect: number;
  facing: 'left' | 'right';
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
    && (fish.facing === 'left' || fish.facing === 'right');
}

export async function createTank(): Promise<string> {
  if (!client) throw new Error('Connect Supabase to create a shared aquarium. The local demo works without it.');
  const { data, error } = await client.rpc('create_tank');
  if (error) throw new Error(`Could not create the aquarium: ${error.message}`);
  if (typeof data !== 'string') throw new Error('The server returned an invalid aquarium link.');
  return data;
}

export async function loadFish(token: string, previous: Fish[]): Promise<Fish[]> {
  if (!client) throw new Error('Supabase is not configured. Add the environment variables and redeploy.');
  const { data, error } = await client.rpc('list_fish', { tank_token: token });
  if (error) throw new Error(`Could not sync the aquarium: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('The server returned an invalid fish list.');
  const summaries = data as FishSummary[];
  const known = new Map(previous.map((fish) => [fish.id, fish]));
  return Promise.all(summaries.map(async (summary) => {
    const existing = known.get(summary.id);
    if (existing) return existing;
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
    if (existing.length >= MAX_FISH) throw new Error('This aquarium is full (40 fish).');
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
  const { error } = await client.rpc('add_fish', {
    tank_token: token,
    fish_name: fish.name,
    fish_image: fish.image,
    fish_aspect: fish.aspect,
    fish_facing: fish.facing,
  });
  if (error) throw new Error(`Your fish could not be released: ${error.message}`);
}

export function reefLink(token: string | null, demo: boolean, upload = false): string {
  const link = new URL(window.location.origin);
  if (demo) link.searchParams.set('demo', '1');
  else if (token) link.searchParams.set('tank', token);
  if (upload) link.searchParams.set('view', 'upload');
  return link.toString();
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
