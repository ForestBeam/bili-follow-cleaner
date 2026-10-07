export const BRIDGE_CHANNEL = 'bfc-bridge';
export const API_BASE = 'https://api.bilibili.com';

export type BridgeParamValue = string | number | boolean;

export interface HelloMessage {
  channel: typeof BRIDGE_CHANNEL;
  type: 'hello';
  token: string;
}

export interface ApiRequestMessage {
  channel: typeof BRIDGE_CHANNEL;
  type: 'api-request';
  id: string;
  token: string;
  path: string;
  method: 'GET' | 'POST';
  params: Record<string, BridgeParamValue>;
}

export interface ApiResponseMessage {
  channel: typeof BRIDGE_CHANNEL;
  type: 'api-response';
  id: string;
  ok: boolean;
  status: number;
  body: unknown;
}

export type BridgeMessage = HelloMessage | ApiRequestMessage | ApiResponseMessage;

export function isBridgeMessage(data: unknown): data is BridgeMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const message = data as Record<string, unknown>;
  if (message.channel !== BRIDGE_CHANNEL) {
    return false;
  }
  return message.type === 'hello' || message.type === 'api-request' || message.type === 'api-response';
}
