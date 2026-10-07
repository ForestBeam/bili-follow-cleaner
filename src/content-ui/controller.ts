import { createBackup, pushBackup, type BackupRecord } from '../core/backup';
import { decideAfterResult } from '../core/backoff';
import type { FollowGroup } from '../core/api';
import { RETRYABLE_CODES } from '../core/codes';
import {
  MAX_PROTECTED,
  buildExclusion,
  pushProtected,
  removeProtected,
  type Exclusion,
  type ProtectedUser,
} from '../core/protection';
import { DEFAULT_SETTINGS, type IntervalPreset, type Settings } from '../core/settings';
import {
  abortRun,
  backToSelecting,
  beginAttempt,
  createRetryTask,
  createTask,
  enterBackoff,
  finishIfDone,
  isResumable,
  markFailed,
  markSucceeded,
  nextPending,
  pauseRun,
  removeFromPlan,
  resumeRun,
  setPlanned,
  startRun,
  toConfirming,
  type FollowUser,
  type TaskState,
  type TaskStatus,
} from '../core/task';

export type Phase = TaskStatus | 'login' | 'error' | 'resume';

export interface ControllerDeps {
  unfollow: (mid: number) => Promise<{ code: number | undefined; message: string }>;
  sleep: (ms: number) => Promise<void>;
  randomDelayMs: (interval: IntervalPreset) => number;
  now: () => number;
  onChange: () => void;
  saveTask: (task: TaskState | null) => Promise<void>;
  saveBackups: (backups: BackupRecord[]) => Promise<void>;
  saveProtected: (list: ProtectedUser[]) => Promise<void>;
}

export interface UiSnapshot {
  phase: Phase;
  users: FollowUser[];
  selected: ReadonlySet<number>;
  task: TaskState;
  settings: Settings;
  backups: BackupRecord[];
  groups: FollowGroup[];
  exclusion: Exclusion;
  protectedList: ProtectedUser[];
  slowMode: boolean;
  resume: { total: number; succeeded: number } | null;
  loadProgress: { loaded: number; total: number } | null;
  message: string | null;
}

const WAIT_CHUNK_MS = 250;
const PERSIST_EVERY_ITEMS = 5;
const PERSIST_INTERVAL_MS = 30_000;

export class CleanupController {
  private users: FollowUser[] = [];
  private selected = new Set<number>();
  private task: TaskState = createTask();
  private settings: Settings = DEFAULT_SETTINGS;
  private backups: BackupRecord[] = [];
  private groups: FollowGroup[] = [];
  private protectedList: ProtectedUser[] = [];
  private exclusion: Exclusion = buildExclusion([], [], 0, 0);
  private slowMode = false;
  private pendingResume: TaskState | null = null;
  private currentBackupId: string | null = null;
  private persistedCount = 0;
  private persistedAt = 0;
  private prePhase: 'loading' | 'login' | 'error' | 'resume' | null = null;
  private loadProgress: { loaded: number; total: number } | null = null;
  private message: string | null = null;
  private loopRunning = false;

  constructor(private readonly deps: ControllerDeps) {}

  setLoading(): void {
    this.prePhase = 'loading';
    this.loadProgress = { loaded: 0, total: 0 };
    this.message = null;
    this.deps.onChange();
  }

  setLoadProgress(loaded: number, total: number): void {
    this.loadProgress = { loaded, total };
    this.deps.onChange();
  }

  setLoginRequired(): void {
    this.prePhase = 'login';
    this.message = null;
    this.deps.onChange();
  }

  setError(message: string): void {
    this.prePhase = 'error';
    this.message = message;
    this.deps.onChange();
  }

  setUsers(users: FollowUser[]): void {
    this.users = users;
    this.selected = new Set();
    this.prePhase = null;
    this.message = null;
    this.task = setPlanned(this.task, users);
    this.recomputeExclusion();
    this.deps.onChange();
  }

  toggle(mid: number): void {
    if (!this.isSelectable(mid)) {
      this.message = this.exclusion.protectedMids.has(mid)
        ? '该账号在保护名单中，不会被选中；可在设置页解除。'
        : '该账号是最近关注的，默认跳过；可在设置中调整天数。';
      this.deps.onChange();
      return;
    }
    if (this.selected.has(mid)) {
      this.selected.delete(mid);
    } else {
      this.selected.add(mid);
    }
    this.deps.onChange();
  }

  selectAll(mids?: number[]): void {
    const limit = this.settings.limit;
    const allowed = mids ? new Set(mids) : null;
    const pool = this.users.filter(
      (user) => (!allowed || allowed.has(user.mid)) && this.isSelectable(user.mid),
    );
    const picked = pool.slice(0, limit);
    this.selected = new Set(picked.map((user) => user.mid));
    this.message =
      pool.length > limit
        ? `单次最多处理 ${limit} 个，已选中前 ${limit} 个；可在设置中调整上限。`
        : null;
    this.deps.onChange();
  }

  clearSelection(): void {
    this.selected = new Set();
    this.deps.onChange();
  }

