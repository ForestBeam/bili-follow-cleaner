import { API_BASE, BRIDGE_CHANNEL, type ApiRequestMessage, type ApiResponseMessage } from '../bridge/protocol';
import { buildQuery } from '../core/wbi';

export interface ResponderOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
}

export function createApiResponder(options: ResponderOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const baseUrl = options.baseUrl ?? API_BASE;

  return async function respond(request: ApiRequestMessage): Promise<ApiResponseMessage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const query = buildQuery(request.params);
      const url = request.method === 'GET' ? `${baseUrl}${request.path}?${query}` : `${baseUrl}${request.path}`;
      const init: RequestInit = {
        method: request.method,
        credentials: 'include',
        signal: controller.signal,
      };
      if (request.method === 'POST') {
        init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        init.body = query;
      }
      const response = await fetchImpl(url, init);
      const text = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = { code: -1, message: '非 JSON 响应' };
      }
      return {
        channel: BRIDGE_CHANNEL,
        type: 'api-response',
        id: request.id,
        ok: response.ok,
        status: response.status,
        body,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        channel: BRIDGE_CHANNEL,
        type: 'api-response',
        id: request.id,
        ok: false,
        status: 0,
        body: { code: -1, message },
      };
    } finally {
      clearTimeout(timer);
    }
  };
}
