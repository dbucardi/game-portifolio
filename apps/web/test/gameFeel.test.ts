import { decodeAds, type Ad } from '@mugloar/core';
import { FAKE_ADS } from '@mugloar/core/testing';
import { flavourText, milestonesBetween, oddsText, questKind, questStage, sortQuests, suspenseDurationMs, type QuestKind } from '@/gameFeel';
import { stats } from './fixtures';

const ads = decodeAds(FAKE_ADS.map((ad) => ({ ...ad, reward: Number(ad.reward) })));

function questAd(message: string, probability = 'Piece of cake'): Ad {
  return { adId: 'x', message, reward: 10, expiresIn: 5, probability, encryption: 'none' };
}

const MESSAGE_BY_KIND: Readonly<Record<QuestKind, string>> = {
  steal: 'Steal chariot delivery to Elenor Smith',
  escort: 'Escort Llyr Hambleton to meadow where they lost clothes',
  transport: 'Help Eun Thrussell to transport a magic squirrel',
  sell: 'Help Joetta Garrard to sell an unordinary potatoes on the local market',
  advertise: 'Create an advertisement campaign for Hyacinth turnips',
  defend: 'Help defending the old bridge',
  other: 'Infiltrate The Azure Ghosts and recover their secrets.',
};

const FIGHTING_WORDS = /blade|steel|fire|ground shakes/i;

describe('suspenseDurationMs (FUN-05)', () => {
  it('grows with risk', () => {
    expect(suspenseDurationMs('Piece of cake')).toBe(4500);
    expect(suspenseDurationMs('Gamble')).toBe(6500);
    expect(suspenseDurationMs('Suicide mission')).toBe(8000);
    expect(suspenseDurationMs('Never heard of it')).toBe(8000);
  });
});
describe('questKind (FUN-03)', () => {
  it.each(Object.entries(MESSAGE_BY_KIND))('reads %s from a real message', (kind, message) => {
    expect(questKind(message)).toBe(kind);
  });
  it('lets a steal win over any other word', () => {
    expect(questKind('Steal the advertisement and sell it')).toBe('steal');
  });
});
describe('oddsText (FUN-03)', () => {
  it.each([
    ['Piece of cake', 'Odds: almost certain'],
    ['Walk in the park', 'Odds: almost certain'],
    ['Sure thing', 'Odds: very good'],
    ['Quite likely', 'Odds: good'],
    ['Hmmm....', 'Odds: better than even'],
    ['Gamble', 'Odds: a gamble, about 1 in 2'],
    ['Risky', 'Odds: less than even'],
    ['Rather detrimental', 'Odds: poor'],
    ['Playing with fire', 'Odds: bleak'],
    ['Suicide mission', 'Odds: grim'],
    ['Impossible', 'Odds: next to none'],
    ['Never heard of it', 'Odds: grim'],
  ])('%s reads "%s"', (label, text) => {
    expect(oddsText(questAd(MESSAGE_BY_KIND.escort, label))).toBe(text);
  });
  it('does not quote odds for a steal (API-20)', () => {
    expect(oddsText(questAd(MESSAGE_BY_KIND.steal, 'Piece of cake'))).toBe('Odds: unclear. Steals stop working once your reputation drops.');
  });
});
describe('flavourText (FUN-03, FUN-09)', () => {
  const escort = questAd(MESSAGE_BY_KIND.escort);

  it('is picked with the injected random source', () => {
    expect(flavourText('setting-out', escort, () => 0)).toBe('Your dragon takes the road with your charge in tow...');
    expect(flavourText('setting-out', escort, () => 0.99)).toBe('You scout ahead and wave them on...');
    expect(flavourText('climax', escort, () => 0)).toBe('Almost there...');
  });
  it('has its own opening line for sell, advertise and steal', () => {
    expect(flavourText('setting-out', questAd(MESSAGE_BY_KIND.sell), () => 0)).toBe('You set up a stall in the market square...');
    expect(flavourText('setting-out', questAd(MESSAGE_BY_KIND.advertise), () => 0)).toBe('You grab a quill and start on the posters...');
    expect(flavourText('setting-out', questAd(MESSAGE_BY_KIND.steal), () => 0)).toBe('You pull your hood low and slip out after dark...');
  });
  it('uses fighting words for defend quests only', () => {
    for (const kind of Object.keys(MESSAGE_BY_KIND) as QuestKind[]) {
      for (const probability of ['Gamble', 'Suicide mission']) {
        const ad = questAd(MESSAGE_BY_KIND[kind], probability);
        const lines = [0, 0.99].map((random) => flavourText('climax', ad, () => random));

        expect(lines.some((line) => FIGHTING_WORDS.test(line))).toBe(kind === 'defend');
      }
    }

    expect(flavourText('climax', questAd(MESSAGE_BY_KIND.defend, 'Suicide mission'), () => 0)).toBe('The ground shakes... this is it!');
    expect(flavourText('setting-out', questAd(MESSAGE_BY_KIND.defend), () => 0)).toBe('You sharpen your blade and ride out...');
  });
  it('never shows fighting words for a sell quest', () => {
    const sell = questAd(MESSAGE_BY_KIND.sell, 'Suicide mission');

    for (const phase of ['setting-out', 'climax'] as const) {
      for (const random of [0, 0.5, 0.99]) {
        expect(flavourText(phase, sell, () => random)).not.toMatch(FIGHTING_WORDS);
      }
    }
  });
});
describe('questStage (FUN-03)', () => {
  it('keeps the combat stage for defend and other quests', () => {
    expect(questStage(MESSAGE_BY_KIND.defend)).toEqual({ hero: '🛡️', clash: '⚔️', foe: '🐉' });
    expect(questStage(MESSAGE_BY_KIND.other)).toEqual(questStage(MESSAGE_BY_KIND.defend));
  });
  it('shows coins for a sell quest', () => {
    expect(questStage(MESSAGE_BY_KIND.sell).clash).toBe('💰');
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
