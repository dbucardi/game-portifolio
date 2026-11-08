import type { RawAd } from './api/schemas';

export type Encryption = 'none' | 'base64' | 'rot13';

/** An ad with readable text and a numeric reward, safe for any other use (CORE-02). */
export interface Ad {
  adId: string;
  message: string;
  reward: number;
  expiresIn: number;
  probability: string;
  encryption: Encryption;
}

const ENCRYPTION_BY_FLAG: Record<number, Encryption> = { 1: 'base64', 2: 'rot13' };

export function decodeBase64(value: string): string {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

export function rot13(value: string): string {
  return value.replace(/[a-z]/gi, (char) => {
    const base = char <= 'Z' ? 65 : 97;

    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}

const DECODERS: Record<Encryption, (value: string) => string> = {
  none: (value) => value,
  base64: decodeBase64,
  rot13,
};

/** Returns null for an unknown encryption flag or undecodable text (CORE-03). */
export function decodeAd(raw: RawAd): Ad | null {
  const encryption = raw.encrypted == null ? 'none' : ENCRYPTION_BY_FLAG[raw.encrypted];

  if (!encryption) {
    return null;
  }

  const decode = DECODERS[encryption];

  try {
    return {
      adId: decode(raw.adId),
      message: decode(raw.message),
      reward: raw.reward,
      expiresIn: raw.expiresIn,
      probability: decode(raw.probability),
      encryption,
    };
  } catch {
    return null;
  }
}

export function decodeAds(raws: RawAd[], onSkip: (raw: RawAd) => void = warnSkipped): Ad[] {
  const ads: Ad[] = [];

  for (const raw of raws) {
    const ad = decodeAd(raw);

    if (ad) {
      ads.push(ad);
    } else {
      onSkip(raw);
    }
  }

  return ads;
}

function warnSkipped(raw: RawAd): void {
  console.warn(`Skipping ad ${raw.adId}: unknown encryption flag ${String(raw.encrypted)}`);
}
