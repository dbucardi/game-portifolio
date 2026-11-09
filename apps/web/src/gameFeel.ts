import { riskTier, successRate, TARGET_SCORE, type Ad, type GameStats, type RiskTier } from '@mugloar/core';

export type SuspensePhase = 'setting-out' | 'climax';

/** FUN-05: riskier quests keep the player waiting longer. */
const SUSPENSE_MS_BY_TIER: Readonly<Record<RiskTier, number>> = {
  safe: 4500,
  likely: 5500,
  risky: 6500,
  dangerous: 8000,
};

/** FUN-02, FUN-05: the minimum time a result is held back. */
export function suspenseDurationMs(probability: string): number {
  return SUSPENSE_MS_BY_TIER[riskTier(probability)];
}

export type QuestKind = 'steal' | 'escort' | 'transport' | 'sell' | 'advertise' | 'defend' | 'other';

/** FUN-03: the quest text is the only hint of what the quest is about. `steal` is tested first. */
export function questKind(message: string): QuestKind {
  const text = message.trim().toLowerCase();

  if (/\bsteal\b/.test(text)) {
    return 'steal';
  }

  if (text.startsWith('escort')) {
    return 'escort';
  }

  if (/\btransport\b/.test(text)) {
    return 'transport';
  }

  if (/\bsell\b/.test(text)) {
    return 'sell';
  }

  if (/\badvertisement\b/.test(text)) {
    return 'advertise';
  }

  if (/\bdefend/.test(text)) {
    return 'defend';
  }

  return 'other';
}

const ODDS_TEXT: readonly (readonly [minRate: number, text: string])[] = [
  [0.9, 'Odds: almost certain'],
  [0.8, 'Odds: very good'],
  [0.7, 'Odds: good'],
  [0.55, 'Odds: better than even'],
  [0.45, 'Odds: a gamble, about 1 in 2'],
  [0.35, 'Odds: less than even'],
  [0.28, 'Odds: poor'],
  [0.2, 'Odds: bleak'],
  [0.1, 'Odds: grim'],
];

/** API-20, API-21: a steal's label does not predict the result, so no odds are quoted. */
export const STEAL_ODDS_TEXT = 'Odds: unclear. Steals stop working once your reputation drops.';

export function oddsText(ad: Pick<Ad, 'message' | 'probability'>): string {
  if (questKind(ad.message) === 'steal') {
    return STEAL_ODDS_TEXT;
  }

  const rate = successRate(ad.probability);

  return ODDS_TEXT.find(([minRate]) => rate >= minRate)?.[1] ?? 'Odds: next to none';
}

export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

const FIGHTING_SETTING_OUT: readonly string[] = [
  'You sharpen your blade and ride out...',
  'Your dragon spreads its wings and sets off across the map...',
  'The townsfolk wave as you leave the gates...',
];
const SETTING_OUT: Readonly<Record<QuestKind, readonly string[]>> = {
  steal: [
    'You pull your hood low and slip out after dark...',
    'You watch the delivery cart and wait for the road to empty...',
    'You creep along the back alleys...',
  ],
  escort: ['Your dragon takes the road with your charge in tow...', 'You offer an arm and set a gentle pace...', 'You scout ahead and wave them on...'],
  transport: ['You tie down the load and take the old road...', 'You hitch up the cart and set off...', 'You check the straps twice and head out...'],
  sell: ['You set up a stall in the market square...', 'You polish the wares and call out to the crowd...', 'You lay out the goods and wait for a buyer...'],
  advertise: ['You grab a quill and start on the posters...', 'You pin the first notice to the town board...', 'You practise your pitch for the crowd...'],
  defend: FIGHTING_SETTING_OUT,
  other: [
    'You pack your gear and follow the old road...',
    'Your dragon spreads its wings and sets off across the map...',
    'The townsfolk wave as you leave the gates...',
  ],
};

