import { classify } from './codes';

export const MAX_ATTEMPTS = 3;
export const RETRY_WAIT_BASE_SECONDS = 60;
export const MAX_CONSECUTIVE_FAILURES = 5;

export type AttemptDecision =
  | { action: 'succeed' }
  | { action: 'give-up'; message: string }
  | { action: 'wait-then-retry'; waitSeconds: number; message: string }
  | { action: 'abort'; code: number; message: string };

export function retryWaitSeconds(attempt: number): number {
  return RETRY_WAIT_BASE_SECONDS * attempt;
}

export function decideAfterResult(
  code: number | undefined,
  message: string,
  attempt: number,
): AttemptDecision {
  const outcome = classify(code, message);
  switch (outcome.kind) {
    case 'success':
      return { action: 'succeed' };
    case 'fatal':
      return { action: 'abort', code: outcome.code, message: outcome.message };
    case 'retryable':
      if (attempt < MAX_ATTEMPTS) {
        return {
          action: 'wait-then-retry',
          waitSeconds: retryWaitSeconds(attempt),
          message: outcome.message,
        };
      }
      return { action: 'give-up', message: outcome.message };
    case 'failed':
      return { action: 'give-up', message: outcome.message };
  }
}

export function shouldAbortForStreak(consecutiveFailures: number): boolean {
  return consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}
