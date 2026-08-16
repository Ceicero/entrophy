import { describe, expect, it } from 'vitest';
import { CalculatorError, evaluateExpression, formatCalculatorResult } from '../calculator';

describe('evaluateExpression: precedence and associativity', () => {
  it('respects standard operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20);
    expect(evaluateExpression('2 * 3 + 4 * 5')).toBe(26);
  });

  it('is left-associative for + - * /', () => {
    expect(evaluateExpression('10 - 3 - 2')).toBe(5);
    expect(evaluateExpression('100 / 10 / 2')).toBe(5);
  });

  it('is right-associative for ^', () => {
    expect(evaluateExpression('2 ^ 3 ^ 2')).toBe(2 ** (3 ** 2));
  });

  it('handles unary minus, including nested and after ^', () => {
    expect(evaluateExpression('-5')).toBe(-5);
    expect(evaluateExpression('-5 + 3')).toBe(-2);
    expect(evaluateExpression('--5')).toBe(5);
    expect(evaluateExpression('2 ^ -2')).toBe(0.25);
    expect(evaluateExpression('-(2 + 3)')).toBe(-5);
  });

  it('supports the modulo operator', () => {
    expect(evaluateExpression('10 % 3')).toBe(1);
  });
});

describe('evaluateExpression: functions and constants', () => {
  it('evaluates known single-argument functions', () => {
    expect(evaluateExpression('sqrt(16)')).toBe(4);
    expect(evaluateExpression('abs(-7)')).toBe(7);
    expect(evaluateExpression('round(2.5)')).toBe(3);
    expect(evaluateExpression('floor(2.9)')).toBe(2);
    expect(evaluateExpression('ceil(2.1)')).toBe(3);
    expect(evaluateExpression('exp(0)')).toBe(1);
    expect(evaluateExpression('ln(1)')).toBe(0);
    expect(evaluateExpression('log(100)')).toBe(2);
  });

  it('evaluates trig functions', () => {
    expect(evaluateExpression('sin(0)')).toBe(0);
    expect(evaluateExpression('cos(0)')).toBe(1);
    expect(evaluateExpression('tan(0)')).toBe(0);
  });

  it('evaluates variadic min/max', () => {
    expect(evaluateExpression('min(3, 1, 2)')).toBe(1);
    expect(evaluateExpression('max(3, 1, 2, 99)')).toBe(99);
  });

  it('evaluates the pi and e constants', () => {
    expect(evaluateExpression('pi')).toBeCloseTo(Math.PI);
    expect(evaluateExpression('e')).toBeCloseTo(Math.E);
    expect(evaluateExpression('2 * pi')).toBeCloseTo(2 * Math.PI);
  });

  it('rejects a function called with the wrong number of arguments', () => {
    expect(() => evaluateExpression('sqrt(1, 2)')).toThrow(CalculatorError);
    expect(() => evaluateExpression('min(1)')).toThrow(CalculatorError);
  });
});

describe('evaluateExpression: errors', () => {
  it('rejects division by zero', () => {
    expect(() => evaluateExpression('1 / 0')).toThrow(/division by zero/i);
    expect(() => evaluateExpression('1 % 0')).toThrow(/division by zero/i);
  });

  it('rejects malformed input', () => {
    expect(() => evaluateExpression('2 +')).toThrow(CalculatorError);
    expect(() => evaluateExpression('(2 + 3')).toThrow(CalculatorError);
    expect(() => evaluateExpression('2 + + + )')).toThrow(CalculatorError);
    expect(() => evaluateExpression('')).toThrow(CalculatorError);
    expect(() => evaluateExpression('   ')).toThrow(CalculatorError);
  });

  it('rejects code-injection-style strings as unknown identifiers rather than evaluating them', () => {
    expect(() => evaluateExpression('process')).toThrow(/unknown identifier/i);
    expect(() => evaluateExpression('process.exit(1)')).toThrow(CalculatorError);
    // Quotes aren't part of the grammar at all (no string literals), so this is rejected even earlier, as an
    // unexpected character — still safely, still never evaluated.
    expect(() => evaluateExpression('require("fs")')).toThrow(CalculatorError);
    expect(() => evaluateExpression('constructor')).toThrow(/unknown identifier/i);
    expect(() => evaluateExpression('__proto__')).toThrow(/unknown identifier/i);
  });

  it('rejects disallowed characters outright', () => {
    expect(() => evaluateExpression('alert(1)')).toThrow(/unknown function/i);
    expect(() => evaluateExpression('`test`')).toThrow(CalculatorError);
    expect(() => evaluateExpression('2; 3')).toThrow(CalculatorError);
  });

  it('rejects expressions over the max length', () => {
    const long = '1+'.repeat(150) + '1';
    expect(long.length).toBeGreaterThan(200);
    expect(() => evaluateExpression(long)).toThrow(/too long/i);
  });

  it('rejects huge/non-finite results', () => {
    expect(() => evaluateExpression('10 ^ 1000')).toThrow(/too large/i);
    expect(() => evaluateExpression('9999999999 ^ 9999999999')).toThrow(/too large/i);
  });
});

describe('formatCalculatorResult', () => {
  it('formats integers without a decimal point', () => {
    expect(formatCalculatorResult(4)).toBe('4');
    expect(formatCalculatorResult(-4)).toBe('-4');
  });

  it('trims floating-point noise', () => {
    expect(formatCalculatorResult(0.1 + 0.2)).toBe('0.3');
  });
});
