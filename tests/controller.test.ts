import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type IntervalPreset } from '../src/core/settings';
import { createTask, type TaskState } from '../src/core/task';
import { CleanupController, type ControllerDeps } from '../src/content-ui/controller';

const USERS = [
  { mid: 1, uname: 'a' },
  { mid: 2, uname: 'b' },
  { mid: 3, uname: 'c' },
];

function makeController(overrides: Partial<ControllerDeps> = {}) {
  const deps: ControllerDeps = {
    unfollow: vi.fn(async () => ({ code: 0, message: '0' })),
    sleep: vi.fn(async () => {}),
    randomDelayMs: () => 10,
    now: () => Date.now(),
    onChange: vi.fn(),
    saveTask: vi.fn(async () => {}),
    saveBackups: vi.fn(async () => {}),
    saveProtected: vi.fn(async () => {}),
    ...overrides,
  };
  return { controller: new CleanupController(deps), deps };
}

async function waitForPhase(controller: CleanupController, phase: string) {
  await vi.waitFor(() => {
    expect(controller.getSnapshot().phase).toBe(phase);
  });
}

describe('selection', () => {
  it('starts with nothing selected and supports select all / clear', () => {
    const { controller } = makeController();
    controller.setUsers(USERS);
    expect(controller.getSnapshot().selected.size).toBe(0);
    controller.selectAll();
    expect(controller.getSnapshot().selected.size).toBe(3);
    controller.toggle(2);
    expect(controller.getSnapshot().selected.has(2)).toBe(false);
    controller.clearSelection();
    expect(controller.getSnapshot().selected.size).toBe(0);
  });

  it('ignores confirm without a selection', () => {
    const { controller } = makeController();
    controller.setUsers(USERS);
    controller.confirm();
    expect(controller.getSnapshot().phase).toBe('selecting');
  });
});

describe('run loop', () => {
  it('unfollows every selected user and finishes', async () => {
    const { controller, deps } = makeController();
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();
    expect(controller.getSnapshot().phase).toBe('confirming');

    controller.start();
    await waitForPhase(controller, 'done');

    expect(deps.unfollow).toHaveBeenCalledTimes(3);
    expect(controller.getSnapshot().task.succeeded).toEqual([1, 2, 3]);
    expect(controller.getSnapshot().task.failed).toEqual([]);
  });

  it('retries after a retryable failure and then succeeds', async () => {
    const unfollow = vi
      .fn()
      .mockResolvedValueOnce({ code: -352, message: '风控' })
      .mockResolvedValue({ code: 0, message: '0' });
    const { controller, deps } = makeController({ unfollow });
    controller.setUsers([USERS[0]]);
    controller.selectAll();
    controller.confirm();
    controller.start();

    await waitForPhase(controller, 'done');

    expect(deps.unfollow).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().task.succeeded).toEqual([1]);
    const sleep = deps.sleep as unknown as { mock: { calls: unknown[][] } };
    const waited = sleep.mock.calls.reduce((sum, [ms]) => sum + (ms as number), 0);
    expect(waited).toBeGreaterThanOrEqual(60_000);
  });

  it('aborts on fatal codes and stops the loop', async () => {
    const { controller, deps } = makeController({
      unfollow: vi.fn(async () => ({ code: -101, message: '未登录' })),
    });
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();
    controller.start();

    await waitForPhase(controller, 'aborted');

    expect(deps.unfollow).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().message).toContain('登录');
  });

  it('aborts after five consecutive failures', async () => {
    const users = Array.from({ length: 8 }, (_, index) => ({ mid: index + 1, uname: `u${index + 1}` }));
    const { controller, deps } = makeController({
      unfollow: vi.fn(async () => ({ code: -400, message: '请求错误' })),
    });
    controller.setUsers(users);
    controller.selectAll();
    controller.confirm();
    controller.start();

    await waitForPhase(controller, 'aborted');

    expect(deps.unfollow).toHaveBeenCalledTimes(5);
    expect(controller.getSnapshot().task.failed).toHaveLength(5);
  });

  it('pauses mid-run and resumes on demand', async () => {
    let controller: CleanupController;
    const unfollow = vi.fn(async (mid: number) => {
      if (mid === 1) {
        controller.pause();
      }
      return { code: 0, message: '0' };
    });
    const made = makeController({ unfollow });
    controller = made.controller;
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();
    controller.start();

    await waitForPhase(controller, 'paused');
    expect(made.deps.unfollow).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().task.succeeded).toEqual([1]);

    controller.resume();
    await waitForPhase(controller, 'done');
    expect(made.deps.unfollow).toHaveBeenCalledTimes(3);
  });

  it('stops immediately when requested', async () => {
    let controller: CleanupController;
    const unfollow = vi.fn(async (mid: number) => {
      if (mid === 1) {
        controller.stop();
      }
      return { code: 0, message: '0' };
    });
    const made = makeController({ unfollow });
    controller = made.controller;
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();
    controller.start();

    await waitForPhase(controller, 'aborted');
    expect(made.deps.unfollow).toHaveBeenCalledTimes(1);
  });
});

