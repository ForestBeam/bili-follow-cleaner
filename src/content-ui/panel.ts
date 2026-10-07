import {
  MAX_BACKUPS,
  backupFilename,
  toBackupCsv,
  toBackupJson,
  type BackupRecord,
} from '../core/backup';
import { MAX_PROTECTED, isSpecialFollow } from '../core/protection';
import {
  LIMIT_MAX,
  LIMIT_MIN,
  RECENT_DAYS_MAX,
  clampLimit,
  clampRecentDays,
  delayRangeMs,
  type Settings,
} from '../core/settings';
import { progress, type FollowUser } from '../core/task';
import type { UiSnapshot } from './controller';
import { PANEL_CSS } from './styles';

export interface PanelActions {
  onToggle(mid: number): void;
  onProtect(mid: number): void;
  onUnprotect(mid: number): void;
  onSelectAll(mids?: number[]): void;
  onClearSelection(): void;
  onConfirm(): void;
  onBack(): void;
  onStart(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  onRetryFailed(): void;
  onReload(): void;
  onClose(): void;
  onResumeTask(): void;
  onDismissResume(): void;
  onUndo(): void;
  onInfo(text: string): void;
  onChangeSettings(settings: Settings): void;
}

type IconName =
  | 'mark'
  | 'x'
  | 'gear'
  | 'lock'
  | 'unlock'
  | 'check'
  | 'back'
  | 'play'
  | 'pause'
  | 'stop'
  | 'retry'
  | 'download'
  | 'clock'
  | 'shield'
  | 'link'
  | 'search';

const ICONS: Record<IconName, string> = {
  mark: '<path d="M4 6h11M4 12h7M4 18h5"/><path d="m17.6 3.4.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  gear: '<path d="M5 8.5h8M18.5 8.5H19M5 15.5h3.5M12 15.5h7"/><circle cx="15.5" cy="8.5" r="2.1"/><circle cx="10.5" cy="15.5" r="2.1"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="9.6" rx="2.6"/><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4"/>',
  unlock: '<rect x="4.6" y="10.4" width="14.8" height="9.6" rx="2.6"/><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.3-1.6"/>',
  check: '<path d="m5 12.6 4.6 4.6L19 7.4"/>',
  back: '<path d="M14 6l-6 6 6 6"/>',
  play: '<path d="M8.5 5.6v12.8L19 12z"/>',
  pause: '<path d="M9.2 5.6v12.8M14.8 5.6v12.8"/>',
  stop: '<rect x="6.6" y="6.6" width="10.8" height="10.8" rx="2.4"/>',
  retry: '<path d="M19.6 12a7.6 7.6 0 1 1-2.5-5.6"/><path d="M19.8 4.4v4.4h-4.4"/>',
  download: '<path d="M12 4.4v9.8m0 0 3.8-3.8M12 14.2 8.2 10.4"/><path d="M5.2 18.4h13.6"/>',
  clock: '<circle cx="12" cy="12" r="7.8"/><path d="M12 8.2v4.3l3 1.8"/>',
  shield: '<path d="M12 4.4 19 6.9v5c0 4.4-2.9 7.2-7 8.4-4.1-1.2-7-4-7-8.4v-5z"/>',
  link: '<path d="M14.2 4.4h5.4v5.4"/><path d="M19.6 4.4 11 13"/><path d="M18.4 13.8v4.3a1.9 1.9 0 0 1-1.9 1.9H5.9A1.9 1.9 0 0 1 4 18.1V7.5a1.9 1.9 0 0 1 1.9-1.9h4.3"/>',
  search: '<circle cx="11" cy="11" r="6.2"/><path d="m15.6 15.6 4 4"/>',
};

interface ButtonOpts {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm';
  icon?: IconName;
  title?: string;
  block?: boolean;
}

function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name: IconName, size = 15): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}

function button(label: string, onClick: () => void, opts: ButtonOpts = {}): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `btn${opts.variant ? ` ${opts.variant}` : ''}${
    opts.size === 'sm' ? ' sm' : ''
  }${opts.block ? ' block' : ''}`;
  if (opts.title) node.title = opts.title;
  if (opts.icon) node.append(icon(opts.icon, opts.size === 'sm' ? 13 : 15));
  if (label) node.append(h('span', '', label));
  node.addEventListener('click', onClick);
  return node;
}

