import { describe, expect, it, vi } from 'vitest';
import { OverwriteType, type TextChannel } from 'discord.js';
import { applyFlagQueueOverwrites, applyLedgerOverwrites } from '../channels';

type EditMock = ReturnType<typeof makeChannel>['edit'];

function makeChannel() {
  const edit = vi.fn(async (..._args: unknown[]) => undefined);
  const set = vi.fn(async (..._args: unknown[]) => undefined);
  const channel = {
    id: 'chan-1',
    guild: { roles: { everyone: { id: 'everyone-1' } }, members: { me: { id: 'bot-1' } } },
    permissionOverwrites: { edit, set },
  } as unknown as TextChannel;
  return { channel, edit, set };
}

function callFor(edit: EditMock, targetId: string): unknown[] | undefined {
  return edit.mock.calls.find((args) => args[0] === targetId);
}

function optionsFor(edit: EditMock, targetId: string): Record<string, boolean | null> {
  return (callFor(edit, targetId)?.[1] ?? {}) as Record<string, boolean | null>;
}

function extrasFor(edit: EditMock, targetId: string): { reason?: string; type?: OverwriteType } {
  return (callFor(edit, targetId)?.[2] ?? {}) as { reason?: string; type?: OverwriteType };
}

describe('applyLedgerOverwrites / applyFlagQueueOverwrites — non-destructive', () => {
  it('never calls permissionOverwrites.set on the ledger channel — set() replaces the whole list and would wipe unrelated access an admin configured there', async () => {
    const { channel, edit, set } = makeChannel();

    await applyLedgerOverwrites(channel, 'staff', ['staff-1']);

    expect(set).not.toHaveBeenCalled();
    expect(callFor(edit, 'everyone-1')).toBeDefined();
    expect(callFor(edit, 'staff-1')).toBeDefined();
    expect(callFor(edit, 'bot-1')).toBeDefined();
  });

  it('never calls permissionOverwrites.set on the flag-queue channel either', async () => {
    const { channel, edit, set } = makeChannel();

    await applyFlagQueueOverwrites(channel, ['staff-1']);

    expect(set).not.toHaveBeenCalled();
    expect(callFor(edit, 'everyone-1')).toBeDefined();
  });

  it('edits only the targets Enforcer owns: each configured staff role, the bot, and @everyone', async () => {
    const { channel, edit } = makeChannel();

    await applyFlagQueueOverwrites(channel, ['staff-1', 'staff-2', 'staff-1']);

    // Duplicated ids are de-duplicated, and nothing outside these four targets is touched.
    expect(edit.mock.calls.map((args) => args[0])).toEqual(['staff-1', 'staff-2', 'bot-1', 'everyone-1']);
  });

  it('restricts @everyone only after granting staff and the bot, so a mid-way API failure cannot leave the channel hidden from everyone who needs it', async () => {
    const { channel, edit } = makeChannel();
    // Second call (the bot's grant) blows up, as a stale role id or a transient 5xx would.
    edit.mockImplementationOnce(async () => undefined).mockRejectedValueOnce(new Error('Discord API down'));

    await expect(applyLedgerOverwrites(channel, 'staff', ['staff-1'])).rejects.toThrow(/Discord API down/);

    // The staff grant landed; the @everyone deny was never reached.
    expect(edit.mock.calls.map((args) => args[0])).toEqual(['staff-1', 'bot-1']);
    expect(callFor(edit, 'everyone-1')).toBeUndefined();
  });
});

describe('applyLedgerOverwrites — permission payloads', () => {
  it('denies posting for @everyone and hides the channel when visibility is staff-only', async () => {
    const { channel, edit } = makeChannel();

    await applyLedgerOverwrites(channel, 'staff', []);

    expect(optionsFor(edit, 'everyone-1')).toEqual({
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      AddReactions: false,
      ViewChannel: false,
    });
  });

  it('clears the ViewChannel deny with null (not by omitting it) in transparency mode, so switching back from staff-only actually un-hides the ledger', async () => {
    const { channel, edit } = makeChannel();

    await applyLedgerOverwrites(channel, 'everyone', []);

    expect(optionsFor(edit, 'everyone-1').ViewChannel).toBeNull();
  });

  it('grants staff roles read access as a Role overwrite and the bot its posting access as a Member overwrite', async () => {
    const { channel, edit } = makeChannel();

    await applyLedgerOverwrites(channel, 'staff', ['staff-1']);

    expect(optionsFor(edit, 'staff-1')).toEqual({ ViewChannel: true, ReadMessageHistory: true });
    expect(extrasFor(edit, 'staff-1')).toEqual({
      reason: 'Enforcer: ledger channel overwrites',
      type: OverwriteType.Role,
    });
    expect(optionsFor(edit, 'bot-1')).toEqual({
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
      ReadMessageHistory: true,
    });
    expect(extrasFor(edit, 'bot-1').type).toBe(OverwriteType.Member);
  });
});

describe('applyFlagQueueOverwrites — permission payloads', () => {
  it('hides the queue from @everyone and lets staff roles read and post in it', async () => {
    const { channel, edit } = makeChannel();

    await applyFlagQueueOverwrites(channel, ['staff-1']);

    expect(optionsFor(edit, 'everyone-1')).toEqual({ ViewChannel: false });
    expect(optionsFor(edit, 'staff-1')).toEqual({
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    expect(extrasFor(edit, 'everyone-1').reason).toBe('Enforcer: flag-queue channel overwrites');
  });
});
