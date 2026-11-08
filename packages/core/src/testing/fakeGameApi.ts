import { http, HttpResponse, type HttpHandler } from 'msw';
import { DEFAULT_GAME_API_URL } from '../api/client';
import type { GameState, RawAdInput as RawAd, Reputation, ShopItem } from '../api/schemas';
import { successRate } from '../probability';
import { HEALING_POTION_ID } from '../strategy';

/**
 * A deterministic, in-memory game that follows the API contract (docs/REQUIREMENTS.md §2):
 * text errors (API-10), 410 after game over, one turn per solve or purchase (API-14),
 * 3 lives and 0 of everything else at start (API-15).
 */

export const FAKE_SHOP: ShopItem[] = [
  { id: HEALING_POTION_ID, name: 'Healing potion', cost: 50 },
  { id: 'cs', name: 'Claw Sharpening', cost: 100 },
  { id: 'gas', name: 'Gasoline', cost: 100 },
  { id: 'ch', name: 'Claw Honing', cost: 300 },
];

export const FAKE_ADS: RawAd[] = [
  {
    adId: 'ad-safe',
    message: 'Escort Ibn Ali to the castle in the north',
    reward: 72,
    expiresIn: 5,
    encrypted: null,
    probability: 'Piece of cake',
  },
  {
    adId: 'ad-park',
    message: 'Help Jasmina Winthrop write her novel',
    reward: '41',
    expiresIn: 3,
    encrypted: null,
    probability: 'Walk in the park',
  },
  {
    adId: btoa('ad-b64'),
    message: btoa('Infiltrate The Azure Ghosts and recover their secrets.'),
    reward: 28,
    expiresIn: 7,
    encrypted: 1,
    probability: btoa('Quite likely'),
  },
  {
    adId: 'nq-ebg13',
    message: 'Qrsraq gur ivyyntr sebz n onaq bs gebyyf',
    reward: 120,
    expiresIn: 6,
    encrypted: 2,
    probability: 'Evfxl',
  },
  {
    adId: 'ad-trap',
    message: 'Steal super awesome diamond from the royal vault',
    reward: 300,
    expiresIn: 4,
    encrypted: null,
    probability: 'Suicide mission',
  },
];

export interface FakeGameOptions {
  baseUrl?: string;
  ads?: (turn: number) => RawAd[];
  /** Decides each solve. Default: succeeds when the label's estimated success rate is at least 0.5. */
  solveSucceeds?: (ad: RawAd, decodedProbability: string) => boolean;
}

interface FakeGame extends GameState {
  ads: RawAd[];
  /** Tests set this to control what the investigation reports. */
  reputation: Reputation;
}

export interface FakeGameApi {
  handlers: HttpHandler[];
  games: Map<string, FakeGame>;
  reset(): void;
}

export function createFakeGameApi(options: FakeGameOptions = {}): FakeGameApi {
  const baseUrl = options.baseUrl ?? DEFAULT_GAME_API_URL;
  const adsForTurn = options.ads ?? (() => FAKE_ADS.map((ad) => ({ ...ad })));
  const solveSucceeds = options.solveSucceeds ?? ((_ad, label) => successRate(label) >= 0.5);
  const games = new Map<string, FakeGame>();
  let nextId = 1;
  const gameOver = () => HttpResponse.json({ status: 'Game Over' }, { status: 410 });
  const text = (body: string, status: number) => new HttpResponse(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  function lookup(gameId: unknown): FakeGame | Response {
    const game = typeof gameId === 'string' ? games.get(gameId) : undefined;

    if (!game) {
      return text(`<pre>Game ${String(gameId)} not found</pre>`, 404);
    }

    if (game.lives <= 0) {
      return gameOver();
    }

    return game;
  }

  function nextTurn(game: FakeGame): void {
    game.turn += 1;
    game.ads = adsForTurn(game.turn);
  }

  const handlers = [
    http.post(`${baseUrl}/game/start`, () => {
      const game: FakeGame = {
        gameId: `game${String(nextId++).padStart(4, '0')}`,
        lives: 3,
        gold: 0,
        level: 0,
        score: 0,
        highScore: 0,
        turn: 0,
        ads: adsForTurn(0),
        reputation: { people: 0, state: 0, underworld: 0 },
      };

      games.set(game.gameId, game);

      const { ads: _ads, reputation: _reputation, ...state } = game;

      return HttpResponse.json(state);
    }),

    http.get(`${baseUrl}/:gameId/messages`, ({ params }) => {
      const game = lookup(params.gameId);

      return game instanceof Response ? game : HttpResponse.json(game.ads);
    }),

    http.get(`${baseUrl}/:gameId/shop`, ({ params }) => {
      const game = lookup(params.gameId);

      return game instanceof Response ? game : HttpResponse.json(FAKE_SHOP);
    }),

    http.post(`${baseUrl}/:gameId/solve/:adId`, ({ params }) => {
      const game = lookup(params.gameId);

      if (game instanceof Response) {
        return game;
      }

      const ad = game.ads.find((candidate) => decodeField(candidate, candidate.adId) === params.adId);

      if (!ad) {
        return text('No ad by this ID exists', 400);
      }

      const success = solveSucceeds(ad, decodeField(ad, ad.probability));

      if (success) {
        game.gold += Number(ad.reward);
        game.score += Number(ad.reward);
      } else {
        game.lives -= 1;
      }

      nextTurn(game);

      return HttpResponse.json({
        success,
        lives: game.lives,
        gold: game.gold,
        score: game.score,
        highScore: game.highScore,
        turn: game.turn,
        message: success ? 'You successfully solved the mission!' : 'You were defeated.',
      });
    }),

    http.post(`${baseUrl}/:gameId/investigate/reputation`, ({ params }) => {
      const game = lookup(params.gameId);

      if (game instanceof Response) {
        return game;
      }

      nextTurn(game);

      return HttpResponse.json(game.reputation);
    }),

    http.post(`${baseUrl}/:gameId/shop/buy/:itemId`, ({ params }) => {
      const game = lookup(params.gameId);

      if (game instanceof Response) {
        return game;
      }

      const item = FAKE_SHOP.find((candidate) => candidate.id === params.itemId);

      if (!item) {
        return text('No item by this ID exists', 400);
      }

      const shoppingSuccess = game.gold >= item.cost;

      if (shoppingSuccess) {
        game.gold -= item.cost;

        if (item.id === HEALING_POTION_ID) {
          game.lives += 1;
        } else {
          game.level += 1;
        }
      }

      nextTurn(game);

      return HttpResponse.json({
        shoppingSuccess,
        gold: game.gold,
        lives: game.lives,
        level: game.level,
        turn: game.turn,
      });
    }),
  ];

  return {
    handlers,
    games,
    reset() {
      games.clear();
      nextId = 1;
    },
  };
}

function decodeField(ad: RawAd, value: string): string {
  if (ad.encrypted === 1) {
    return atob(value);
  }

  if (ad.encrypted === 2) {
    return rot13(value);
  }

  return value;
}

// Kept separate from src/decode.ts so the fake does not trust the code it tests.
function rot13(value: string): string {
  return value.replace(/[a-z]/gi, (char) => {
    const base = char <= 'Z' ? 65 : 97;

    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}
