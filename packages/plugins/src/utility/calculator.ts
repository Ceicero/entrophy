// Safe expression evaluator for `/utility calculator` — a hand-written tokenizer + recursive-descent parser
// (equivalent in power to shunting-yard) over a strict whitelist of characters, identifiers, and operators.
// Deliberately contains no `eval`/`Function`/`vm` usage: unrecognized identifiers (e.g. `process`, `require`,
// `constructor`) are rejected at parse time before any evaluation happens, so there is no code-injection surface.

export const CALCULATOR_MAX_LENGTH = 200;

/** Thrown for any invalid expression; `.message` is safe to show directly to the Discord user. */
export class CalculatorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalculatorError';
  }
}

type TokenType = 'number' | 'ident' | 'operator' | 'lparen' | 'rparen' | 'comma';

interface Token {
  type: TokenType;
  value: string;
}

const OPERATOR_CHARS = new Set(['+', '-', '*', '/', '%', '^']);
// Matches a run of digits with an optional single decimal point (no leading `+`/`-` — that's handled as a
// unary operator by the parser, and no exponent notation like `1e10` to keep the grammar unambiguous with
// the `e` constant / function names).
const NUMBER_PATTERN = /^\d+(\.\d+)?/;
const IDENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*/;

/** Tokenizes `input`, rejecting any character outside the allowed set (digits, `.`, letters, `_`, operators, parens, comma, whitespace). */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch });
      i += 1;
      continue;
    }
    if (OPERATOR_CHARS.has(ch)) {
      tokens.push({ type: 'operator', value: ch });
      i += 1;
      continue;
    }

    const rest = input.slice(i);

    const numberMatch = NUMBER_PATTERN.exec(rest);
    if (numberMatch && ch >= '0' && ch <= '9') {
      tokens.push({ type: 'number', value: numberMatch[0] });
      i += numberMatch[0].length;
      continue;
    }

    const identMatch = IDENT_PATTERN.exec(rest);
    if (identMatch) {
      tokens.push({ type: 'ident', value: identMatch[0] });
      i += identMatch[0].length;
      continue;
    }

    throw new CalculatorError(`Unexpected character "${ch}" in the expression.`);
  }
  return tokens;
}

// `Map` (not a plain object) is deliberate: a plain `{}` inherits from `Object.prototype`, so bracket-access or
// an `in` check for names like "constructor", "toString", "valueOf", or "hasOwnProperty" would resolve to real
// inherited methods instead of being rejected as unknown — quietly defeating the whitelist below. `Map` has no
// such prototype-chain lookup surface.
const CONSTANTS: ReadonlyMap<string, number> = new Map([
  ['pi', Math.PI],
  ['e', Math.E],
]);

interface FunctionSpec {
  minArgs: number;
  maxArgs: number;
  apply: (args: number[]) => number;
}

