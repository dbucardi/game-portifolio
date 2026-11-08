import { decodeAds } from '@mugloar/core';
import { FAKE_ADS } from '@mugloar/core/testing';
import { flavourText, milestonesBetween, oddsText, sortQuests, suspenseDurationMs } from '@/gameFeel';
import { stats } from './fixtures';

const ads = decodeAds(FAKE_ADS.map((ad) => ({ ...ad, reward: Number(ad.reward) })));

describe('suspenseDurationMs (FUN-05)', () => {
  it('grows with risk', () => {
    expect(suspenseDurationMs('Piece of cake')).toBe(4500);
    expect(suspenseDurationMs('Gamble')).toBe(6500);
    expect(suspenseDurationMs('Suicide mission')).toBe(8000);
    expect(suspenseDurationMs('Never heard of it')).toBe(8000);
  });
});
describe('oddsText', () => {
  it('describes the chance in words', () => {
    expect(oddsText('Gamble')).toBe('Odds: a gamble, about 1 in 2');
    expect(oddsText('Piece of cake')).toBe('Odds: almost certain');
  });
});
describe('flavourText (FUN-09)', () => {
  it('is picked with the injected random source', () => {
    const [ad] = ads;

    if (!ad) {
      throw new Error('no ad');
    }

    expect(flavourText('setting-out', ad, () => 0)).toBe('You sharpen your blade and ride out...');
    expect(flavourText('setting-out', ad, () => 0.99)).toBe('The townsfolk wave as you leave the gates...');
    expect(flavourText('climax', ad, () => 0)).toBe('Almost there...');
  });
});
describe('sortQuests (FUN-01)', () => {
  it('keeps the board order unless the player picks another sort', () => {
    expect(sortQuests(ads, 'board').map((ad) => ad.adId)).toEqual(ads.map((ad) => ad.adId));
    expect(sortQuests(ads, 'reward').map((ad) => ad.reward)).toEqual([300, 120, 72, 41, 28]);
    expect(sortQuests(ads, 'expiry').map((ad) => ad.expiresIn)).toEqual([3, 4, 5, 6, 7]);
    expect(sortQuests(ads, 'risk')[0]?.probability).toBe('Piece of cake');
    expect(sortQuests(ads, 'risk').at(-1)?.probability).toBe('Suicide mission');
  });
});
describe('milestonesBetween (FUN-08)', () => {
  it('calls out the target, a new high score and the last life', () => {
    expect(milestonesBetween(stats({ score: 950 }), stats({ score: 1020 }), 0).map((m) => m.key)).toEqual(['target']);
    expect(milestonesBetween(stats({ score: 400 }), stats({ score: 520 }), 500).map((m) => m.key)).toEqual(['high-score']);
    expect(milestonesBetween(stats({ lives: 2 }), stats({ lives: 1 }), 0).map((m) => m.key)).toEqual(['last-life']);
  });
  it('stays quiet otherwise', () => {
    expect(milestonesBetween(stats({ score: 1000 }), stats({ score: 1100 }), 0)).toEqual([]);
    expect(milestonesBetween(stats({ score: 10 }), stats({ score: 50 }), 0)).toEqual([]);
  });
});
