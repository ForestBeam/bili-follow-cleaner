import type { FollowUser } from './task';

export const SPECIAL_TAG_ID = -10;
export const MAX_PROTECTED = 1000;

const DAY_MS = 86_400_000;
const MS_THRESHOLD = 1e12;

export interface ProtectedUser {
  mid: number;
  uname: string;
}

export interface Exclusion {
  protectedMids: Set<number>;
  recentMids: Set<number>;
  excludedMids: Set<number>;
  protectedCount: number;
  recentCount: number;
  hasFollowedAt: boolean;
}

export function isSpecialFollow(user: Pick<FollowUser, 'tags'>): boolean {
  return user.tags?.includes(SPECIAL_TAG_ID) === true;
}

export function parseFollowedAt(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return undefined;
  }
  return raw > MS_THRESHOLD ? raw : raw * 1000;
}

export function parseProtected(raw: unknown): ProtectedUser[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const list: ProtectedUser[] = [];
  const seen = new Set<number>();
  for (const entry of raw) {
    if (list.length >= MAX_PROTECTED) {
      break;
    }
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const { mid, uname } = entry as { mid?: unknown; uname?: unknown };
    if (typeof mid !== 'number' || seen.has(mid)) {
      continue;
    }
    seen.add(mid);
    list.push({ mid, uname: typeof uname === 'string' ? uname : '' });
  }
  return list;
}

export function pushProtected(
  list: ProtectedUser[],
  user: ProtectedUser,
): { list: ProtectedUser[]; added: boolean; reason?: 'duplicate' | 'limit' } {
  if (list.some((item) => item.mid === user.mid)) {
    return { list, added: false, reason: 'duplicate' };
  }
  if (list.length >= MAX_PROTECTED) {
    return { list, added: false, reason: 'limit' };
  }
  return { list: [...list, user], added: true };
}

export function removeProtected(list: ProtectedUser[], mid: number): ProtectedUser[] {
  return list.filter((item) => item.mid !== mid);
}

export function buildExclusion(
  users: FollowUser[],
  manual: ProtectedUser[],
  now: number,
  recentDays: number,
): Exclusion {
  const protectedMids = new Set<number>();
  for (const item of manual) {
    protectedMids.add(item.mid);
  }
  for (const user of users) {
    if (isSpecialFollow(user)) {
      protectedMids.add(user.mid);
    }
  }

  const windowMs = recentDays > 0 ? recentDays * DAY_MS : 0;
  const recentMids = new Set<number>();
  let protectedCount = 0;
  let hasFollowedAt = false;
  for (const user of users) {
    const isProtected = protectedMids.has(user.mid);
    if (isProtected) {
      protectedCount += 1;
    }
    const followedAt = user.followedAt;
    if (typeof followedAt !== 'number' || followedAt <= 0) {
      continue;
    }
    hasFollowedAt = true;
    if (windowMs > 0 && !isProtected && now - followedAt < windowMs) {
      recentMids.add(user.mid);
    }
  }

  return {
    protectedMids,
    recentMids,
    excludedMids: new Set([...protectedMids, ...recentMids]),
    protectedCount,
    recentCount: recentMids.size,
    hasFollowedAt,
  };
}
