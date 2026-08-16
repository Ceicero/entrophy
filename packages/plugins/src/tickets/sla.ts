// Pure, unit-tested: SLA due-date computation and breach detection.

/** Computes when a ticket's SLA is due, or `null` if no SLA minutes are configured. */
export function computeSlaDueAt(openedAt: Date, slaMinutes: number | null | undefined): Date | null {
  if (slaMinutes === null || slaMinutes === undefined) return null;
  return new Date(openedAt.getTime() + slaMinutes * 60_000);
}

export interface SlaBreachInput {
  slaDueAt: Date | string | null;
  firstResponseAt: Date | string | null;
  now?: Date;
}

/** True if a ticket has an SLA due date in the past and has not yet received a first staff response. */
export function isSlaBreached(input: SlaBreachInput): boolean {
  if (!input.slaDueAt || input.firstResponseAt) return false;
  const due = typeof input.slaDueAt === 'string' ? new Date(input.slaDueAt) : input.slaDueAt;
  const now = input.now ?? new Date();
  return due.getTime() <= now.getTime();
}