function iconButton(name: IconName, label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'icon-btn';
  node.title = label;
  node.setAttribute('aria-label', label);
  node.append(icon(name, 16));
  node.addEventListener('click', onClick);
  return node;
}

function chip(
  label: string,
  active: boolean,
  onClick: () => void,
  count?: number,
  disabled = false,
): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'chip';
  node.setAttribute('aria-pressed', String(active));
  node.disabled = disabled;
  node.append(h('span', '', label));
  if (count !== undefined) {
    node.append(h('b', '', String(count)));
  }
  node.addEventListener('click', onClick);
  return node;
}

function activate(node: HTMLElement, onActivate: () => void): void {
  node.setAttribute('role', 'button');
  node.tabIndex = 0;
  node.addEventListener('click', onActivate);
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  });
}

function avatar(user: Pick<FollowUser, 'uname' | 'face'>): HTMLElement {
  const wrap = h('div', 'face-wrap');
  if (user.face) {
    const img = document.createElement('img');
    img.className = 'face';
    img.src = user.face;
    img.loading = 'lazy';
    img.alt = '';
    wrap.append(img);
  } else {
    wrap.append(h('span', 'face-txt', (user.uname || '?').slice(0, 1)));
  }
  return wrap;
}

function note(text: string, kind: 'brand' | 'warn' | 'ok' = 'brand', name?: IconName): HTMLElement {
  const node = h('div', `note${kind === 'brand' ? '' : ` ${kind}`}`);
  if (name) node.append(icon(name, 14));
  node.append(h('div', '', text));
  return node;
}

