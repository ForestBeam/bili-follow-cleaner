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
import { progress } from '../core/task';
import type { UiSnapshot } from './controller';

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
  onChangeSettings(settings: Settings): void;
}

const CSS = `
:host { all: initial; }
.panel {
  position: fixed; top: 72px; right: 16px; bottom: 16px; width: 360px;
  display: flex; flex-direction: column; background: #fff; color: #18191c;
  border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.24);
  font: 13px/1.6 system-ui, -apple-system, "Microsoft YaHei", sans-serif;
  z-index: 2147483000; overflow: hidden;
}
header { display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
.title { font-weight: 600; }
button { cursor: pointer; border: 1px solid #d0d5dd; background: #fff; color: inherit;
  border-radius: 8px; padding: 6px 12px; font: inherit; }
button:hover:not(:disabled) { border-color: #fb7299; color: #fb7299; }
button:disabled { opacity: .5; cursor: default; }
button.primary { background: #fb7299; border-color: #fb7299; color: #fff; }
button.primary:hover:not(:disabled) { background: #e5648a; color: #fff; }
.close { border: none; font-size: 18px; padding: 2px 8px; }
main { flex: 1; overflow: auto; padding: 12px 16px; }
.toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.count { margin-left: auto; color: #61666d; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px; border: 1px solid #e5e7eb; border-radius: 10px; cursor: pointer; }
.card.selected { border-color: #fb7299; background: #fff5f8; }
.card.excluded { cursor: default; background: #fafbfc; }
.card.excluded .name, .card.excluded .initial { opacity: .6; }
.badge { position: absolute; top: 4px; left: 4px; font-size: 11px; line-height: 1;
  padding: 2px 4px; border-radius: 6px; background: #fff1e6; color: #d97706; }
.lock { position: absolute; top: 2px; right: 2px; border: none; background: transparent;
  padding: 2px 4px; font-size: 13px; line-height: 1; }
.lock:disabled { opacity: 1; cursor: default; }
.card img, .initial { width: 40px; height: 40px; border-radius: 50%; object-fit: cover;
  display: flex; align-items: center; justify-content: center; background: #f1f2f3; font-weight: 600; }
.name { width: 100%; text-align: center; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; font-size: 12px; }
.actions { display: flex; gap: 8px; margin-top: 12px; }
.actions button { flex: 1; }
.muted { color: #61666d; }
.message { margin: 8px 0; padding: 8px 10px; border-radius: 8px; background: #fff7e6; color: #9a6700; }
.bar { height: 8px; border-radius: 4px; background: #f1f2f3; overflow: hidden; margin: 10px 0; }
.bar > i { display: block; height: 100%; background: #fb7299; }
.stats { display: flex; justify-content: space-between; color: #61666d; }
.failed { max-height: 160px; overflow: auto; margin-top: 8px; }
.failed div { padding: 2px 0; }
.hint { margin-top: 10px; color: #9499a0; font-size: 12px; }
.tag { display: inline-block; margin-top: 8px; padding: 2px 8px; border-radius: 999px;
  background: #fff5f8; color: #fb7299; font-size: 12px; }
.icon { border: none; padding: 2px 6px; }
.setting { margin-bottom: 14px; }
.setting .label, .section .label { display: block; font-weight: 600; margin-bottom: 6px; }
.choices { display: flex; gap: 8px; flex-wrap: wrap; }
.choices button.on, .toolbar button.on { border-color: #fb7299; color: #fb7299; background: #fff5f8; }
.row { display: flex; align-items: center; gap: 6px; margin: 6px 0; }
.row input[type="number"] { width: 84px; padding: 4px 6px; border: 1px solid #d0d5dd;
  border-radius: 6px; font: inherit; }
.section { margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
.backup-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.backup-row .grow { flex: 1; color: #61666d; font-size: 12px; }
`;

function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const node = document.createElement('button');
  node.textContent = label;
  if (primary) node.className = 'primary';
  node.addEventListener('click', onClick);
  return node;
}

