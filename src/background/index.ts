import { parseSettings } from '../core/settings';
import { SETTINGS_KEY } from '../core/storage';

const OPEN_FLAG = 'bfc.openRequested';
const SPACE_URL = 'https://space.bilibili.com/';
const INJECTABLE = /^https:\/\/(space|www)\.bilibili\.com\//;
const NOTIFICATION_ICON = 'assets/icon128.png';
const DEFAULT_TITLE = '关注列表整理工具';

let handling = false;

async function sendToggle(tabId: number): Promise<boolean> {
  try {
    const reply: unknown = await chrome.tabs.sendMessage(tabId, { type: 'bfc-toggle' });
    return (reply as { ok?: boolean } | undefined)?.ok === true;
  } catch {
    return false;
  }
}

async function injectAndToggle(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content-main.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content-ui.js'] });
  } catch {
    return false;
  }
  return sendToggle(tabId);
}

async function handleClick(tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id;

  if (tabId !== undefined && INJECTABLE.test(tab.url ?? '')) {
    if ((await sendToggle(tabId)) || (await injectAndToggle(tabId))) {
      return;
    }
  }

  await chrome.storage.local.set({ [OPEN_FLAG]: true });
  await chrome.tabs.create({ url: SPACE_URL });
}

chrome.action.onClicked.addListener((tab) => {
  if (handling) {
    return;
  }
  handling = true;
  void handleClick(tab).finally(() => {
    handling = false;
  });
});

async function showNotification(title: string, message: string): Promise<void> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  if (!parseSettings(stored[SETTINGS_KEY]).notify) {
    return;
  }
  await chrome.notifications.create(`bfc-${Date.now()}`, {
    type: 'basic',
    iconUrl: NOTIFICATION_ICON,
    title,
    message,
  });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const data = message as { type?: string; title?: string; message?: string } | null;
  if (data?.type !== 'bfc-notify') {
    return;
  }
  void showNotification(data.title ?? DEFAULT_TITLE, data.message ?? '');
  sendResponse({ ok: true });
});

export {};
