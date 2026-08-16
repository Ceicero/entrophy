import type { ZodFastifyInstance } from '../lib/http';
import { z } from 'zod';
import { encryptSecret } from '@entrophy/core';
import { requireGuildAccess } from '../lib/guild-access';
import { guildIdParamSchema } from '../lib/schemas';

const AI_PLUGIN_ID = 'ai' as const;

const settingsBodySchema = z
  .object({
    provider: z.string().trim().max(50).optional(),
    apiKey: z.string().trim().min(1).max(500).optional(),
    clearKey: z.boolean().optional(),
  })
  .catchall(z.unknown());

/** Strips the encrypted key out of a raw ai plugin config, replacing it with a `hasKey` boolean — the key itself is never returned. */
function toPublicAiSettings(raw: Record<string, unknown>): Record<string, unknown> {
  const { apiKeyEnc, ...rest } = raw;
  return { ...rest, hasKey: Boolean(apiKeyEnc) };
}

/** `/guilds/:guildId/ai` — AI assistant settings (provider key never round-tripped in plaintext) and usage summary (ARCHITECTURE.md §10). */
export default async function aiRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get('/:guildId/ai/settings', { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() }, async (request) => {
    const raw = await app.configStore.getConfig<Record<string, unknown>>(request.guildId!, AI_PLUGIN_ID);
    return toPublicAiSettings(raw);
  });

  app.put(
    '/:guildId/ai/settings',
    { schema: { params: guildIdParamSchema, body: settingsBodySchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const session = request.session!;
      const { apiKey, clearKey, ...rest } = request.body;

      const patch: Record<string, unknown> = { ...rest };
      if (clearKey) {
        patch.apiKeyEnc = null;
      } else if (apiKey) {
        patch.apiKeyEnc = encryptSecret(apiKey);
      }

      const updated = await app.configStore.setConfig<Record<string, unknown>>(guildId, AI_PLUGIN_ID, patch, {
        id: session.userId,
        source: 'dashboard',
      });
      return toPublicAiSettings(updated);
    },
  );

  app.get('/:guildId/ai/usage', { schema: { params: guildIdParamSchema } , preHandler: requireGuildAccess() }, async (request) => {
    const guildId = request.guildId!;
    const [totals, recent] = await Promise.all([
      app.prisma.aiUsage.aggregate({
        where: { guildId },
        _sum: { promptTokens: true, completionTokens: true },
        _count: true,
      }),
      app.prisma.aiUsage.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 25 }),
    ]);

    return {
      totalRequests: totals._count,
      totalPromptTokens: totals._sum.promptTokens ?? 0,
      totalCompletionTokens: totals._sum.completionTokens ?? 0,
      recent: recent.map((row) => ({
        id: row.id,
        userId: row.userId,
        command: row.command,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        provider: row.provider,
        model: row.model,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });
}
