import {
  SlashCommandBuilder,
} from 'discord.js';
import { embedCommandOption, manageEmbedFieldsSubcommandGroup } from './options';
import { configureEmbedSubcommand } from './components';
import { embedFromEmbedModel, settingsKeyFromEmbedOption } from './helpers';
import { configureEmbedController, manageEmbedFieldsController } from './controllers';
import { EmbedConfigurationConstants } from './enums';
import { ChatInputCommand, InteractionUtils, PermLevel } from '@rhidium/core';
import { guildSettingsFromCache } from '@/database';

const ConfigureEmbedsCommand = new ChatInputCommand({
  permLevel: PermLevel.Administrator,
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setDescription('Configure embeds used throughout the bot')
    .addSubcommand((subcommand) =>
      subcommand
        .setName(EmbedConfigurationConstants.SHOW_SUBCOMMAND_NAME)
        .setDescription('Display/render an embed')
        .addIntegerOption(embedCommandOption),
    )
    .addSubcommand(configureEmbedSubcommand())
    .addSubcommandGroup(manageEmbedFieldsSubcommandGroup),
  run: async (client, interaction) => {
    const { options } = interaction;
    const subcommand = options.getSubcommand(true);
    const subcommandGroup = options.getSubcommandGroup(false);
    const embedOptionInput = options.getInteger(
      EmbedConfigurationConstants.EMBED_COMMAND_OPTION_NAME,
      true,
    );

    const guildAvailable = InteractionUtils.requireAvailableGuild(client, interaction);
    if (!guildAvailable) return;

    await ConfigureEmbedsCommand.deferReplyInternal(interaction);

    const guildSettings = await guildSettingsFromCache(interaction.guild.id);
    if (!guildSettings) {
      ConfigureEmbedsCommand.reply(
        interaction,
        client.embeds.error('Guild settings not found'),
      );
      return;
    }

    const settingKey = settingsKeyFromEmbedOption(embedOptionInput);
    const setting = guildSettings[settingKey];

    if (subcommandGroup) {
      switch (subcommandGroup) {
      case EmbedConfigurationConstants.MANAGE_FIELDS_SUBCOMMAND_NAME:
      default: {
        manageEmbedFieldsController(client, interaction, guildSettings, setting);
        break;
      }}
      return;
    }


    switch (subcommand) {
    case EmbedConfigurationConstants.CONFIGURE_SUBCOMMAND_NAME: {
      configureEmbedController(client, interaction, guildSettings);
      break;
    }

    case EmbedConfigurationConstants.SHOW_SUBCOMMAND_NAME:
    default: {
      if (setting === null) {
        ConfigureEmbedsCommand.reply(
          interaction,
          client.embeds.error('Embed not configured, nothing to show'),
        );
        return;
      }

      const embed = embedFromEmbedModel(setting);
      ConfigureEmbedsCommand.reply(interaction, { embeds: [embed] });
      break;
    }}
  },
});

export default ConfigureEmbedsCommand;
