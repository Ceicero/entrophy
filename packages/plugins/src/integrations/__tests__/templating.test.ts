import { describe, expect, it } from 'vitest';
import { getByPath, renderDefaultPayloadPreview, renderTemplate } from '../templating';

describe('getByPath', () => {
  it('resolves a nested dot path', () => {
    expect(getByPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('returns undefined for a missing path', () => {
    expect(getByPath({ a: 1 }, 'a.b.c')).toBeUndefined();
    expect(getByPath(null, 'a.b')).toBeUndefined();
    expect(getByPath('not-an-object', 'a')).toBeUndefined();
  });
});

describe('renderTemplate', () => {
  it('fills placeholders from the payload', () => {
    const result = renderTemplate('{user.name} did {action}', { user: { name: 'Ada' }, action: 'something' });
    expect(result).toBe('Ada did something');
  });

  it('leaves an unresolved placeholder as literal text', () => {
    expect(renderTemplate('Hello {missing.path}!', { a: 1 })).toBe('Hello {missing.path}!');
  });

  it('stringifies object/array values', () => {
    expect(renderTemplate('data: {items}', { items: [1, 2] })).toBe('data: [1,2]');
  });
});

describe('renderDefaultPayloadPreview', () => {
  it('renders a fenced JSON block including the event type', () => {
    const preview = renderDefaultPayloadPreview('order.created', { id: 1 });
    expect(preview).toContain('order.created');
    expect(preview).toContain('```json');
    expect(preview).toContain('"id": 1');
  });

  it('truncates very large payloads', () => {
    const big = { text: 'x'.repeat(5000) };
    const preview = renderDefaultPayloadPreview('big.event', big);
    expect(preview.length).toBeLessThan(1200);
    expect(preview).toContain('truncated');
  });
});
