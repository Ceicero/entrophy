import { z } from 'zod';
import { paginationQuerySchema, snowflakeSchema } from '../schemas';

export const developerReportKindSchema = z.enum(['BUG', 'FEEDBACK', 'QUESTION']);
export const developerReportStatusSchema = z.enum(['OPEN', 'HANDLED']);

/** `GET /owner/developer-reports` query — filters plus the shared cursor/limit pagination params. */
export const developerReportsQuerySchema = paginationQuerySchema.extend({
  status: developerReportStatusSchema.optional(),
  kind: developerReportKindSchema.optional(),
  guildId: snowflakeSchema.optional(),
});

export const developerReportIdParamSchema = z.object({ id: z.string().min(1) });

/** `PATCH /owner/developer-reports/:id` — every field optional so status and notes can be saved independently. */
export const developerReportPatchBodySchema = z
  .object({
    status: developerReportStatusSchema,
    notes: z.string().trim().max(4000),
  })
  .partial()
  .refine((body) => body.status !== undefined || body.notes !== undefined, {
    message: 'Provide at least one of "status" or "notes".',
  });
