import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, ownerDatabase, ownerSettings, readJson, requireOwner, requireSameOrigin, sendError } from '../server/owner.ts';
import type { OwnerSettings } from '../server/owner.ts';

export function createDrawingsHandler(settings: OwnerSettings) {
  return async (request: IncomingMessage & { body?: unknown }, response: ServerResponse) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        throw new ApiError(405, 'Use POST to add a drawing.');
      }
      requireSameOrigin(request);
      await requireOwner(request, settings);
      const body = await readJson(request, 710_000);
      if (!body || typeof body !== 'object') throw new ApiError(400, 'The drawing request is invalid.');
      const data = body as Record<string, unknown>;
      const size = data.size === undefined ? 'medium' : data.size;
      const movement = data.movement === undefined ? 'swim' : data.movement;
      if (typeof data.token !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.token)
        || typeof data.name !== 'string' || data.name.trim().length < 1 || data.name.trim().length > 40
        || typeof data.childName !== 'string' || data.childName.trim().length > 40
        || typeof data.image !== 'string' || data.image.length > 700_000 || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(data.image)
        || typeof data.aspect !== 'number' || !Number.isFinite(data.aspect) || data.aspect < 0.2 || data.aspect > 5
        || (data.facing !== 'left' && data.facing !== 'right')
        || (data.kind !== 'fish' && data.kind !== 'submarine' && data.kind !== 'plant')
        || (size !== 'small' && size !== 'medium' && size !== 'large')
        || (movement !== 'swim' && movement !== 'walk') || (movement === 'walk' && data.kind !== 'fish')) {
        throw new ApiError(400, 'Use a valid drawing cutout and names of at most 40 characters.');
      }
      const { error } = await ownerDatabase(settings).rpc('add_reef_drawing', {
        tank_token: data.token, fish_name: data.name, fish_image: data.image,
        fish_aspect: data.aspect, fish_facing: data.facing, drawing_kind: data.kind, child_name: data.childName,
        drawing_size: size,
        drawing_movement: movement,
      });
      if (error) {
        if (error.code === 'P0001') throw new ApiError(422, error.message);
        console.error('Owner drawing upload failed', { code: error.code });
        throw new ApiError(503, 'The drawing could not be saved. Check the party database setup.');
      }
      response.end(JSON.stringify({ saved: true }));
    } catch (error) { sendError(response, error); }
  };
}

export default createDrawingsHandler(ownerSettings);
