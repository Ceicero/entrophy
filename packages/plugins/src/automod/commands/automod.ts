import { PermissionFlagsBits, SlashCommandBuilder, type SlashCommandSubcommandBuilder } from 'discord.js';
import { errorEmbed, type PluginCommand } from '../../sdk';
import { handleDryrun, handleStatus } from './status-handlers';
import { handleExemptAdd, handleExemptList, handleExemptRemove } from './exempt-handlers';
import { handleReview } from './review-handlers';
import {
  RULE_ACTION_CHOICES,
  RULE_TYPE_CHOICES,
  handleRuleCreate,
  handleRuleDelete,
  handleRuleEdit,
  handleRuleList,
  handleRuleTest,
  handleRuleToggle,
  handleRuleView,
  ruleAutocomplete,
} from './rule-handlers';

const EXEMPT_KIND_CHOICES = [
  { name: 'Role', value: 'role' },
  { name: 'Channel', value: 'channel' },
  { name: 'User', value: 'user' },
  { name: 'Trusted domain', value: 'domain' },
];

function ruleOption(builder: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
  return builder.addStringOption((opt) => opt.setName('rule').setDescription('The rule (start typing its name).').setRequired(true).setAutocomplete(true));
}

const data = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Automated moderation rules: spam, filters, raid detection, and the review queue.')
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommandGroup((group) =>
    group
      .setName('rule')
      .setDescription('Create, edit, and manage automod rules.')
      .addSubcommand((sub) =>
        sub
          .setName('create')
          .setDescription('Create a new automod rule (opens a form for the type-specific settings).')
          .addStringOption((opt) => opt.setName('type').setDescription('What this rule checks for.').setRequired(true).addChoices(...RULE_TYPE_CHOICES))
          .addStringOption((opt) => opt.setName('name').setDescription('A short name for this rule.').setRequired(true).setMaxLength(100))
          .addStringOption((opt) => opt.setName('action').setDescription('What to do when the rule matches.').setRequired(true).addChoices(...RULE_ACTION_CHOICES))
          .addIntegerOption((opt) => opt.setName('timeout_minutes').setDescription('Timeout length in minutes (only used when action is timeout).').setMinValue(1).setMaxValue(40320)),
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('List every automod rule.'))
      .addSubcommand((sub) => ruleOption(sub.setName('view').setDescription('View a rule\'s full configuration.')))
      .addSubcommand((sub) => ruleOption(sub.setName('edit').setDescription('Edit a rule\'s type-specific settings (opens a form).')))
      .addSubcommand((sub) => ruleOption(sub.setName('delete').setDescription('Delete a rule (asks for confirmation).')))
      .addSubcommand((sub) => ruleOption(sub.setName('toggle').setDescription('Enable/disable a rule.')))
      .addSubcommand((sub) =>
        ruleOption(sub.setName('test').setDescription('Test a rule against sample text — no action is taken.')).addStringOption((opt) =>
          opt.setName('text').setDescription('Sample message text to test.').setRequired(true).setMaxLength(1000),
        ),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('exempt')
      .setDescription('Manage a rule\'s exemptions (roles, channels, users, trusted domains).')
      .addSubcommand((sub) =>
        ruleOption(sub.setName('add').setDescription('Exempt a role/channel/user, or trust a domain, for a rule.'))
          .addStringOption((opt) => opt.setName('kind').setDescription('What kind of exemption to add.').setRequired(true).addChoices(...EXEMPT_KIND_CHOICES))
          .addRoleOption((opt) => opt.setName('role').setDescription('Role to exempt (kind: role).'))
          .addChannelOption((opt) => opt.setName('channel').setDescription('Channel to exempt (kind: channel).'))
          .addUserOption((opt) => opt.setName('user').setDescription('User to exempt (kind: user).'))
          .addStringOption((opt) => opt.setName('domain').setDescription('Domain to trust (kind: domain).').setMaxLength(253)),
      )
      .addSubcommand((sub) =>
        ruleOption(sub.setName('remove').setDescription('Remove an exemption from a rule.'))
          .addStringOption((opt) => opt.setName('kind').setDescription('What kind of exemption to remove.').setRequired(true).addChoices(...EXEMPT_KIND_CHOICES))
          .addRoleOption((opt) => opt.setName('role').setDescription('Role to un-exempt (kind: role).'))
          .addChannelOption((opt) => opt.setName('channel').setDescription('Channel to un-exempt (kind: channel).'))
          .addUserOption((opt) => opt.setName('user').setDescription('User to un-exempt (kind: user).'))
          .addStringOption((opt) => opt.setName('domain').setDescription('Domain to un-trust (kind: domain).').setMaxLength(253)),
      )
      .addSubcommand((sub) => ruleOption(sub.setName('list').setDescription('List a rule\'s exemptions.'))),
  )
  .addSubcommand((sub) =>
    sub
      .setName('dryrun')
      .setDescription('Turn guild-wide dry-run mode on or off (admin only).')
      .addStringOption((opt) =>
        opt
          .setName('state')
          .setDescription('On = log matches without acting. Off = rules take real action.')
          .setRequired(true)
          .addChoices({ name: 'On (dry run)', value: 'on' }, { name: 'Off (live)', value: 'off' }),
      ),
  )
  .addSubcommand((sub) => sub.setName('review').setDescription('Review pending automod matches (confirm or mark as false positive).'))
  .addSubcommand((sub) => sub.setName('status').setDescription('Show automod\'s current status: dry-run state, rule health, recent activity.'));

export const command: PluginCommand = {
  data,
  requirement: { staffLevel: 'helper', guildOnly: true },
  async execute(c) {
    const group = c.interaction.options.getSubcommandGroup(false);
    const sub = c.interaction.options.getSubcommand(true);

    if (group === 'rule') {
      switch (sub) {
        case 'create':
          return handleRuleCreate(c);
        case 'list':
          return handleRuleList(c);
        case 'view':
          return handleRuleView(c);
        case 'edit':
          return handleRuleEdit(c);
        case 'delete':
          return handleRuleDelete(c);
        case 'toggle':
          return handleRuleToggle(c);
        case 'test':
          return handleRuleTest(c);
      }
    }

    if (group === 'exempt') {
      switch (sub) {
        case 'add':
          return handleExemptAdd(c);
        case 'remove':
          return handleExemptRemove(c);
        case 'list':
          return handleExemptList(c);
      }
    }

    if (!group) {
      switch (sub) {
        case 'dryrun':
          return handleDryrun(c);
        case 'review':
          return handleReview(c);
        case 'status':
          return handleStatus(c);
      }
    }

    await c.interaction.reply({ embeds: [errorEmbed(c.t('errors.not_found', { thing: 'Subcommand' }))], ephemeral: true });
  },
  async autocomplete(c) {
    await ruleAutocomplete(c);
  },
};
