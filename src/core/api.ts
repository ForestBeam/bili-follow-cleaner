import type { BridgeClient } from '../bridge/client';
import { parseFollowedAt } from './protection';
import { parseTagIds, type FollowUser } from './task';
import { signParams } from './wbi';

export interface WbiKeys {
  imgKey: string;
  subKey: string;
}

export interface NavInfo {
  isLogin: boolean;
  mid: number | null;
  keys: WbiKeys;
}

export function stemFromUrl(url: string): string {
  const file = url.slice(url.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

export async function fetchNav(client: BridgeClient): Promise<NavInfo> {
  const response = await client.request('/x/web-interface/nav', 'GET', {});
  const body = (response.body ?? {}) as {
    data?: { isLogin?: boolean; mid?: number; wbi_img?: { img_url?: string; sub_url?: string } };
  };
  const data = body.data ?? {};
  const imgUrl = data.wbi_img?.img_url ?? '';
  const subUrl = data.wbi_img?.sub_url ?? '';
  return {
    isLogin: Boolean(data.isLogin),
    mid: typeof data.mid === 'number' ? data.mid : null,
    keys: { imgKey: imgUrl ? stemFromUrl(imgUrl) : '', subKey: subUrl ? stemFromUrl(subUrl) : '' },
  };
}

export interface FollowingsOptions {
  pageSize?: number;
  pageDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  nowSeconds?: () => number;
  onProgress?: (loaded: number, total: number) => void;
}

export interface FollowGroup {
  tagId: number;
  name: string;
}

export async function fetchGroups(client: BridgeClient): Promise<FollowGroup[]> {
  const response = await client.request('/x/relation/tags', 'GET', {});
  const body = (response.body ?? {}) as {
    code?: number;
    message?: string;
    data?: Array<{ tagid?: number; name?: string } | null>;
  };
  if (body.code !== 0) {
    throw new Error(`拉取关注分组失败：${body.code} ${body.message ?? ''}`);
  }
  const list = Array.isArray(body.data) ? body.data : [];
  const groups: FollowGroup[] = [];
  for (const item of list) {
    if (!item || typeof item.tagid !== 'number') {
      continue;
    }
    groups.push({
      tagId: item.tagid,
      name: typeof item.name === 'string' && item.name ? item.name : `分组 ${item.tagid}`,
    });
  }
  return groups;
}

export async function fetchFollowings(
  client: BridgeClient,
  keys: WbiKeys,
  uid: number,
  options: FollowingsOptions = {},
): Promise<{ items: FollowUser[]; total: number }> {
  const pageSize = options.pageSize ?? 50;
  const pageDelayMs = options.pageDelayMs ?? 500;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));

  const base = { vmid: uid, ps: pageSize, order: 'desc', order_type: 'attention', jsonp: 'jsonp' };
  let useSign = Boolean(keys.imgKey && keys.subKey);
  const items: FollowUser[] = [];
  let total = 0;
  let page = 1;

  for (;;) {
    const params: Record<string, string | number | boolean> = { ...base, pn: page };
    let response = await client.request(
      '/x/relation/followings',
      'GET',
      useSign ? signParams(params, { ...keys, wts: nowSeconds() }) : params,
    );
    let body = (response.body ?? {}) as {
      code?: number;
      message?: string;
      data?: { total?: number; list?: Array<{ mid?: number; uname?: string; face?: string }> };
    };
    if (body.code !== 0 && useSign) {
      useSign = false;
      response = await client.request('/x/relation/followings', 'GET', params);
      body = (response.body ?? {}) as typeof body;
    }
    if (body.code !== 0) {
      throw new Error(`拉取关注列表失败：${body.code} ${body.message ?? ''}`);
    }
    const list = body.data?.list ?? [];
    total = body.data?.total ?? total;
    for (const item of list) {
      if (typeof item.mid === 'number') {
        const user: FollowUser = { mid: item.mid, uname: item.uname ?? '', face: item.face };
        const tags = parseTagIds((item as { tag?: unknown }).tag);
        if (tags.length > 0) {
          user.tags = tags;
        }
        const followedAt = parseFollowedAt((item as { mtime?: unknown }).mtime);
        if (followedAt !== undefined) {
          user.followedAt = followedAt;
        }
        items.push(user);
      }
    }
    options.onProgress?.(items.length, total);
    if (list.length === 0 || items.length >= total) {
      break;
    }
    page += 1;
    await sleep(pageDelayMs);
  }
  return { items, total };
}

export async function unfollow(
  client: BridgeClient,
  mid: number,
  csrf: string,
): Promise<{ code: number | undefined; message: string }> {
  const response = await client.request('/x/relation/modify', 'POST', {
    fid: mid,
    act: 2,
    re_src: 11,
    csrf,
  });
  const body = (response.body ?? {}) as { code?: number; message?: string };
  return { code: body.code, message: body.message ?? '' };
}
