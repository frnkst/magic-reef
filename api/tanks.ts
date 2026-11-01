import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, ownerDatabase, ownerSettings, requireOwner, requireSameOrigin, sendError } from '../server/owner.ts';
import type { OwnerSettings } from '../server/owner.ts';

export function createTanksHandler(settings: OwnerSettings) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        throw new ApiError(405, 'Use POST to create an aquarium.');
      }
      requireSameOrigin(request);
      await requireOwner(request, settings);
      const { data, error } = await ownerDatabase(settings).rpc('create_tank');
      if (error) {
        if (error.code === 'P0001') throw new ApiError(422, error.message);
        console.error('Owner aquarium creation failed', { code: error.code });
        throw new ApiError(503, 'The aquarium could not be created. Try again.');
      }
      response.end(JSON.stringify({ token: data }));
    } catch (error) { sendError(response, error); }
  };
}

export default createTanksHandler(ownerSettings);
