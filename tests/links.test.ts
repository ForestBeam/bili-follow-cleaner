import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';
import { REPO_URL } from '../src/core/links';

describe('对外链接', () => {
  it('manifest 主页与面板使用的仓库地址一致', () => {
    expect(manifest.homepage_url).toBe(REPO_URL);
  });
});
