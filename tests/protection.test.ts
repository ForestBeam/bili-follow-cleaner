import { describe, expect, it } from 'vitest';
import {
  MAX_PROTECTED,
  SPECIAL_TAG_ID,
  buildExclusion,
  isSpecialFollow,
  parseFollowedAt,
  parseProtected,
  pushProtected,
  removeProtected,
} from '../src/core/protection';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

describe('保护名单解析', () => {
  it('脏数据回退为空数组', () => {
    expect(parseProtected(undefined)).toEqual([]);
    expect(parseProtected(null)).toEqual([]);
    expect(parseProtected('x')).toEqual([]);
    expect(parseProtected([null, { mid: 'x' }, { uname: 'a' }])).toEqual([]);
  });

  it('过滤非法项并按 mid 去重', () => {
    expect(
      parseProtected([{ mid: 1, uname: 'a' }, { mid: 1, uname: 'a2' }, { mid: 2 }]),
    ).toEqual([
      { mid: 1, uname: 'a' },
      { mid: 2, uname: '' },
    ]);
  });

  it('超出上限时截断', () => {
    const many = Array.from({ length: MAX_PROTECTED + 10 }, (_, index) => ({
      mid: index + 1,
      uname: `u${index + 1}`,
    }));
    expect(parseProtected(many)).toHaveLength(MAX_PROTECTED);
  });
});

describe('保护名单增删', () => {
  it('新增时按 mid 去重', () => {
    const first = pushProtected([], { mid: 1, uname: 'a' });
    expect(first.added).toBe(true);
    expect(first.list).toEqual([{ mid: 1, uname: 'a' }]);

    const again = pushProtected(first.list, { mid: 1, uname: 'a' });
    expect(again.added).toBe(false);
    expect(again.reason).toBe('duplicate');
    expect(again.list).toHaveLength(1);
  });

  it('达到上限后拒绝新增', () => {
    const full = Array.from({ length: MAX_PROTECTED }, (_, index) => ({
      mid: index + 1,
      uname: '',
    }));
    const result = pushProtected(full, { mid: 999_999, uname: 'x' });
    expect(result.added).toBe(false);
    expect(result.reason).toBe('limit');
    expect(result.list).toHaveLength(MAX_PROTECTED);
  });

  it('移除指定账号，未命中时原样返回', () => {
    const list = [
      { mid: 1, uname: 'a' },
      { mid: 2, uname: 'b' },
    ];
    expect(removeProtected(list, 1)).toEqual([{ mid: 2, uname: 'b' }]);
    expect(removeProtected(list, 3)).toEqual(list);
  });
});

describe('关注时间解析', () => {
  it('秒转毫秒，毫秒原样保留', () => {
    expect(parseFollowedAt(1_700_000_000)).toBe(1_700_000_000_000);
    expect(parseFollowedAt(1_700_000_000_123)).toBe(1_700_000_000_123);
  });

  it('缺失或非法返回 undefined', () => {
    expect(parseFollowedAt(undefined)).toBeUndefined();
    expect(parseFollowedAt(0)).toBeUndefined();
    expect(parseFollowedAt(-5)).toBeUndefined();
    expect(parseFollowedAt('1700000000')).toBeUndefined();
  });
});

describe('受保护与近期判定', () => {
  const users = [
    { mid: 1, uname: 'a', tags: [SPECIAL_TAG_ID] },
    { mid: 2, uname: 'b' },
    { mid: 3, uname: 'c', followedAt: NOW - DAY },
    { mid: 4, uname: 'd', followedAt: NOW - 7 * DAY },
    { mid: 5, uname: 'e', followedAt: NOW - 30 * DAY },
  ];

  it('识别特别关注分组', () => {
    expect(isSpecialFollow({ tags: [0, SPECIAL_TAG_ID] })).toBe(true);
    expect(isSpecialFollow({ tags: [0] })).toBe(false);
    expect(isSpecialFollow({})).toBe(false);
  });

  it('手动名单与特别关注合并，近期命中单独统计', () => {
    const exclusion = buildExclusion(users, [{ mid: 2, uname: 'b' }], NOW, 7);
    expect([...exclusion.protectedMids].sort((a, b) => a - b)).toEqual([1, 2]);
    expect([...exclusion.recentMids]).toEqual([3]);
    expect([...exclusion.excludedMids].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(exclusion.protectedCount).toBe(2);
    expect(exclusion.recentCount).toBe(1);
    expect(exclusion.hasFollowedAt).toBe(true);
  });

  it('正好 N 天不排除，N 天差 1 毫秒排除', () => {
    const edge = [
      { mid: 10, uname: 'x', followedAt: NOW - 7 * DAY },
      { mid: 11, uname: 'y', followedAt: NOW - 7 * DAY + 1 },
    ];
    const exclusion = buildExclusion(edge, [], NOW, 7);
    expect(exclusion.recentMids.has(10)).toBe(false);
    expect(exclusion.recentMids.has(11)).toBe(true);
  });

  it('recentDays 为 0 时关闭该功能', () => {
    const exclusion = buildExclusion(users, [], NOW, 0);
    expect(exclusion.recentMids.size).toBe(0);
    expect(exclusion.recentCount).toBe(0);
  });

  it('接口未返回关注时间时整体不生效', () => {
    const exclusion = buildExclusion([{ mid: 1, uname: 'a' }], [], NOW, 7);
    expect(exclusion.hasFollowedAt).toBe(false);
    expect(exclusion.recentCount).toBe(0);
  });

  it('受保护账号不重复计入近期数量', () => {
    const both = [{ mid: 1, uname: 'a', followedAt: NOW - DAY }];
    const exclusion = buildExclusion(both, [{ mid: 1, uname: 'a' }], NOW, 7);
    expect(exclusion.protectedCount).toBe(1);
    expect(exclusion.recentCount).toBe(0);
    expect(exclusion.excludedMids.has(1)).toBe(true);
  });
});
