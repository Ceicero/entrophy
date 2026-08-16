import { Client, Partials, type GatewayIntentBits } from 'discord.js';

/**
 * Builds the single Discord gateway client for this process, with the partials needed for events on
 * uncached entities (DM channels, edited/deleted messages, reactions, members, users) to still fire.
 */
export function createClient(intents: GatewayIntentBits[]): Client {
  return new Client({
    intents,
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember, Partials.User],
  });
}