  confirm(): void {
    const picked = this.users.filter(
      (user) => this.selected.has(user.mid) && this.isSelectable(user.mid),
    );
    if (picked.length === 0) {
      return;
    }
    const limit = this.settings.limit;
    const chosen = picked.slice(0, limit);
    if (picked.length > limit) {
      this.message = `单次最多处理 ${limit} 个，本次只处理前 ${limit} 个。`;
    }
    this.task = toConfirming(setPlanned(createTask(), chosen));
    this.deps.onChange();
  }

  back(): void {
    if (this.task.status === 'confirming') {
      this.task = backToSelecting(this.task);
      this.deps.onChange();
    }
  }

  start(): void {
    if (this.task.status !== 'confirming') {
      return;
    }
    this.message = null;
    this.slowMode = false;
    this.task = startRun(this.task);
    this.beginBackup(this.task.planned);
    this.persist(true);
    this.deps.onChange();
    void this.loop();
  }

  pause(): void {
    this.task = pauseRun(this.task);
    this.persist(true);
    this.deps.onChange();
  }

  resume(): void {
    const wasPaused = this.task.status === 'paused';
    this.task = resumeRun(this.task);
    this.deps.onChange();
    if (wasPaused) {
      void this.loop();
    }
  }

  stop(): void {
    this.task = abortRun(this.task);
    this.settle();
    this.deps.onChange();
  }

  retryFailed(): void {
    if (this.task.failed.length === 0) {
      return;
    }
    const failedUsers = this.task.failed.map(({ mid, uname, face }) => ({ mid, uname, face }));
    this.users = failedUsers;
    this.selected = new Set(failedUsers.map((user) => user.mid));
    this.prePhase = null;
    this.task = toConfirming(createRetryTask(this.task));
    this.deps.onChange();
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.recomputeExclusion();
    this.deps.onChange();
  }

  setProtected(list: ProtectedUser[]): void {
    this.protectedList = list;
    this.recomputeExclusion();
    this.deps.onChange();
  }

  protect(mid: number): void {
    const user = this.users.find((item) => item.mid === mid);
    const result = pushProtected(this.protectedList, { mid, uname: user?.uname ?? '' });
    if (!result.added) {
      if (result.reason === 'limit') {
        this.message = `保护名单最多 ${MAX_PROTECTED} 个，请先在设置页清理。`;
      }
      this.deps.onChange();
      return;
    }
    this.protectedList = result.list;
    void this.deps.saveProtected(result.list);
    this.selected.delete(mid);
    this.task = removeFromPlan(this.task, mid);
    this.recomputeExclusion();
    this.message = '已加入保护名单，本次不会再处理该账号。';
    this.deps.onChange();
  }

  unprotect(mid: number): void {
    this.protectedList = removeProtected(this.protectedList, mid);
    void this.deps.saveProtected(this.protectedList);
    this.recomputeExclusion();
    this.deps.onChange();
  }

  isSelectable(mid: number): boolean {
    return !this.exclusion.excludedMids.has(mid);
  }

  private recomputeExclusion(): void {
    this.exclusion = buildExclusion(
      this.users,
      this.protectedList,
      this.deps.now(),
      this.settings.recentDays,
    );
    for (const mid of [...this.selected]) {
      if (!this.isSelectable(mid)) {
        this.selected.delete(mid);
      }
    }
  }

  setBackups(backups: BackupRecord[]): void {
    this.backups = backups;
    this.deps.onChange();
  }

  setGroups(groups: FollowGroup[]): void {
    this.groups = groups;
    this.deps.onChange();
  }

  offerResume(task: TaskState): void {
    if (!isResumable(task)) {
      return;
    }
    this.pendingResume = task;
    this.prePhase = 'resume';
    this.deps.onChange();
  }

  continueResume(): void {
    const stored = this.pendingResume;
    if (!stored) {
      return;
    }
    const succeeded = new Set(stored.succeeded);
    const exclusion = buildExclusion(stored.planned, this.protectedList, this.deps.now(), 0);
    const remaining = stored.planned.filter(
      (user) => !succeeded.has(user.mid) && !exclusion.excludedMids.has(user.mid),
    );
    const skippedProtected = stored.planned.filter(
      (user) => !succeeded.has(user.mid) && exclusion.excludedMids.has(user.mid),
    ).length;
    this.pendingResume = null;
    this.prePhase = null;
    this.slowMode = false;
    if (remaining.length === 0) {
      this.message = '剩余账号都在保护名单中，本次无需执行。';
      void this.deps.saveTask(null);
      this.deps.onChange();
      return;
    }
    this.users = remaining;
    this.selected = new Set();
    const notes: string[] = [];
    if (stored.succeeded.length > 0) {
      notes.push(`已跳过上次完成的 ${stored.succeeded.length} 个`);
    }
    if (skippedProtected > 0) {
      notes.push(`已跳过保护名单中的 ${skippedProtected} 个`);
    }
    this.message =
      notes.length > 0 ? `${notes.join('，')}，本次处理 ${remaining.length} 个。` : null;
    this.task = { ...createTask(), status: 'running', planned: remaining };
    this.beginBackup(remaining);
    this.recomputeExclusion();
    this.persist(true);
    this.deps.onChange();
    void this.loop();
  }

