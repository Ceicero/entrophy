import { definePlugin, registerPluginLocales } from '../sdk';
import { manifest } from './manifest';
import { createRolesService } from './service';

import { command as rolesCommand } from './commands/roles';
import { command as welcomeCommand } from './commands/welcome';
import { command as goodbyeCommand } from './commands/goodbye';
import { command as verifyCommand } from './commands/verify';
import { command as verificationCommand } from './commands/verification';
import { command as onboardingCommand } from './commands/onboarding';

import { panelCreateModalHandler } from './components/panel-create-modal';
import { panelToggleHandler } from './components/panel-toggle';
import { panelSelectHandler } from './components/panel-select';
import { rulesAgreeHandler } from './components/rules-agree';
import { verifyModalHandler } from './components/verify-modal';
import { verifyApproveHandler, verifyDenyHandler } from './components/verify-decision';
import { welcomeEmbedModalHandler, goodbyeEmbedModalHandler } from './components/embed-modal';

import { memberJoinHandler } from './events/member-join';
import { memberLeaveHandler } from './events/member-leave';
import { memberUpdateHandler } from './events/member-update';
import { reactionAddHandler, reactionRemoveHandler } from './events/reactions';

import { captchaPollJob } from './jobs/captcha-poll';
import { autoRoleApplyJob } from './jobs/autorole-apply';

import en from './locales/en.json';

registerPluginLocales('roles', { en });

export const plugin = definePlugin({
  manifest,
  commands: [
    rolesCommand,
    welcomeCommand,
    goodbyeCommand,
    verifyCommand,
    verificationCommand,
    onboardingCommand,
  ],
  components: [
    panelCreateModalHandler,
    panelToggleHandler,
    panelSelectHandler,
    rulesAgreeHandler,
    verifyModalHandler,
    verifyApproveHandler,
    verifyDenyHandler,
    welcomeEmbedModalHandler,
    goodbyeEmbedModalHandler,
  ],
  events: [
    memberJoinHandler,
    memberLeaveHandler,
    memberUpdateHandler,
    reactionAddHandler,
    reactionRemoveHandler,
  ],
  jobs: [captchaPollJob, autoRoleApplyJob],
  async onLoad(ctx) {
    ctx.services.register('roles', createRolesService(ctx));
  },
  async health(ctx) {
    if (!ctx.intentsEnabled.guildMembers) {
      return {
        status: 'degraded',
        details:
          'GuildMembers intent is off — welcome/goodbye, role persistence, and the account-age gate are unavailable until it is enabled.',
      };
    }
    return { status: 'ok' };
  },
});

export default plugin;
