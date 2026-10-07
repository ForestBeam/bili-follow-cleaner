import { describe, expect, it } from 'vitest';
import {
  MAX_BACKUPS,
  backupFilename,
  createBackup,
  parseBackups,
  pushBackup,
  toBackupCsv,
  toBackupJson,
  type BackupRecord,
} from '../src/core/backup';

const NOW = new Date('2026-10-07T15:30:00');
const USERS = [
  { mid: 1, uname: '普通昵称', face: 'https://i0.hdslb.com/a.jpg' },
  { mid: 2, uname: '带,逗号', face: '' },
  { mid: 3, uname: '带"引号"', face: '' },
  { mid: 4, uname: '两行\n昵称', face: '' },
  { mid: 5, uname: '=cmd|calc', face: '' },
];

describe('备份记录', () => {
  it('创建记录只保留必要字段，初始统计为计划数', () => {
    const record = createBackup(USERS, NOW);
    expect(record.createdAt).toBe(NOW.getTime());
    expect(record.stats).toEqual({ total: 5, succeeded: 0, failed: 0 });
    expect(record.users[0]).toEqual({
      mid: 1,
      uname: '普通昵称',
      face: 'https://i0.hdslb.com/a.jpg',
    });
    expect(Object.keys(record.users[0])).toEqual(['mid', 'uname', 'face']);
  });

  it('新备份在前，按 id 去重，最多保留 3 条', () => {
    let list: BackupRecord[] = [];
    for (let index = 0; index < 5; index += 1) {
      list = pushBackup(list, createBackup(USERS, new Date(NOW.getTime() + index * 1000)));
    }
    expect(list).toHaveLength(MAX_BACKUPS);
    expect(list.map((item) => item.createdAt)).toEqual([
      NOW.getTime() + 4000,
      NOW.getTime() + 3000,
      NOW.getTime() + 2000,
    ]);
    const again = pushBackup(list, list[1]);
    expect(again).toHaveLength(MAX_BACKUPS);
    expect(again[0].id).toBe(list[1].id);
  });
});

describe('备份序列化', () => {
  it('JSON 含导出时间、统计与账号字段', () => {
    const parsed = JSON.parse(toBackupJson(createBackup(USERS, NOW))) as {
      exportedAt: string;
      exportedAtMs: number;
      stats: { total: number };
      users: Array<{ mid: number; uname: string }>;
    };
    expect(parsed.exportedAtMs).toBe(NOW.getTime());
    expect(parsed.exportedAt).toBe(NOW.toISOString());
    expect(parsed.stats.total).toBe(5);
    expect(parsed.users).toHaveLength(5);
    expect(parsed.users[4]).toEqual({ mid: 5, uname: '=cmd|calc', face: '' });
  });

  it('CSV 转义逗号 / 引号 / 换行，并防公式注入', () => {
    const lines = toBackupCsv(createBackup(USERS, NOW)).split('\r\n');
    expect(lines[0]).toBe('mid,uname,face,exportedAt');
    expect(lines[1]).toBe(`1,普通昵称,https://i0.hdslb.com/a.jpg,${NOW.toISOString()}`);
    expect(lines[2]).toBe(`2,"带,逗号",,${NOW.toISOString()}`);
    expect(lines[3]).toBe(`3,"带""引号""",,${NOW.toISOString()}`);
    expect(lines[4]).toBe(`4,"两行\n昵称",,${NOW.toISOString()}`);
    expect(lines[5]).toBe(`5,'=cmd|calc,,${NOW.toISOString()}`);
    expect(lines[6]).toBe('');
  });

  it('文件名带本地时间戳', () => {
    const record = createBackup(USERS, NOW);
    expect(backupFilename(record, 'json')).toBe('bili-follow-backup-20261007-1530.json');
    expect(backupFilename(record, 'csv')).toBe('bili-follow-backup-20261007-1530.csv');
  });
});

describe('备份脏数据兜底', () => {
  it('非数组或非法条目直接丢弃', () => {
    expect(parseBackups(undefined)).toEqual([]);
    expect(parseBackups({})).toEqual([]);
    expect(parseBackups([null, 1, 'x', { createdAt: 'y' }, { createdAt: 1, users: [] }])).toEqual(
      [],
    );
  });

  it('条目内非法账号被过滤，统计缺失时按实际条数补齐', () => {
    const parsed = parseBackups([
      { createdAt: 5, users: [{ mid: 'a' }, { mid: 7, uname: 3 }] },
      { createdAt: 9, users: [{ mid: 8 }], stats: { total: 9, succeeded: 1, failed: 2 } },
    ]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].users).toEqual([{ mid: 7, uname: '', face: undefined }]);
    expect(parsed[0].stats).toEqual({ total: 1, succeeded: 0, failed: 0 });
    expect(parsed[1].stats).toEqual({ total: 9, succeeded: 1, failed: 2 });
  });
});