  dismissResume(): void {
    this.pendingResume = null;
    this.prePhase = null;
    void this.deps.saveTask(null);
    this.deps.onChange();
  }

  flush(): void {
    this.persist(true);
  }

  private beginBackup(users: FollowUser[]): void {
    if (users.length === 0) {
      return;
    }
    const record = createBackup(users);
    this.currentBackupId = record.id;
    this.backups = pushBackup(this.backups, record);
    void this.deps.saveBackups(this.backups);
  }

  private finishBackup(): void {
    const id = this.currentBackupId;
    if (!id) {
      return;
    }
    this.currentBackupId = null;
    this.backups = this.backups.map((record) =>
      record.id === id
        ? {
            ...record,
            stats: {
              total: record.users.length,
              succeeded: this.task.succeeded.length,
              failed: this.task.failed.length,
            },
          }
        : record,
    );
    void this.deps.saveBackups(this.backups);
  }

  private settle(): void {
    if (this.task.status === 'done') {
      this.finishBackup();
      void this.deps.saveTask(null);
      return;
    }
    if (this.task.status === 'aborted') {
      this.finishBackup();
      this.persist(true);
    }
  }

  private persist(force = false): void {
    const { status } = this.task;
    if (status !== 'running' && status !== 'paused' && status !== 'aborted') {
      return;
    }
    const processed = this.task.succeeded.length + this.task.failed.length;
    const now = Date.now();
    const settled = status !== 'running';
    if (
      !force &&
      !settled &&
      processed - this.persistedCount < PERSIST_EVERY_ITEMS &&
      now - this.persistedAt < PERSIST_INTERVAL_MS
    ) {
      return;
    }
    this.persistedCount = processed;
    this.persistedAt = now;
    void this.deps.saveTask(this.task);
  }

  private describeFailure(code: number | undefined, message: string): string {
    const friendly =
      typeof code === 'number' && RETRYABLE_CODES.has(code)
        ? 'B 站暂时限制了操作，稍后可再试'
        : message || '操作未成功';
    return this.settings.showRawErrors ? `[${code ?? -1}] ${message || friendly}` : friendly;
  }

  getSnapshot(): UiSnapshot {
    return {
      phase: this.prePhase ?? this.task.status,
      users: this.users,
      selected: this.selected,
      task: this.task,
      settings: this.settings,
      backups: this.backups,
      groups: this.groups,
      exclusion: this.exclusion,
      protectedList: this.protectedList,
      slowMode: this.slowMode,
      resume: this.pendingResume
        ? {
            total: this.pendingResume.planned.length,
            succeeded: this.pendingResume.succeeded.length,
          }
        : null,
      loadProgress: this.loadProgress,
      message: this.message,
    };
  }

  private async loop(): Promise<void> {
    if (this.loopRunning) {
      return;
    }
    this.loopRunning = true;
    try {
      while (this.task.status === 'running') {
        const next = nextPending(this.task);
        if (!next) {
          this.task = finishIfDone(this.task);
          this.deps.onChange();
          break;
        }

        this.task = beginAttempt(this.task, next.mid);
        this.deps.onChange();

        const result = await this.deps.unfollow(next.mid);
        const decision = decideAfterResult(result.code, result.message, this.task.attempt);

        if (decision.action === 'succeed') {
          this.task = markSucceeded(this.task);
        } else if (decision.action === 'abort') {
          this.message = '账号状态异常，已停止。请检查登录状态后重试。';
          this.task = abortRun(this.task);
          this.deps.onChange();
          break;
        } else if (decision.action === 'wait-then-retry') {
          if (!this.slowMode) {
            this.slowMode = true;
            this.message = '检测到风控，本次剩余任务已切换保守节奏。';
          }
          this.task = enterBackoff(this.task, decision.waitSeconds);
          this.deps.onChange();
          await this.waitWhileRunning(decision.waitSeconds * 1000);
          continue;
        } else {
          this.task = markFailed(this.task, this.describeFailure(result.code, decision.message));
        }
        this.deps.onChange();
        this.persist();

        if (this.task.status === 'aborted') {
          break;
        }
        if (nextPending(this.task) === null) {
          this.task = finishIfDone(this.task);
          this.deps.onChange();
          break;
        }
        const interval = this.slowMode ? 'conservative' : this.settings.interval;
        await this.waitWhileRunning(this.deps.randomDelayMs(interval));
      }
    } finally {
      this.loopRunning = false;
      this.settle();
    }
  }

  private async waitWhileRunning(ms: number): Promise<void> {
    let remaining = ms;
    while (remaining > 0 && this.task.status === 'running') {
      const step = Math.min(WAIT_CHUNK_MS, remaining);
      await this.deps.sleep(step);
      remaining -= step;
    }
  }
}
