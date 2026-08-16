import type { ButtonInteraction } from 'discord.js';
import { successEmbed, type ComponentHandler } from '../../sdk';
import { parseOnboardingProgress } from '../engine';
import type { RolesConfig } from '../manifest';

/** `/onboarding rules post` button: `roles:rules-agree` — records acceptance and grants `config.rulesRoleId` if configured. Any member may click. */
export const rulesAgreeHandler: ComponentHandler = {
  action: 'rules-agree',
  kind: 'button',
  ownerOnly: false,
  async handler(c) {
    const interaction = c.interaction as ButtonInteraction<'cached'>;
    const existing = await c.ctx.prisma.onboardingProgress.findUnique({ where: { guildId_userId: { guildId: c.guildId, userId: interaction.user.id } } });
    if (existing?.rulesAcceptedAt) {
      await interaction.reply({ embeds: [successEmbed("You've already agreed to the rules.")], ephemeral: true });
      return;
    }

    const progress = parseOnboardingProgress(existing?.steps);
    await c.ctx.prisma.onboardingProgress.upsert({
      where: { guildId_userId: { guildId: c.guildId, userId: interaction.user.id } },
      create: { guildId: c.guildId, userId: interaction.user.id, steps: progress as never, rulesAcceptedAt: new Date() },
      update: { rulesAcceptedAt: new Date() },
    });

    const config = await c.config<RolesConfig>();
    if (config.rulesRoleId) {
      const roles = c.ctx.services.get('roles');
      if (roles) {
        await roles.assignRoles({ guildId: c.guildId, userId: interaction.user.id, addRoleIds: [config.rulesRoleId], reason: 'Accepted server rules' }).catch(() => undefined);
      }
    }

    await c.ctx.audit({ guildId: c.guildId, actorId: interaction.user.id, actorType: 'user', action: 'onboarding.rules.accepted', targetType: 'member', targetId: interaction.user.id, source: 'bot' });

    await interaction.reply({ embeds: [successEmbed('Thanks — you have agreed to the server rules.')], ephemeral: true });
  },
};
