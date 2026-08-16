// STUB: replaced by the enforcer build stage (ARCHITECTURE.md §19). Only the settings-read endpoint exists for
// now, so the dashboard placeholder and other agents have a real route to call against a plugin that is
// otherwise commands-only (`enforcer/index.ts` has no routes/handlers of its own yet).
import type { ZodFastifyInstance } from '../lib/http';
import { requireGuildAccess } from '../lib/guild-access';
import { guildIdParamSchema } from '../lib/schemas';

/** `/guilds/:guildId/enforcer/*` — see ARCHITECTURE.md §19. */
export default async function enforcerRoutes(app: ZodFastifyInstance): Promise<void> {
  app.get(
    '/:guildId/enforcer/settings',
    { schema: { params: guildIdParamSchema }, preHandler: requireGuildAccess() },
    async (request) => {
      const guildId = request.guildId!;
      const config = await app.configStore.getConfig(guildId, 'enforcer');
      return { config };
    },
  );
}
