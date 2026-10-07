import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  LIMIT_MAX,
  LIMIT_MIN,
  RECENT_DAYS_MAX,
  clampLimit,
  clampRecentDays,
  delayRangeMs,
  parseSettings,
  randomDelayMs,
} from '../src/core/settings';

describe('设置解析', () => {
  it('脏数据回退到默认值', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ interval: 'fast', limit: '300', notify: 1 })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('保留合法字段', () => {
    expect(
      parseSettings({
        interval: 'conservative',
        limit: 500,
        notify: false,
        showRawErrors: true,
        recentDays: 30,
      }),
    ).toEqual({
      interval: 'conservative',
      limit: 500,
      notify: false,
      showRawErrors: true,
      recentDays: 30,
    });
  });

  it('单次上限收敛到边界内', () => {
    expect(clampLimit(300)).toBe(300);
    expect(clampLimit(1)).toBe(LIMIT_MIN);
    expect(clampLimit(99999)).toBe(LIMIT_MAX);
    expect(clampLimit(Number.NaN)).toBe(DEFAULT_SETTINGS.limit);
    expect(clampLimit(120.6)).toBe(121);
  });

  it('最近关注天数默认 7，收敛到 0~365', () => {
    expect(DEFAULT_SETTINGS.recentDays).toBe(7);
    expect(clampRecentDays(-3)).toBe(0);
    expect(clampRecentDays(999)).toBe(RECENT_DAYS_MAX);
    expect(clampRecentDays(Number.NaN)).toBe(DEFAULT_SETTINGS.recentDays);
    expect(clampRecentDays(6.4)).toBe(6);
    expect(parseSettings({ recentDays: 'bad' }).recentDays).toBe(7);
    expect(parseSettings({ recentDays: 0 }).recentDays).toBe(0);
  });
});

describe('间隔档位', () => {
  it('标准档 1.5~4 秒，保守档 3~8 秒', () => {
    expect(delayRangeMs('standard')).toEqual({ min: 1500, max: 4000 });
    expect(delayRangeMs('conservative')).toEqual({ min: 3000, max: 8000 });
  });

  it('随机延迟落在区间内', () => {
    expect(randomDelayMs('standard', () => 0)).toBe(1500);
    expect(randomDelayMs('standard', () => 1)).toBe(4000);
    expect(randomDelayMs('conservative', () => 0.5)).toBe(5500);
  });
});
