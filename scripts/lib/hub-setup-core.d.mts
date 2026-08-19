// Hand-written type declarations for hub-setup-core.mjs (a plain-JS module — workspace packages export raw
// .ts per docs/ARCHITECTURE.md §3, but this script lives outside every package and stays plain ESM so it
// runs under plain `node` with no build step; see infra/hub/README.md). TypeScript is not aware these match
// the implementation — keep this file in sync by hand whenever hub-setup-core.mjs's exported shapes change.
export declare const STAFF_ROLE_NAMES: string[];
export declare const BOT_ALWAYS_VIEW_CHANNELS: string[];
export declare const BOT_ALWAYS_PERMS: string[];
export declare const CHANNEL_TYPE_MAP: Record<'text' | 'voice' | 'announcement', number>;
export declare const ROLE_OVERWRITE_TYPE: number;
export declare const MEMBER_OVERWRITE_TYPE: number;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}
export declare function validatePlan(plan: unknown): ValidationResult;

export interface RoleSpec {
  name: string;
  color?: string;
  hoist?: boolean;
  mentionable?: boolean;
  permissions?: string[];
  assignTo?: string[];
  isPingRole?: boolean;
}
export declare function normalizePlanRoles(plan: any): RoleSpec[];

export declare function hexToInt(hex: string | undefined): number;

export interface PermissionBitfieldResult {
  value: bigint;
  unknown: string[];
}
export declare function permissionsToBitfield(names: readonly string[] | undefined): PermissionBitfieldResult;

export interface ExistingRole {
  id: string;
  name: string;
  color?: number;
  hoist?: boolean;
  mentionable?: boolean;
  permissions?: string;
  position?: number;
  tags?: Record<string, unknown>;
}

export interface PatchResult {
  patch: Record<string, unknown>;
  notes: string[];
  hasChanges: boolean;
}
export declare function diffRolePayload(existingRole: ExistingRole, spec: RoleSpec): PatchResult;

export declare function resolveRoleTarget(args: {
  spec: { name: string };
  existingRoles: ExistingRole[];
  existingIdMap: Record<string, string> | undefined;
}): ExistingRole | null;

export type RoleAction =
  | { type: 'create'; name: string; payload: Record<string, unknown> }
  | { type: 'update'; name: string; id: string; patch: Record<string, unknown> }
  | { type: 'noop'; name: string; id: string }
  | { type: 'skip_above_bot'; name: string; id: string; position: number };

export declare function planRoleActions(args: {
  specs: RoleSpec[];
  existingRoles: ExistingRole[];
  existingIdMap: Record<string, string>;
  botTopPosition: number;
}): { actions: RoleAction[]; notes: string[] };

export declare function computeRolePositions(args: {
  orderedNames: string[];
  nameToId: Record<string, string>;
  skipNames?: string[];
  botTopPosition: number;
}): { positions: Array<{ id: string; position: number }>; skipped: string[] };

export interface ExistingChannel {
  id: string;
  name: string;
  type?: number;
  parent_id?: string | null;
  position?: number;
  topic?: string | null;
  rate_limit_per_user?: number;
  tags?: Record<string, unknown>;
}

export declare function resolveCategoryTarget(args: {
  spec: { name: string };
  existingChannels: ExistingChannel[];
}): ExistingChannel | null;

export declare function computeCategoryPatch(args: { existing: ExistingChannel; position: number }): {
  patch: Record<string, unknown>;
  hasChanges: boolean;
};

export interface ChannelSpec {
  name: string;
  type?: 'text' | 'voice' | 'announcement';
  topic?: string;
  slowmode?: number;
  existingKey?: string;
  existingName?: string;
  everyone?: { deny: string[] };
  roleOnly?: string[];
  boosterOnly?: boolean;
  botNeeds?: string[];
}

export declare function resolveChannelTarget(args: {
  spec: ChannelSpec;
  existingChannels: ExistingChannel[];
  existingIdMap: Record<string, string> | undefined;
}): ExistingChannel | null;

export declare function isTrivialRename(currentName: string, desiredName: string): boolean;

export declare function computeChannelPatch(args: {
  existing: ExistingChannel;
  spec: ChannelSpec;
  categoryId: string | null;
  position: number;
  channelType: 'text' | 'voice' | 'announcement';
}): PatchResult;

export declare function computeChannelCreatePayload(args: {
  spec: ChannelSpec;
  categoryId: string | null;
  position: number;
  channelType: 'text' | 'voice' | 'announcement';
}): Record<string, unknown>;

export interface Overwrite {
  id: string;
  type: number;
  allow: string;
  deny: string;
}

export declare function computeChannelOverwrites(args: {
  spec: ChannelSpec;
  channelType: 'text' | 'voice' | 'announcement';
  roleNameToId: Record<string, string>;
  everyoneId: string;
  mutedRoleId: string | null;
  mutedDenyList: string[] | undefined;
  botUserId: string | null;
  boosterRoleId: string | null;
}): { overwrites: Overwrite[]; notes: string[] };

export declare function chunkMessage(lines: string[], options?: { maxLen?: number; joiner?: string }): string[];

export declare function hasBotPosted(
  messages: Array<{ author?: { id?: string } }> | undefined,
  botUserId: string,
): boolean;
