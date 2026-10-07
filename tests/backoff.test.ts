import { describe, expect, it } from 'vitest';
import { classify } from '../src/core/codes';
import { decideAfterResult, retryWaitSeconds, shouldAbortForStreak } from '../src/core/backoff';

describe('classify', () => {
  it('treats code 0 as success', () => {
    expect(classify(0).kind).toBe('success');
  });

  it.each([-352, -412, -509, -1])('treats %i as retryable', (code) => {
    expect(classify(code).kind).toBe('retryable');
  });

  it.each([-101, -111])('treats %i as fatal', (code) => {
    expect(classify(code).kind).toBe('fatal');
  });

  it('treats other codes as failed', () => {
    expect(classify(-400).kind).toBe('failed');
    expect(classify(22001).kind).toBe('failed');
  });

  it('treats a missing code as retryable network failure', () => {
    expect(classify(undefined).kind).toBe('retryable');
  });
});

describe('decideAfterResult', () => {
  it('succeeds on code 0', () => {
    expect(decideAfterResult(0, '0', 1)).toEqual({ action: 'succeed' });
  });

  it('aborts immediately on fatal codes', () => {
    expect(decideAfterResult(-101, '未登录', 1)).toMatchObject({ action: 'abort' });
    expect(decideAfterResult(-111, 'csrf', 2)).toMatchObject({ action: 'abort' });
  });

  it('waits 60s then 120s before exhausting attempts', () => {
    expect(decideAfterResult(-352, '风控', 1)).toEqual({
      action: 'wait-then-retry',
      waitSeconds: 60,
      message: '风控',
    });
    expect(decideAfterResult(-352, '风控', 2)).toEqual({
      action: 'wait-then-retry',
      waitSeconds: 120,
      message: '风控',
    });
    expect(decideAfterResult(-352, '风控', 3)).toEqual({ action: 'give-up', message: '风控' });
  });

  it('gives up without retry on non-retryable failures', () => {
    expect(decideAfterResult(-400, '请求错误', 1)).toEqual({ action: 'give-up', message: '请求错误' });
  });
});

describe('retryWaitSeconds', () => {
  it('scales with attempt number', () => {
    expect(retryWaitSeconds(1)).toBe(60);
    expect(retryWaitSeconds(2)).toBe(120);
  });
});

describe('shouldAbortForStreak', () => {
  it('aborts at 5 consecutive failures', () => {
    expect(shouldAbortForStreak(4)).toBe(false);
    expect(shouldAbortForStreak(5)).toBe(true);
  });
});
