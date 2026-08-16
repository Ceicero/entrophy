import type { ComponentHandler } from '../../sdk';
import { ruleDeleteConfirmHandlers } from '../commands/rule-handlers';
import { reviewConfirmHandler, reviewFalsePositiveHandler, reviewSelectHandler } from '../commands/review-handlers';
import { ruleCreateModalHandler, ruleEditModalHandler } from './rule-modals';

export const automodComponents: ComponentHandler[] = [
  ruleCreateModalHandler,
  ruleEditModalHandler,
  ...ruleDeleteConfirmHandlers,
  reviewSelectHandler,
  reviewConfirmHandler,
  reviewFalsePositiveHandler,
];