describe('retry failed items', () => {
  it('builds a fresh confirming task from failures', async () => {
    const unfollow = vi
      .fn()
      .mockResolvedValueOnce({ code: -400, message: '请求错误' })
      .mockResolvedValueOnce({ code: -400, message: '请求错误' })
      .mockResolvedValue({ code: 0, message: '0' });
    const { controller } = makeController({ unfollow });
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();
    controller.start();
    await waitForPhase(controller, 'done');
    expect(controller.getSnapshot().task.failed).toHaveLength(2);

    controller.retryFailed();
    const snapshot = controller.getSnapshot();
    expect(snapshot.phase).toBe('confirming');
    expect(snapshot.task.planned).toEqual([
      { mid: 1, uname: 'a', face: undefined },
      { mid: 2, uname: 'b', face: undefined },
    ]);

    controller.start();
    await waitForPhase(controller, 'done');
    expect(controller.getSnapshot().task.succeeded).toEqual([1, 2]);
  });
});

function manyUsers(count: number) {
  return Array.from({ length: count }, (_, index) => ({ mid: index + 1, uname: `u${index + 1}` }));
}

describe('单次上限', () => {
  it('设置关注分组后随快照输出', () => {
    const { controller } = makeController();
    expect(controller.getSnapshot().groups).toEqual([]);

    controller.setGroups([
      { tagId: 0, name: '默认分组' },
      { tagId: -10, name: '特别关注' },
    ]);

    expect(controller.getSnapshot().groups).toEqual([
      { tagId: 0, name: '默认分组' },
      { tagId: -10, name: '特别关注' },
    ]);
  });

  it('可只全选指定批次（用于已注销筛选）', () => {
    const { controller } = makeController();
    controller.setUsers(manyUsers(5));

    controller.selectAll([2, 3, 5]);
    expect([...controller.getSnapshot().selected].sort()).toEqual([2, 3, 5]);

    controller.selectAll();
    expect(controller.getSnapshot().selected.size).toBe(5);
  });

  it('全选超过上限时只选中前 N 个并给出提示', () => {
    const { controller } = makeController();
    controller.setSettings({ ...DEFAULT_SETTINGS, limit: 3 });
    controller.setUsers(manyUsers(5));

    controller.selectAll();
    expect(controller.getSnapshot().selected.size).toBe(3);
    expect(controller.getSnapshot().message).toContain('最多处理 3 个');

    controller.confirm();
    expect(controller.getSnapshot().task.planned.map((user) => user.mid)).toEqual([1, 2, 3]);
  });

  it('确认阶段按上限截断超出的选择', () => {
    const { controller } = makeController();
    controller.setUsers(manyUsers(5));
    controller.selectAll();
    controller.setSettings({ ...DEFAULT_SETTINGS, limit: 2 });

    controller.confirm();
    expect(controller.getSnapshot().task.planned.map((user) => user.mid)).toEqual([1, 2]);
    expect(controller.getSnapshot().message).toContain('只处理前 2 个');
  });
});

