import { z } from 'zod';

/** A Discord snowflake id (17-20 decimal digits). */
export const snowflakeSchema = z.string().regex(/^\d{17,20}$/, 'Must be a valid Discord snowflake id.');

/** `{ guildId }` route param shared by every guild-scoped route. */
export const guildIdParamSchema = z.object({ guildId: snowflakeSchema });

/** Opaque cursor + limit query params for cursor-paginated list endpoints. */
export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** ISO date-range query params used by analytics/audit/log search. */
export const dateRangeQuerySchema = z.object({
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
});

/** Non-empty free-text reason field, trimmed, capped at a sane length. */
export const reasonSchema = z.string().trim().min(1).max(1000);

/** Optional reason field (many moderation actions allow an empty reason). */
export const optionalReasonSchema = z.string().trim().max(1000).optional();
