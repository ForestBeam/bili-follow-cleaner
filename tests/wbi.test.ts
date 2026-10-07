import { describe, expect, it } from 'vitest';
import { buildQuery, mixinKey, signParams } from '../src/core/wbi';
import fixturesJson from './fixtures/wbi-vectors.json';

interface WbiFixture {
  imgKey: string;
  subKey: string;
  wts: number;
  params: Record<string, string>;
  expectedQuery: string;
  expectedMixinKey: string;
  expectedWRid: string;
}

const fixtures = fixturesJson as unknown as WbiFixture[];

describe('wbi signer', () => {
  it('reorders and truncates the mixin key', () => {
    for (const fixture of fixtures) {
      expect(mixinKey(fixture.imgKey + fixture.subKey)).toBe(fixture.expectedMixinKey);
    }
  });

  it.each(fixtures.map((fixture, index) => [index, fixture] as const))(
    'case %i matches python reference',
    (_index, fixture) => {
      const signed = signParams(fixture.params, {
        imgKey: fixture.imgKey,
        subKey: fixture.subKey,
        wts: fixture.wts,
      });
      const { w_rid, ...rest } = signed;
      expect(buildQuery(rest)).toBe(fixture.expectedQuery);
      expect(w_rid).toBe(fixture.expectedWRid);
    },
  );

  it('does not mutate the input params', () => {
    const params = { vmid: '1', pn: 1 };
    signParams(params, { imgKey: fixtures[0].imgKey, subKey: fixtures[0].subKey, wts: 1 });
    expect(params).toEqual({ vmid: '1', pn: 1 });
  });
});
