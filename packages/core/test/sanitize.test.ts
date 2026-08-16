import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeMarkdown, sanitizeEmbedText, sanitizeFilename, stripMentions, truncate } from '../src/utils/sanitize';

describe('escapeMarkdown', () => {
  it('escapes markdown special characters', () => {
    expect(escapeMarkdown('*bold* _italic_ `code`')).toBe('\\*bold\\* \\_italic\\_ \\`code\\`');
  });

  it('leaves plain text untouched', () => {
    expect(escapeMarkdown('hello world')).toBe('hello world');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML special characters', () => {
    expect(escapeHtml(`<script>alert("x & y's")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x &amp; y&#39;s&quot;)&lt;/script&gt;',
    );
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators and reserved characters', () => {
    expect(sanitizeFilename('../../etc/passwd')).not.toMatch(/[/\\]/);
    expect(sanitizeFilename('evidence:1<2>3.png')).not.toMatch(/[:<>]/);
  });

  it('falls back to a safe default for empty/dot-only input', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('...')).not.toMatch(/^\.+/);
  });

  it('truncates to the max length', () => {
    const name = sanitizeFilename('a'.repeat(500), 50);
    expect(name.length).toBeLessThanOrEqual(50);
  });
});

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('cuts long strings and appends an ellipsis', () => {
    const result = truncate('hello world', 5);
    expect(result.length).toBe(5);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('stripMentions', () => {
  it('removes user, role, and @everyone/@here mentions', () => {
    expect(stripMentions('hey <@123456789012345678> and <@&987654321098765432>')).toBe('hey [mention] and [mention]');
    expect(stripMentions('@everyone please read this, @here too')).toBe('[mention] please read this, [mention] too');
  });

  it('leaves normal text untouched', () => {
    expect(stripMentions('no mentions here')).toBe('no mentions here');
  });
});

describe('sanitizeEmbedText', () => {
  it('strips mentions and truncates to the default 1024 limit', () => {
    const long = 'a'.repeat(2000);
    const result = sanitizeEmbedText(long);
    expect(result.length).toBe(1024);
  });
});
