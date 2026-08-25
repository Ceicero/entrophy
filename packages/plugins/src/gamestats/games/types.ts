// Game descriptor framework for the `gamestats` plugin. A "game" is a Steam app id plus a curated, ordered list
// of stat definitions to fetch/display/rank on. Adding the next game means adding one descriptor file under
// `games/` and registering it in `games/index.ts`'s `GAMES` map — never touching the Steam client, service, or
// job (spec: "Built game-pluggable so the next game is a new descriptor, not a new architecture").

/** One curated stat this plugin surfaces for a game — never the provider's full stats payload (data
 *  minimization, SPEC.md "Non-negotiables"). */
export interface GameStatDef {
  /** The provider's own stat API name, e.g. `'DBD_Escape'` (Steam `ISteamUserStats/GetUserStatsForGame`). */
  key: string;
  /** Our stable slug, e.g. `'escapes'` — used as the object key in a `GameStatSnapshot.stats` JSON blob and as
   *  `/dbd leaderboard stat:` option values. Never renamed once shipped; existing stored snapshots and any
   *  saved config reference it. */
  id: string;
  /** Display label, e.g. `'Escapes'`. */
  label: string;
  /** `'float'` stats render with 1 decimal place; `'int'` stats render as whole numbers with thousands
   *  separators. See `service.ts`'s `formatStatValue`. */
  kind: 'int' | 'float';
}

export interface GameDescriptor {
  /** Stable key for this game, e.g. `'dbd'`. Stored as `GameStatSnapshot.game` and used as the game-select
   *  value wherever a command lets a member choose a game. Never renamed once shipped. */
  key: string;
  /** Display name, e.g. `'Dead by Daylight'`. */
  name: string;
  /** Steam app id backing this game's stats. */
  steamAppId: number;
  /** Curated, ordered stat list — this order is also the display order for a stat card. */
  stats: GameStatDef[];
}
