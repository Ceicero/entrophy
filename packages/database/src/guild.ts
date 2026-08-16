import { Prisma, type Guild, type PrismaClient } from '@prisma/client';

import { defaultRetentionPolicy } from './retention';

/** Terse `{ guildId }` where-clause fragment for tenant-scoped queries, e.g. `prisma.ticket.findMany({ where: withGuild(guildId) })`. */
export function withGuild(guildId: string): { guildId: string } {
  return { guildId };
}

export interface EnsureGuildInput {
  id: string;
  name: string;
  iconHash?: string | null;
  ownerId: string;
  memberCount?: number | null;
}

/** Upserts a Guild row plus its default GuildConfig and DataRetentionPolicy; call on `guildCreate`/`ready` sync and whenever guild metadata changes. */
export async function ensureGuild(prisma: PrismaClient, input: EnsureGuildInput): Promise<Guild> {
  const guild = await prisma.guild.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      name: input.name,
      iconHash: input.iconHash ?? undefined,
      ownerId: input.ownerId,
      memberCount: input.memberCount ?? undefined,
      botPresent: true,
    },
    update: {
      name: input.name,
      iconHash: input.iconHash ?? undefined,
      ownerId: input.ownerId,
      memberCount: input.memberCount ?? undefined,
      botPresent: true,
      leftAt: null,
    },
  });

  await prisma.guildConfig.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id },
    update: {},
  });

  await prisma.dataRetentionPolicy.upsert({
    where: { guildId: guild.id },
    create: { guildId: guild.id, ...defaultRetentionPolicy },
    update: {},
  });

  return guild;
}

/** Marks a guild as left (bot removed/kicked) without deleting its data; retention/deletion is a separate, explicit flow. */
export async function markGuildLeft(prisma: PrismaClient, id: string): Promise<Guild> {
  return prisma.guild.update({
    where: { id },
    data: { botPresent: false, leftAt: new Date() },
  });
}

/**
 * Computes the next ModerationCase.caseNumber for a guild as `MAX(caseNumber) + 1`.
 *
 * RACE WINDOW: this reads the current max inside its own transaction and returns
 * before any row is inserted. node-postgres/Prisma has no portable way to take a
 * `SELECT ... FOR UPDATE`-style lock on an aggregate with zero matching rows (the
 * common case for a guild's first case), so two concurrent callers can compute the
 * same next number. Correctness is therefore NOT guaranteed by this function alone
 * — it is enforced by the `@@unique([guildId, caseNumber])` constraint on
 * ModerationCase. Callers MUST catch a unique-constraint violation (Prisma error
 * code `P2002`) on the case `create()` and retry by calling `nextCaseNumber` again.
 * `withNextCaseNumber` below implements that retry loop (3 attempts) for callers
 * that want it handled for them.
 */
export async function nextCaseNumber(prisma: PrismaClient, guildId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const agg = await tx.moderationCase.aggregate({
      where: { guildId },
      _max: { caseNumber: true },
    });
    return (agg._max.caseNumber ?? 0) + 1;
  });
}

const CASE_NUMBER_MAX_ATTEMPTS = 3;

/**
 * Fetches the next case number and calls `create(caseNumber)`, retrying up to
 * `CASE_NUMBER_MAX_ATTEMPTS` times if `create` throws a Prisma unique-constraint
 * violation (P2002) on `[guildId, caseNumber]` — see `nextCaseNumber`'s race-window
 * note. `create` is expected to insert a ModerationCase row using the given number.
 */
export async function withNextCaseNumber<T>(
  prisma: PrismaClient,
  guildId: string,
  create: (caseNumber: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CASE_NUMBER_MAX_ATTEMPTS; attempt++) {
    const caseNumber = await nextCaseNumber(prisma, guildId);
    try {
      return await create(caseNumber);
    } catch (err) {
      lastError = err;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Computes the next EnforcerRecord.recordNumber for a guild as `MAX(recordNumber) + 1`,
 * mirroring `nextCaseNumber`. Same race-window caveat: correctness is enforced by the
 * `@@unique([guildId, recordNumber])` constraint, not by this read alone. Callers MUST
 * retry on a Prisma P2002 violation the same way `withNextCaseNumber` does.
 */
export async function nextEnforcerRecordNumber(prisma: PrismaClient, guildId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const agg = await tx.enforcerRecord.aggregate({
      where: { guildId },
      _max: { recordNumber: true },
    });
    return (agg._max.recordNumber ?? 0) + 1;
  });
}
