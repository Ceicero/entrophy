import type { ButtonInteraction } from 'discord.js';
import { errorEmbed, successEmbed, type ComponentHandler } from '../../sdk';
import { refreshEventMessage } from '../actions';
import type { RsvpStatus } from '../service';

const RSVP_ARG_TO_STATUS: Record<string, RsvpStatus> = {
  going: 'GOING',
  maybe: 'MAYBE',
  declined: 'DECLINED',
};

const rsvpButton: ComponentHandler = {
  action: 'rsvp',
  kind: 'button',
  ownerOnly: false,
  async handler(c) {
    const interaction = c.interaction as ButtonInteraction<'cached'>;
    const [eventId, statusArg] = c.args;
    const status = statusArg ? RSVP_ARG_TO_STATUS[statusArg] : undefined;
    if (!eventId || !status) {
      await interaction.reply({ embeds: [errorEmbed('Malformed RSVP button.')], ephemeral: true });
      return;
    }

    const event = await c.ctx.prisma.communityEvent.findUnique({ where: { id: eventId } });
    if (!event) {
      await interaction.reply({ embeds: [errorEmbed('This event no longer exists.')], ephemeral: true });
      return;
    }
    if (event.startsAt.getTime() <= Date.now()) {
      await interaction.reply({ embeds: [errorEmbed('This event has already started.')], ephemeral: true });
      return;
    }

    await c.ctx.prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId: interaction.user.id } },
      create: { eventId, userId: interaction.user.id, status },
      update: { status },
    });

    await interaction.reply({
      embeds: [
        successEmbed(
          `RSVP recorded: **${status === 'GOING' ? 'Going' : status === 'MAYBE' ? 'Maybe' : "Can't go"}**.`,
        ),
      ],
      ephemeral: true,
    });
    await refreshEventMessage(c.ctx, event);
  },
};

export const eventComponents: ComponentHandler[] = [rsvpButton];
