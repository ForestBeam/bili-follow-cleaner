export type IntervalPreset = 'standard' | 'conservative';

export interface Settings {
  interval: IntervalPreset;
  limit: number;
  recentDays: number;
  notify: boolean;
  showRawErrors: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  interval: 'standard',
  limit: 300,
  recentDays: 7,
  notify: true,
  showRawErrors: false,
};

export const LIMIT_MIN = 50;
export const LIMIT_MAX = 2000;
export const RECENT_DAYS_MAX = 365;

export function delayRangeMs(interval: IntervalPreset): { min: number; max: number } {
  return interval === 'conservative' ? { min: 3000, max: 8000 } : { min: 1500, max: 4000 };
}

export function randomDelayMs(
  interval: IntervalPreset,
  random: () => number = Math.random,
): number {
  const { min, max } = delayRangeMs(interval);
  return min + random() * (max - min);
}

export function clampLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.limit;
  }
  return Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Math.round(value)));
}

export function clampRecentDays(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.recentDays;
  }
  return Math.min(RECENT_DAYS_MAX, Math.max(0, Math.round(value)));
}

export function parseSettings(raw: unknown): Settings {
  const source = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    interval: source.interval === 'conservative' ? 'conservative' : 'standard',
    limit: clampLimit(typeof source.limit === 'number' ? source.limit : DEFAULT_SETTINGS.limit),
    recentDays: clampRecentDays(
      typeof source.recentDays === 'number' ? source.recentDays : DEFAULT_SETTINGS.recentDays,
    ),
    notify: typeof source.notify === 'boolean' ? source.notify : DEFAULT_SETTINGS.notify,
    showRawErrors:
      typeof source.showRawErrors === 'boolean'
        ? source.showRawErrors
        : DEFAULT_SETTINGS.showRawErrors,
  };
}
