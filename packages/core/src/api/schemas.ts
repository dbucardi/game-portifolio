import { z } from 'zod';

const numericString = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'Expected a numeric string')
  .transform(Number);

/** API-12: `reward` arrives either as a number or as a numeric string. */
export const numberLike = z.union([z.number(), numericString]);

export const gameStateSchema = z.object({
  gameId: z.string().min(1),
  lives: z.number().int(),
  gold: z.number(),
  level: z.number(),
  score: z.number(),
  highScore: z.number(),
  turn: z.number().int(),
});

export const rawAdSchema = z.object({
  adId: z.string().min(1),
  message: z.string(),
  reward: numberLike,
  expiresIn: z.number().int(),
  encrypted: z.number().int().nullable().optional(),
  probability: z.string(),
});

export const solveResultSchema = z.object({
  success: z.boolean(),
  lives: z.number().int(),
  gold: z.number(),
  score: z.number(),
  highScore: z.number(),
  turn: z.number().int(),
  message: z.string(),
});

export const shopItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  cost: numberLike,
});

export const buyResultSchema = z.object({
  shoppingSuccess: z.boolean(),
  gold: z.number(),
  lives: z.number().int(),
  level: z.number(),
  turn: z.number().int(),
});

/** API-06: how the people, the state and the underworld see the player. */
export const reputationSchema = z.object({
  people: z.number(),
  state: z.number(),
  underworld: z.number(),
});

export type GameState = z.infer<typeof gameStateSchema>;

export type RawAd = z.infer<typeof rawAdSchema>;

/** An ad as it arrives on the wire, before validation and coercion. */
export type RawAdInput = z.input<typeof rawAdSchema>;

export type SolveResult = z.infer<typeof solveResultSchema>;

export type ShopItem = z.infer<typeof shopItemSchema>;

export type BuyResult = z.infer<typeof buyResultSchema>;

export type Reputation = z.infer<typeof reputationSchema>;

/** The per-game numbers every response updates. */
export const gameStatsSchema = gameStateSchema.omit({ gameId: true });

export type GameStats = z.infer<typeof gameStatsSchema>;
