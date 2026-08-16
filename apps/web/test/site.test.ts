import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inviteUrl } from '../src/lib/site';

const ADMINISTRATOR_BIT = 8n; // 1 << 3

describe('inviteUrl', () => {
  const originalClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const originalPermissions = process.env.NEXT_PUBLIC_INVITE_PERMISSIONS;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = '123456789012345678';
  });

  afterEach(() => {
    if (originalClientId === undefined) delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    else process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID = originalClientId;
    if (originalPermissions === undefined) delete process.env.NEXT_PUBLIC_INVITE_PERMISSIONS;
    else process.env.NEXT_PUBLIC_INVITE_PERMISSIONS = originalPermissions;
  });

  it('returns null when no client id is configured', () => {
    delete process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    expect(inviteUrl()).toBeNull();
  });

  it('never includes Administrator using the default (checked-in) permissions', () => {
    delete process.env.NEXT_PUBLIC_INVITE_PERMISSIONS;
    const url = inviteUrl();
    expect(url).not.toBeNull();
    const permissions = BigInt(new URL(url!).searchParams.get('permissions')!);
    expect(permissions & ADMINISTRATOR_BIT).toBe(0n);
  });

  it('strips Administrator even if the env override explicitly includes it', () => {
    // 8 = Administrator only; 1032 = Administrator (8) | ManageGuild (32) | ViewChannel (1024)... any bitfield
    // that includes bit 3.
    process.env.NEXT_PUBLIC_INVITE_PERMISSIONS = '8';
    const url = inviteUrl();
    const permissions = BigInt(new URL(url!).searchParams.get('permissions')!);
    expect(permissions & ADMINISTRATOR_BIT).toBe(0n);
  });

  it('falls back to the safe default when the env override is not a valid integer', () => {
    process.env.NEXT_PUBLIC_INVITE_PERMISSIONS = 'not-a-number';
    const url = inviteUrl();
    expect(url).not.toBeNull();
    const permissions = BigInt(new URL(url!).searchParams.get('permissions')!);
    expect(permissions & ADMINISTRATOR_BIT).toBe(0n);
  });
});
