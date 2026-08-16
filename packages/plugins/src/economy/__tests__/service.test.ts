import { describe, expect, it } from 'vitest';
import { DAILY_COOLDOWN_MS, encodeStreakNote, formatCurrency, parseStreakFromNote, rollDaily, validateGive } from '../service';

const config = { dailyMinAmount: 50, dailyMaxAmount: 150, streakBonusPerDay: 10, streakBonusMax: 200 };

describe('rollDaily', () => {
  it('allows a first-ever claim with streak 1', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const result = rollDaily({ now, lastDailyAt: null, priorStreak: 0, config, rng: () => 0 });
    expect(result).toEqual({ ok: true, amount: 50 + 10, streak: 1 });
  });

  it('rejects a claim inside the 20h cooldown, reporting time remaining', () => {
    const now = new Date('2026-01-01T10:00:00Z');
    const lastDailyAt = new Date('2026-01-01T00:00:00Z'); // 10h ago, cooldown is 20h
    const result = rollDaily({ now, lastDailyAt, priorStreak: 3, config, rng: () => 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterMs).toBe(DAILY_COOLDOWN_MS - 10 * 60 * 60 * 1000);
  });

  it('extends the streak when claimed within 48h of the last claim', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    const lastDailyAt = new Date('2026-01-01T00:00:00Z'); // exactly 24h ago
    const result = rollDaily({ now, lastDailyAt, priorStreak: 2, config, rng: () => 0 });
    expect(result).toMatchObject({ ok: true, streak: 3 });
  });

  it('resets the streak to 1 when the last claim was more than 48h ago', () => {
    const now = new Date('2026-01-05T00:00:00Z');
    const lastDailyAt = new Date('2026-01-01T00:00:00Z'); // 4 days ago
    const result = rollDaily({ now, lastDailyAt, priorStreak: 7, config, rng: () => 0 });
    expect(result).toMatchObject({ ok: true, streak: 1 });
  });

  it('caps the streak bonus at streakBonusMax', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    const lastDailyAt = new Date('2026-01-01T00:00:00Z');
    const result = rollDaily({ now, lastDailyAt, priorStreak: 50, config, rng: () => 0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amount).toBe(config.dailyMinAmount + config.streakBonusMax);
  });

  it('uses the injected rng to pick the base amount within [min, max]', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const resultLow = rollDaily({ now, lastDailyAt: null, priorStreak: 0, config, rng: () => 0 });
    const resultHigh = rollDaily({ now, lastDailyAt: null, priorStreak: 0, config, rng: () => 0.999999 });
    expect(resultLow.ok && resultHigh.ok).toBe(true);
    if (resultLow.ok && resultHigh.ok) {
      expect(resultLow.amount).toBe(config.dailyMinAmount + config.streakBonusPerDay);
      expect(resultHigh.amount).toBe(config.dailyMaxAmount + config.streakBonusPerDay);
    }
  });

  it('allows a claim exactly at the cooldown boundary', () => {
    const lastDailyAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date(lastDailyAt.getTime() + DAILY_COOLDOWN_MS);
    const result = rollDaily({ now, lastDailyAt, priorStreak: 1, config, rng: () => 0 });
    expect(result.ok).toBe(true);
  });
});

describe('parseStreakFromNote / encodeStreakNote', () => {
  it('round-trips a streak count', () => {
    expect(parseStreakFromNote(encodeStreakNote(5))).toBe(5);
  });

  it('defaults to 0 for missing, malformed, or unrelated notes', () => {
    expect(parseStreakFromNote(null)).toBe(0);
    expect(parseStreakFromNote(undefined)).toBe(0);
    expect(parseStreakFromNote('not json')).toBe(0);
    expect(parseStreakFromNote('{}')).toBe(0);
    expect(parseStreakFromNote('{"streak":-1}')).toBe(0);
  });
});

describe('validateGive', () => {
  const giveConfig = { giveMinAmount: 1, giveMaxAmount: 1000 };

  it('rejects giving to yourself', () => {
    expect(validateGive({ amount: 10, senderBalance: 100n, config: giveConfig, targetIsSelf: true, targetIsBot: false })).toEqual({ ok: false, reason: 'self' });
  });

  it('rejects giving to a bot', () => {
    expect(validateGive({ amount: 10, senderBalance: 100n, config: giveConfig, targetIsSelf: false, targetIsBot: true })).toEqual({ ok: false, reason: 'bot' });
  });

  it('enforces the minimum amount', () => {
    expect(validateGive({ amount: 0, senderBalance: 100n, config: giveConfig, targetIsSelf: false, targetIsBot: false })).toEqual({ ok: false, reason: 'below_min' });
  });

  it('enforces the maximum amount', () => {
    expect(validateGive({ amount: 1001, senderBalance: 10_000n, config: giveConfig, targetIsSelf: false, targetIsBot: false })).toEqual({ ok: false, reason: 'above_max' });
  });

  it('enforces sufficient balance', () => {
    expect(validateGive({ amount: 50, senderBalance: 10n, config: giveConfig, targetIsSelf: false, targetIsBot: false })).toEqual({ ok: false, reason: 'insufficient_balance' });
  });

  it('allows a valid give at the exact balance', () => {
    expect(validateGive({ amount: 50, senderBalance: 50n, config: giveConfig, targetIsSelf: false, targetIsBot: false })).toEqual({ ok: true });
  });
});

describe('formatCurrency', () => {
  it('formats a bigint balance with thousands separators and a symbol', () => {
    expect(formatCurrency(1234n, '🪙')).toBe('1,234 🪙');
    expect(formatCurrency(0n, 'C')).toBe('0 C');
  });
});
