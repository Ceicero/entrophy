import type { ComponentHandler } from '../../sdk';
import { handleRuleCreateModalSubmit, handleRuleEditModalSubmit } from '../commands/rule-handlers';

export const ruleCreateModalHandler: ComponentHandler = {
  action: 'rule-create-modal',
  kind: 'modal',
  ownerOnly: true,
  async handler(c) {
    const [, pendingId] = c.args;
    if (!pendingId) return;
    await handleRuleCreateModalSubmit(c, pendingId);
  },
};

export const ruleEditModalHandler: ComponentHandler = {
  action: 'rule-edit-modal',
  kind: 'modal',
  ownerOnly: true,
  requirement: { staffLevel: 'moderator' },
  async handler(c) {
    const [, ruleId] = c.args;
    if (!ruleId) return;
    await handleRuleEditModalSubmit(c, ruleId);
  },
};
