import { describe, expect, it } from 'vitest';
import { md5Hex } from '../src/core/md5';

const RFC1321_VECTORS: Array<[string, string]> = [
  ['', 'd41d8cd98f00b204e9800998ecf8427e'],
  ['a', '0cc175b9c0f1b6a831c399e269772661'],
  ['abc', '900150983cd24fb0d6963f7d28e17f72'],
  ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
  ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
  ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
  ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
];

describe('md5Hex', () => {
  it.each(RFC1321_VECTORS)('matches RFC 1321 vector %j', (input, expected) => {
    expect(md5Hex(input)).toBe(expected);
  });

  it('encodes utf-8 before hashing', () => {
    expect(md5Hex('关注列表整理工具')).toBe('d0543f6806130d4745d71534136f9faf');
  });

  it.each([
    [55, 'ef1772b6dff9a122358552954ad0df65'],
    [56, '3b0c8ac703f828b04c6c197006d17218'],
    [57, '652b906d60af96844ebd21b674f35e93'],
    [64, '014842d480b571495a4a0363793f7367'],
    [119, '8a7bd0732ed6a28ce75f6dabc90e1613'],
    [120, '5f61c0ccad4cac44c75ff505e1f1e537'],
  ])('handles padding boundary at %i bytes', (length, expected) => {
    expect(md5Hex('a'.repeat(length))).toBe(expected);
  });
});
