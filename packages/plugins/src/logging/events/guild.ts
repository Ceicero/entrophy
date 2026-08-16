import type { PluginEventHandler } from '../../sdk';

export const guildUpdate: PluginEventHandler<'guildUpdate'> = {
  event: 'guildUpdate',
  guildIdOf: (_oldGuild, newGuild) => newGuild.id,
  async handler(ctx, oldGuild, newGuild) {
    const logging = ctx.services.get('logging');
    if (!logging) return;

    const changes: string[] = [];
    if (oldGuild.name !== newGuild.name) changes.push(`Name: ${oldGuild.name} → ${newGuild.name}`);
    if (oldGuild.icon !== newGuild.icon) changes.push('Icon changed');
    if (oldGuild.ownerId !== newGuild.ownerId)
      changes.push(`Owner: <@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`);
    if (oldGuild.verificationLevel !== newGuild.verificationLevel)
      changes.push(`Verification level: ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`);
    if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter)
      changes.push('Explicit content filter changed');
    if (changes.length === 0) return;

    await logging.log(newGuild.id, 'guild.update', {
      title: 'Server settings updated',
      description: changes.join('\n'),
    });
  },
};
