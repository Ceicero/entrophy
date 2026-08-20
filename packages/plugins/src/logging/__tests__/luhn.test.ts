import { describe, expect, it } from 'vitest';
import { isValidLuhn } from '../luhn';

describe('isValidLuhn', () => {
  it('accepts real Luhn-valid test card numbers', () => {
    expect(isValidLuhn('4242424242424242')).toBe(true); // Stripe test Visa
    expect(isValidLuhn('4111111111111111')).toBe(true); // classic test Visa
    expect(isValidLuhn('5555555555554444')).toBe(true); // Mastercard test number
    expect(isValidLuhn('378282246310005')).toBe(true); // Amex test number (15 digits)
  });

  it('accepts Luhn-valid numbers with spaced or dashed separators', () => {
    expect(isValidLuhn('4242 4242 4242 4242')).toBe(true);
    expect(isValidLuhn('4242-4242-4242-4242')).toBe(true);
    expect(isValidLuhn('4111 1111 1111 1111')).toBe(true);
  });

  it('rejects real Discord snowflake ids', () => {
    // Actual ids pulled from production log lines / Discord API examples.
    expect(isValidLuhn('1539837857747832943')).toBe(false);
    expect(isValidLuhn('175928847299117063')).toBe(false);
    expect(isValidLuhn('80351110224678912')).toBe(false);
    expect(isValidLuhn('1234567890123456789')).toBe(false);
  });

  it('rejects a digit run that is one Luhn-check away from valid', () => {
    // 4242424242424241 flips the final check digit of a valid number, so it must fail.
    expect(isValidLuhn('4242424242424241')).toBe(false);
  });

  it('rejects digit runs outside the plausible card-length range', () => {
    expect(isValidLuhn('12345')).toBe(false); // too short
    expect(isValidLuhn('1'.repeat(25))).toBe(false); // too long
  });
});
