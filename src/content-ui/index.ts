import { createBridgeClient, type BridgeClient } from '../bridge/client';
import { fetchFollowings, fetchGroups, fetchNav, unfollow, type FollowGroup } from '../core/api';
import { randomDelayMs as delayFor, type Settings } from '../core/settings';
import { createStorage } from '../core/storage';
import { progress, type TaskStatus } from '../core/task';
import { CleanupController, type UiSnapshot } from './controller';
import { createPanel, type PanelActions } from './panel';

const OPEN_FLAG = 'bfc.openRequested';

type Panel = ReturnType<typeof createPanel>;

const storage = createStorage(chrome.storage.local);

let client: BridgeClient | null = null;
let controller: CleanupController | null = null;
let activePanel: Panel | null = null;
let opening = false;
let notifiedStatus: TaskStatus | null = null;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getClient(): BridgeClient {
  if (!client) {
    client = createBridgeClient();
  }
  return client;
}

function getController(): CleanupController {
  if (!controller) {
    const bridge = getClient();
    controller = new CleanupController({
      unfollow: async (mid) => {
        const csrf = readCookie('bili_jct');
        if (!csrf) {
          return { code: -111, message: '缺少 csrf 令牌' };
        }
        return unfollow(bridge, mid, csrf);
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      randomDelayMs: (interval) => delayFor(interval),
      now: () => Date.now(),
      onChange: () => {
        const snapshot = getController().getSnapshot();
        notifyOnSettle(snapshot);
        activePanel?.render(snapshot);
      },
      saveTask: (task) => storage.saveTask(task),
      saveBackups: (backups) => storage.saveBackups(backups),
      saveProtected: (list) => storage.saveProtected(list),
    });
  }
  return controller;
}

function notifyOnSettle(snapshot: UiSnapshot): void {
  const { status } = snapshot.task;
  const settled = status === 'done' || status === 'aborted';
  if (settled && notifiedStatus !== status) {
    const stats = progress(snapshot.task);
    const title = status === 'done' ? '关注列表清理完成' : '关注列表清理已中止';
    void chrome.runtime
      .sendMessage({
        type: 'bfc-notify',
        title,
        message: `成功 ${stats.done} 个，失败 ${stats.failed} 个。`,
      })
      .catch(() => undefined);
  }
  notifiedStatus = settled ? status : null;
}

const actions: PanelActions = {
  onToggle: (mid) => getController().toggle(mid),
  onProtect: (mid) => getController().protect(mid),
  onUnprotect: (mid) => getController().unprotect(mid),
  onSelectAll: () => getController().selectAll(),
  onClearSelection: () => getController().clearSelection(),
  onConfirm: () => getController().confirm(),
  onBack: () => getController().back(),
  onStart: () => getController().start(),
  onPause: () => getController().pause(),
  onResume: () => getController().resume(),
  onStop: () => getController().stop(),
  onRetryFailed: () => getController().retryFailed(),
  onReload: () => {
    void loadFollowings();
  },
  onResumeTask: () => getController().continueResume(),
  onDismissResume: () => {
    getController().dismissResume();
    void loadFollowings();
  },
  onChangeSettings: (settings: Settings) => {
    void storage.saveSettings(settings);
    getController().setSettings(settings);
  },
  onClose: () => {
    activePanel?.destroy();
    activePanel = null;
  },
};

async function loadFollowings(): Promise<void> {
  const bridge = getClient();
  const control = getController();
  control.setLoading();
  try {
    const nav = await fetchNav(bridge);
    if (!nav.isLogin || nav.mid === null) {
      control.setLoginRequired();
      return;
    }
    const { items } = await fetchFollowings(bridge, nav.keys, nav.mid, {
      onProgress: (loaded, total) => control.setLoadProgress(loaded, total),
    });
    if (items.length === 0) {
      control.setError('关注列表为空，无需整理。');
      return;
    }
    control.setGroups(await loadGroups(bridge));
    control.setUsers(items);
  } catch (error) {
    control.setError(error instanceof Error ? error.message : String(error));
  }
}

async function loadGroups(bridge: BridgeClient): Promise<FollowGroup[]> {
  try {
    return await fetchGroups(bridge);
  } catch {
    return [];
  }
}

async function openPanel(): Promise<void> {
  if (opening) {
    return;
  }
  const control = getController();
  const phase = control.getSnapshot().phase;

  if (activePanel) {
    if (phase === 'login' || phase === 'error') {
      await loadFollowings();
    }
    return;
  }

  opening = true;
  try {
    activePanel = createPanel(actions);
    if (phase === 'idle' || phase === 'login' || phase === 'error') {
      await loadFollowings();
    } else {
      activePanel.render(control.getSnapshot());
    }
  } finally {
    opening = false;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if ((message as { type?: string } | null)?.type === 'bfc-open') {
    void openPanel();
    sendResponse({ ok: true });
  }
});

async function boot(): Promise<void> {
  const control = getController();
  control.setSettings(await storage.loadSettings());
  control.setBackups(await storage.loadBackups());
  control.setProtected(await storage.loadProtected());
  const task = await storage.loadTask();
  if (task) {
    control.offerResume(task);
  }
  window.addEventListener('pagehide', () => getController().flush());

  const stored = await chrome.storage.local.get(OPEN_FLAG);
  if (!stored[OPEN_FLAG]) {
    return;
  }
  await chrome.storage.local.remove(OPEN_FLAG);
  await openPanel();
}

void boot();
