import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { RULE_FIELD_SPECS } from './rule-fields';
import type { AutomodRuleTypeValue } from '../schemas';

/** Builds the type-specific config modal for `/automod rule create`/`rule edit` (TASK: "then a modal for type-specific fields"). */
export function buildRuleConfigModal(params: {
  customId: string;
  title: string;
  type: AutomodRuleTypeValue;
  /** Existing config to prefill from (rule edit); omitted for create, which prefills defaults. */
  prefillConfig?: Record<string, unknown>;
}): ModalBuilder {
  const { customId, title, type, prefillConfig = {} } = params;
  const specs = RULE_FIELD_SPECS[type];

  const modal = new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45));

  for (const spec of specs) {
    const input = new TextInputBuilder()
      .setCustomId(spec.id)
      .setLabel(spec.label.slice(0, 45))
      .setStyle(spec.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(spec.required)
      .setMaxLength(spec.maxLength ?? 256);

    if (spec.placeholder) input.setPlaceholder(spec.placeholder.slice(0, 100));

    const value = spec.stringify(prefillConfig);
    if (value.length > 0) input.setValue(value.slice(0, spec.maxLength ?? 256));

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

/** Reads every field's submitted value out of a modal submit interaction, keyed by field id. */
export function readModalFieldValues(type: AutomodRuleTypeValue, interaction: { fields: { getTextInputValue: (id: string) => string } }): Record<string, string> {
  const specs = RULE_FIELD_SPECS[type];
  const values: Record<string, string> = {};
  for (const spec of specs) {
    values[spec.id] = interaction.fields.getTextInputValue(spec.id);
  }
  return values;
}
