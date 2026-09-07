/** Resolves parsed prefix-command tokens against a command's option schema. */
import type { Message } from 'discord.js';
import { splitNamedArg } from './parse';

export interface ResolvedOptions {
  subcommandGroup: string | null;
  subcommand: string | null;
  values: Map<string, ResolvedValue>;
}

import type { GuildMember, GuildBasedChannel, Role, Attachment } from 'discord.js';

export type ResolvedValue =
  | string
  | number
  | boolean
  | GuildMember
  | GuildBasedChannel
  | Role
  | Attachment;

interface DiscordOption {
  type: number;
  name: string;
  required?: boolean;
  description?: string;
  choices?: Array<{ name: string; value: string | number }>;
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  options?: DiscordOption[];
}

/**
 * Resolves parsed tokens against a command's option schema (from `command.data.toJSON()`).
 * Returns either a resolved set of options with any subcommand/subcommand-group details,
 * or an error with a usage string.
 */
export function resolvePrefixOptions(
  commandJson: { options?: DiscordOption[] },
  tokens: string[],
  message: Message<true>,
  commandName: string = '',
): { ok: true; resolved: ResolvedOptions } | { ok: false; usage: string; error: string } {
  const options = commandJson.options ?? [];
  let remainingTokens = [...tokens];
  let subcommandGroup: string | null = null;
  let subcommand: string | null = null;
  let leafOptions: DiscordOption[] = options;

  // Walk off subcommand group and subcommand from the front of tokens
  // Check if any option is a subcommand group
  const hasSubcommandGroup = leafOptions.some((o) => o.type === 2);
  if (hasSubcommandGroup && remainingTokens.length > 0) {
    const groupName = remainingTokens[0].toLowerCase();
    const groupDef = leafOptions.find((o) => o.type === 2 && o.name.toLowerCase() === groupName);
    if (groupDef) {
      subcommandGroup = groupDef.name;
      remainingTokens = remainingTokens.slice(1);
      leafOptions = groupDef.options ?? [];
    }
  }

  // Check if any option is a subcommand
  const hasSubcommand = leafOptions.some((o) => o.type === 1);
  if (hasSubcommand && remainingTokens.length > 0) {
    const subcmdName = remainingTokens[0].toLowerCase();
    const subcmdDef = leafOptions.find((o) => o.type === 1 && o.name.toLowerCase() === subcmdName);
    if (subcmdDef) {
      subcommand = subcmdDef.name;
      remainingTokens = remainingTokens.slice(1);
      leafOptions = subcmdDef.options ?? [];
    }
  }

  // If this level still offers subcommands, one of them must be chosen. Reaching the option binder without a
  // subcommand means `getSubcommand(true)` will throw inside the handler and the router will render a generic
  // "something went wrong" — useless to someone who simply typed `+level` and needs to be told what comes next.
  // Covers both the missing case (`+level`) and an unrecognised one (`+level bogus`).
  const pendingSubcommands = leafOptions.filter((opt) => opt.type === 1 || opt.type === 2);

  // When a command offers exactly one subcommand there is nothing to choose, so pick it rather than demanding
  // it. `/permissions` is really `/permissions audit`; over the prefix, `+permissions` should just run. Discord
  // forces the choice in the slash picker, but a message command has no picker to force it.
  if (pendingSubcommands.length === 1 && pendingSubcommands[0].type === 1) {
    const only = pendingSubcommands[0];
    subcommand = only.name;
    leafOptions = only.options ?? [];
  } else if (pendingSubcommands.length > 0) {
    const path = [commandName, subcommandGroup, subcommand].filter(Boolean).join(' ');
    const names = pendingSubcommands.map((opt) => opt.name);
    const attempted = remainingTokens[0];
    return {
      ok: false,
      usage: `${path} <${names.join(' | ')}>`,
      error: attempted
        ? `\`${attempted}\` is not a valid option for \`${path}\`. Try one of: ${names.join(', ')}.`
        : `\`${path}\` needs one of: ${names.join(', ')}.`,
    };
  }

  // Now resolve remaining tokens against leaf options (the actual command options)
  const values = new Map<string, ResolvedValue>();
  const namedArgs = new Map<string, string>();
  const positionalArgs: string[] = [];

  // Build a set of valid lowercase option names (for DEFECT 3 fix)
  const validOptionNames = new Set(leafOptions.map((o) => o.name.toLowerCase()));

  // Split tokens into named and positional
  for (const token of remainingTokens) {
    const named = splitNamedArg(token);
    // DEFECT 3 FIX: Only treat as named arg if key matches an actual option name
    if (named && validOptionNames.has(named.key)) {
      namedArgs.set(named.key, named.value);
    } else {
      positionalArgs.push(token);
    }
  }

  // Collect attachments for auto-binding (DEFECT 2 fix)
  const availableAttachments = Array.from(message.attachments.values());
  let attachmentIndex = 0;

  // Bind arguments to options
  let positionalIndex = 0;
  for (let i = 0; i < leafOptions.length; i++) {
    const opt = leafOptions[i];
    if (!opt) continue;

    const name = opt.name;
    const required = opt.required ?? false;

    // Handle attachment auto-binding (DEFECT 2 fix)
    if (opt.type === 11) {
      // Attachment type
      if (attachmentIndex < availableAttachments.length) {
        values.set(name, availableAttachments[attachmentIndex]);
        attachmentIndex += 1;
      } else if (required) {
        const usage = buildUsageString(commandName, leafOptions, subcommandGroup, subcommand);
        return {
          ok: false,
          usage,
          error: `\`${name}\` is required — attach a file to your message.`,
        };
      }
      continue;
    }

    // Try named arg first
    let rawValue = namedArgs.get(name.toLowerCase());

    // If not found and this is positional, consume from positional args
    if (rawValue === undefined && positionalIndex < positionalArgs.length) {
      // The LAST String option consumes all remaining positional args
      const isLastStringOption =
        opt.type === 3 && !leafOptions.slice(i + 1).some((o) => o.type === 3);
      if (isLastStringOption) {
        rawValue = positionalArgs.slice(positionalIndex).join(' ');
        positionalIndex = positionalArgs.length;
      } else {
        rawValue = positionalArgs[positionalIndex];
        positionalIndex += 1;
      }
    }

    // Validate and resolve
    if (rawValue === undefined) {
      if (required) {
        const usage = buildUsageString(commandName, leafOptions, subcommandGroup, subcommand);
        return {
          ok: false,
          usage,
          error: `Missing required option: \`${name}\`.`,
        };
      }
      continue;
    }

    try {
      const resolved = resolveOptionValue(rawValue, opt, message);
      values.set(name, resolved);
    } catch (err) {
      const usage = buildUsageString(commandName, leafOptions, subcommandGroup, subcommand);
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        usage,
        error: errorMsg,
      };
    }
  }

  return {
    ok: true,
    resolved: { subcommandGroup, subcommand, values },
  };
}

