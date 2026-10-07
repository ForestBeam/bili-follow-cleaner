import { MAX_BACKUPS, parseBackups, type BackupRecord } from './backup';
import { parseProtected, type ProtectedUser } from './protection';
import { parseSettings, type Settings } from './settings';
import { parseTaskState, type TaskState } from './task';

export const TASK_KEY = 'task';
export const BACKUPS_KEY = 'backups';
export const SETTINGS_KEY = 'settings';
export const PROTECTED_KEY = 'protected';

export interface StorageLike {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface Storage {
  loadSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  loadBackups(): Promise<BackupRecord[]>;
  saveBackups(backups: BackupRecord[]): Promise<void>;
  loadTask(): Promise<TaskState | null>;
  saveTask(task: TaskState | null): Promise<void>;
  loadProtected(): Promise<ProtectedUser[]>;
  saveProtected(list: ProtectedUser[]): Promise<void>;
}

export function createStorage(area: StorageLike): Storage {
  return {
    async loadSettings() {
      const stored = await area.get(SETTINGS_KEY);
      return parseSettings(stored[SETTINGS_KEY]);
    },
    async saveSettings(settings) {
      await area.set({ [SETTINGS_KEY]: settings });
    },
    async loadBackups() {
      const stored = await area.get(BACKUPS_KEY);
      return parseBackups(stored[BACKUPS_KEY]);
    },
    async saveBackups(backups) {
      await area.set({ [BACKUPS_KEY]: backups.slice(0, MAX_BACKUPS) });
    },
    async loadTask() {
      const stored = await area.get(TASK_KEY);
      return parseTaskState(stored[TASK_KEY]);
    },
    async saveTask(task) {
      if (task) {
        await area.set({ [TASK_KEY]: task });
      } else {
        await area.remove(TASK_KEY);
      }
    },
    async loadProtected() {
      const stored = await area.get(PROTECTED_KEY);
      return parseProtected(stored[PROTECTED_KEY]);
    },
    async saveProtected(list) {
      await area.set({ [PROTECTED_KEY]: list });
    },
  };
}
