/** Product branding constants used across embeds, dashboard, and README generation. */
export const BRAND = {
  name: 'Entrophy',
  color: 0x6366f1,
  tagline: 'The modular, compliance-first Discord bot',
  docsUrl: 'https://github.com/',
} as const;

/** Discord embed field/content limits (bytes are UTF-16 code units per Discord's API docs). */
export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  total: 6000,
} as const;

/** Maximum length of a Discord component custom_id. */
export const CUSTOM_ID_MAX = 100;
