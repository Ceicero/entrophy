/**
 * Small, boring default list of well-known scam/phishing patterns (SPEC.md §C, TASK: "ships a small default list
 * of well-known phishing patterns (free nitro/steam gift + non-official domains, homoglyph discord domains) +
 * admin additions"). Intentionally short and conservative — false positives on a "you got banned" message are
 * worse than missing an obscure new scam domain, and admins can extend it per-guild via `blockedDomains`.
 */

/** Domain suffixes (matched against the hostname of any link found in a message) that are near-universally scam/phishing. */
export const DEFAULT_SCAM_DOMAINS: readonly string[] = [
  // Homoglyph / lookalike "discord" domains (not discord.com/discordapp.com/discord.gg).
  'dlscord.com',
  'discorb.com',
  'discordapp.net',
  'discord-nitro.com',
  'discordgift.site',
  'discord-gift.com',
  'discordnitro.gift',
  'discrod.com',
  'dicsord.com',
  // Generic steam-lookalike scam domains.
  'steamcommunlty.com',
  'steampowered.info',
  'steamcommunity.ru',
  'steamgift.pro',
  'steam-wallet.top',
];

/** Case-insensitive phrase fragments commonly used to bait clicks in scam messages. */
export const DEFAULT_SCAM_KEYWORD_PATTERNS: readonly RegExp[] = [
  /\bfree\s+nitro\b/i,
  /\bnitro\s+free\b/i,
  /\bfree\s+discord\s+nitro\b/i,
  /\bsteam\s+gift\b/i,
  /\bfree\s+steam\s+wallet\b/i,
  /\bclaim\s+your\s+(nitro|gift|reward)\b/i,
  /\byou('| ha)ve\s+won\b.{0,20}\b(nitro|steam|gift\s*card)\b/i,
];

/** Returns the registrable-ish suffix match: true if `hostname` equals or ends with `domain`. */
export function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}