describe('备份与落盘', () => {
  it('开始执行前自动备份，完成时补记统计', async () => {
    const { controller, deps } = makeController();
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();
    controller.start();
    await waitForPhase(controller, 'done');

    expect(deps.saveBackups).toHaveBeenCalled();
    const backups = controller.getSnapshot().backups;
    expect(backups).toHaveLength(1);
    expect(backups[0].users.map((user) => user.mid)).toEqual([1, 2, 3]);
    expect(backups[0].stats).toEqual({ total: 3, succeeded: 3, failed: 0 });
  });

  it('运行中每 5 条落盘一次，完成后清除存档', async () => {
    const { controller, deps } = makeController();
    controller.setUsers(manyUsers(12));
    controller.selectAll();
    controller.confirm();
    controller.start();
    await waitForPhase(controller, 'done');

    const calls = (deps.saveTask as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const saved = calls.map((call) => call[0] as TaskState | null);
    expect(saved.filter((task) => task !== null)).toHaveLength(3);
    expect(saved[0]?.status).toBe('running');
    expect(saved[saved.length - 1]).toBeNull();
  });

  it('暂停时立即落盘，进度可供续跑', async () => {
    let controller: CleanupController;
    const unfollow = vi.fn(async (mid: number) => {
      if (mid === 2) {
        controller.pause();
      }
      return { code: 0, message: '0' };
    });
    const made = makeController({ unfollow });
    controller = made.controller;
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();
    controller.start();
    await waitForPhase(controller, 'paused');

    const calls = (made.deps.saveTask as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const saved = calls[calls.length - 1][0] as TaskState;
    expect(saved.status).toBe('paused');
    expect(saved.succeeded).toEqual([1, 2]);
  });
});

describe('断点续跑', () => {
  const stored: TaskState = {
    ...createTask(),
    status: 'paused',
    planned: [
      { mid: 1, uname: 'a' },
      { mid: 2, uname: 'b' },
      { mid: 3, uname: 'c' },
    ],
    succeeded: [1],
  };

  it('提示剩余数量，继续后只处理未完成项', async () => {
    const { controller, deps } = makeController();
    controller.offerResume(stored);
    expect(controller.getSnapshot().phase).toBe('resume');
    expect(controller.getSnapshot().resume).toEqual({ total: 3, succeeded: 1 });

    controller.continueResume();
    expect(controller.getSnapshot().phase).toBe('running');
    await waitForPhase(controller, 'done');

    expect(deps.unfollow).toHaveBeenCalledTimes(2);
    expect(deps.unfollow).toHaveBeenCalledWith(2);
    expect(deps.unfollow).toHaveBeenCalledWith(3);
    expect(controller.getSnapshot().task.succeeded).toEqual([2, 3]);
  });

  it('放弃续跑时清除存档', () => {
    const { controller, deps } = makeController();
    controller.offerResume(stored);
    controller.dismissResume();

    expect(controller.getSnapshot().phase).not.toBe('resume');
    expect(deps.saveTask).toHaveBeenCalledWith(null);
  });

  it('未完成之外的存档不提示续跑', () => {
    const { controller } = makeController();
    controller.offerResume({ ...stored, status: 'done' });
    expect(controller.getSnapshot().phase).not.toBe('resume');
  });

  it('续跑时跳过保护名单中的账号', async () => {
    const { controller, deps } = makeController();
    controller.setProtected([{ mid: 2, uname: 'b' }]);
    controller.offerResume(stored);
    controller.continueResume();

    expect(controller.getSnapshot().phase).toBe('running');
    await waitForPhase(controller, 'done');

    expect(deps.unfollow).toHaveBeenCalledTimes(1);
    expect(deps.unfollow).toHaveBeenCalledWith(3);
    expect(controller.getSnapshot().message).toContain('保护名单');
  });

  it('剩余项全部受保护时不需要执行', () => {
    const { controller, deps } = makeController();
    controller.setProtected([
      { mid: 2, uname: 'b' },
      { mid: 3, uname: 'c' },
    ]);
    controller.offerResume(stored);
    controller.continueResume();

    expect(controller.getSnapshot().phase).not.toBe('running');
    expect(deps.unfollow).not.toHaveBeenCalled();
    expect(deps.saveTask).toHaveBeenCalledWith(null);
    expect(controller.getSnapshot().message).toContain('保护名单');
  });
});

describe('错误信息展示', () => {
  it('默认可重试类错误使用友好文案', async () => {
    const { controller } = makeController({
      unfollow: vi.fn(async () => ({ code: -352, message: '风控校验失败' })),
    });
    controller.setUsers([USERS[0]]);
    controller.selectAll();
    controller.confirm();
    controller.start();
    await waitForPhase(controller, 'done');

    expect(controller.getSnapshot().task.failed[0].message).toBe('B 站暂时限制了操作，稍后可再试');
  });

  it('开启后展示原始错误码与消息', async () => {
    const { controller } = makeController({
      unfollow: vi.fn(async () => ({ code: -352, message: '风控校验失败' })),
    });
    controller.setSettings({ ...DEFAULT_SETTINGS, showRawErrors: true });
    controller.setUsers([USERS[0]]);
    controller.selectAll();
    controller.confirm();
    controller.start();
    await waitForPhase(controller, 'done');

    expect(controller.getSnapshot().task.failed[0].message).toBe('[-352] 风控校验失败');
  });
});

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

describe('保护名单', () => {
  it('手动锁定与特别关注账号不可选中，全选跳过，计划不含', () => {
    const { controller } = makeController();
    controller.setProtected([{ mid: 2, uname: 'b' }]);
    controller.setUsers([
      { mid: 1, uname: 'a' },
      { mid: 2, uname: 'b' },
      { mid: 3, uname: 'c', tags: [-10] },
    ]);

    controller.toggle(2);
    controller.toggle(3);
    expect(controller.getSnapshot().selected.size).toBe(0);
    expect(controller.getSnapshot().exclusion.protectedCount).toBe(2);

    controller.selectAll();
    expect([...controller.getSnapshot().selected]).toEqual([1]);
    controller.confirm();
    expect(controller.getSnapshot().task.planned.map((user) => user.mid)).toEqual([1]);
  });

  it('保护时移出已选与当前计划，并写入存储', () => {
    const { controller, deps } = makeController();
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();

    controller.protect(2);

    expect(controller.getSnapshot().task.planned.map((user) => user.mid)).toEqual([1, 3]);
    expect([...controller.getSnapshot().selected]).toEqual([1, 3]);
    expect(deps.saveProtected).toHaveBeenCalledWith([{ mid: 2, uname: 'b' }]);
    expect(controller.getSnapshot().protectedList).toEqual([{ mid: 2, uname: 'b' }]);
  });

  it('暂停期间锁定账号后，续跑不再处理它', async () => {
    let controller: CleanupController;
    const unfollow = vi.fn(async (mid: number) => {
      if (mid === 1) {
        controller.pause();
      }
      return { code: 0, message: '0' };
    });
    const made = makeController({ unfollow });
    controller = made.controller;
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();
    controller.start();
    await waitForPhase(controller, 'paused');

    controller.protect(2);
    controller.resume();
    await waitForPhase(controller, 'done');

    expect(made.deps.unfollow).toHaveBeenCalledTimes(2);
    expect(made.deps.unfollow).not.toHaveBeenCalledWith(2);
    expect(controller.getSnapshot().task.succeeded).toEqual([1, 3]);
  });

  it('解除保护后账号恢复可选', () => {
    const { controller, deps } = makeController();
    controller.setUsers(USERS);
    controller.protect(2);
    controller.unprotect(2);

    controller.toggle(2);
    expect([...controller.getSnapshot().selected]).toEqual([2]);
    expect(controller.getSnapshot().protectedList).toEqual([]);
    expect(deps.saveProtected).toHaveBeenLastCalledWith([]);
  });
});

describe('最近关注排除', () => {
  it('最近 N 天关注的账号不可选，改为 0 天后恢复', () => {
    const { controller } = makeController({ now: () => NOW });
    controller.setUsers([
      { mid: 1, uname: 'a', followedAt: NOW - DAY },
      { mid: 2, uname: 'b', followedAt: NOW - 30 * DAY },
    ]);

    expect(controller.getSnapshot().exclusion.recentCount).toBe(1);
    controller.toggle(1);
    expect(controller.getSnapshot().selected.size).toBe(0);

    controller.selectAll();
    expect([...controller.getSnapshot().selected]).toEqual([2]);

    controller.setSettings({ ...DEFAULT_SETTINGS, recentDays: 0 });
    controller.selectAll();
    expect([...controller.getSnapshot().selected]).toEqual([1, 2]);
  });

  it('调整最近天数后，不该选的账号自动移出已选', () => {
    const { controller } = makeController({ now: () => NOW });
    controller.setUsers([
      { mid: 1, uname: 'a', followedAt: NOW - DAY },
      { mid: 2, uname: 'b' },
    ]);
    controller.setSettings({ ...DEFAULT_SETTINGS, recentDays: 0 });
    controller.selectAll();
    expect(controller.getSnapshot().selected.size).toBe(2);

    controller.setSettings({ ...DEFAULT_SETTINGS, recentDays: 7 });
    expect([...controller.getSnapshot().selected]).toEqual([2]);
  });
});

describe('风控自动降速', () => {
  it('触发退避后剩余间隔切保守档', async () => {
    const randomDelayMs = vi.fn((_interval: IntervalPreset) => 10);
    const unfollow = vi
      .fn()
      .mockResolvedValueOnce({ code: -352, message: '风控' })
      .mockResolvedValue({ code: 0, message: '0' });
    const { controller } = makeController({ unfollow, randomDelayMs });
    controller.setUsers(USERS);
    controller.selectAll();
    controller.confirm();
    controller.start();

    await waitForPhase(controller, 'done');

    expect(controller.getSnapshot().slowMode).toBe(true);
    expect(randomDelayMs.mock.calls.map(([interval]) => interval)).toEqual([
      'conservative',
      'conservative',
    ]);
    expect(controller.getSnapshot().message).toContain('保守节奏');
    expect(controller.getSnapshot().task.succeeded).toEqual([1, 2, 3]);
  });

  it('下一次任务重置降速标记，恢复用户档位', async () => {
    const randomDelayMs = vi.fn((_interval: IntervalPreset) => 10);
    const unfollow = vi
      .fn()
      .mockResolvedValueOnce({ code: -352, message: '风控' })
      .mockResolvedValue({ code: 0, message: '0' });
    const { controller } = makeController({ unfollow, randomDelayMs });
    controller.setUsers([USERS[0]]);
    controller.selectAll();
    controller.confirm();
    controller.start();
    await waitForPhase(controller, 'done');
    expect(controller.getSnapshot().slowMode).toBe(true);

    controller.selectAll();
    controller.confirm();
    controller.start();
    expect(controller.getSnapshot().slowMode).toBe(false);

    await waitForPhase(controller, 'done');
  });
});
