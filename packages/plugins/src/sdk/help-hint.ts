/**
 * Central source of truth for the command prefix hint appended to command descriptions.
 * This ensures consistent messaging across the bot, website, and documentation.
 */

export const COMMAND_PREFIX_DISPLAY = '+';
export const HELP_COMMAND_DISPLAY = '+help';
export const HELP_HINT_SUFFIX = ' • +help';

const DISCORD_DESCRIPTION_MAX_LENGTH = 100;

/**
 * Appends the help hint to a command description, but trims if necessary to fit Discord's 100-char limit.
 * If the description already contains '+help', returns it unchanged (idempotent).
 * Word-boundary-aware: cuts at spaces, adds '…' to indicate truncation.
 */
export function withHelpHint(description: string): string {
  // If already mentions +help, don't modify it (idempotent)
  if (description.includes('+help')) {
    return description;
  }

  const withSuffix = description + HELP_HINT_SUFFIX;

  // If it fits, return it as-is
  if (withSuffix.length <= DISCORD_DESCRIPTION_MAX_LENGTH) {
    return withSuffix;
  }

  // Need to trim the description. Leave room for " • +help" (9 chars) and "…" (1 char)
  const maxDescLength = DISCORD_DESCRIPTION_MAX_LENGTH - HELP_HINT_SUFFIX.length - 1; // -1 for the ellipsis

  let trimmed = description.slice(0, maxDescLength);

  // Find the last space to cut at a word boundary
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace > 0) {
    trimmed = trimmed.slice(0, lastSpace);
  }

  return trimmed + '…' + HELP_HINT_SUFFIX;
}
