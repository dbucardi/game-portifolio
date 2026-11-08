/**
 * CORE-04: estimated success rate per probability label (API-17).
 * Hand-tuned starting values; the bot service benchmark (BOT-22) calibrates them.
 */
export const SUCCESS_RATE_BY_LABEL: Readonly<Record<string, number>> = {
  'Piece of cake': 0.95,
  'Walk in the park': 0.9,
  'Sure thing': 0.85,
  'Quite likely': 0.75,
  'Hmmm....': 0.6,
  Gamble: 0.5,
  Risky: 0.4,
  'Rather detrimental': 0.3,
  'Playing with fire': 0.25,
  'Suicide mission': 0.15,
  Impossible: 0.05,
};

/** Unknown labels are treated as high risk. */
export const UNKNOWN_SUCCESS_RATE = 0.1;

export function successRate(label: string): number {
  return SUCCESS_RATE_BY_LABEL[label.trim()] ?? UNKNOWN_SUCCESS_RATE;
}

export type RiskTier = 'safe' | 'likely' | 'risky' | 'dangerous';

export function riskTier(label: string): RiskTier {
  const p = successRate(label);

  if (p >= 0.85) {
    return 'safe';
  }

  if (p >= 0.6) {
    return 'likely';
  }

  if (p >= 0.4) {
    return 'risky';
  }

  return 'dangerous';
}
