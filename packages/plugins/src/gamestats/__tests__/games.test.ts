import { describe, expect, it } from 'vitest';
import { curateStats, GAMES, allGames, getGame, getStatDef, providerStatKeys, readStat } from '../games';
import { dbd } from '../games/dbd';

describe('GAMES / getGame / allGames', () => {
  it('registers dbd under its key', () => {
    expect(getGame('dbd')).toBe(dbd);
    expect(GAMES.dbd).toBe(dbd);
  });

  it('returns undefined for an unknown game key', () => {
    expect(getGame('nonexistent-game')).toBeUndefined();
  });

  it('allGames lists every registered descriptor', () => {
    expect(allGames()).toContain(dbd);
  });
});

describe('getStatDef', () => {
  it('finds a stat by its stable id', () => {
    expect(getStatDef(dbd, 'escapes')).toEqual({ key: 'DBD_Escape', id: 'escapes', label: 'Escapes', kind: 'int' });
  });

  it('returns undefined for an unknown stat id', () => {
    expect(getStatDef(dbd, 'not-a-real-stat')).toBeUndefined();
  });
});

describe('readStat', () => {
  const statDef = dbd.stats.find((s) => s.id === 'escapes')!;

  it('reads the raw provider key value when present', () => {
    expect(readStat({ DBD_Escape: 7 }, statDef)).toBe(7);
  });

  it('treats a missing key as 0 — Steam omits zero-valued stats rather than sending explicit 0s', () => {
    expect(readStat({}, statDef)).toBe(0);
    expect(readStat({ SomeOtherStat: 99 }, statDef)).toBe(0);
  });
});

describe('curateStats', () => {
  it('keys the result by each stat\'s stable id, never the raw provider key', () => {
    const raw = { DBD_Escape: 5, DBD_SacrificedCampers: 2 };
    const curated = curateStats(dbd, raw);
    expect(curated).toEqual({
      escapes: 5,
      sacrifices: 2,
      kills: 0,
      bloodpoints: 0,
      generators: 0,
      heals: 0,
      'survivor-perfect-games': 0,
    });
  });

  it('never leaks an uncurated provider key into the result', () => {
    const raw = { DBD_Escape: 1, DBD_SomeUnlistedInternalStat: 12345 };
    const curated = curateStats(dbd, raw);
    expect(Object.keys(curated).sort()).toEqual(dbd.stats.map((s) => s.id).sort());
    expect(curated).not.toHaveProperty('DBD_SomeUnlistedInternalStat');
  });

  it('curates an entirely empty payload down to all zeros', () => {
    const curated = curateStats(dbd, {});
    for (const stat of dbd.stats) {
      expect(curated[stat.id]).toBe(0);
    }
  });
});

describe('providerStatKeys', () => {
  it('returns every provider stat key, in descriptor order, for use as getGameStats\' keepKeys', () => {
    expect(providerStatKeys(dbd)).toEqual(dbd.stats.map((s) => s.key));
    expect(providerStatKeys(dbd)).toContain('DBD_Escape');
  });
});

describe('the dbd descriptor', () => {
  it('targets the correct Steam app id', () => {
    expect(dbd.steamAppId).toBe(381210);
    expect(dbd.key).toBe('dbd');
  });

  it('has unique, non-empty stat ids and provider keys', () => {
    const ids = dbd.stats.map((s) => s.id);
    const keys = dbd.stats.map((s) => s.key);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(keys).size).toBe(keys.length);
    for (const stat of dbd.stats) {
      expect(stat.id.length).toBeGreaterThan(0);
      expect(stat.key.length).toBeGreaterThan(0);
      expect(stat.label.length).toBeGreaterThan(0);
    }
  });
});
