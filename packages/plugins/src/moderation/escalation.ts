import type { EscalationRule } from './manifest';

/**
 * Picks the escalation rule (if any) that should fire for a member who now has `activeWarningCount` active
 * warnings, given the guild's configured ladder. Fires on an exact threshold match only — so re-warning past a
 * rung doesn't re-trigger it every time, only the run where the count first reaches that rung. When multiple
 * rules share the same `warnings` value (a misconfiguration), the most severe action wins (ban > kick > timeout).
 */
const ACTION_SEVERITY: Record<EscalationRule['action'], number> = { timeout: 0, kick: 1, ban: 2 };

export function evaluateEscalation(
  activeWarningCount: number,
  escalations: EscalationRule[],
): EscalationRule | null {
  const matches = escalations.filter((rule) => rule.warnings === activeWarningCount);
  if (matches.length === 0) return null;
  return matches.reduce((best, rule) =>
    ACTION_SEVERITY[rule.action] > ACTION_SEVERITY[best.action] ? rule : best,
  );
}
