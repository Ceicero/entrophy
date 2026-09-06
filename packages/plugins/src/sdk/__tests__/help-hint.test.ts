import { describe, expect, it } from 'vitest';
import { HELP_COMMAND_DISPLAY, HELP_HINT_SUFFIX, withHelpHint } from '../help-hint';

describe('withHelpHint', () => {
  it('appends the hint to a short description', () => {
    const description = 'Get help with commands';
    const result = withHelpHint(description);
    expect(result).toBe(description + HELP_HINT_SUFFIX);
    expect(result).toContain(HELP_COMMAND_DISPLAY);
  });

  it('keeps result under 100 characters when description is short', () => {
    const description = 'A brief command description';
    const result = withHelpHint(description);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('trims a long description to fit within 100 characters including hint', () => {
    // 88 chars + 12 for " • +help" = 100 chars exactly
    const description = 'This is a very long command description that should be trimmed to make room for the help hint suffix';
    const result = withHelpHint(description);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toContain('…');
    expect(result).toContain(HELP_COMMAND_DISPLAY);
  });

  it('cuts at word boundaries when trimming', () => {
    // A 99-char description that needs trimming to fit the hint
    const description = 'Ask the AI assistant to suggest options for a moderation case (staff only — never acts on its own).';
    const result = withHelpHint(description);
    expect(result.length).toBeLessThanOrEqual(100);
    // Should end with "…" not cut mid-word
    expect(result).toMatch(/[^\s]…/);
    expect(result).toContain(HELP_COMMAND_DISPLAY);
  });

  it('is idempotent when +help is already mentioned', () => {
    const description = 'Type +help to get started';
    const result = withHelpHint(description);
    expect(result).toBe(description);
  });

  it('does not double-append the hint when re-applied', () => {
    const description = 'Get started with this command';
    const first = withHelpHint(description);
    const second = withHelpHint(first);
    expect(first).toBe(second);
  });

  it('handles descriptions already at or near the limit', () => {
    // Exactly 88 chars to leave room for the hint
    const description = 'A' + 'b'.repeat(87);
    const result = withHelpHint(description);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toContain(HELP_COMMAND_DISPLAY);
  });
});
