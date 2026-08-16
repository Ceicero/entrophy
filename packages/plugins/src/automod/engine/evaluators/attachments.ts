import type { z } from 'zod';
import type { attachmentsConfigSchema } from '../../schemas';
import { NO_MATCH, type MessageEvaluator } from '../types';

type Config = z.infer<typeof attachmentsConfigSchema>;

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase();
}

/** Flags messages with too many attachments, or attachments with a blocked file extension. Requires the Message Content intent (attachment metadata is gated behind it for non-bot-authored messages, same as content). */
export const evaluateAttachments: MessageEvaluator<Config> = async ({ message }, config) => {
  if (message.attachments.length === 0) return NO_MATCH;

  const blocked = new Set(config.blockedExtensions.map((ext) => ext.toLowerCase().replace(/^\./, '')));
  const blockedFile = message.attachments.find((a) => blocked.has(extensionOf(a.filename)));
  if (blockedFile) {
    return {
      matched: true,
      reason: `Attachment "${blockedFile.filename}" has a blocked file extension.`,
      evidence: { filename: blockedFile.filename, extension: extensionOf(blockedFile.filename) },
    };
  }

  if (config.maxAttachments !== undefined && message.attachments.length > config.maxAttachments) {
    return {
      matched: true,
      reason: `Message has ${message.attachments.length} attachments (limit ${config.maxAttachments}).`,
      evidence: { attachmentCount: message.attachments.length, maxAttachments: config.maxAttachments },
    };
  }

  return NO_MATCH;
};
