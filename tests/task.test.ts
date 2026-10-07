import { describe, expect, it } from 'vitest';
import {
  abortRun,
  backToSelecting,
  beginAttempt,
  createRetryTask,
  createTask,
  enterBackoff,
  finishIfDone,
  markFailed,
  markSucceeded,
  nextPending,
  pauseRun,
  progress,
  resumeRun,
  setPlanned,
  startRun,
  toConfirming,
} from '../src/core/task';

const USERS = [
  { mid: 1, uname: 'a' },
  { mid: 2, uname: 'b' },
  { mid: 3, uname: 'c' },
];

function runningTask(users = USERS) {
  let state = createTask();
  state = setPlanned(state, users);
  state = toConfirming(state);
  return startRun(state);
}

describe('task lifecycle', () => {
  it('starts idle and empty', () => {
    const state = createTask();
    expect(state.status).toBe('idle');
    expect(state.planned).toEqual([]);
    expect(state.currentMid).toBeNull();
  });

  it('moves through selecting -> confirming -> running', () => {
    let state = createTask();
    state = setPlanned(state, USERS);
    expect(state.status).toBe('selecting');
    state = toConfirming(state);
    expect(state.status).toBe('confirming');
    state = startRun(state);
    expect(state.status).toBe('running');
  });

  it('supports pause, resume, abort, and back-to-selecting', () => {
    let state = runningTask();
    state = pauseRun(state);
    expect(state.status).toBe('paused');
    state = resumeRun(state);
    expect(state.status).toBe('running');
    expect(pauseRun(createTask()).status).toBe('idle');
    expect(resumeRun(createTask()).status).toBe('idle');
    expect(backToSelecting(toConfirming(setPlanned(createTask(), USERS))).status).toBe('selecting');
    expect(abortRun(state).status).toBe('aborted');
  });
});

describe('queue management', () => {
  it('keeps the in-flight user pending until it is resolved', () => {
    let state = runningTask();
    expect(nextPending(state)).toEqual(USERS[0]);
    state = beginAttempt(state, USERS[0].mid);
    expect(nextPending(state)).toEqual(USERS[0]);
    state = markSucceeded(state);
    expect(nextPending(state)).toEqual(USERS[1]);
  });

  it('returns null when everything is resolved', () => {
    let state = runningTask();
    for (const user of USERS) {
      state = beginAttempt(state, user.mid);
      state = markSucceeded(state);
    }
    expect(nextPending(state)).toBeNull();
  });

  it('records failures with message and uname', () => {
    let state = runningTask();
    state = beginAttempt(state, 1);
    state = markFailed(state, '风控');
    expect(state.failed).toEqual([{ mid: 1, uname: 'a', message: '风控' }]);
    expect(state.consecutiveFailures).toBe(1);
    expect(state.currentMid).toBeNull();
    expect(progress(state)).toEqual({ total: 3, done: 0, failed: 1, remaining: 2 });
  });

  it('resets the failure streak after a success', () => {
    let state = runningTask();
    state = beginAttempt(state, 1);
    state = markFailed(state, 'x');
    state = beginAttempt(state, 2);
    state = markSucceeded(state);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.succeeded).toEqual([2]);
  });

  it('aborts after five consecutive failures', () => {
    const users = Array.from({ length: 6 }, (_, index) => ({ mid: index + 1, uname: `u${index + 1}` }));
    let state = runningTask(users);
    for (let index = 0; index < 5; index += 1) {
      state = beginAttempt(state, users[index].mid);
      state = markFailed(state, 'x');
    }
    expect(state.status).toBe('aborted');
    expect(state.failed).toHaveLength(5);
  });

  it('tracks retry attempts via backoff entries', () => {
    let state = runningTask();
    state = beginAttempt(state, 1);
    expect(state.attempt).toBe(1);
    state = enterBackoff(state, 60);
    expect(state.attempt).toBe(2);
    expect(state.backoffWaitSeconds).toBe(60);
    state = beginAttempt(state, 1);
    expect(state.attempt).toBe(2);
    expect(state.backoffWaitSeconds).toBeNull();
    state = beginAttempt(state, 2);
    expect(state.attempt).toBe(1);
    state = markSucceeded(state);
    expect(state.attempt).toBe(1);
    expect(state.backoffWaitSeconds).toBeNull();
  });
});

describe('completion and retry', () => {
  it('marks the task done when nothing is pending', () => {
    let state = runningTask();
    for (const user of USERS) {
      state = beginAttempt(state, user.mid);
      state = markSucceeded(state);
    }
    expect(finishIfDone(state).status).toBe('done');
  });

  it('keeps aborted status when finishing', () => {
    let state = runningTask();
    state = beginAttempt(state, 1);
    state = markFailed(state, 'x');
    state = finishIfDone(abortRun(state));
    expect(state.status).toBe('aborted');
  });

  it('builds a retry task from failed items', () => {
    let state = runningTask();
    state = beginAttempt(state, 1);
    state = markFailed(state, 'x');
    const retry = createRetryTask(state);
    expect(retry.status).toBe('selecting');
    expect(retry.planned).toEqual([{ mid: 1, uname: 'a' }]);
    expect(retry.failed).toEqual([]);
  });
});