const CLIMAX: Readonly<Record<RiskTier, readonly string[]>> = {
  safe: ['Almost there...', 'Nothing you have not handled before...'],
  likely: ['A shadow moves ahead...', 'This could go either way... but probably yours.'],
  risky: ['Things are not going to plan...!', 'The odds turn against you...!'],
  dangerous: ['The whole thing hangs by a thread... this is it!', 'Everything is at stake... hold on!'],
};
/** Fighting words are only for quests that are about a fight. */
const DEFEND_CLIMAX: Readonly<Record<RiskTier, readonly string[]>> = {
  ...CLIMAX,
  risky: ['Steel meets steel...!', 'The odds turn against you...!'],
  dangerous: ['The ground shakes... this is it!', 'Fire everywhere... hold on!'],
};

/** FUN-03, FUN-09: `random` is injected so tests always get the same line. */
export function flavourText(phase: SuspensePhase, ad: Ad, random: () => number): string {
  const kind = questKind(ad.message);
  const lines = phase === 'setting-out' ? SETTING_OUT[kind] : (kind === 'defend' ? DEFEND_CLIMAX : CLIMAX)[riskTier(ad.probability)];
  const index = Math.min(lines.length - 1, Math.floor(random() * lines.length));

  return lines[index] ?? '';
}

export interface QuestStage {
  hero: string;
  clash: string;
  foe: string;
}

const COMBAT_STAGE: QuestStage = { hero: '🛡️', clash: '⚔️', foe: '🐉' };
const STAGE_BY_KIND: Readonly<Record<QuestKind, QuestStage>> = {
  steal: { hero: '🥷', clash: '💨', foe: '📦' },
  escort: { hero: '🐉', clash: '🛤️', foe: '🧳' },
  transport: { hero: '🐴', clash: '💨', foe: '🏠' },
  sell: { hero: '🧑‍🌾', clash: '💰', foe: '🛒' },
  advertise: { hero: '📣', clash: '✨', foe: '👀' },
  defend: COMBAT_STAGE,
  other: COMBAT_STAGE,
};

export function questStage(message: string): QuestStage {
  return STAGE_BY_KIND[questKind(message)];
}

export const BOARD_SORTS = ['board', 'reward', 'expiry', 'risk'] as const;

export type BoardSort = (typeof BOARD_SORTS)[number];

export const BOARD_SORT_LABELS: Record<BoardSort, string> = {
  board: 'Board order',
  reward: 'Highest reward',
  expiry: 'Expiring soonest',
  risk: 'Safest first',
};

/** FUN-01: the player's own sort. 'board' keeps the API order; ties keep it too. */
export function sortQuests(ads: readonly Ad[], sort: BoardSort): Ad[] {
  const sorted = [...ads];

  switch (sort) {
    case 'board':
      return sorted;

    case 'reward':
      return sorted.sort((a, b) => b.reward - a.reward);

    case 'expiry':
      return sorted.sort((a, b) => a.expiresIn - b.expiresIn);

    case 'risk':
      return sorted.sort((a, b) => successRate(b.probability) - successRate(a.probability));
  }
}

export interface Milestone {
  key: 'target' | 'high-score' | 'last-life';
  text: string;
}

export const LAST_LIFE_TEXT = 'One life left. Choose carefully.';

/** FUN-08: what is worth calling out between two consecutive states. */
export function milestonesBetween(previous: GameStats, next: GameStats, bestScore: number): Milestone[] {
  const milestones: Milestone[] = [];

  if (previous.score < TARGET_SCORE && next.score >= TARGET_SCORE) {
    milestones.push({
      key: 'target',
      text: `${TARGET_SCORE} points! The bards are writing songs about you.`,
    });
  }

  if (bestScore > 0 && previous.score <= bestScore && next.score > bestScore) {
    milestones.push({ key: 'high-score', text: 'New high score!' });
  }

  if (previous.lives > 1 && next.lives === 1) {
    milestones.push({ key: 'last-life', text: LAST_LIFE_TEXT });
  }

  return milestones;
}