const FUNCTIONS: ReadonlyMap<string, FunctionSpec> = new Map<string, FunctionSpec>([
  ['sqrt', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.sqrt(x) }],
  ['abs', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.abs(x) }],
  ['round', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.round(x) }],
  ['floor', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.floor(x) }],
  ['ceil', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.ceil(x) }],
  ['sin', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.sin(x) }],
  ['cos', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.cos(x) }],
  ['tan', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.tan(x) }],
  ['log', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.log10(x) }],
  ['ln', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.log(x) }],
  ['exp', { minArgs: 1, maxArgs: 1, apply: ([x]) => Math.exp(x) }],
  ['min', { minArgs: 2, maxArgs: Infinity, apply: (args) => Math.min(...args) }],
  ['max', { minArgs: 2, maxArgs: Infinity, apply: (args) => Math.max(...args) }],
]);

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (!token) throw new CalculatorError('Unexpected end of expression.');
    this.pos += 1;
    return token;
  }

  private expectOperator(op: string): boolean {
    const token = this.peek();
    return !!token && token.type === 'operator' && token.value === op;
  }

  parse(): number {
    const value = this.parseAddSub();
    if (this.pos < this.tokens.length) {
      throw new CalculatorError(`Unexpected token "${this.tokens[this.pos].value}" in the expression.`);
    }
    return value;
  }

  private parseAddSub(): number {
    let value = this.parseMulDiv();
    for (;;) {
      if (this.expectOperator('+')) {
        this.next();
        value += this.parseMulDiv();
      } else if (this.expectOperator('-')) {
        this.next();
        value -= this.parseMulDiv();
      } else {
        break;
      }
    }
    return value;
  }

  private parseMulDiv(): number {
    let value = this.parseUnary();
    for (;;) {
      if (this.expectOperator('*')) {
        this.next();
        value *= this.parseUnary();
      } else if (this.expectOperator('/')) {
        this.next();
        const divisor = this.parseUnary();
        if (divisor === 0) throw new CalculatorError('Division by zero.');
        value /= divisor;
      } else if (this.expectOperator('%')) {
        this.next();
        const divisor = this.parseUnary();
        if (divisor === 0) throw new CalculatorError('Division by zero.');
        value %= divisor;
      } else {
        break;
      }
    }
    return value;
  }

  private parseUnary(): number {
    if (this.expectOperator('-')) {
      this.next();
      return -this.parseUnary();
    }
    if (this.expectOperator('+')) {
      this.next();
      return this.parseUnary();
    }
    return this.parsePow();
  }

  private parsePow(): number {
    const base = this.parseAtom();
    if (this.expectOperator('^')) {
      this.next();
      // Right-associative, and the exponent may itself start with a unary sign (e.g. `2^-2`).
      const exponent = this.parseUnary();
      return Math.pow(base, exponent);
    }
    return base;
  }

  private parseAtom(): number {
    const token = this.peek();
    if (!token) throw new CalculatorError('Unexpected end of expression.');

    if (token.type === 'number') {
      this.next();
      return Number(token.value);
    }

    if (token.type === 'lparen') {
      this.next();
      const value = this.parseAddSub();
      const closing = this.peek();
      if (!closing || closing.type !== 'rparen') {
        throw new CalculatorError('Missing closing parenthesis.');
      }
      this.next();
      return value;
    }

    if (token.type === 'ident') {
      this.next();
      const name = token.value.toLowerCase();

      if (this.peek()?.type === 'lparen') {
        this.next(); // consume '('
        const args: number[] = [];
        if (this.peek()?.type !== 'rparen') {
          args.push(this.parseAddSub());
          while (this.peek()?.type === 'comma') {
            this.next();
            args.push(this.parseAddSub());
          }
        }
        const closing = this.peek();
        if (!closing || closing.type !== 'rparen') {
          throw new CalculatorError('Missing closing parenthesis.');
        }
        this.next();

        const fn = FUNCTIONS.get(name);
        if (!fn) {
          throw new CalculatorError(`Unknown function "${name}".`);
        }
        if (args.length < fn.minArgs || args.length > fn.maxArgs) {
          const expected =
            fn.minArgs === fn.maxArgs
              ? `${fn.minArgs}`
              : `${fn.minArgs}-${fn.maxArgs === Infinity ? '∞' : fn.maxArgs}`;
          throw new CalculatorError(`"${name}" expects ${expected} argument(s), got ${args.length}.`);
        }
        return fn.apply(args);
      }

      if (CONSTANTS.has(name)) {
        return CONSTANTS.get(name) as number;
      }

      throw new CalculatorError(
        `Unknown identifier "${name}". Only known constants (pi, e) and function names are allowed.`,
      );
    }

    throw new CalculatorError(`Unexpected token "${token.value}" in the expression.`);
  }
}

/**
 * Evaluates a calculator expression string. Supports `+ - * / % ^`, parentheses, unary minus, the functions
 * `sqrt abs round floor ceil min max sin cos tan log ln exp`, and the constants `pi`/`e`. Throws
 * `CalculatorError` (safe, user-facing message) for anything invalid — including division by zero, unknown
 * identifiers (so arbitrary text like `process` or `require` is rejected, not evaluated), malformed syntax,
 * and non-finite results.
 */
export function evaluateExpression(rawInput: string): number {
  if (typeof rawInput !== 'string' || rawInput.trim().length === 0) {
    throw new CalculatorError('Please provide an expression to calculate.');
  }
  if (rawInput.length > CALCULATOR_MAX_LENGTH) {
    throw new CalculatorError(`Expression is too long (max ${CALCULATOR_MAX_LENGTH} characters).`);
  }

  const tokens = tokenize(rawInput);
  if (tokens.length === 0) {
    throw new CalculatorError('Please provide an expression to calculate.');
  }

  const parser = new Parser(tokens);
  const result = parser.parse();

  if (!Number.isFinite(result)) {
    throw new CalculatorError('The result is too large (or otherwise not a finite number) to display.');
  }

  return result;
}

/** Formats a calculator result for display: trims floating-point noise, caps decimal places. */
export function formatCalculatorResult(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  // Round to 10 significant decimal places to hide binary floating-point artifacts (e.g. 0.1 + 0.2), then
  // strip trailing zeros.
  const rounded = Number(value.toPrecision(12));
  return rounded.toString();
}
