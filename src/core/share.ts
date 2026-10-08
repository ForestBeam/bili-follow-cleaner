import { REPO_URL } from './links';
import type { TaskKind } from './task';

export interface ShareSummary {
  kind: TaskKind;
  done: number;
  failed: number;
}

export function reportHeadline(summary: ShareSummary): string {
  const action = summary.kind === 'follow' ? '回关了' : '清理了';
  return `${action} ${summary.done} 个关注`;
}

export function buildShareText(summary: ShareSummary): string {
  const failed = summary.failed > 0 ? `，失败 ${summary.failed} 个` : '';
  return `${reportHeadline(summary)}${failed}。开源浏览器扩展「关注列表整理工具」，数据只存本机：${REPO_URL}`;
}