/**
 * Resolves a single option value according to its Discord type.
 * Discord type numbers: 1 Subcommand, 2 SubcommandGroup, 3 String, 4 Integer,
 * 5 Boolean, 6 User, 7 Channel, 8 Role, 9 Mentionable, 10 Number, 11 Attachment.
 */
function resolveOptionValue(rawValue: string, option: DiscordOption, message: Message<true>): ResolvedValue {
  const type = option.type;
  const name = option.name;

  switch (type) {
    case 3: {
      // String
      if (option.min_length && rawValue.length < option.min_length) {
        throw new Error(`\`${name}\` must be at least ${option.min_length} character(s).`);
      }
      if (option.max_length && rawValue.length > option.max_length) {
        throw new Error(`\`${name}\` must be at most ${option.max_length} character(s).`);
      }
      if (option.choices && option.choices.length > 0) {
        // DEFECT 4 FIX: Match against both name and value, case-insensitively
        const choice = option.choices.find(
          (c) =>
            String(c.value).toLowerCase() === rawValue.toLowerCase() ||
            c.name.toLowerCase() === rawValue.toLowerCase(),
        );
        if (!choice) {
          const validChoices = option.choices.map((c) => `\`${c.name}\``).join(', ');
          throw new Error(`\`${name}\` must be one of: ${validChoices}.`);
        }
        return String(choice.value);
      }
      return rawValue;
    }

    case 4: {
      // Integer
      const intVal = Number.parseInt(rawValue, 10);
      if (Number.isNaN(intVal)) {
        throw new Error(`\`${name}\` must be an integer.`);
      }
      if (option.min_value !== undefined && intVal < option.min_value) {
        throw new Error(`\`${name}\` must be at least ${option.min_value}.`);
      }
      if (option.max_value !== undefined && intVal > option.max_value) {
        throw new Error(`\`${name}\` must be at most ${option.max_value}.`);
      }
      return intVal;
    }

    case 10: {
      // Number
      const numVal = Number.parseFloat(rawValue);
      if (Number.isNaN(numVal)) {
        throw new Error(`\`${name}\` must be a number.`);
      }
      if (option.min_value !== undefined && numVal < option.min_value) {
        throw new Error(`\`${name}\` must be at least ${option.min_value}.`);
      }
      if (option.max_value !== undefined && numVal > option.max_value) {
        throw new Error(`\`${name}\` must be at most ${option.max_value}.`);
      }
      return numVal;
    }

    case 5: {
      // Boolean
      const boolVal = resolveBooleanValue(rawValue);
      if (boolVal === null) {
        throw new Error(`\`${name}\` must be true/false, yes/no, on/off, or 1/0.`);
      }
      return boolVal;
    }

    case 6:
      // User
      return resolveUser(rawValue, message);

    case 7:
      // Channel
      return resolveChannel(rawValue, message);

    case 8:
      // Role
      return resolveRole(rawValue, message);

    case 9: {
      // Mentionable
      try {
        return resolveUser(rawValue, message);
      } catch {
        return resolveRole(rawValue, message);
      }
    }

    case 11:
      // Attachment
      return resolveAttachment(rawValue, message);

    default:
      throw new Error(`Unknown option type: ${type}`);
  }
}

