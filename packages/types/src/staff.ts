/** Ordered staff privilege levels, from least to most privileged. */
export type StaffLevel = 'member' | 'helper' | 'moderator' | 'admin' | 'owner';

/** All staff levels in ascending rank order (index 0 = lowest privilege). */
export const STAFF_LEVELS: readonly StaffLevel[] = [
  'member',
  'helper',
  'moderator',
  'admin',
  'owner',
] as const;

/** Maps each staff level to its numeric rank; higher rank = more privileged. */
export const STAFF_LEVEL_RANK: Record<StaffLevel, number> = {
  member: 0,
  helper: 1,
  moderator: 2,
  admin: 3,
  owner: 4,
};
