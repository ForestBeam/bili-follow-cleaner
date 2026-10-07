import { describe, expect, it, vi } from 'vitest';
import { BRIDGE_CHANNEL, type ApiResponseMessage, type BridgeParamValue } from '../src/bridge/protocol';
import type { BridgeClient } from '../src/bridge/client';
import { fetchFollowings, fetchGroups, fetchNav, follow, stemFromUrl, unfollow } from '../src/core/api';

type Handler = (path: string, method: string, params: Record<string, BridgeParamValue>) => unknown;

function mockClient(handler: Handler) {
  const calls: Array<{ path: string; method: string; params: Record<string, BridgeParamValue> }> = [];
  const client: BridgeClient = {
    async request(path, method, params) {
      calls.push({ path, method, params });
      const message: ApiResponseMessage = {
        channel: BRIDGE_CHANNEL,
        type: 'api-response',
        id: `req-${calls.length}`,
        ok: true,
        status: 200,
        body: handler(path, method, params),
      };
      return message;
    },
  };
  return { client, calls };
}

const KEYS = { imgKey: '7f1a3c9d2b8e4065af17c2d94e6b8031', subKey: 'c4e0d8196a2f53b7e0948c1d7b62fa35' };

describe('stemFromUrl', () => {
  it('extracts the file stem', () => {
    expect(stemFromUrl('https://i0.hdslb.com/bfs/wbi/abcdef.png')).toBe('abcdef');
    expect(stemFromUrl('abcdef')).toBe('abcdef');
  });
});

describe('fetchNav', () => {
  it('maps login state, mid and wbi keys', async () => {
    const { client } = mockClient(() => ({
      code: 0,
      data: {
        isLogin: true,
        mid: 12345,
        uname: 'tester',
        wbi_img: { img_url: 'https://i0.hdslb.com/bfs/wbi/key1.png', sub_url: 'https://i0.hdslb.com/bfs/wbi/key2.png' },
      },
    }));

    const nav = await fetchNav(client);

    expect(nav).toEqual({
      isLogin: true,
      mid: 12345,
      uname: 'tester',
      keys: { imgKey: 'key1', subKey: 'key2' },
    });
  });

  it('reports logged-out state without keys', async () => {
    const { client } = mockClient(() => ({ code: 0, data: { isLogin: false } }));
    const nav = await fetchNav(client);
    expect(nav.isLogin).toBe(false);
    expect(nav.mid).toBeNull();
    expect(nav.keys).toEqual({ imgKey: '', subKey: '' });
  });
});

describe('fetchFollowings', () => {
  it('pages through the list and signs requests', async () => {
    const pageOne = Array.from({ length: 50 }, (_, index) => ({ mid: index + 1, uname: `u${index + 1}` }));
    const pageTwo = Array.from({ length: 10 }, (_, index) => ({ mid: index + 51, uname: `u${index + 51}` }));
    const { client, calls } = mockClient((_path, _method, params) => {
      const page = Number(params.pn);
      return { code: 0, data: { total: 60, list: page === 1 ? pageOne : pageTwo } };
    });
    const sleep = vi.fn(async () => {});
    const onProgress = vi.fn();

    const result = await fetchFollowings(client, KEYS, 999, { sleep, onProgress, nowSeconds: () => 1700000000 });

    expect(result.items).toHaveLength(60);
    expect(result.total).toBe(60);
    expect(result.items[0]).toEqual({ mid: 1, uname: 'u1', face: undefined });
    expect(calls).toHaveLength(2);
    expect(calls[0].params.w_rid).toBeDefined();
    expect(calls[0].params.wts).toBe('1700000000');
    expect(calls[0].params.vmid).toBe('999');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(onProgress).toHaveBeenLastCalledWith(60, 60);
  });

  it('falls back to unsigned requests when signing fails', async () => {
    const { client, calls } = mockClient((_path, _method, params) =>
      params.w_rid !== undefined
        ? { code: -352, message: '风控' }
        : { code: 0, data: { total: 1, list: [{ mid: 7, uname: 'x' }] } },
    );

    const result = await fetchFollowings(client, KEYS, 1, { sleep: async () => {}, nowSeconds: () => 1 });

    expect(result.items).toEqual([{ mid: 7, uname: 'x', face: undefined }]);
    expect(calls).toHaveLength(2);
    expect(calls[1].params.w_rid).toBeUndefined();
  });

  it('throws when the list cannot be fetched', async () => {
    const { client } = mockClient(() => ({ code: -101, message: '未登录' }));
    await expect(fetchFollowings(client, KEYS, 1, { sleep: async () => {} })).rejects.toThrow('-101');
  });
});

