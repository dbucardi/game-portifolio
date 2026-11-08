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

const ODDS_TEXT: readonly (readonly [minRate: number, text: string])[] = [
  [0.9, 'Odds: almost certain'],
  [0.7, 'Odds: good, about 3 in 4'],
  [0.55, 'Odds: better than even'],
  [0.45, 'Odds: a gamble, about 1 in 2'],
  [0.3, 'Odds: poor, about 1 in 3'],
  [0.1, 'Odds: grim, about 1 in 6'],
];

export function oddsText(probability: string): string {
  const rate = successRate(probability);

  return ODDS_TEXT.find(([minRate]) => rate >= minRate)?.[1] ?? 'Odds: next to none';
}

export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

const SETTING_OUT: readonly string[] = [
  'You sharpen your blade and ride out...',
  'Your dragon spreads its wings and sets off across the map...',
  'You pack your gear and follow the old road...',
  'The townsfolk wave as you leave the gates...',
];
const CLIMAX: Readonly<Record<RiskTier, readonly string[]>> = {
  safe: ['Almost there...', 'Nothing you have not handled before...'],
  likely: ['A shadow moves ahead...', 'This could go either way... but probably yours.'],
  risky: ['Steel meets steel...!', 'The odds turn against you...!'],
  dangerous: ['The ground shakes... this is it!', 'Fire everywhere... hold on!'],
};

/** FUN-03, FUN-09: `random` is injected so tests always get the same line. */
export function flavourText(phase: SuspensePhase, ad: Ad, random: () => number): string {
  const lines = phase === 'setting-out' ? SETTING_OUT : CLIMAX[riskTier(ad.probability)];
  const index = Math.min(lines.length - 1, Math.floor(random() * lines.length));

  return lines[index] ?? '';
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
