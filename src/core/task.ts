import { shouldAbortForStreak } from './backoff';

export type TaskStatus =
  | 'idle'
  | 'loading'
  | 'selecting'
  | 'confirming'
  | 'running'
  | 'paused'
  | 'done'
  | 'aborted';

export interface FollowUser {
  mid: number;
  uname: string;
  face?: string;
  tags?: number[];
  followedAt?: number;
}

export function parseTagIds(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.filter((tag): tag is number => typeof tag === 'number');
  }
  return typeof raw === 'number' ? [raw] : [];
}

export interface FailedItem extends FollowUser {
  message: string;
}

export interface TaskState {
  status: TaskStatus;
  planned: FollowUser[];
  succeeded: number[];
  failed: FailedItem[];
  currentMid: number | null;
  attempt: number;
  consecutiveFailures: number;
  backoffWaitSeconds: number | null;
}

export interface TaskProgress {
  total: number;
  done: number;
  failed: number;
  remaining: number;
}

export function createTask(): TaskState {
  return {
    status: 'idle',
    planned: [],
    succeeded: [],
    failed: [],
    currentMid: null,
    attempt: 1,
    consecutiveFailures: 0,
    backoffWaitSeconds: null,
  };
}

export function setPlanned(_state: TaskState, planned: FollowUser[]): TaskState {
  return {
    ...createTask(),
    status: 'selecting',
    planned,
  };
}

export function toConfirming(state: TaskState): TaskState {
  return { ...state, status: 'confirming' };
}

export function backToSelecting(state: TaskState): TaskState {
  return { ...state, status: 'selecting' };
}

export function startRun(state: TaskState): TaskState {
  return state.status === 'confirming' ? { ...state, status: 'running' } : state;
}

export function pauseRun(state: TaskState): TaskState {
  return state.status === 'running' ? { ...state, status: 'paused' } : state;
}

export function resumeRun(state: TaskState): TaskState {
  return state.status === 'paused' ? { ...state, status: 'running' } : state;
}

export function abortRun(state: TaskState): TaskState {
  return { ...state, status: 'aborted' };
}

export function nextPending(state: TaskState): FollowUser | null {
  if (state.currentMid !== null) {
    const current = state.planned.find((user) => user.mid === state.currentMid);
    if (current) {
      return current;
    }
  }
  const succeeded = new Set(state.succeeded);
  const failed = new Set(state.failed.map((item) => item.mid));
  const next = state.planned.find(
    (user) => !succeeded.has(user.mid) && !failed.has(user.mid),
  );
  return next ?? null;
}

export function beginAttempt(state: TaskState, mid: number): TaskState {
  if (state.currentMid === mid) {
    return { ...state, backoffWaitSeconds: null };
  }
  return { ...state, currentMid: mid, attempt: 1, backoffWaitSeconds: null };
}

export function enterBackoff(state: TaskState, waitSeconds: number): TaskState {
  return { ...state, attempt: state.attempt + 1, backoffWaitSeconds: waitSeconds };
}

export function markSucceeded(state: TaskState): TaskState {
  if (state.currentMid === null) {
    return state;
  }
  return {
    ...state,
    succeeded: [...state.succeeded, state.currentMid],
    currentMid: null,
    attempt: 1,
    consecutiveFailures: 0,
    backoffWaitSeconds: null,
  };
}

export function markFailed(state: TaskState, message: string): TaskState {
  if (state.currentMid === null) {
    return state;
  }
  const user = state.planned.find((item) => item.mid === state.currentMid);
  const consecutiveFailures = state.consecutiveFailures + 1;
  const next: TaskState = {
    ...state,
    failed: [
      ...state.failed,
      { mid: state.currentMid, uname: user?.uname ?? '', message },
    ],
    currentMid: null,
    attempt: 1,
    consecutiveFailures,
    backoffWaitSeconds: null,
  };
  return shouldAbortForStreak(consecutiveFailures) ? { ...next, status: 'aborted' } : next;
}

export function finishIfDone(state: TaskState): TaskState {
  if (state.status !== 'running') {
    return state;
  }
  return nextPending(state) === null ? { ...state, status: 'done' } : state;
}

export function removeFromPlan(state: TaskState, mid: number): TaskState {
  const next: TaskState = {
    ...state,
    planned: state.planned.filter((user) => user.mid !== mid),
    succeeded: state.succeeded.filter((item) => item !== mid),
    failed: state.failed.filter((item) => item.mid !== mid),
    currentMid: state.currentMid === mid ? null : state.currentMid,
  };
  if (next.planned.length === 0) {
    return { ...next, status: 'selecting', currentMid: null };
  }
  return finishIfDone(next);
}

export function createRetryTask(state: TaskState): TaskState {
  return {
    ...createTask(),
    status: 'selecting',
    planned: state.failed.map(({ mid, uname }) => ({ mid, uname })),
  };
}

export function progress(state: TaskState): TaskProgress {
  const total = state.planned.length;
  const done = state.succeeded.length;
  const failed = state.failed.length;
  return { total, done, failed, remaining: total - done - failed };
}

const STATUSES: TaskStatus[] = [
  'idle',
  'loading',
  'selecting',
  'confirming',
  'running',
  'paused',
  'done',
  'aborted',
];

function parseUser(raw: unknown): FollowUser | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const user = raw as {
    mid?: unknown;
    uname?: unknown;
    face?: unknown;
    tags?: unknown;
    followedAt?: unknown;
  };
  if (typeof user.mid !== 'number') {
    return null;
  }
  const parsed: FollowUser = {
    mid: user.mid,
    uname: typeof user.uname === 'string' ? user.uname : '',
    face: typeof user.face === 'string' ? user.face : undefined,
  };
  const tags = parseTagIds(user.tags);
  if (tags.length > 0) {
    parsed.tags = tags;
  }
  if (typeof user.followedAt === 'number' && user.followedAt > 0) {
    parsed.followedAt = user.followedAt;
  }
  return parsed;
}

export function parseTaskState(raw: unknown): TaskState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Partial<Record<keyof TaskState, unknown>>;
  if (!STATUSES.includes(candidate.status as TaskStatus) || !Array.isArray(candidate.planned)) {
    return null;
  }
  const planned: FollowUser[] = [];
  for (const entry of candidate.planned) {
    const user = parseUser(entry);
    if (user) {
      planned.push(user);
    }
  }
  if (planned.length === 0) {
    return null;
  }
  const succeeded = Array.isArray(candidate.succeeded)
    ? candidate.succeeded.filter((mid): mid is number => typeof mid === 'number')
    : [];
  const failed: FailedItem[] = [];
  if (Array.isArray(candidate.failed)) {
    for (const entry of candidate.failed) {
      const user = parseUser(entry);
      if (!user) {
        continue;
      }
      const message = (entry as { message?: unknown }).message;
      failed.push({ ...user, message: typeof message === 'string' ? message : '' });
    }
  }
  return {
    status: candidate.status as TaskStatus,
    planned,
    succeeded,
    failed,
    currentMid: null,
    attempt: 1,
    consecutiveFailures: 0,
    backoffWaitSeconds: null,
  };
}

export function isResumable(state: TaskState | null): state is TaskState {
  if (!state) {
    return false;
  }
  if (state.status !== 'running' && state.status !== 'paused') {
    return false;
  }
  return state.planned.length > 0 && state.succeeded.length < state.planned.length;
}
