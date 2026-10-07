import { describe, expect, it } from 'vitest';
import { createBackup } from '../src/core/backup';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { createTask, parseTaskState, type TaskState } from '../src/core/task';
import {
  BACKUPS_KEY,
  PROTECTED_KEY,
  SELECTION_KEY,
  SETTINGS_KEY,
  TASK_KEY,
  createStorage,
  type StorageLike,
} from '../src/core/storage';

function fakeArea(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = structuredClone(initial);
  const area: StorageLike = {
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
    async remove(key) {
      delete data[key];
    },
  };
  return { area, data };
}

const RUNNING_TASK: TaskState = {
  ...createTask(),
  status: 'running',
  planned: [
    { mid: 1, uname: 'a' },
    { mid: 2, uname: 'b' },
  ],
  succeeded: [1],
};

describe('存储封装', () => {
  it('任务往返：写入后可原样读回', async () => {
    const { area, data } = fakeArea();
    const storage = createStorage(area);
    await storage.saveTask(RUNNING_TASK);
    expect(data[TASK_KEY]).toEqual(RUNNING_TASK);
    const loaded = await storage.loadTask();
    expect(loaded).toEqual({ ...RUNNING_TASK, currentMid: null });
  });

  it('任务清空：saveTask(null) 移除键', async () => {
    const { area, data } = fakeArea({ [TASK_KEY]: RUNNING_TASK });
    await createStorage(area).saveTask(null);
    expect(TASK_KEY in data).toBe(false);
  });

  it('任务脏数据返回 null', async () => {
    const { area } = fakeArea({ [TASK_KEY]: { status: 'running' } });
    expect(await createStorage(area).loadTask()).toBeNull();
  });

  it('设置缺失时返回默认值，写入后可读回', async () => {
    const { area, data } = fakeArea({ [SETTINGS_KEY]: { limit: 'bad' } });
    const storage = createStorage(area);
    expect(await storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    await storage.saveSettings({ ...DEFAULT_SETTINGS, interval: 'conservative', limit: 500 });
    expect(data[SETTINGS_KEY]).toEqual({
      ...DEFAULT_SETTINGS,
      interval: 'conservative',
      limit: 500,
    });
    expect(await storage.loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      interval: 'conservative',
      limit: 500,
    });
  });

  it('备份最多保留 3 条且可读回', async () => {
    const { area, data } = fakeArea();
    const storage = createStorage(area);
    const records = [4, 3, 2, 1].map((index) =>
      createBackup([{ mid: index, uname: `u${index}` }], new Date(2026, 9, 7, 15, index)),
    );
    await storage.saveBackups(records);
    expect((data[BACKUPS_KEY] as unknown[]).length).toBe(3);
    expect((await storage.loadBackups()).map((item) => item.users[0].mid)).toEqual([4, 3, 2]);
  });

  it('保护名单往返：脏数据兜底、写入后可读回', async () => {
    const { area, data } = fakeArea({ [PROTECTED_KEY]: [{ mid: 1, uname: 'a' }, { mid: 'x' }] });
    const storage = createStorage(area);
    expect(await storage.loadProtected()).toEqual([{ mid: 1, uname: 'a' }]);

    await storage.saveProtected([{ mid: 2, uname: 'b' }]);
    expect(data[PROTECTED_KEY]).toEqual([{ mid: 2, uname: 'b' }]);
    expect(await storage.loadProtected()).toEqual([{ mid: 2, uname: 'b' }]);
  });

  it('选择集往返：非法值被过滤，写入后可读回', async () => {
    const { area, data } = fakeArea({ [SELECTION_KEY]: [1, 'x', 2, 2, null] });
    const storage = createStorage(area);
    expect(await storage.loadSelection()).toEqual([1, 2]);

    await storage.saveSelection([5]);
    expect(data[SELECTION_KEY]).toEqual([5]);
    expect(await storage.loadSelection()).toEqual([5]);
  });
});

describe('任务解析', () => {
  it('非法字段被过滤，进行中标记重置', () => {
    const parsed = parseTaskState({
      status: 'paused',
      planned: [{ mid: 1, uname: 'a', tags: [0, 3] }, { mid: 'x' }, null],
      succeeded: [1, 'y'],
      failed: [{ mid: 2, uname: 'b', message: '失败' }, { mid: 'z' }],
      currentMid: 2,
      attempt: 3,
    });
    expect(parsed).toEqual({
      kind: 'unfollow',
      status: 'paused',
      planned: [{ mid: 1, uname: 'a', face: undefined, tags: [0, 3] }],
      succeeded: [1],
      failed: [{ mid: 2, uname: 'b', face: undefined, message: '失败' }],
      currentMid: null,
      attempt: 1,
      consecutiveFailures: 0,
      backoffWaitSeconds: null,
    });
  });

  it('分组字段非法时省略', () => {
    const parsed = parseTaskState({
      status: 'running',
      planned: [{ mid: 1, uname: 'a', tags: 'x' }],
      succeeded: [],
    });
    expect(parsed?.planned).toEqual([{ mid: 1, uname: 'a', face: undefined }]);
  });

  it('保留合法关注时间，非法值省略', () => {
    const parsed = parseTaskState({
      status: 'paused',
      planned: [
        { mid: 1, uname: 'a', followedAt: 1_700_000_000_000 },
        { mid: 2, uname: 'b', followedAt: 'x' },
      ],
      succeeded: [],
    });
    expect(parsed?.planned[0].followedAt).toBe(1_700_000_000_000);
    expect(parsed?.planned[1].followedAt).toBeUndefined();
  });
});
