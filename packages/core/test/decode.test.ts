import { describe, expect, it, vi } from 'vitest';
import { decodeAd, decodeAds, rot13 } from '../src/decode';
import { rawAdSchema, type RawAd } from '../src/api/schemas';

const plain: RawAd = {
  adId: 'abc',
  message: 'Help Jasmina',
  reward: 41,
  expiresIn: 3,
  encrypted: null,
  probability: 'Walk in the park',
};

describe('decodeAd', () => {
  it('passes plain ads through', () => {
    expect(decodeAd(plain)).toEqual({
      adId: 'abc',
      message: 'Help Jasmina',
      reward: 41,
      expiresIn: 3,
      probability: 'Walk in the park',
      encryption: 'none',
    });
  });
  it('decodes Base64 ads (live sample from the API spike)', () => {
    const ad = decodeAd({
      adId: 'MGdka0Z3cWc=',
      message: 'SW5maWx0cmF0ZSBUaGUgQXp1cmUgR2hvc3RzIGFuZCByZWNvdmVyIHRoZWlyIHNlY3JldHMu',
      reward: 154,
      expiresIn: 2,
      encrypted: 1,
      probability: 'UmF0aGVyIGRldHJpbWVudGFs',
    });

    expect(ad).toMatchObject({
      adId: '0gdkFwqg',
      message: 'Infiltrate The Azure Ghosts and recover their secrets.',
      probability: 'Rather detrimental',
      encryption: 'base64',
    });
  });
  it('decodes ROT13 ads', () => {
    const ad = decodeAd({
      ...plain,
      adId: 'nop',
      message: 'Uryc Wnfzvan',
      probability: 'Evfxl',
      encrypted: 2,
    });

    expect(ad).toMatchObject({
      adId: 'abc',
      message: 'Help Jasmina',
      probability: 'Risky',
      encryption: 'rot13',
    });
  });
  it('normalises a numeric-string reward (VAL-02)', () => {
    const raw = rawAdSchema.parse({ ...plain, reward: '41' });

    expect(decodeAd(raw)?.reward).toBe(41);
  });
  it('rejects a non-numeric reward (VAL-01)', () => {
    expect(rawAdSchema.safeParse({ ...plain, reward: 'lots' }).success).toBe(false);
  });
  it('rejects an unknown encryption flag', () => {
    expect(decodeAd({ ...plain, encrypted: 99 })).toBeNull();
  });
});
describe('decodeAds', () => {
  it('skips and reports ads with an unknown encryption flag (CORE-03)', () => {
    const onSkip = vi.fn();
    const ads = decodeAds([plain, { ...plain, adId: 'weird', encrypted: 99 }], onSkip);

    expect(ads.map((ad) => ad.adId)).toEqual(['abc']);
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ adId: 'weird' }));
  });
  it('warns by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    decodeAds([{ ...plain, encrypted: 99 }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown encryption flag 99'));
    warn.mockRestore();
  });
});
describe('rot13', () => {
  it('is its own inverse and keeps non-letters', () => {
    expect(rot13(rot13('Hmmm.... 42!'))).toBe('Hmmm.... 42!');
  });
});
