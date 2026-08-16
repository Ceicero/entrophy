// Pure SLA-breach computation for the tickets queue/detail DTOs. Deliberately duplicated (not imported) from
// `packages/plugins/src/tickets/sla.ts`'s `isSlaBreached` — same few lines of logic, kept local so the API
// doesn't reach into another plugin's internal module structure across a package boundary for one function.

export interface SlaBreachInput {
  slaDueAt: Date | null;
  firstResponseAt: Date | null;
  now?: Date;
}

/** True if a ticket has an SLA due date in the past and has not yet received a first staff response. */
export function isSlaBreached(input: SlaBreachInput): boolean {
  if (!input.slaDueAt || input.firstResponseAt) return false;
  const now = input.now ?? new Date();
  return input.slaDueAt.getTime() <= now.getTime();
}
