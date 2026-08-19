// Hand-written type declarations for hub-setup.mjs (see hub-setup-core.d.mts for why this exists — plain
// ESM, no build step). Keep in sync by hand whenever hub-setup.mjs's exported shapes change.
import type { ExistingChannel, ExistingRole } from './lib/hub-setup-core.d.mts';

export declare const REPO_ROOT: string;

export interface CliArgs {
  plan: string | null;
  dryRun: boolean;
  apply: boolean;
  help?: boolean;
}
export declare function parseArgs(argv: string[]): CliArgs;

export interface DiscordClient {
  getRoles(guildId: string): Promise<ExistingRole[]>;
  getChannels(guildId: string): Promise<ExistingChannel[]>;
  getBotMember(guildId: string): Promise<{ user: { id: string }; roles: string[] }>;
  getMessages(channelId: string, limit?: number): Promise<Array<{ author?: { id?: string } }>>;
  createRole(guildId: string, payload: Record<string, unknown>): Promise<{ id: string }>;
  patchRole(guildId: string, roleId: string, payload: Record<string, unknown>): Promise<unknown>;
  patchRolePositions(guildId: string, positions: Array<{ id: string; position: number }>): Promise<unknown>;
  assignRole(guildId: string, userId: string, roleId: string): Promise<unknown>;
  createChannel(guildId: string, payload: Record<string, unknown>): Promise<{ id: string }>;
  patchChannel(channelId: string, payload: Record<string, unknown>): Promise<unknown>;
  putChannelPermission(channelId: string, overwriteId: string, payload: Record<string, unknown>): Promise<unknown>;
  postMessage(channelId: string, content: string): Promise<unknown>;
}

export declare function createDiscordClient(rest: unknown): DiscordClient;

export interface HubSetupReport {
  created: string[];
  updated: string[];
  skipped: string[];
  noop: string[];
  posted: string[];
  errors: string[];
  notes: string[];
}

export interface HubSetupResult {
  report: HubSetupReport;
  idMap: {
    roles: Record<string, string>;
    channels: Record<string, string>;
    categories: Record<string, string>;
  };
}

export declare function runHubSetup(args: { plan: any; client: DiscordClient; dryRun: boolean }): Promise<HubSetupResult>;

export declare function main(argv?: string[]): Promise<void>;
