import { afterEach, describe, expect, test } from 'bun:test';

import { createProtonHttpClient, type Session } from './auth.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createSession(): Session {
  return {
    UID: 'uid',
    AccessToken: 'expired-access-token',
    RefreshToken: 'refresh-token',
  };
}

describe('Proton HTTP token refresh', () => {
  test('surfaces a failed refresh instead of returning the original 401', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    const client = createProtonHttpClient(createSession(), async () => {
      throw new Error('INVALID_REFRESH_TOKEN');
    });

    await expect(
      client.fetchJson({
        url: 'core/v4/users',
        method: 'GET',
        headers: new Headers(),
        timeoutMs: 1_000,
      })
    ).rejects.toThrow('Token refresh failed: INVALID_REFRESH_TOKEN');
  });

  test('retries once with the updated access token after a successful refresh', async () => {
    const session = createSession();
    const authorizationHeaders: string[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      authorizationHeaders.push(headers.get('Authorization') ?? '');
      return new Response('{}', { status: authorizationHeaders.length === 1 ? 401 : 200 });
    }) as unknown as typeof fetch;
    const client = createProtonHttpClient(session, async () => {
      session.AccessToken = 'fresh-access-token';
      session.RefreshToken = 'fresh-refresh-token';
    });

    const response = await client.fetchJson({
      url: 'core/v4/users',
      method: 'GET',
      headers: new Headers(),
      timeoutMs: 1_000,
    });

    expect(response.status).toBe(200);
    expect(authorizationHeaders).toEqual([
      'Bearer expired-access-token',
      'Bearer fresh-access-token',
    ]);
  });
});
