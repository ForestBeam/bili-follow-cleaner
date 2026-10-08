import { describe, expect, it } from 'vitest';
import { REPO_URL } from '../src/core/links';
import { buildShareText, reportHeadline } from '../src/core/share';

describe('完成页报告文案', () => {
  it('取关完成后生成可分享文案', () => {
    const text = buildShareText({ kind: 'unfollow', done: 128, failed: 0 });
    expect(text).toContain('清理了 128 个关注');
    expect(text).toContain(REPO_URL);
  });

  it('回关任务使用「回关」措辞', () => {
    expect(reportHeadline({ kind: 'follow', done: 12, failed: 0 })).toBe('回关了 12 个关注');
  });

  it('有失败项时带上失败数量', () => {
    expect(buildShareText({ kind: 'unfollow', done: 10, failed: 2 })).toContain('失败 2 个');
  });

  it('无失败项时不出现「失败」字样', () => {
    expect(buildShareText({ kind: 'follow', done: 3, failed: 0 })).not.toContain('失败');
  });
});
