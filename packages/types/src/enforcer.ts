/** DTOs for the `enforcer` plugin (ARCHITECTURE.md §19). */

export type EnforcerPolicySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type EnforcerRecordKind = 'FLAG' | 'DECISION' | 'APPEAL_OPENED' | 'APPEAL_DECIDED' | 'NOTE';

export type EnforcerFlagStatus = 'PENDING' | 'ACTIONED' | 'DISMISSED' | 'EXPIRED';

export type EnforcerSource = 'AUTO' | 'MANUAL' | 'AI_ASSIST' | 'DASHBOARD';

export type EnforcerDecisionType = 'WARN' | 'TIMEOUT' | 'MUTE' | 'UNMUTE' | 'KICK' | 'BAN' | 'DISMISS';

export interface EnforcerMatcherDto {
  type:
    | 'keyword'
    | 'phrase'
    | 'regex'
    | 'link_domain'
    | 'invite'
    | 'mention_count'
    | 'attachment_ext'
    | 'ai_category';
  value: string | string[] | number;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export interface EnforcerPolicyDto {
  id: string;
  guildId: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: EnforcerPolicySeverity;
  matchers: EnforcerMatcherDto[];
  channelIds: string[];
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  suggestedAction: EnforcerDecisionType | null;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface EnforcerRecordDto {
  id: string;
  guildId: string;
  recordNumber: number;
  kind: EnforcerRecordKind;
  status: EnforcerFlagStatus | null;
  userId: string;
  channelId: string | null;
  messageId: string | null;
  messageJumpUrl: string | null;
  policyId: string | null;
  policyName: string | null;
  matcherSummary: string | null;
  riskScore: number | null;
  aiExplanation: string | null;
  excerpt: string | null;
  contextSnapshot: unknown;
  source: EnforcerSource;
  flaggedBy: string | null;
  decision: EnforcerDecisionType | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  durationMs: number | null;
  caseId: string | null;
  parentRecordId: string | null;
  ledgerMessageId: string | null;
  flagMessageId: string | null;
  createdAt: string;
}

export interface EnforcerSettingsDto {
  ledgerChannelId: string | null;
  ledgerVisibility: 'staff' | 'everyone';
  flagChannelId: string | null;
  muteRoleId: string | null;
  captureContext: boolean;
  contextBefore: number;
  contextAfter: number;
  excerptMaxChars: number;
  autoFlagEnabled: boolean;
  exemptStaff: boolean;
  aiAssist: boolean;
  dmOnAction: boolean;
  defaultTimeoutMinutes: number;
  defaultMuteMinutes: number | null;
  requireReasonOn: ('warn' | 'timeout' | 'mute' | 'kick' | 'ban')[];
  allowedDecisions: ('warn' | 'timeout' | 'mute' | 'kick' | 'ban' | 'dismiss')[];
  banDeleteMessageSeconds: number;
}
