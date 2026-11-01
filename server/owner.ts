import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';

export interface OwnerSettings {
  authUrl?: string;
  authKey?: string;
  ownerId?: string;
  databaseUrl?: string;
  databaseKey?: string;
}

export const ownerSettings: OwnerSettings = {
  authUrl: process.env.VITE_AUTH_SUPABASE_URL,
  authKey: process.env.VITE_AUTH_SUPABASE_PUBLISHABLE_KEY,
  ownerId: process.env.ALLOWED_GITHUB_USER_ID,
  databaseUrl: process.env.VITE_SUPABASE_URL,
  databaseKey: process.env.SUPABASE_SECRET_KEY,
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireOwner(request: IncomingMessage, settings: OwnerSettings) {
  if (!settings.authUrl || !settings.authKey || !settings.ownerId || !/^\d+$/.test(settings.ownerId)) {
    throw new ApiError(503, 'Owner login is not configured on the server.');
  }
  const bearer = request.headers.authorization;
  if (!bearer?.startsWith('Bearer ') || bearer.length > 10_000) {
    throw new ApiError(401, 'Sign in with the aquarium owner’s GitHub account to upload drawings.');
  }
  const auth = createClient(settings.authUrl, settings.authKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.getUser(bearer.slice(7));
  if (error) {
    if (!error.status || error.status >= 500) {
      console.error('Owner authentication unavailable', { status: error.status });
      throw new ApiError(503, 'GitHub login could not be verified right now. Try again.');
    }
    throw new ApiError(401, 'Your login has expired. Sign in with GitHub again.');
  }
  const identity = data.user?.identities?.find((entry) => entry.provider === 'github');
  const id: unknown = identity?.identity_data?.provider_id ?? identity?.identity_data?.sub;
  if ((typeof id !== 'string' && typeof id !== 'number') || String(id) !== settings.ownerId) {
    throw new ApiError(403, 'Only the aquarium owner can upload drawings. Everyone can watch the reef.');
  }
}

export function ownerDatabase(settings: OwnerSettings) {
  if (!settings.databaseUrl || !settings.databaseKey) {
    throw new ApiError(503, 'Owner uploads are not configured on the server.');
  }
  return createClient(settings.databaseUrl, settings.databaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function requireSameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  let originHost: string | null;
  try { originHost = origin ? new URL(origin).host : null; }
  catch { throw new ApiError(403, 'Open this action on the aquarium’s website.'); }
  if (!originHost || originHost !== request.headers.host) {
    throw new ApiError(403, 'Open this action on the aquarium’s website.');
  }
}

export async function readJson(request: IncomingMessage & { body?: unknown }, limit: number): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new ApiError(415, 'The request must be JSON.');
  }
  let text: string;
  if (request.body !== undefined) {
    text = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  } else {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) throw new ApiError(413, 'The request is too large.');
      chunks.push(buffer);
    }
    text = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(text) > limit) throw new ApiError(413, 'The request is too large.');
  try { return JSON.parse(text); }
  catch { throw new ApiError(400, 'The request is invalid.'); }
}

export function sendError(response: ServerResponse, error: unknown) {
  if (!(error instanceof ApiError)) {
    console.error('Owner aquarium action failed', { name: error instanceof Error ? error.name : 'UnknownError' });
  }
  response.statusCode = error instanceof ApiError ? error.status : 503;
  response.end(JSON.stringify({ error: error instanceof ApiError ? error.message : 'The aquarium service is unavailable. Try again.' }));
}
