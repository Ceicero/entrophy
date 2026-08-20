/**
 * Luhn checksum (ISO/IEC 7812-1) — used by the `credit_card` redaction pattern to tell a real payment
 * card number apart from an incidental 13-19 digit run (most notably a Discord snowflake id, which is
 * 17-19 digits and passes this check by chance only about 1 in 10 times).
 *
 * `value` may include the spaced/dashed separators the redaction regex allows between digits
 * (e.g. `'4111 1111 1111 1111'` or `'4111-1111-1111-1111'`); they're stripped before checksumming.
 */
export function isValidLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  // Real card numbers are 12-19 digits (PAN-13 through PAN-19); reject anything outside that range up
  // front so short/garbage digit runs never even reach the checksum math.
  if (digits.length < 12 || digits.length > 19) return false;

  let sum = 0;
  let doubleDigit = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48; // '0' -> 0
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }
  return sum % 10 === 0;
}
