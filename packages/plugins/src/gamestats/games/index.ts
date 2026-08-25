import { dbd } from './dbd';
import type { GameDescriptor, GameStatDef } from './types';

export type { GameDescriptor, GameStatDef } from './types';

/** Every supported game, keyed by its stable `key`. Add the next game here (and nowhere else in the
 *  framework) once its descriptor file exists. */
export const GAMES: Record<string, GameDescriptor> = {
  [dbd.key]: dbd,
};

export function getGame(key: string): GameDescriptor | undefined {
  return GAMES[key];
}

export function allGames(): GameDescriptor[] {
  return Object.values(GAMES);
}

export function getStatDef(game: GameDescriptor, statId: string): GameStatDef | undefined {
  return game.stats.find((s) => s.id === statId);
}

/** A stat key missing from a player's raw Steam payload means Steam considers it genuinely zero (Steam omits
 *  zero-valued stats rather than sending explicit `0`s) — this is never treated as an error. */
export function readStat(raw: Record<string, number>, stat: GameStatDef): number {
  return raw[stat.key] ?? 0;
}

/** Curates a raw provider stats payload down to exactly the descriptor's stat ids — the only shape ever
 *  persisted to `GameStatSnapshot.stats` (data minimization, SPEC.md "Non-negotiables": "never the full Steam
 *  payload"). Keyed by each stat's stable `id`, not its provider `key`, so a future provider swap for the same
 *  game never changes what's stored. */
export function curateStats(game: GameDescriptor, raw: Record<string, number>): Record<string, number> {
  const curated: Record<string, number> = {};
  for (const stat of game.stats) {
    curated[stat.id] = readStat(raw, stat);
  }
  return curated;
}

/** This descriptor's provider stat keys (e.g. `'DBD_Escape'`), in descriptor order — every `steam.ts` caller
 *  passes this as `getGameStats`'s `keepKeys` option so the raw Steam payload is curated down before it is ever
 *  cached or returned, never after (data minimization, same reasoning as `curateStats`). */
export function providerStatKeys(game: GameDescriptor): string[] {
  return game.stats.map((stat) => stat.key);
}
