import { db } from '../lib/db';

export class NetworkDisabledError extends Error {
  constructor(message: string = 'External Network Features are disabled in privacy settings.') {
    super(message);
    this.name = 'NetworkDisabledError';
  }
}

/**
 * checkNetworkConsent
 * 
 * Intercepts network-bound requests and verifies if the user has enabled
 * "External Network Features" in their privacy settings.
 * 
 * @throws {NetworkDisabledError} If external network access is disabled.
 */
export async function checkNetworkConsent(): Promise<boolean> {
  const setting = await db.app_settings.get('enableNetworkIntegrations');

  // FAIL-CLOSED: Only an explicit `true` permits network access.
  // undefined, null, or false are all treated as denied.
  if (setting?.value !== true) {
    throw new NetworkDisabledError();
  }

  return true;
}