export function createPanel(actions: PanelActions) {
  const host = document.createElement('div');
  host.id = 'bfc-panel-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const panel = h('div', 'panel');
  const header = h('header');
  header.append(h('span', 'title', '关注列表整理工具'));
  const settingsButton = button('设置', () => {
    showSettings = !showSettings;
    if (lastSnapshot) {
      render(lastSnapshot);
    }
  });
  settingsButton.classList.add('icon');
  const closeButton = button('×', actions.onClose);
  closeButton.classList.add('close');
  header.append(settingsButton, closeButton);
  const main = h('main');
  panel.append(header, main);
  shadow.append(style, panel);
  document.body.append(host);

  let visibleCount = 200;
  let showSettings = false;
  let lastSnapshot: UiSnapshot | null = null;
  let onlyDeactivated = false;
  let onlyGroup: number | null = null;
  const unprotectArmed = new Set<number>();

  function renderGrid(snapshot: UiSnapshot, users: UiSnapshot['users']) {
    const grid = h('div', 'grid');
    for (const user of users.slice(0, visibleCount)) {
      const excluded = snapshot.exclusion.excludedMids.has(user.mid);
      const card = h(
        'div',
        `card${snapshot.selected.has(user.mid) ? ' selected' : ''}${excluded ? ' excluded' : ''}`,
      );
      if (snapshot.exclusion.protectedMids.has(user.mid)) {
        card.append(h('span', 'badge', '🔒'));
      } else if (snapshot.exclusion.recentMids.has(user.mid)) {
        card.append(h('span', 'badge', '新'));
      }
      const manual = snapshot.protectedList.some((item) => item.mid === user.mid);
      const special = isSpecialFollow(user);
      const lock = button(manual || special ? '🔒' : '🔓', () => actions.onProtect(user.mid));
      lock.classList.add('lock');
      lock.disabled = manual || special;
      lock.title =
        special && !manual
          ? 'B 站「特别关注」分组，取消特别关注后自动解除'
          : manual
            ? '已在保护名单；如需解除请到设置页'
            : '加入保护名单（永不被选中）';
      card.append(lock);
      if (user.face) {
        const img = document.createElement('img');
        img.src = user.face;
        img.loading = 'lazy';
        img.alt = '';
        card.append(img);
      } else {
        card.append(h('span', 'initial', (user.uname || '?').slice(0, 1)));
      }
      card.append(h('span', 'name', user.uname || '(已注销)'));
      card.addEventListener('click', () => actions.onToggle(user.mid));
      grid.append(card);
    }
    return grid;
  }

  function render(snapshot: UiSnapshot) {
    lastSnapshot = snapshot;
    main.textContent = '';
    if (showSettings) {
      renderSettings(snapshot);
      return;
    }
    if (snapshot.phase === 'selecting') {
      visibleCount = Math.max(visibleCount, 200);
    }
    if (snapshot.message) {
      main.append(h('div', 'message', snapshot.message));
    }

    if (snapshot.phase === 'loading') {
      const loaded = snapshot.loadProgress?.loaded ?? 0;
      const total = snapshot.loadProgress?.total ?? 0;
      main.append(h('div', 'muted', total > 0 ? `正在读取关注列表 ${loaded}/${total}…` : '正在读取关注列表…'));
      return;
    }

    if (snapshot.phase === 'login') {
      main.append(h('div', '', '未检测到 B 站登录状态，请先登录后重新点击扩展图标。'));
      const row = h('div', 'actions');
      row.append(
        button('打开登录页', () => {
          window.open('https://passport.bilibili.com/login', '_blank');
        }, true),
      );
      main.append(row);
      return;
    }

    if (snapshot.phase === 'error') {
      const row = h('div', 'actions');
      row.append(button('重试', actions.onReload, true));
      main.append(row);
      return;
    }

    if (snapshot.phase === 'resume' && snapshot.resume) {
      main.append(
        h(
          'div',
          '',
          `上次清理没有完成：计划 ${snapshot.resume.total} 个，已完成 ${snapshot.resume.succeeded} 个。`,
        ),
      );
      main.append(
        h(
          'div',
          'muted',
          `继续将处理剩余 ${snapshot.resume.total - snapshot.resume.succeeded} 个账号，已完成的不会重复处理。`,
        ),
      );
      const row = h('div', 'actions');
      row.append(button('暂不继续', actions.onDismissResume));
      row.append(button('继续清理', actions.onResumeTask, true));
      main.append(row);
      return;
    }

    if (snapshot.phase === 'selecting') {
      if (onlyGroup !== null && !snapshot.groups.some((group) => group.tagId === onlyGroup)) {
        onlyGroup = null;
      }
      const filtered = snapshot.users.filter(
        (user) =>
          (!onlyDeactivated || !user.uname) &&
          (onlyGroup === null || user.tags?.includes(onlyGroup) === true),
      );
      const isFiltered = onlyDeactivated || onlyGroup !== null;
      if (snapshot.exclusion.recentCount > 0) {
        main.append(
          h(
            'div',
            'hint',
            `最近 ${snapshot.settings.recentDays} 天关注的 ${snapshot.exclusion.recentCount} 个已跳过（可在设置中调整）。`,
          ),
        );
      }
      const toolbar = h('div', 'toolbar');
      const deactivated = snapshot.users.filter((user) => !user.uname).length;
      const filter = button(
        onlyDeactivated ? '显示全部' : `只看已注销（${deactivated}）`,
        () => {
          onlyDeactivated = !onlyDeactivated;
          render(snapshot);
        },
      );
      filter.disabled = deactivated === 0;
      toolbar.append(filter);
      toolbar.append(
        button(`全选${isFiltered ? '（筛选结果）' : ''}`, () =>
          actions.onSelectAll(filtered.map((user) => user.mid)),
        ),
      );
      toolbar.append(button('清空', actions.onClearSelection));
      toolbar.append(
        h(
          'span',
          'count',
          `已选 ${snapshot.selected.size} / ${snapshot.users.length}${
            isFiltered ? `（显示 ${filtered.length}）` : ''
          }${
            snapshot.exclusion.protectedCount > 0
              ? `（已保护 ${snapshot.exclusion.protectedCount}）`
              : ''
          }`,
        ),
      );
      main.append(toolbar);

      const tagged = snapshot.users.some((user) => (user.tags?.length ?? 0) > 0);
      if (snapshot.groups.length > 0 && tagged) {
        const groupRow = h('div', 'toolbar');
        const all = button('全部分组', () => {
          onlyGroup = null;
          render(snapshot);
        });
        if (onlyGroup === null) {
          all.classList.add('on');
        }
        groupRow.append(all);
        for (const group of snapshot.groups) {
          const count = snapshot.users.filter(
            (user) => user.tags?.includes(group.tagId) === true,
          ).length;
          const chip = button(`${group.name}（${count}）`, () => {
            onlyGroup = group.tagId;
            render(snapshot);
          });
          if (onlyGroup === group.tagId) {
            chip.classList.add('on');
          }
          chip.disabled = count === 0;
          groupRow.append(chip);
        }
        groupRow.append(h('span', 'count', '按分组筛选'));
        main.append(groupRow);
      }

      main.append(renderGrid(snapshot, filtered));
      if (filtered.length > visibleCount) {
        const more = h('div', 'actions');
        more.append(
          button(`显示更多（还有 ${filtered.length - visibleCount} 个）`, () => {
            visibleCount += 200;
            render(snapshot);
          }),
        );
        main.append(more);
      }
      const row = h('div', 'actions');
      const start = button(`下一步（已选 ${snapshot.selected.size}）`, actions.onConfirm, true);
      start.disabled = snapshot.selected.size === 0;
      row.append(start);
      main.append(row);
      return;
    }

    if (snapshot.phase === 'confirming') {
      const total = snapshot.task.planned.length;
      main.append(h('div', '', `将取关 ${total} 个账号，其余关注保持不变。`));
      main.append(h('div', 'hint', '取关不会通知对方；重新关注对方会收到提醒。建议先确认列表无误再开始。'));
      const row = h('div', 'actions');
      row.append(button('返回', actions.onBack));
      row.append(button(`开始执行（${total}）`, actions.onStart, true));
      main.append(row);
      return;
    }

    if (snapshot.phase === 'running' || snapshot.phase === 'paused') {
      const stats = progress(snapshot.task);
      const bar = h('div', 'bar');
      const fill = h('i');
      fill.style.width = `${stats.total === 0 ? 0 : Math.round((stats.done + stats.failed) / stats.total * 100)}%`;
      bar.append(fill);
      main.append(bar);
      const line = h('div', 'stats');
      line.append(h('span', '', `成功 ${stats.done} / 失败 ${stats.failed} / 共 ${stats.total}`));
      line.append(h('span', '', `剩余 ${stats.remaining}`));
      main.append(line);
      if (snapshot.slowMode) {
        main.append(h('span', 'tag', '已切换保守节奏'));
      }
      const current = snapshot.users.find((user) => user.mid === snapshot.task.currentMid);
      if (current) {
        main.append(h('div', 'muted', `当前：${current.uname || '(已注销)'}`));
      }
      if (snapshot.task.backoffWaitSeconds !== null) {
        main.append(h('div', 'message', `B 站暂时限制了操作，等待 ${snapshot.task.backoffWaitSeconds} 秒后自动重试…`));
      }
      const row = h('div', 'actions');
      if (snapshot.phase === 'running') {
        row.append(button('暂停', actions.onPause));
      } else {
        row.append(button('继续', actions.onResume, true));
      }
      row.append(button('停止', actions.onStop));
      main.append(row);
      main.append(h('div', 'hint', '请保持本页面打开；切到其他标签页会变慢但不会中断。'));
      return;
    }

    if (snapshot.phase === 'done' || snapshot.phase === 'aborted') {
      const stats = progress(snapshot.task);
      const aborted = snapshot.phase === 'aborted';
      main.append(h('div', '', aborted ? '任务已停止。' : '清理完成。'));
      main.append(h('div', 'muted', `成功 ${stats.done} 个，失败 ${stats.failed} 个。`));
      if (snapshot.task.failed.length > 0) {
        const list = h('div', 'failed');
        for (const item of snapshot.task.failed.slice(0, 50)) {
          list.append(h('div', 'muted', `${item.uname || '(已注销)'}：${item.message}`));
        }
        main.append(list);
      }
      if (snapshot.backups.length > 0) {
        const section = h('div', 'section');
        section.append(h('div', 'label', '本次备份（可随时下载）'));
        section.append(backupRow(snapshot.backups[0]));
        main.append(section);
      }
      const row = h('div', 'actions');
      if (snapshot.task.failed.length > 0) {
        row.append(button(`重试失败项（${snapshot.task.failed.length}）`, actions.onRetryFailed, true));
      }
      row.append(button('重新整理', actions.onReload, snapshot.task.failed.length === 0));
      main.append(row);
    }
  }

  function saveFile(name: string, text: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function backupRow(record: BackupRecord): HTMLElement {
    const row = h('div', 'backup-row');
    const date = new Date(record.createdAt);
    row.append(
      h(
        'span',
        'grow',
        `${date.toLocaleString()} · 计划 ${record.stats.total} · 成功 ${record.stats.succeeded} / 失败 ${record.stats.failed}`,
      ),
    );
    row.append(
      button('JSON', () =>
        saveFile(backupFilename(record, 'json'), toBackupJson(record), 'application/json'),
      ),
    );
    row.append(
      button('CSV', () =>
        saveFile(
          backupFilename(record, 'csv'),
          `\ufeff${toBackupCsv(record)}`,
          'text/csv',
        ),
      ),
    );
    return row;
  }

  function checkbox(
    label: string,
    checked: boolean,
    onChange: (value: boolean) => void,
  ): HTMLElement {
    const row = h('label', 'row');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    row.append(input, h('span', '', label));
    return row;
  }

  function intervalLabel(preset: Settings['interval']): string {
    const { min, max } = delayRangeMs(preset);
    return `${min / 1000}~${max / 1000} 秒`;
  }

  function renderSettings(snapshot: UiSnapshot): void {
    const interval = h('div', 'setting');
    interval.append(h('span', 'label', '执行间隔'));
    const choices = h('div', 'choices');
    for (const preset of ['standard', 'conservative'] as const) {
      const node = button(
        `${preset === 'standard' ? '标准' : '保守'}（${intervalLabel(preset)}）`,
        () => actions.onChangeSettings({ ...snapshot.settings, interval: preset }),
      );
      if (snapshot.settings.interval === preset) {
        node.classList.add('on');
      }
      choices.append(node);
    }
    interval.append(choices);
    main.append(interval);
    main.append(h('div', 'hint', '触发风控时，本次任务剩余部分会自动切换保守档（3~8 秒）。'));

    const limit = h('div', 'setting');
    limit.append(h('span', 'label', `单次上限（${LIMIT_MIN}~${LIMIT_MAX}）`));
    const limitRow = h('div', 'row');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(LIMIT_MIN);
    input.max = String(LIMIT_MAX);
    input.step = '50';
    input.value = String(snapshot.settings.limit);
    input.addEventListener('change', () => {
      actions.onChangeSettings({ ...snapshot.settings, limit: clampLimit(Number(input.value)) });
    });
    limitRow.append(input, h('span', 'muted', '个 / 次'));
    limit.append(limitRow);
    main.append(limit);

    const recent = h('div', 'setting');
    recent.append(h('span', 'label', '最近关注排除'));
    const recentRow = h('div', 'row');
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
    recentRow.append(recentInput, h('span', 'muted', '天内关注的账号默认不选（0 = 关闭）'));
    recent.append(recentRow);
    if (!snapshot.exclusion.hasFollowedAt) {
      recent.append(h('div', 'hint', 'B 站当前未返回关注时间，本功能暂不生效。'));
    }
    main.append(recent);

    const protectSection = h('div', 'section');
    protectSection.append(
      h('div', 'label', `保护名单（${snapshot.protectedList.length} / ${MAX_PROTECTED}）`),
    );
    protectSection.append(
      h('div', 'hint', '名单中的账号不会被选中或取关；B 站「特别关注」分组自动保护。'),
    );
    if (snapshot.protectedList.length === 0) {
      protectSection.append(h('div', 'muted', '暂无手动锁定，可在整理列表点击 🔓 加入。'));
    } else {
      for (const item of snapshot.protectedList) {
        const row = h('div', 'backup-row');
        row.append(h('span', 'grow', item.uname || `(已注销 ${item.mid})`));
        const armed = unprotectArmed.has(item.mid);
        row.append(
          button(armed ? '确认解除' : '解除', () => {
            if (armed) {
              unprotectArmed.delete(item.mid);
              actions.onUnprotect(item.mid);
            } else {
              unprotectArmed.add(item.mid);
              render(snapshot);
            }
          }),
        );
        protectSection.append(row);
      }
    }
    main.append(protectSection);

    main.append(
      checkbox('完成时发送系统通知', snapshot.settings.notify, (checked) =>
        actions.onChangeSettings({ ...snapshot.settings, notify: checked }),
      ),
    );
    main.append(
      checkbox('显示原始错误信息（反馈问题时开启）', snapshot.settings.showRawErrors, (checked) =>
        actions.onChangeSettings({ ...snapshot.settings, showRawErrors: checked }),
      ),
    );
    main.append(
      h('div', 'hint', '隐私：所有数据只保存在本机浏览器，不会发送到任何外部服务器。'),
    );

    const section = h('div', 'section');
    section.append(h('div', 'label', `备份中心（保留最近 ${MAX_BACKUPS} 次）`));
    if (snapshot.backups.length === 0) {
      section.append(h('div', 'muted', '暂无备份。点击「开始执行」前会自动保存一份。'));
    } else {
      for (const record of snapshot.backups) {
        section.append(backupRow(record));
      }
    }
    main.append(section);

    const row = h('div', 'actions');
    row.append(
      button(
        '返回',
        () => {
          showSettings = false;
          render(snapshot);
        },
        true,
      ),
    );
    main.append(row);
  }

  return {
    render,
    destroy() {
      host.remove();
    },
  };
}
