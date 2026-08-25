import type { GameDescriptor } from './types';

/**
 * Dead by Daylight (Steam appid 381210) — the only game in v1.
 *
 * Stat keys are Steam `ISteamUserStats/GetUserStatsForGame` API names. Verified against the source of a real,
 * actively-referenced Steam-stats Discord bot (github.com/MattSchwabby/discord-dbd-bot, `src/app/main.py`,
 * which reads these exact key strings out of a live `GetUserStatsForGame` response) rather than guessed —
 * every key below appears there with a matching description. `DBD_CamperMaxScoreByCategory` in particular was
 * only kept because that cross-check confirmed it (spec: "include only if key confirmed; drop silently if
 * unsure").
 *
 * Steam omits a stat from a player's payload entirely once it is genuinely zero — `games/index.ts`'s
 * `readStat`/`curateStats` treat a missing key as 0, so every descriptor here can assume that rather than each
 * game re-implementing the fallback.
 */
export const dbd: GameDescriptor = {
  key: 'dbd',
  name: 'Dead by Daylight',
  steamAppId: 381210,
  stats: [
    { key: 'DBD_Escape', id: 'escapes', label: 'Escapes', kind: 'int' },
    { key: 'DBD_SacrificedCampers', id: 'sacrifices', label: 'Survivors sacrificed', kind: 'int' },
    { key: 'DBD_KilledCampers', id: 'kills', label: 'Survivors killed (mori)', kind: 'int' },
    { key: 'DBD_BloodwebPoints', id: 'bloodpoints', label: 'Bloodpoints earned', kind: 'int' },
    {
      key: 'DBD_GeneratorPct_float',
      id: 'generators',
      label: 'Generators repaired (equivalent)',
      kind: 'float',
    },
    { key: 'DBD_HealPct_float', id: 'heals', label: 'Survivors healed (equivalent)', kind: 'float' },
    {
      key: 'DBD_CamperMaxScoreByCategory',
      id: 'survivor-perfect-games',
      label: 'Perfect survivor games',
      kind: 'int',
    },
  ],
};
