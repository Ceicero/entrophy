import type { ButtonInteraction } from 'discord.js';
import { errorEmbed, type ComponentHandler } from '../../sdk';
import { syncSuggestionMessage } from '../actions';
import { toggleSuggestionVote, type SuggestionVoteDirection } from '../service';

const voteButton: ComponentHandler = {
  action: 'sugg-vote',
  kind: 'button',
  ownerOnly: false,
  async handler(c) {
    const interaction = c.interaction as ButtonInteraction<'cached'>;
    const [suggestionId, dir] = c.args;
    if (!suggestionId || (dir !== 'up' && dir !== 'down')) {
      await interaction.reply({ embeds: [errorEmbed('Malformed vote button.')], ephemeral: true });
      return;
    }

    const suggestion = await c.ctx.prisma.suggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion || suggestion.deletedAt) {
      await interaction.reply({ embeds: [errorEmbed('This suggestion no longer exists.')], ephemeral: true });
      return;
    }

    const direction: SuggestionVoteDirection = dir === 'up' ? 1 : -1;
    const existing = await c.ctx.prisma.suggestionVote.findUnique({
      where: { suggestionId_userId: { suggestionId, userId: interaction.user.id } },
    });
    const change = toggleSuggestionVote(
      (existing?.value as SuggestionVoteDirection | undefined) ?? null,
      direction,
    );

    if (change.newValue === null) {
      await c.ctx.prisma.suggestionVote.delete({
        where: { suggestionId_userId: { suggestionId, userId: interaction.user.id } },
      });
    } else {
      await c.ctx.prisma.suggestionVote.upsert({
        where: { suggestionId_userId: { suggestionId, userId: interaction.user.id } },
        create: { suggestionId, userId: interaction.user.id, value: change.newValue },
        update: { value: change.newValue },
      });
    }

    const updated = await c.ctx.prisma.suggestion.update({
      where: { id: suggestionId },
      data: { upvotes: { increment: change.upvoteDelta }, downvotes: { increment: change.downvoteDelta } },
    });

    await interaction.deferUpdate();
    await syncSuggestionMessage(c.ctx, updated);
  },
};

export const suggestionComponents: ComponentHandler[] = [voteButton];
