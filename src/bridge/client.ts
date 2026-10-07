import { BRIDGE_CHANNEL, isBridgeMessage, type ApiResponseMessage, type BridgeParamValue } from './protocol';

export interface BridgeClient {
  request(
    path: string,
    method: 'GET' | 'POST',
    params: Record<string, BridgeParamValue>,
  ): Promise<ApiResponseMessage>;
}

export interface BridgeClientOptions {
  timeoutMs?: number;
  token?: string;
}

export function createBridgeClient(options: BridgeClientOptions = {}): BridgeClient {
  const token = options.token ?? crypto.randomUUID();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pending = new Map<string, { resolve: (response: ApiResponseMessage) => void; timer: number }>();

  window.addEventListener('message', (event) => {
    if (event.source !== window || !isBridgeMessage(event.data) || event.data.type !== 'api-response') {
      return;
    }
    const waiter = pending.get(event.data.id);
    if (!waiter) {
      return;
    }
    pending.delete(event.data.id);
    clearTimeout(waiter.timer);
    waiter.resolve(event.data);
  });

  window.postMessage({ channel: BRIDGE_CHANNEL, type: 'hello', token }, '*');

  return {
    request(path, method, params) {
      const id = crypto.randomUUID();
      return new Promise<ApiResponseMessage>((resolve) => {
        const timer = window.setTimeout(() => {
          pending.delete(id);
          resolve({
            channel: BRIDGE_CHANNEL,
            type: 'api-response',
            id,
            ok: false,
            status: 0,
            body: { code: -1, message: '桥接超时' },
          });
        }, timeoutMs);
        pending.set(id, { resolve, timer });
        window.postMessage(
          { channel: BRIDGE_CHANNEL, type: 'api-request', id, token, path, method, params },
          '*',
        );
      });
    },
  };
}
