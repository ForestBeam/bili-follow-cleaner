import type { FollowUser } from './task';

export interface BackupStats {
  total: number;
  succeeded: number;
  failed: number;
}

export interface BackupRecord {
  id: string;
  createdAt: number;
  users: FollowUser[];
  stats: BackupStats;
}

export const MAX_BACKUPS = 3;

export function createBackup(users: FollowUser[], now: Date = new Date()): BackupRecord {
  const createdAt = now.getTime();
  return {
    id: `${createdAt}`,
    createdAt,
    users: users.map(({ mid, uname, face }) => ({ mid, uname, face })),
    stats: { total: users.length, succeeded: 0, failed: 0 },
  };
}

export function pushBackup(list: BackupRecord[], record: BackupRecord): BackupRecord[] {
  return [record, ...list.filter((item) => item.id !== record.id)].slice(0, MAX_BACKUPS);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function backupFilename(record: BackupRecord, ext: 'json' | 'csv'): string {
  const date = new Date(record.createdAt);
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `bili-follow-backup-${stamp}.${ext}`;
}

export function toBackupJson(record: BackupRecord): string {
  return JSON.stringify(
    {
      exportedAt: new Date(record.createdAt).toISOString(),
      exportedAtMs: record.createdAt,
      stats: record.stats,
      users: record.users.map(({ mid, uname, face }) => ({ mid, uname, face })),
    },
    null,
    2,
  );
}

export function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toBackupCsv(record: BackupRecord): string {
  const exportedAt = new Date(record.createdAt).toISOString();
  const lines = ['mid,uname,face,exportedAt'];
  for (const user of record.users) {
    lines.push(
      [String(user.mid), csvCell(user.uname ?? ''), csvCell(user.face ?? ''), exportedAt].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

function parseStats(raw: unknown, total: number): BackupStats {
  const source = (raw ?? {}) as Partial<Record<keyof BackupStats, unknown>>;
  return {
    total: typeof source.total === 'number' ? source.total : total,
    succeeded: typeof source.succeeded === 'number' ? source.succeeded : 0,
    failed: typeof source.failed === 'number' ? source.failed : 0,
  };
}

export function parseBackups(raw: unknown): BackupRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const list: BackupRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const candidate = item as {
      id?: unknown;
      createdAt?: unknown;
      users?: unknown;
      stats?: unknown;
    };
    if (typeof candidate.createdAt !== 'number' || !Array.isArray(candidate.users)) {
      continue;
    }
    const users: FollowUser[] = [];
    for (const entry of candidate.users) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const user = entry as { mid?: unknown; uname?: unknown; face?: unknown };
      if (typeof user.mid !== 'number') {
        continue;
      }
      users.push({
        mid: user.mid,
        uname: typeof user.uname === 'string' ? user.uname : '',
        face: typeof user.face === 'string' ? user.face : undefined,
      });
    }
    if (users.length === 0) {
      continue;
    }
    list.push({
      id: typeof candidate.id === 'string' ? candidate.id : `${candidate.createdAt}`,
      createdAt: candidate.createdAt,
      users,
      stats: parseStats(candidate.stats, users.length),
    });
  }
  return list.slice(0, MAX_BACKUPS);
}
