import { md5Hex } from './md5';

export const MIXIN_KEY_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

export interface WbiKeys {
  imgKey: string;
  subKey: string;
}

export type ParamValue = string | number | boolean;

export function mixinKey(raw: string): string {
  let key = '';
  for (const index of MIXIN_KEY_TAB) {
    key += raw[index] ?? '';
  }
  return key.slice(0, 32);
}

function stripSpecials(value: string): string {
  return value.replace(/[!'()*]/g, '');
}

function encodeComponent(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}

export function buildQuery(params: Record<string, ParamValue>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeComponent(key)}=${encodeComponent(String(params[key]))}`)
    .join('&');
}

export function signParams(
  params: Record<string, ParamValue>,
  keys: WbiKeys & { wts: number },
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    cleaned[key] = stripSpecials(String(value));
  }
  cleaned.wts = String(keys.wts);
  const query = buildQuery(cleaned);
  return { ...cleaned, w_rid: md5Hex(query + mixinKey(keys.imgKey + keys.subKey)) };
}
