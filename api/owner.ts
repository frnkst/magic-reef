import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, ownerSettings, requireOwner, sendError } from '../server/owner.ts';
import type { OwnerSettings } from '../server/owner.ts';

export function createOwnerHandler(settings: OwnerSettings) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    try {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        throw new ApiError(405, 'Use GET to check owner login.');
      }
      await requireOwner(request, settings);
      response.end(JSON.stringify({ allowed: true }));
    } catch (error) { sendError(response, error); }
  };
}

export default createOwnerHandler(ownerSettings);
