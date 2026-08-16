// Pure, unit-tested: the reopen-window check shared by the `/ticket reopen` command and the reopen button.

/** True if a ticket closed at `closedAt` is still within its guild's configured reopen window. */
export function isWithinReopenWindow(closedAt: Date | string, reopenWindowHours: number, now: Date = new Date()): boolean {
  if (reopenWindowHours <= 0) return false;
  const closed = typeof closedAt === 'string' ? new Date(closedAt) : closedAt;
  return now.getTime() - closed.getTime() <= reopenWindowHours * 3_600_000;
}
