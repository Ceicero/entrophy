/** Plain-data embed shape produced by every provider formatter — deliberately not a discord.js `EmbedBuilder`
 * so formatters stay pure and trivially unit-testable. `toEmbedBuilder` (embeds.ts) converts this to a real embed
 * right before sending. */
export interface AlertField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface AlertEmbedData {
  title: string;
  url?: string;
  description?: string;
  color?: number;
  thumbnailUrl?: string;
  imageUrl?: string;
  authorName?: string;
  authorIconUrl?: string;
  fields?: AlertField[];
  footer?: string;
}
