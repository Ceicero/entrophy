import type { PluginContext } from '../../sdk';
import { ModerationServiceImpl } from '../service';

/**
 * Returns this plugin's own concrete service implementation. `ctx.services.require('moderation')` is typed as
 * the cross-plugin `ModerationService` interface (sdk/services.ts) — command/component handlers inside this
 * same plugin know the concrete class was registered in `onLoad` and use the wider surface (kick/ban/purge/...)
 * that isn't part of the cross-plugin contract.
 */
export function moderationService(ctx: PluginContext): ModerationServiceImpl {
  return ctx.services.require('moderation') as ModerationServiceImpl;
}

/** Reads the core `GuildConfig.fastActions` toggle (owned by `admin`, read via the shared `host` service). */
export async function getFastActions(ctx: PluginContext, guildId: string): Promise<boolean> {
  const host = ctx.services.get('host');
  if (!host) return false;
  const guildConfig = await host.getGuildConfig(guildId);
  return guildConfig.fastActions;
}
