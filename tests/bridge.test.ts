import { describe, expect, it, vi } from 'vitest';
import { API_BASE, BRIDGE_CHANNEL, isBridgeMessage, type ApiRequestMessage } from '../src/bridge/protocol';
import { createApiResponder } from '../src/content-main/responder';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function makeRequest(overrides: Partial<ApiRequestMessage> = {}): ApiRequestMessage {
  return {
    channel: BRIDGE_CHANNEL,
    type: 'api-request',
    id: 'req-1',
    token: 't',
    path: '/x/relation/followings',
    method: 'GET',
    params: { vmid: 1, ps: 50, order: 'desc', jsonp: 'jsonp', wts: 1, w_rid: 'abc' },
    ...overrides,
  };
}

describe('createApiResponder', () => {
  it('builds a sorted, encoded GET url and includes credentials', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ code: 0, data: { total: 3 } }));
    const respond = createApiResponder({ fetchImpl: fetchMock as unknown as typeof fetch });

    const response = await respond(makeRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `${API_BASE}/x/relation/followings?jsonp=jsonp&order=desc&ps=50&vmid=1&w_rid=abc&wts=1`,
    );
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ code: 0, data: { total: 3 } });
  });

  it('posts urlencoded bodies', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ code: 0 }));
    const respond = createApiResponder({ fetchImpl: fetchMock as unknown as typeof fetch });

    await respond(
      makeRequest({
        path: '/x/relation/modify',
        method: 'POST',
        params: { fid: 9, act: 2, re_src: 11, csrf: 'token' },
      }),
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE}/x/relation/modify`);
    expect(init.body).toBe('act=2&csrf=token&fid=9&re_src=11');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('falls back to code -1 for non json responses', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '<html>' }) as Response);
    const respond = createApiResponder({ fetchImpl: fetchMock as unknown as typeof fetch });

    const response = await respond(makeRequest());

    expect(response.ok).toBe(true);
    expect(response.body).toMatchObject({ code: -1 });
  });

  it('keeps the bilibili error code from http failures', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ code: -352, message: '风控' }, 412));
    const respond = createApiResponder({ fetchImpl: fetchMock as unknown as typeof fetch });

    const response = await respond(makeRequest());

    expect(response.ok).toBe(false);
    expect(response.status).toBe(412);
    expect(response.body).toMatchObject({ code: -352 });
  });

  it('maps network errors to code -1 with status 0', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const respond = createApiResponder({ fetchImpl: fetchMock as unknown as typeof fetch });

    const response = await respond(makeRequest());

    expect(response.ok).toBe(false);
    expect(response.status).toBe(0);
    expect(response.body).toMatchObject({ code: -1, message: 'network down' });
  });

  it('aborts and reports a timeout', async () => {
    const slowFetch = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const respond = createApiResponder({ fetchImpl: slowFetch as unknown as typeof fetch, timeoutMs: 10 });

    const response = await respond(makeRequest());

    expect(response.status).toBe(0);
    expect(response.body).toMatchObject({ code: -1 });
  });
});

describe('isBridgeMessage', () => {
  it('accepts messages on the bridge channel', () => {
    expect(isBridgeMessage({ channel: BRIDGE_CHANNEL, type: 'hello', token: 'x' })).toBe(true);
  });

  it('rejects foreign or malformed payloads', () => {
    expect(isBridgeMessage(null)).toBe(false);
    expect(isBridgeMessage('hello')).toBe(false);
    expect(isBridgeMessage({ channel: 'other', type: 'hello' })).toBe(false);
    expect(isBridgeMessage({ channel: BRIDGE_CHANNEL, type: 'nope' })).toBe(false);
  });
});
