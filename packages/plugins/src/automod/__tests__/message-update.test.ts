import { describe, expect, it } from 'vitest';
import { isContentEdit } from '../events/message-update';

const CONTENT_ON = { messageContent: true, guildMembers: true, guildPresences: false };
const CONTENT_OFF = { messageContent: false, guildMembers: true, guildPresences: false };

function cached(content: string) {
  return { partial: false, content };
}

describe('isContentEdit', () => {
  it('is true when the text actually changed', () => {
    expect(isContentEdit(CONTENT_ON, cached('before'), cached('after'))).toBe(true);
  });

  it('is false when Discord re-sends the same text (embed unfurl, pin, flag change)', () => {
    expect(isContentEdit(CONTENT_ON, cached('same text'), cached('same text'))).toBe(false);
  });

  it('is true for an uncached old message, so an edit to an evicted message is still scanned', () => {
    // discord.js drops every message from before the last restart out of cache; a real user edit still arrives
    // with a full new message. Re-checking is safe (the claim + `reevaluation` make it idempotent) and skipping
    // it would leave "post benign text, wait for eviction, edit in a scam link" unscanned.
    expect(isContentEdit(CONTENT_ON, { partial: true, content: null }, cached('after'))).toBe(true);
  });

  it('is false for a partial new message (the shape an embed unfurl actually arrives in)', () => {
    expect(isContentEdit(CONTENT_ON, cached('before'), { partial: true, content: null })).toBe(false);
    expect(isContentEdit(CONTENT_ON, { partial: true, content: null }, { partial: true, content: null })).toBe(
      false,
    );
  });

  it('is false without the Message Content intent, where every message looks empty', () => {
    expect(isContentEdit(CONTENT_OFF, cached(''), cached(''))).toBe(false);
  });
});