describe('unfollow', () => {
  it('posts a modify request with act=2', async () => {
    const { client, calls } = mockClient(() => ({ code: 0, message: '0' }));

    const result = await unfollow(client, 42, 'csrf-token');

    expect(result).toEqual({ code: 0, message: '0' });
    expect(calls[0]).toEqual({
      path: '/x/relation/modify',
      method: 'POST',
      params: { fid: 42, act: 2, re_src: 11, csrf: 'csrf-token' },
    });
  });
});

describe('follow', () => {
  it('posts a modify request with act=1', async () => {
    const { client, calls } = mockClient(() => ({ code: 0, message: '0' }));

    const result = await follow(client, 42, 'csrf-token');

    expect(result).toEqual({ code: 0, message: '0' });
    expect(calls[0]).toEqual({
      path: '/x/relation/modify',
      method: 'POST',
      params: { fid: 42, act: 1, re_src: 11, csrf: 'csrf-token' },
    });
  });
});

describe('fetchGroups', () => {
  it('maps the group list and skips invalid entries', async () => {
    const { client, calls } = mockClient(() => ({
      code: 0,
      data: [
        { tagid: 0, name: '默认分组', count: 12 },
        { tagid: -10, name: '特别关注', count: 2 },
        { tagid: 7 },
        { tagid: 'x', name: '非法' },
        null,
      ],
    }));

    const groups = await fetchGroups(client);

    expect(groups).toEqual([
      { tagId: 0, name: '默认分组' },
      { tagId: -10, name: '特别关注' },
      { tagId: 7, name: '分组 7' },
    ]);
    expect(calls[0]).toEqual({ path: '/x/relation/tags', method: 'GET', params: {} });
  });

  it('throws when the group list cannot be fetched', async () => {
    const { client } = mockClient(() => ({ code: -101, message: '未登录' }));
    await expect(fetchGroups(client)).rejects.toThrow('-101');
  });
});

describe('关注列表中的分组字段', () => {
  it('解析 tag 数组，缺失或非法时省略该字段', async () => {
    const { client } = mockClient(() => ({
      code: 0,
      data: {
        total: 4,
        list: [
          { mid: 1, uname: 'a', tag: [0, 5] },
          { mid: 2, uname: 'b', tag: 5 },
          { mid: 3, uname: 'c' },
          { mid: 4, uname: 'd', tag: ['x', 2] },
        ],
      },
    }));

    const result = await fetchFollowings(client, KEYS, 1, { sleep: async () => {} });

    expect(result.items[0].tags).toEqual([0, 5]);
    expect(result.items[1].tags).toEqual([5]);
    expect('tags' in result.items[2]).toBe(false);
    expect(result.items[3].tags).toEqual([2]);
  });
});

describe('关注列表中的关注时间', () => {
  it('mtime 秒转毫秒、毫秒原样，缺失或非法时省略', async () => {
    const { client } = mockClient(() => ({
      code: 0,
      data: {
        total: 4,
        list: [
          { mid: 1, uname: 'a', mtime: 1_700_000_000 },
          { mid: 2, uname: 'b', mtime: 1_700_000_000_123 },
          { mid: 3, uname: 'c' },
          { mid: 4, uname: 'd', mtime: 0 },
        ],
      },
    }));

    const result = await fetchFollowings(client, KEYS, 1, { sleep: async () => {} });

    expect(result.items[0].followedAt).toBe(1_700_000_000_000);
    expect(result.items[1].followedAt).toBe(1_700_000_000_123);
    expect('followedAt' in result.items[2]).toBe(false);
    expect('followedAt' in result.items[3]).toBe(false);
  });
});
