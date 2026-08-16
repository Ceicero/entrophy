import { describe, expect, it } from 'vitest';
import {
  buildHtmlTranscript,
  buildJsonTranscript,
  type TranscriptMessage,
  type TranscriptTicketMeta,
} from '../transcript';

const baseMeta: TranscriptTicketMeta = {
  number: 42,
  guildId: 'g1',
  openerId: '111111111111111111',
  subject: 'Help with billing',
  status: 'CLOSED',
  mode: 'CHANNEL',
  createdAt: '2026-01-01T00:00:00.000Z',
  closedAt: '2026-01-02T00:00:00.000Z',
  closedBy: '222222222222222222',
  closeReason: 'Resolved',
  tags: ['billing'],
  intake: null,
};

function messageWith(overrides: Partial<TranscriptMessage>): TranscriptMessage {
  return {
    id: 'm1',
    authorId: '333333333333333333',
    authorTag: 'someone',
    content: 'hello',
    createdAt: '2026-01-01T00:01:00.000Z',
    editedAt: null,
    attachments: [],
    ...overrides,
  };
}

describe('buildJsonTranscript', () => {
  it('carries the full message list and ticket metadata through untouched', () => {
    const messages = [messageWith({})];
    const result = buildJsonTranscript(baseMeta, messages);
    expect(result.ticket).toEqual(baseMeta);
    expect(result.messages).toEqual(messages);
    expect(result.messageCount).toBe(1);
    expect(typeof result.generatedAt).toBe('string');
  });
});

describe('buildHtmlTranscript — XSS escaping', () => {
  it('escapes a <script> tag in message content so it cannot execute', () => {
    const html = buildHtmlTranscript(baseMeta, [messageWith({ content: '<script>alert(1)</script>' })]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes an inline event-handler attribute payload', () => {
    const html = buildHtmlTranscript(baseMeta, [messageWith({ content: '<img src=x onerror=alert(1)>' })]);
    expect(html).not.toMatch(/<img[^>]*onerror=/i);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes a javascript: payload in the message text itself', () => {
    const html = buildHtmlTranscript(baseMeta, [
      messageWith({ content: '<a href="javascript:alert(1)">click</a>' }),
    ]);
    expect(html).not.toContain('<a href="javascript:alert(1)">');
    expect(html).toContain('&lt;a href=&quot;javascript:alert(1)&quot;&gt;');
  });

  it('neutralizes a javascript: attachment URL to a safe placeholder href', () => {
    const html = buildHtmlTranscript(baseMeta, [
      messageWith({ attachments: [{ name: 'evil.txt', url: 'javascript:alert(1)' }] }),
    ]);
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).toContain('href="#"');
  });

  it('neutralizes a data: attachment URL', () => {
    const html = buildHtmlTranscript(baseMeta, [
      messageWith({ attachments: [{ name: 'evil.html', url: 'data:text/html,<script>alert(1)</script>' }] }),
    ]);
    expect(html).not.toContain('data:text/html');
    expect(html).toContain('href="#"');
  });

  it('keeps legitimate https attachment URLs intact (escaped, not neutralized)', () => {
    const html = buildHtmlTranscript(baseMeta, [
      messageWith({ attachments: [{ name: 'file.png', url: 'https://cdn.example.com/file.png' }] }),
    ]);
    expect(html).toContain('href="https://cdn.example.com/file.png"');
  });

  it('escapes the ticket subject, tags, and close reason', () => {
    const html = buildHtmlTranscript(
      { ...baseMeta, subject: '<b>hi</b>', closeReason: '<script>x</script>', tags: ['<i>tag</i>'] },
      [],
    );
    expect(html).not.toContain('<b>hi</b>');
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('<i>tag</i>');
  });

  it('includes a strict Content-Security-Policy meta tag with no script-src allowance', () => {
    const html = buildHtmlTranscript(baseMeta, []);
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("script-src 'none'");
  });

  it('renders a placeholder for empty message content instead of an empty element', () => {
    const html = buildHtmlTranscript(baseMeta, [messageWith({ content: '' })]);
    expect(html).toContain('[no text content]');
  });

  it('renders "No messages." when the transcript has no messages', () => {
    const html = buildHtmlTranscript(baseMeta, []);
    expect(html).toContain('No messages.');
  });
});