function tile(label: string, value: number, warn = false): HTMLElement {
  const node = h('div', `tile${warn ? ' warn' : ''}`);
  node.append(h('b', '', String(value)), h('span', '', label));
  return node;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} 分钟`;
  }
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

function etaMs(snapshot: UiSnapshot): number | null {
  const stats = progress(snapshot.task);
  if (stats.remaining <= 0) {
    return null;
  }
  const interval = snapshot.slowMode ? 'conservative' : snapshot.settings.interval;
  const { min, max } = delayRangeMs(interval);
  return stats.remaining * ((min + max) / 2);
}

export interface PanelOptions {
  notice?: string;
}

export function createPanel(actions: PanelActions, options: PanelOptions = {}) {
  const host = document.createElement('div');
  host.id = 'bfc-panel-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;

  const panel = h('div', 'panel');
  const header = h('header', 'hd');
  const mark = h('div', 'mark');
  mark.append(icon('mark', 17));
  const titles = h('div', 'titles');
  titles.append(h('div', 'kicker', 'follow list cleaner'));
  titles.append(h('div', 'title', '关注列表整理工具'));
  const accountLine = h('div', 'acct');
  titles.append(accountLine);
  const settingsButton = iconButton('gear', '设置', () => {
    showSettings = !showSettings;
    if (lastSnapshot) {
      render(lastSnapshot);
    }
  });
  const closeButton = iconButton('x', '关闭面板', () => {
    const runningState = lastSnapshot?.phase === 'running' || lastSnapshot?.phase === 'paused';
    if (runningState && !closeArmed) {
      closeArmed = true;
      closeButton.classList.add('armed');
      closeButton.title = '任务运行中，再点一次关闭（任务会继续）';
      closeButton.setAttribute('aria-label', '任务运行中，再点一次关闭');
      return;
    }
    actions.onClose();
  });
  const headerActions = h('div', 'hd-actions');
  headerActions.append(settingsButton, closeButton);
  header.append(mark, titles, headerActions);

  const main = h('main');
  panel.append(header, main);
  shadow.append(style, panel);
  document.body.append(host);

  let visibleCount = 200;
  let showSettings = false;
  let lastSnapshot: UiSnapshot | null = null;
  let lastViewKey = '';
  let onlyDeactivated = false;
  let onlyGroup: number | null = null;
  let query = '';
  let queryFocused = false;
  let stopArmed = false;
  let closeArmed = false;
  const unprotectArmed = new Set<number>();

  function disarm(): void {
    stopArmed = false;
    closeArmed = false;
    closeButton.classList.remove('armed');
    closeButton.title = '关闭面板';
    closeButton.setAttribute('aria-label', '关闭面板');
    if (unprotectArmed.size > 0) {
      unprotectArmed.clear();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    if (stopArmed || closeArmed || unprotectArmed.size > 0) {
      disarm();
      if (lastSnapshot) {
        render(lastSnapshot);
      }
      return;
    }
    actions.onClose();
  }
  document.addEventListener('keydown', onKeyDown, true);

  function saveFile(name: string, text: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function backupRow(record: BackupRecord): HTMLElement {
    const row = h('div', 'row');
    const date = new Date(record.createdAt);
    const info = h('div', 'grow');
    info.append(h('div', '', `成功 ${record.stats.succeeded} / 失败 ${record.stats.failed}`));
    info.append(h('div', 'date', date.toLocaleString()));
    row.append(info);
    row.append(
      button('JSON', () => saveFile(backupFilename(record, 'json'), toBackupJson(record), 'application/json'), { size: 'sm' }),
      button('CSV', () => saveFile(backupFilename(record, 'csv'), `\ufeff${toBackupCsv(record)}`, 'text/csv'), { size: 'sm' }),
    );
    return row;
  }

  function renderLoading(container: HTMLElement, snapshot: UiSnapshot): void {
    const loaded = snapshot.loadProgress?.loaded ?? 0;
    const total = snapshot.loadProgress?.total ?? 0;
    const line = h('div', 'hint');
    line.append(
      h('span', '', total > 0 ? `正在读取关注列表 ${loaded} / ${total}` : '正在读取关注列表…'),
    );
    container.append(line);
    const grid = h('div', 'grid');
    grid.style.marginTop = '12px';
    for (let index = 0; index < 9; index += 1) {
      grid.append(h('div', 'sk card-sk'));
    }
    container.append(grid);
  }

  function renderLogin(container: HTMLElement): void {
    container.append(note('未检测到 B 站登录状态，请先登录后再打开面板。', 'warn', 'shield'));
    container.append(
      button('打开登录页', () => {
        window.open('https://passport.bilibili.com/login', '_blank');
      }, { variant: 'primary', block: true }),
    );
  }

  function renderError(container: HTMLElement): void {
    container.append(button('重试', actions.onReload, { variant: 'primary', icon: 'retry', block: true }));
  }

  function renderResume(container: HTMLElement, snapshot: UiSnapshot): void {
    const resume = snapshot.resume;
    if (!resume) {
      return;
    }
    container.append(
      note(`上次清理没有完成：计划 ${resume.total} 个，已完成 ${resume.succeeded} 个。`, 'brand', 'clock'),
    );
    container.append(
      h('div', 'hint', `继续将处理剩余 ${resume.total - resume.succeeded} 个账号，已完成的不会重复处理。`),
    );
    const foot = h('div', 'foot');
    foot.append(
      button('暂不继续', actions.onDismissResume, { variant: 'ghost' }),
      h('div', 'grow'),
      button('继续清理', actions.onResumeTask, { variant: 'primary', icon: 'play' }),
    );
    container.append(foot);
  }

  function renderCard(snapshot: UiSnapshot, user: FollowUser): HTMLElement {
    const excluded = snapshot.exclusion.excludedMids.has(user.mid);
    const selected = snapshot.selected.has(user.mid);
    const card = h('div', `card${excluded ? ' is-blocked' : ''}`);
    card.setAttribute('aria-pressed', String(selected));
    if (excluded) {
      card.setAttribute('aria-disabled', 'true');
    }

    const manual = snapshot.protectedList.some((item) => item.mid === user.mid);
    const special = isSpecialFollow(user);
    if (manual || special) {
      const badge = h('span', 'badge lock');
      badge.append(icon('lock', 9), h('span', '', special && !manual ? '特别关注' : '保护'));
      card.append(badge);
    } else if (snapshot.exclusion.recentMids.has(user.mid)) {
      card.append(h('span', 'badge fresh', '新关注'));
    }

    const cardActions = h('div', 'card-actions');
    const openLink = h('button', 'lock-btn') as HTMLButtonElement;
    openLink.type = 'button';
    openLink.append(icon('link', 12));
    openLink.title = '在新标签打开 TA 的主页';
    openLink.setAttribute('aria-label', openLink.title);
    openLink.addEventListener('click', (event) => {
      event.stopPropagation();
      window.open(`https://space.bilibili.com/${user.mid}`, '_blank', 'noopener');
    });
    const lock = h('button', 'lock-btn') as HTMLButtonElement;
    lock.type = 'button';
    lock.append(icon(manual || special ? 'lock' : 'unlock', 13));
    if (manual || special) {
      lock.classList.add('on');
    }
    lock.title =
      special && !manual
        ? 'B 站「特别关注」分组，取消特别关注后自动解除'
        : manual
          ? '已在保护名单，再点一次解除'
          : '加入保护名单（永不被选中）';
    lock.setAttribute('aria-label', lock.title);
    lock.addEventListener('click', (event) => {
      event.stopPropagation();
      if (special && !manual) {
        actions.onInfo('这是 B 站的「特别关注」，在 B 站里取消特别关注后会自动解除。');
        return;
      }
      if (manual) {
        actions.onUnprotect(user.mid);
      } else {
        actions.onProtect(user.mid);
      }
    });
    cardActions.append(openLink, lock);
    card.append(cardActions);

    const face = avatar(user);
    if (selected) {
      const tick = h('span', 'tick');
      tick.append(icon('check', 11));
      face.append(tick);
    }
    card.append(face, h('span', 'name', user.uname || '(已注销)'));
    activate(card, () => actions.onToggle(user.mid));
    return card;
  }

  function renderSelecting(container: HTMLElement, snapshot: UiSnapshot): void {
    if (onlyGroup !== null && !snapshot.groups.some((group) => group.tagId === onlyGroup)) {
      onlyGroup = null;
    }
    visibleCount = Math.max(visibleCount, 200);
    const needle = query.trim().toLowerCase();
    const filtered = snapshot.users.filter(
      (user) =>
        (!onlyDeactivated || !user.uname) &&
        (onlyGroup === null || user.tags?.includes(onlyGroup) === true) &&
        (needle === '' || user.uname.toLowerCase().includes(needle)),
    );
    const isFiltered = onlyDeactivated || onlyGroup !== null || needle !== '';
    const deactivated = snapshot.users.filter((user) => !user.uname).length;

    const facts: string[] = [];
    if (snapshot.exclusion.protectedCount > 0) {
      facts.push(`已保护 ${snapshot.exclusion.protectedCount}`);
    }
    if (snapshot.exclusion.recentCount > 0) {
      facts.push(`最近 ${snapshot.settings.recentDays} 天关注的 ${snapshot.exclusion.recentCount} 个已跳过`);
    }
    if (isFiltered) {
      facts.push(`当前显示 ${filtered.length}`);
    }
    const hint = h('div', 'hint');
    hint.append(
      icon('shield', 13),
      h(
        'span',
        '',
        facts.length > 0 ? facts.join(' · ') : '点卡片选择要取关的账号，锁按钮可加入保护',
      ),
    );
    container.append(hint);

    const searchRow = h('div', 'search-row');
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'search';
    searchInput.placeholder = '搜索昵称';
    searchInput.value = query;
    searchInput.setAttribute('aria-label', '搜索昵称');
    searchInput.addEventListener('input', () => {
      query = searchInput.value;
      queryFocused = true;
      render(snapshot);
    });
    searchRow.append(searchInput);
    container.append(searchRow);

    const chips = h('div', 'chips');
    chips.append(
      chip('全部', !onlyDeactivated && onlyGroup === null, () => {
        onlyDeactivated = false;
        onlyGroup = null;
        render(snapshot);
      }),
      chip('已注销账号', onlyDeactivated, () => {
        onlyDeactivated = !onlyDeactivated;
        render(snapshot);
      }, deactivated, deactivated === 0),
    );
    if (snapshot.groups.length > 0 && snapshot.users.some((user) => (user.tags?.length ?? 0) > 0)) {
      for (const group of snapshot.groups) {
        const count = snapshot.users.filter((user) => user.tags?.includes(group.tagId) === true).length;
        chips.append(
          chip(group.name, onlyGroup === group.tagId, () => {
            onlyGroup = group.tagId;
            render(snapshot);
          }, count, count === 0),
        );
      }
    }
    container.append(chips);

    const tools = h('div', 'chips');
    tools.style.marginTop = '8px';
    const selectAllButton = button(
      `全选${isFiltered ? '筛选结果' : ''}`,
      () => actions.onSelectAll(filtered.map((user) => user.mid)),
      { size: 'sm' },
    );
    selectAllButton.disabled = filtered.length === 0;
    tools.append(
      selectAllButton,
      button('清空', actions.onClearSelection, { size: 'sm', variant: 'ghost' }),
    );
    container.append(tools);
    if (snapshot.protectedList.length === 0) {
      container.append(
        h(
          'div',
          'hint',
          '锁按钮 = 加入保护名单，该账号永不被取关；再点一次可解除。B 站「特别关注」自动保护。',
        ),
      );
    }

    const grid = h('div', 'grid');
    grid.style.marginTop = '10px';
    for (const user of filtered.slice(0, visibleCount)) {
      grid.append(renderCard(snapshot, user));
    }
    container.append(
      filtered.length === 0
        ? h('div', 'empty', needle !== '' ? '没有匹配的账号' : '当前筛选下没有账号')
        : grid,
    );

    main.onscroll = () => {
      if (
        filtered.length > visibleCount &&
        main.scrollTop + main.clientHeight >= main.scrollHeight - 240
      ) {
        visibleCount += 200;
        render(snapshot);
      }
    };

    if (filtered.length > visibleCount) {
      const more = h('div', 'actions');
      more.style.marginTop = '10px';
      more.append(
        button(`显示更多（还有 ${filtered.length - visibleCount} 个）`, () => {
          visibleCount += 200;
          render(snapshot);
        }, { size: 'sm', block: true, variant: 'ghost' }),
      );
      container.append(more);
    }

    const foot = h('div', 'foot');
    const summary = h('div', 'summary');
    summary.append(
      h('span', '', '已选 '),
      h('b', '', String(snapshot.selected.size)),
      h('span', '', ` / 共 ${snapshot.users.length} 个关注`),
    );
    const next = button('下一步', actions.onConfirm, { variant: 'primary', icon: 'check' });
    next.disabled = snapshot.selected.size === 0;
    foot.append(summary, h('div', 'grow'), next);
    container.append(foot);

    if (queryFocused) {
      queryFocused = false;
      searchInput.focus();
      const end = searchInput.value.length;
      searchInput.setSelectionRange(end, end);
    }
  }

  function renderConfirming(container: HTMLElement, snapshot: UiSnapshot): void {
    const total = snapshot.task.planned.length;
    const undo = snapshot.task.kind === 'follow';
    container.append(
      h(
        'div',
        'hint',
        undo
          ? `以下 ${total} 个账号将被重新关注`
          : `以下 ${total} 个账号将被取关，其余关注保持不变`,
      ),
    );
    const strip = h('div', 'strip');
    for (const user of snapshot.task.planned.slice(0, 14)) {
      strip.append(avatar(user));
    }
    if (total > 14) {
      strip.append(h('div', 'more', `+${total - 14}`));
    }
    container.append(strip);
    container.append(h('div', 'hint', `计划名单（${total} 个）`));
    const rows = h('div', 'rows');
    for (const user of snapshot.task.planned.slice(0, 40)) {
      const row = h('div', 'row');
      row.append(h('div', 'grow', user.uname || '(已注销)'));
      rows.append(row);
    }
    if (total > 40) {
      const row = h('div', 'row');
      row.append(h('div', 'grow', `… 其余 ${total - 40} 个`));
      rows.append(row);
    }
    container.append(rows);
    container.append(
      h(
        'div',
        'hint',
        undo
          ? '重新关注后对方会收到提醒。执行期间请保持页面打开。'
          : '取关不会通知对方；重新关注对方会收到提醒。开始前会自动保存备份，完成后可一键回关本次账号。',
      ),
    );
    const foot = h('div', 'foot');
    foot.append(
      button('返回', actions.onBack, { variant: 'ghost', icon: 'back' }),
      h('div', 'grow'),
      button(
        undo ? `重新关注 ${total} 个` : `取消关注 ${total} 个`,
        actions.onStart,
        { variant: 'primary', icon: 'play' },
      ),
    );
    container.append(foot);
  }

  function renderRunning(container: HTMLElement, snapshot: UiSnapshot): void {
    const stats = progress(snapshot.task);
    const processed = stats.done + stats.failed;
    const percent = stats.total === 0 ? 0 : Math.round((processed / stats.total) * 100);
    const bar = h('div', `bar${snapshot.phase === 'running' ? ' busy' : ''}`);
    const fill = h('i');
    fill.style.width = `${percent}%`;
    bar.append(fill);
    container.append(bar);

    const tiles = h('div', 'tiles');
    tiles.append(
      tile('成功', stats.done),
      tile('失败', stats.failed, stats.failed > 0),
      tile('剩余', stats.remaining),
    );
    container.append(tiles);

    const current = snapshot.users.find((user) => user.mid === snapshot.task.currentMid);
    if (current) {
      const box = h('div', 'current');
      box.append(avatar(current), h('div', 'label', current.uname || '(已注销)'));
      if (snapshot.phase === 'running') {
        box.append(h('div', 'spinner'));
      }
      container.append(box);
    }

    if (snapshot.task.backoffWaitSeconds !== null) {
      container.append(
        note(`B 站暂时限制了操作，等待 ${snapshot.task.backoffWaitSeconds} 秒后自动重试…`, 'warn', 'clock'),
      );
    }

    if (snapshot.slowMode) {
      const row = h('div', 'eta');
      const tag = h('span', 'chip-tag');
      tag.append(icon('shield', 12), h('span', '', '已切换保守节奏'));
      row.append(tag);
      container.append(row);
    }

    const eta = etaMs(snapshot);
    if (eta !== null && snapshot.phase === 'running') {
      const row = h('div', 'eta');
      row.append(icon('clock', 13), h('span', '', `预计剩余约 ${formatDuration(eta)}`));
      container.append(row);
    }

    const recent = snapshot.task.succeeded
      .slice(-6)
      .reverse()
      .map((mid) => snapshot.task.planned.find((user) => user.mid === mid))
      .filter((user): user is FollowUser => Boolean(user));
    if (recent.length > 0) {
      container.append(h('div', 'hint', '最近完成'));
      const rows = h('div', 'rows');
      for (const user of recent) {
        const row = h('div', 'row');
        const mark = h('span', 'ok-mark');
        mark.append(icon('check', 12));
        row.append(mark, h('div', 'grow', user.uname || '(已注销)'));
        rows.append(row);
      }
      container.append(rows);
    }
    container.append(
      h(
        'div',
        'hint',
        '可关闭面板，任务会在页面内继续，完成后通知你；也请保持本页面打开，切到其他标签页会变慢但不会中断。',
      ),
    );
    if (stopArmed) {
      container.append(note('中止后已取关的账号不会自动恢复；可在完成页一键回关。', 'warn', 'stop'));
    }
    const foot = h('div', 'foot');
    const stopButton = button(
      stopArmed ? '确认中止' : '中止任务',
      () => {
        if (!stopArmed) {
          stopArmed = true;
          render(snapshot);
          return;
        }
        stopArmed = false;
        actions.onStop();
      },
      {
        variant: 'danger',
        icon: 'stop',
        title: stopArmed ? '已取关的不会自动恢复' : '停止本次清理',
      },
    );
    foot.append(
      snapshot.phase === 'running'
        ? button('暂停', actions.onPause, { icon: 'pause' })
        : button('继续', actions.onResume, { variant: 'primary', icon: 'play' }),
      h('div', 'grow'),
      stopButton,
    );
    container.append(foot);
  }

  function renderDone(container: HTMLElement, snapshot: UiSnapshot): void {
    const stats = progress(snapshot.task);
    const aborted = snapshot.phase === 'aborted';
    const undo = snapshot.task.kind === 'follow';
    container.append(
      note(
        aborted
          ? '任务已中止，计划中未处理的账号保持原状。'
          : undo
            ? '已把本次取关成功的账号重新关注。'
            : '清理完成，未勾选的账号保持关注。',
        aborted ? 'warn' : 'ok',
        aborted ? 'stop' : 'check',
      ),
    );
    const tiles = h('div', 'tiles');
    tiles.append(
      tile(undo ? '已重新关注' : '成功取关', stats.done),
      tile('失败', stats.failed, stats.failed > 0),
      tile('计划', stats.total),
    );
    container.append(tiles);

    if (!undo && stats.done > 0) {
      const undoSection = h('div', 'sec');
      undoSection.append(h('h4', '', '误删了？'));
      undoSection.append(
        h(
          'div',
          'hint',
          `可以把本次取关成功的 ${stats.done} 个账号重新关注；重新关注后对方会收到提醒。`,
        ),
      );
      undoSection.append(
        button(`回关本次 ${stats.done} 个`, actions.onUndo, {
          block: true,
          icon: 'back',
          title: '把这次取关成功的账号重新关注',
        }),
      );
      container.append(undoSection);
    }

    if (snapshot.task.failed.length > 0) {
      const rows = h('div', 'rows');
      for (const item of snapshot.task.failed.slice(0, 50)) {
        const row = h('div', 'row');
        row.append(h('div', 'grow', item.uname || '(账号已注销)'));
        row.append(h('div', 'err', item.message));
        rows.append(row);
      }
      container.append(h('div', 'hint', '失败明细（可一键重试）'));
      container.append(rows);
    }

    if (snapshot.backups.length > 0) {
      const section = h('div', 'sec');
      section.append(h('h4', '', '本次操作记录'));
      const rows = h('div', 'rows');
      rows.append(backupRow(snapshot.backups[0]));
      section.append(rows);
      container.append(section);
    }

    const foot = h('div', 'foot');
    if (snapshot.task.failed.length > 0) {
      foot.append(
        button(`重试失败项`, actions.onRetryFailed, { variant: 'primary', icon: 'retry' }),
        h('div', 'grow'),
        button('重新整理', actions.onReload, { variant: 'ghost' }),
      );
    } else {
      foot.append(h('div', 'grow'), button('重新整理', actions.onReload, { variant: 'primary', icon: 'retry' }));
    }
    container.append(foot);
  }

  function intervalLabel(preset: Settings['interval']): string {
    const { min, max } = delayRangeMs(preset);
    return `${min / 1000}~${max / 1000} 秒`;
  }

  function renderSwitch(
    label: string,
    checked: boolean,
    onChange: (value: boolean) => void,
  ): HTMLElement {
    const row = h('label', 'sw');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    row.append(input, h('span', 'track'), h('span', 'txt', label));
    return row;
  }

  function renderSettings(container: HTMLElement, snapshot: UiSnapshot): void {
    const rhythm = h('div', 'sec');
    rhythm.append(h('h4', '', '执行节奏'));
    const interval = h('div', 'field');
    interval.append(h('span', 'label', '执行间隔'));
    const seg = h('div', 'seg');
    for (const preset of ['standard', 'conservative'] as const) {
      const node = button(
        `${preset === 'standard' ? '标准' : '保守'} ${intervalLabel(preset)}`,
        () => actions.onChangeSettings({ ...snapshot.settings, interval: preset }),
        { size: 'sm' },
      );
      node.setAttribute('aria-pressed', String(snapshot.settings.interval === preset));
      seg.append(node);
    }
    interval.append(seg);
    rhythm.append(interval);
    rhythm.append(h('div', 'hint', '触发风控时，本次剩余任务会自动切换保守档。'));

    const quota = h('div', 'field');
    quota.append(h('span', 'label', '单次上限'));
    const quotaRow = h('div', 'num-row');
    const quotaInput = document.createElement('input');
    quotaInput.type = 'number';
    quotaInput.min = String(LIMIT_MIN);
    quotaInput.max = String(LIMIT_MAX);
    quotaInput.step = '50';
    quotaInput.value = String(snapshot.settings.limit);
    quotaInput.addEventListener('change', () => {
      actions.onChangeSettings({ ...snapshot.settings, limit: clampLimit(Number(quotaInput.value)) });
    });
    quotaRow.append(quotaInput, h('span', 'unit', `个 / 次（${LIMIT_MIN}~${LIMIT_MAX}）`));
    quota.append(quotaRow);
    rhythm.append(quota);
    container.append(rhythm);

    const exclude = h('div', 'sec');
    exclude.append(h('h4', '', '误删防护'));
    const recent = h('div', 'field');
    recent.append(h('span', 'label', '最近关注排除'));
    const recentRow = h('div', 'num-row');
    const recentInput = document.createElement('input');
    recentInput.type = 'number';
    recentInput.min = '0';
    recentInput.max = String(RECENT_DAYS_MAX);
    recentInput.value = String(snapshot.settings.recentDays);
    recentInput.addEventListener('change', () => {
      actions.onChangeSettings({
        ...snapshot.settings,
        recentDays: clampRecentDays(Number(recentInput.value)),
      });
    });
    recentRow.append(recentInput, h('span', 'unit', '天内关注的账号默认不选（0 = 关闭）'));
    recent.append(recentRow);
    exclude.append(recent);
    if (!snapshot.exclusion.hasFollowedAt) {
      exclude.append(h('div', 'hint', 'B 站当前未返回关注时间，本功能暂不生效。'));
    }
    const protectedRows = h('div', 'rows');
    if (snapshot.protectedList.length === 0) {
      protectedRows.append(h('div', 'empty', '还没有手动锁定，在整理列表点击卡片右上角的锁按钮即可加入'));
    } else {
      for (const item of snapshot.protectedList) {
        const row = h('div', 'row');
        row.append(h('div', 'grow', item.uname || `(账号已注销 ${item.mid})`));
        const armed = unprotectArmed.has(item.mid);
        const unlock = button(armed ? '确认解除' : '解除', () => {
          if (armed) {
            unprotectArmed.delete(item.mid);
            actions.onUnprotect(item.mid);
          } else {
            unprotectArmed.add(item.mid);
            render(snapshot);
          }
        }, { size: 'sm', variant: armed ? 'danger' : 'ghost' });
        row.append(unlock);
        protectedRows.append(row);
      }
    }
    exclude.append(h('div', 'hint', `保护名单（${snapshot.protectedList.length} / ${MAX_PROTECTED}）：名单内账号永不被选中，B 站「特别关注」自动保护。`));
    exclude.append(protectedRows);
    exclude.append(
      h('div', 'hint', '误删了？完成页提供「回关本次」，可把最近一批取关的账号一键重新关注。'),
    );
    container.append(exclude);

    const notify = h('div', 'sec');
    notify.append(h('h4', '', '通知与诊断'));
    notify.append(
      renderSwitch('完成时发送系统通知', snapshot.settings.notify, (checked) =>
        actions.onChangeSettings({ ...snapshot.settings, notify: checked }),
      ),
      renderSwitch('显示原始错误信息（反馈问题时开启）', snapshot.settings.showRawErrors, (checked) =>
        actions.onChangeSettings({ ...snapshot.settings, showRawErrors: checked }),
      ),
    );
    notify.append(h('div', 'hint', '隐私：所有数据只保存在本机浏览器，不会发送到任何外部服务器。'));
    container.append(notify);

    const backups = h('div', 'sec');
    backups.append(h('h4', '', `操作记录 · 保留最近 ${MAX_BACKUPS} 次（可导出）`));
    const backupRows = h('div', 'rows');
    if (snapshot.backups.length === 0) {
      backupRows.append(h('div', 'empty', '暂无记录；开始执行前会自动保存一份计划与结果'));
    } else {
      for (const record of snapshot.backups) {
        backupRows.append(backupRow(record));
      }
    }
    backups.append(backupRows);
    container.append(backups);

    const foot = h('div', 'foot');
    foot.append(
      h('div', 'grow'),
      button('完成', () => {
        showSettings = false;
        render(snapshot);
      }, { variant: 'primary', icon: 'check' }),
    );
    container.append(foot);
  }

  function render(snapshot: UiSnapshot): void {
    lastSnapshot = snapshot;
    if (snapshot.phase !== 'running' && snapshot.phase !== 'paused') {
      stopArmed = false;
      closeArmed = false;
      closeButton.classList.remove('armed');
      closeButton.title = '关闭面板';
      closeButton.setAttribute('aria-label', '关闭面板');
    }
    accountLine.textContent = snapshot.account
      ? `当前账号：${snapshot.account.uname || snapshot.account.mid}`
      : '';
    settingsButton.setAttribute('aria-pressed', String(showSettings));
    const key = showSettings ? 'settings' : snapshot.phase;
    const keepScroll = key === lastViewKey;
    const prevScroll = main.scrollTop;
    main.textContent = '';
    main.onscroll = null;
    const container = h('div', key === lastViewKey ? '' : 'view');
    lastViewKey = key;
    main.append(container);

    if (showSettings) {
      renderSettings(container, snapshot);
    } else {
      if (snapshot.message) {
        container.append(note(snapshot.message, snapshot.phase === 'aborted' ? 'warn' : 'brand', 'shield'));
      }
      if (snapshot.phase === 'loading') {
        if (options.notice) {
          container.append(note(options.notice, 'brand', 'clock'));
        }
        renderLoading(container, snapshot);
      } else if (snapshot.phase === 'login') {
        renderLogin(container);
      } else if (snapshot.phase === 'error') {
        renderError(container);
      } else if (snapshot.phase === 'resume') {
        renderResume(container, snapshot);
      } else if (snapshot.phase === 'selecting') {
        renderSelecting(container, snapshot);
      } else if (snapshot.phase === 'confirming') {
        renderConfirming(container, snapshot);
      } else if (snapshot.phase === 'running' || snapshot.phase === 'paused') {
        renderRunning(container, snapshot);
      } else if (snapshot.phase === 'done' || snapshot.phase === 'aborted') {
        renderDone(container, snapshot);
      }
    }
    if (keepScroll) {
      main.scrollTop = prevScroll;
    }
  }

  return {
    render,
    destroy() {
      document.removeEventListener('keydown', onKeyDown, true);
      host.remove();
    },
  };
}
