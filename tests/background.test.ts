import { beforeEach, describe, expect, it, vi } from 'vitest';

type ClickHandler = (tab: { id?: number; url?: string }) => void;
type SendMessage = (tabId: number, message: unknown) => Promise<unknown>;
type MessageHandler = (
  message: unknown,
  sender: unknown,
  sendResponse: (reply?: unknown) => void,
) => void;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function loadBackground(
  options: {
    sendMessage?: SendMessage;
    executeScript?: (injection: unknown) => Promise<unknown>;
    settings?: unknown;
    onNotification?: (id: string, notification: unknown) => void;
  } = {},
) {
  const clicks: ClickHandler[] = [];
  const messageHandlers: MessageHandler[] = [];
  const createdTabs: string[] = [];
  const storage: Record<string, unknown> = {};
  if (options.settings !== undefined) {
    storage.settings = options.settings;
  }

  const fake = {
    action: { onClicked: { addListener: (handler: ClickHandler) => clicks.push(handler) } },
    runtime: {
      onMessage: { addListener: (handler: MessageHandler) => messageHandlers.push(handler) },
    },
    notifications: {
      create: vi.fn(async (id: string, notification: unknown) => {
        options.onNotification?.(id, notification);
        return id;
      }),
    },
    tabs: {
      sendMessage: vi.fn(options.sendMessage ?? (async () => ({ ok: true }))),
      create: vi.fn(async ({ url }: { url: string }) => {
        createdTabs.push(url);
      }),
    },
    scripting: { executeScript: vi.fn(options.executeScript ?? (async () => [])) },
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in storage ? { [key]: storage[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(storage, items);
        }),
      },
    },
  };

  vi.stubGlobal('chrome', fake);
  await import('../src/background/index');
  return { fake, clicks, messageHandlers, createdTabs, storage };
}

const BILI_TAB = { id: 7, url: 'https://space.bilibili.com/123' };

describe('background 图标点击', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('内容脚本在线：原地打开，不注入、不新建标签', async () => {
    const { fake, clicks, createdTabs, storage } = await loadBackground();

    clicks[0](BILI_TAB);

    await vi.waitFor(() => expect(fake.tabs.sendMessage).toHaveBeenCalledTimes(1));
    expect(fake.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'bfc-open' });
    expect(fake.scripting.executeScript).not.toHaveBeenCalled();
    expect(createdTabs).toEqual([]);
    expect(storage).toEqual({});
  });

  it('内容脚本失效：补注入后重新打开', async () => {
    let calls = 0;
    const { fake, clicks, createdTabs } = await loadBackground({
      sendMessage: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('Could not establish connection.');
        }
        return { ok: true };
      },
    });

    clicks[0](BILI_TAB);

    await vi.waitFor(() => expect(fake.tabs.sendMessage).toHaveBeenCalledTimes(2));
    expect(fake.scripting.executeScript.mock.calls.map((call) => call[0])).toEqual([
      { target: { tabId: 7 }, files: ['content-main.js'], world: 'MAIN' },
      { target: { tabId: 7 }, files: ['content-ui.js'] },
    ]);
    expect(createdTabs).toEqual([]);
  });

  it('补注入失败：写入打开标志并新开标签', async () => {
    const { clicks, createdTabs, storage } = await loadBackground({
      sendMessage: async () => {
        throw new Error('Could not establish connection.');
      },
      executeScript: async () => {
        throw new Error('Cannot access contents of the page.');
      },
    });

    clicks[0](BILI_TAB);

    await vi.waitFor(() => expect(createdTabs).toEqual(['https://space.bilibili.com/']));
    expect(storage).toEqual({ 'bfc.openRequested': true });
  });

  it('非 B 站页面：不打扰当前页面，直接新开标签', async () => {
    const { fake, clicks, createdTabs } = await loadBackground();

    clicks[0]({ id: 9, url: 'https://www.example.com/' });

    await vi.waitFor(() => expect(createdTabs).toEqual(['https://space.bilibili.com/']));
    expect(fake.tabs.sendMessage).not.toHaveBeenCalled();
    expect(fake.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('连点：上一次点击处理完成前忽略后续点击', async () => {
    const gate = deferred<{ ok: boolean }>();
    const { fake, clicks, createdTabs } = await loadBackground({ sendMessage: () => gate.promise });

    clicks[0](BILI_TAB);
    clicks[0](BILI_TAB);

    expect(fake.tabs.sendMessage).toHaveBeenCalledTimes(1);
    gate.resolve({ ok: true });
    await gate.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(createdTabs).toEqual([]);
  });
});

describe('background 系统通知', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('设置开启时创建系统通知并应答', async () => {
    const sent: Array<{ id: string; notification: { title?: string; message?: string } }> = [];
    const { fake, messageHandlers } = await loadBackground({
      settings: { notify: true },
      onNotification: (id, notification) =>
        sent.push({ id, notification: notification as { title?: string } }),
    });

    let reply: unknown = null;
    messageHandlers[0](
      { type: 'bfc-notify', title: '关注列表清理完成', message: '成功 3 个，失败 0 个。' },
      {},
      (value) => {
        reply = value;
      },
    );

    await vi.waitFor(() => expect(fake.notifications.create).toHaveBeenCalledTimes(1));
    expect(reply).toEqual({ ok: true });
    expect(sent[0].notification.title).toBe('关注列表清理完成');
    expect(sent[0].notification.message).toBe('成功 3 个，失败 0 个。');
    expect(sent[0].id.startsWith('bfc-')).toBe(true);
  });

  it('设置关闭时不发送通知', async () => {
    const { fake, messageHandlers } = await loadBackground({ settings: { notify: false } });

    messageHandlers[0]({ type: 'bfc-notify', title: 't', message: 'm' }, {}, () => {});
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fake.notifications.create).not.toHaveBeenCalled();
  });

  it('忽略其它类型的消息', async () => {
    const { fake, messageHandlers } = await loadBackground();

    messageHandlers[0]({ type: 'unknown' }, {}, () => {});
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fake.notifications.create).not.toHaveBeenCalled();
  });
});
