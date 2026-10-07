export const RETRYABLE_CODES = new Set([-352, -412, -509, -1]);
export const FATAL_CODES = new Set([-101, -111]);

export type ApiOutcome =
  | { kind: 'success' }
  | { kind: 'retryable'; code: number; message: string }
  | { kind: 'fatal'; code: number; message: string }
  | { kind: 'failed'; code: number; message: string };

export function classify(code: number | undefined, message = ''): ApiOutcome {
  const normalized = typeof code === 'number' ? code : -1;
  if (normalized === 0) {
    return { kind: 'success' };
  }
  if (FATAL_CODES.has(normalized)) {
    return { kind: 'fatal', code: normalized, message };
  }
  if (RETRYABLE_CODES.has(normalized)) {
    return { kind: 'retryable', code: normalized, message };
  }
  return { kind: 'failed', code: normalized, message };
}