function resolveBooleanValue(value: string): boolean | null {
  const lower = value.toLowerCase();
  if (['true', 'yes', 'on', '1'].includes(lower)) return true;
  if (['false', 'no', 'off', '0'].includes(lower)) return false;
  return null;
}

function resolveUser(value: string, message: Message<true>): GuildMember {
  // Try mention: <@123> or <@!123>
  const mentionMatch = value.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    const userId = mentionMatch[1];
    const member = message.guild.members.cache.get(userId);
    if (member) {
      return member;
    }
    throw new Error(`User <@${userId}> not found in this server.`);
  }

  // Try raw snowflake
  if (/^\d{17,19}$/.test(value)) {
    const member = message.guild.members.cache.get(value);
    if (member) {
      return member;
    }
    throw new Error(`User with ID ${value} not found in this server.`);
  }

  // Try exact username or nickname
  const member = message.guild.members.cache.find(
    (m) => m.user.username === value || m.displayName === value,
  );
  if (member) {
    return member;
  }

  throw new Error(`User \`${value}\` not found. Use a mention, ID, or exact username.`);
}

function resolveChannel(value: string, message: Message<true>): GuildBasedChannel {
  // Try mention: <#123>
  const mentionMatch = value.match(/^<#(\d+)>$/);
  if (mentionMatch) {
    const channelId = mentionMatch[1];
    const channel = message.guild.channels.cache.get(channelId);
    if (channel) {
      return channel;
    }
    throw new Error(`Channel <#${channelId}> not found in this server.`);
  }

  // Try raw snowflake
  if (/^\d{17,19}$/.test(value)) {
    const channel = message.guild.channels.cache.get(value);
    if (channel) {
      return channel;
    }
    throw new Error(`Channel with ID ${value} not found in this server.`);
  }

  // Try exact name
  const channel = message.guild.channels.cache.find((c) => c.name === value);
  if (channel) {
    return channel;
  }

  throw new Error(`Channel \`${value}\` not found. Use a mention, ID, or exact name.`);
}

function resolveRole(value: string, message: Message<true>): Role {
  // Try mention: <@&123>
  const mentionMatch = value.match(/^<@&(\d+)>$/);
  if (mentionMatch) {
    const roleId = mentionMatch[1];
    const role = message.guild.roles.cache.get(roleId);
    if (role) {
      return role;
    }
    throw new Error(`Role <@&${roleId}> not found in this server.`);
  }

  // Try raw snowflake
  if (/^\d{17,19}$/.test(value)) {
    const role = message.guild.roles.cache.get(value);
    if (role) {
      return role;
    }
    throw new Error(`Role with ID ${value} not found in this server.`);
  }

  // Try exact name
  const role = message.guild.roles.cache.find((r) => r.name === value);
  if (role) {
    return role;
  }

  throw new Error(`Role \`${value}\` not found. Use a mention, ID, or exact name.`);
}

function resolveAttachment(value: string, message: Message<true>): Attachment {
  // Note: This function should not be called directly with rawValue.
  // Attachments are auto-bound in resolvePrefixOptions and this should not be called.
  throw new Error('Attachment resolution should not be called with a token value. Use auto-binding instead.');
}

/**
 * Builds a human-readable usage string from the option schema.
 * E.g. `+mod ban <user> <reason> [days]` (required in `<>`, optional in `[]`).
 */
function buildUsageString(
  commandName: string,
  options: DiscordOption[],
  subcommandGroup: string | null,
  subcommand: string | null,
): string {
  let usage = commandName;

  if (subcommandGroup) {
    usage += ` ${subcommandGroup}`;
  }
  if (subcommand) {
    usage += ` ${subcommand}`;
  }

  for (const opt of options) {
    if (opt.type === 1 || opt.type === 2) continue; // Skip subcommands

    const bracket = opt.required ? '<' : '[';
    const closeBracket = opt.required ? '>' : ']';
    usage += ` ${bracket}${opt.name}${closeBracket}`;
  }

  return usage.trim();
}
