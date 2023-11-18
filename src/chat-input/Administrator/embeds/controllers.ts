import ConfigureEmbedsCommand from '.';
import { configureEmbedOptions } from './options';
import {
  configureEmbedInputToEmbedData,
  embedFromEmbedModel,
  resolveConfigureEmbedData,
  settingsKeyFromEmbedOption,
} from './helpers';
import { EmbedController, EmbedFieldController } from './types';
import {
  ComponentType,
  EmbedBuilder,
  EmbedField,
  escapeCodeBlock,
  resolveColor,
} from 'discord.js';
import {
  configureEmbedAcceptedRow,
  configureEmbedControlRow,
} from './components';
import { Prisma } from '@prisma/client';
import { EmbedConfigurationConstants } from './enums';
import { LoggingServices } from '@/services';
import {
  buildDiscordPlaceholders,
  replacePlaceholders,
  replacePlaceholdersAcrossEmbed,
} from '@/placeholders';
import { EmbedConstants, InteractionUtils, StringUtils, UnitConstants } from '@rhidium/core';
import { guildTTLCache, prisma } from '@/database';
import Lang from '@/i18n/i18n';

const jsonCodeBlockOffset = 12;

export const configureEmbedController: EmbedController = async (
  client,
  interaction,
  guildSettings,
) => {
  const options = interaction.options;
  const embedOptionInput = options.getInteger(
    EmbedConfigurationConstants.EMBED_COMMAND_OPTION_NAME,
    true,
  );

  const settingKey = settingsKeyFromEmbedOption(embedOptionInput);
  const setting = guildSettings[settingKey];
  const humanFriendlySettingKey = StringUtils.titleCase(
    StringUtils.splitOnUppercase(settingKey),
  );

  const nullableByNone = (value: string | null) =>
    value === 'none' ? null : value ?? undefined;

  const embedData = Object.fromEntries(
    configureEmbedOptions.map((option) => {
      const value = options.getString(option.name);
      return [option.name, nullableByNone(value)];
    }),
  );

  const {
    embed: configureEmbedData,
    message: configureEmbedMessage,
  } = configureEmbedInputToEmbedData(embedData);
  const embedFromSetting = setting
    ? embedFromEmbedModel(setting)
    : new EmbedBuilder();
  const rawEmbed = resolveConfigureEmbedData(configureEmbedData, embedFromSetting);

  const placeholders = buildDiscordPlaceholders(
    interaction.channel,
    interaction.guild,
    interaction.member,
    interaction.user
  );
  const embed = replacePlaceholdersAcrossEmbed(rawEmbed, placeholders);
  const resolvedMessage = configureEmbedMessage ? replacePlaceholders(
    configureEmbedMessage,
    placeholders,
  ) : null;

  const messageSuffix = resolvedMessage ? `\n\n${resolvedMessage}` : '';
  const msg = await ConfigureEmbedsCommand.reply(interaction, {
    content: `${Lang.t('commands:embeds.previewPrompt')}${messageSuffix}`,
    embeds: [embed],
    components: [configureEmbedControlRow],
    fetchReply: true,
  });

  if (!msg) {
    ConfigureEmbedsCommand.reply(
      interaction,
      client.embeds.error(Lang.t('commands:embeds.previewFailed')),
    );
    return;
  }

  let i;
  try {
    i = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: UnitConstants.MS_IN_ONE_MINUTE * 5,
      filter: (i) =>
        i.customId === EmbedConfigurationConstants.CONFIGURE_CONTINUE ||
        i.customId === EmbedConfigurationConstants.CONFIGURE_CANCEL,
    });
  } catch {
    ConfigureEmbedsCommand.reply(
      interaction,
      client.embeds.error(Lang.t('commands:embeds.configurationExpired')),
    );
    return;
  }


  if (i.customId === EmbedConfigurationConstants.CONFIGURE_CANCEL) {
    i.update({
      content: Lang.t('commands:embeds.configurationCancelled'),
      components: [],
    });
    return;
  }

  const upsertId = guildSettings[`${settingKey}Id`] ?? null;
  if (upsertId === null) {
    client.logger.error('Embed configuration failed, setting id reference field couldn\'t be resolved!');
    i.update({
      content: Lang.t('commands:embeds.missingUpsertId'),
      components: [],
    });
    return;
  }

  await ConfigureEmbedsCommand.deferReplyInternal(i);

  const fields =
    configureEmbedData.fields
      .filter((field) => {
        const [name, value] = field.split(';');
        return name && value;
      })
      .map((field) => {
        const [name, value, inline] = field.split(';');
        return {
          name: name as string,
          value: value as string,
          inline: inline === 'true',
        };
      }) ?? [];

  const upsertData: {
    messageText?: string | null;
    color?: number | null;
    authorName?: string | null;
    authorIconURL?: string | null;
    authorURL?: string | null;
    title?: string | null;
    description?: string | null;
    url?: string | null;
    imageURL?: string | null;
    thumbnailURL?: string | null;
    footerText?: string | null;
    footerIconURL?: string | null;
    fields?: { create: EmbedField[] };
  } = {};

  if (rawEmbed.data.color) upsertData.color = rawEmbed.data.color;
  upsertData.messageText = configureEmbedMessage ?? null;
  upsertData.authorName = rawEmbed.data.author?.name ?? null;
  upsertData.authorIconURL = rawEmbed.data.author?.icon_url ?? null;
  upsertData.authorURL = rawEmbed.data.author?.url ?? null;
  upsertData.title = rawEmbed.data.title ?? null;
  upsertData.description = rawEmbed.data.description ?? null;
  upsertData.url = rawEmbed.data.url ?? null;
  upsertData.imageURL = rawEmbed.data.image?.url ?? null;
  upsertData.thumbnailURL = rawEmbed.data.thumbnail?.url ?? null;
  upsertData.footerText = rawEmbed.data.footer?.text ?? null;
  upsertData.footerIconURL = rawEmbed.data.footer?.icon_url ?? null;
  if (fields.length > 0) upsertData.fields = { create: fields };

  const newTotalFields = (setting?.fields?.length ?? 0) + fields.length;
  if (newTotalFields > EmbedConstants.MAX_FIELDS_LENGTH) {
    i.editReply(Lang.t('commands:embeds.maxFieldSize', { max: EmbedConstants.MAX_FIELDS_LENGTH }));
    interaction.editReply({
      components: [configureEmbedAcceptedRow],
    });
    return;
  }

  const createEmbedColor = configureEmbedData.color
    ? resolveColor(`#${configureEmbedData.color.replaceAll('#', '')}`)
    : null;
  const createEmbedData: Prisma.EmbedCreateInput = {
    memberJoinEmbed: {
      connect: {
        guildId: interaction.guildId,
      },
    },
    messageText: configureEmbedMessage ?? null,
    color: createEmbedColor ?? null,
    authorName: configureEmbedData.authorName ?? null,
    authorIconURL: configureEmbedData.authorIconUrl ?? null,
    authorURL: configureEmbedData.authorUrl ?? null,
    title: configureEmbedData.title ?? null,
    description: configureEmbedData.description ?? null,
    url: configureEmbedData.url ?? null,
    imageURL: configureEmbedData.imageUrl ?? null,
    thumbnailURL: configureEmbedData.thumbnailUrl ?? null,
    footerText: configureEmbedData.footerText ?? null,
    footerIconURL: configureEmbedData.footerIconUrl ?? null,
    fields: { create: fields },
  };

  guildTTLCache.delete(interaction.guildId);
  const updatedEmbed = await prisma.embed.upsert({
    update: upsertData,
    create: createEmbedData,
    where: {
      id: upsertId!,
    },
    include: { fields: true },
  });

  i.editReply(Lang.t('commands:embeds.configurationSaved'));
  interaction.editReply({
    components: [configureEmbedAcceptedRow],
  });

  const newEmbedData = msg.embeds[0];
  if (!newEmbedData) return;
  const jsonOutput = escapeCodeBlock(
    JSON.stringify(updatedEmbed, null, 2)
  ).slice(0, EmbedConstants.FIELD_VALUE_MAX_LENGTH - jsonCodeBlockOffset);
  LoggingServices.adminLog(
    interaction.guild,
    client.embeds.info({
      title: Lang.t('commands:embeds.configurationChanged'),
      fields: [
        {
          name: Lang.t('general:member'),
          value: interaction.user.toString(),
          inline: true,
        },
        {
          name: Lang.t('general:embed'),
          value: `\`\`\`${humanFriendlySettingKey}\`\`\``,
          inline: true,
        },
        {
          name: Lang.t('general:fields'),
          value: `\`\`\`${newEmbedData.fields?.length ?? 0}\`\`\``,
          inline: true,
        },
        {
          name: 'JSON',
          value: `\`\`\`json\n${jsonOutput}\n\`\`\``,
        },
      ],
    }),
  );
};

export const manageEmbedFieldsController: EmbedFieldController = async (
  client,
  interaction,
  _guildSettings,
  setting,
) => {
  const { options } = interaction;
  const subcommand = options.getSubcommand(true);
  const embedOptionInput = options.getInteger(
    EmbedConfigurationConstants.EMBED_COMMAND_OPTION_NAME,
    true,
  );
  const settingKey = settingsKeyFromEmbedOption(embedOptionInput);
  const humanFriendlySettingKey = StringUtils.titleCase(
    StringUtils.splitOnUppercase(settingKey),
  );

  switch (subcommand) {
  case EmbedConfigurationConstants.MANAGE_FIELDS_ADD: {
    if (!setting) {
      ConfigureEmbedsCommand.reply(
        interaction,
        client.embeds.error(Lang.t('commands:embeds.editEmbedMissing')),
      );
      return;
    }

    const name = options.getString('name', true);
    const value = options.getString('value', true);
    const inline = options.getBoolean('inline') ?? true;

    if (setting.fields.length === EmbedConstants.MAX_FIELDS_LENGTH) {
      ConfigureEmbedsCommand.reply(
        interaction,
        client.embeds.error(
          Lang.t('commands:embeds.maxFieldSize', { max: EmbedConstants.MAX_FIELDS_LENGTH }),
        ),
      );
      return;
    }

    const newField: EmbedField = {
      name,
      value,
      inline,
    };

    guildTTLCache.delete(interaction.guildId);
    const updatedSetting = await prisma.embed.update({
      where: { id: setting.id },
      include: { fields: true },
      data: {
        fields: {
          create: [newField],
        },
      },
    });

    const rawEmbed = embedFromEmbedModel(updatedSetting);
    const placeholders = buildDiscordPlaceholders(
      interaction.channel,
      interaction.guild,
      interaction.member,
      interaction.user
    );
    const embed = replacePlaceholdersAcrossEmbed(rawEmbed, placeholders);
    const resolvedMessage = updatedSetting.messageText
      ? replacePlaceholders(updatedSetting.messageText, placeholders)
      : null;
    const messageSuffix = resolvedMessage ? `\n\n${resolvedMessage}` : '';

    ConfigureEmbedsCommand.reply(interaction, {
      content: `${Lang.t('commands:embeds.fieldsEditPreview')}${messageSuffix}`,
      embeds: [embed],
    });

    const jsonOutput = escapeCodeBlock(
      JSON.stringify(newField, null, 2),
    ).slice(0, EmbedConstants.FIELD_VALUE_MAX_LENGTH - jsonCodeBlockOffset);
    LoggingServices.adminLog(
      interaction.guild,
      client.embeds.info({
        title: Lang.t('commands:embeds.fieldsAdded'),
        fields: [
          {
            name: Lang.t('general:member'),
            value: `\`\`\`${interaction.user.username}\`\`\``,
            inline: true,
          },
          {
            name: Lang.t('general:embed'),
            value: `\`\`\`${humanFriendlySettingKey}\`\`\``,
            inline: true,
          },
          {
            name: Lang.t('general:field'),
            value: `\`\`\`json\n${jsonOutput}\n\`\`\``,
          },
        ],
      }),
    );

    break;
  }

  case EmbedConfigurationConstants.MANAGE_FIELDS_REMOVE: {
    if (!setting) {
      ConfigureEmbedsCommand.reply(
        interaction,
        client.embeds.error(Lang.t('commands:embeds.removeEmbedMissing')),
      );
      return;
    }

    const index = options.getInteger('index', true);
    if (index < 1 || index > setting.fields.length) {
      ConfigureEmbedsCommand.reply(
        interaction,
        client.embeds.error(
          Lang.t('commands:embeds.indexOutsideRange', { max: setting.fields.length }),
        ),
      );
      return;
    }

    const targetField = setting.fields[index - 1];
    if (!targetField) {
      ConfigureEmbedsCommand.reply(
        interaction,
        client.embeds.error(
          Lang.t('commands:embeds.indexFieldNotFound', { index, max: setting.fields.length }),
        ),
      );
      return;
    }

    guildTTLCache.delete(interaction.guildId);
    const updatedSetting = await prisma.embed.update({
      where: { id: setting.id },
      include: { fields: true },
      data: {
        fields: { delete: { id: targetField.id } },
      },
    });

    const rawEmbed = embedFromEmbedModel(updatedSetting);
    const placeholders = buildDiscordPlaceholders(
      interaction.channel,
      interaction.guild,
      interaction.member,
      interaction.user
    );
    const embed = replacePlaceholdersAcrossEmbed(rawEmbed, placeholders);
    const resolvedMessage = updatedSetting.messageText
      ? replacePlaceholders(updatedSetting.messageText, placeholders)
      : null;
    const messageSuffix = resolvedMessage ? `\n\n${resolvedMessage}` : '';


    ConfigureEmbedsCommand.reply(interaction, {
      content: `${Lang.t('commands:embeds.fieldRemovedPreview')}${messageSuffix}`,
      embeds: [embed],
    });

    const jsonOutput = escapeCodeBlock(
      JSON.stringify(targetField, null, 2),
    ).slice(0, EmbedConstants.FIELD_VALUE_MAX_LENGTH - jsonCodeBlockOffset);
    LoggingServices.adminLog(
      interaction.guild,
      client.embeds.info({
        title: Lang.t('commands:embeds.fieldRemoved'),
        fields: [
          {
            name: Lang.t('general:member'),
            value: `\`\`\`${interaction.user.username}\`\`\``,
            inline: true,
          },
          {
            name: Lang.t('general:embed'),
            value: `\`\`\`${humanFriendlySettingKey}\`\`\``,
            inline: true,
          },
          {
            name: Lang.t('general:field'),
            value: `\`\`\`json\n${jsonOutput}\n\`\`\``,
          },
        ],
      }),
    );

    break;
  }

  case EmbedConfigurationConstants.MANAGE_FIELDS_RESET: {
    if (!setting) {
      ConfigureEmbedsCommand.reply(
        interaction,
        client.embeds.error(Lang.t('commands:embeds.fieldsResetEmbedMissing')),
      );
      return;
    }

    InteractionUtils.promptConfirmation({
      client,
      interaction,
      async onConfirm(i) {
        guildTTLCache.delete(interaction.guildId);
        const updatedSetting = await prisma.embed.update({
          where: { id: setting.id },
          include: { fields: true },
          data: {
            fields: { deleteMany: {} },
          },
        });

        const rawEmbed = embedFromEmbedModel(updatedSetting);
        const placeholders = buildDiscordPlaceholders(
          interaction.channel,
          interaction.guild,
          interaction.member,
          interaction.user
        );
        const embed = replacePlaceholdersAcrossEmbed(rawEmbed, placeholders);
        const resolvedMessage = updatedSetting.messageText
          ? replacePlaceholders(updatedSetting.messageText, placeholders)
          : null;
        const messageSuffix = resolvedMessage ? `\n\n${resolvedMessage}` : '';

        InteractionUtils.replyDynamic(client, i, {
          content: `${Lang.t('commands:embeds.fieldsResetSuccess')}${messageSuffix}`,
          embeds: [embed],
        });

        LoggingServices.adminLog(
          interaction.guild,
          client.embeds.info({
            title: Lang.t('commands:embeds.fieldsReset'),
            fields: [
              {
                name: Lang.t('general:member'),
                value: `\`\`\`${interaction.user.username}\`\`\``,
                inline: true,
              },
              {
                name: Lang.t('general:embed'),
                value: `\`\`\`${humanFriendlySettingKey}\`\`\``,
                inline: true,
              },
            ],
          }),
        ); 
      },
    });

    break;
  }

  case EmbedConfigurationConstants.MANAGE_FIELDS_LIST:
  default: {
    if (!setting) {
      ConfigureEmbedsCommand.reply(
        interaction,
        client.embeds.error(Lang.t('commands:embeds.fieldsListEmbedMissing')),
      );
      return;
    }

    if (setting.fields.length === 0) {
      ConfigureEmbedsCommand.reply(
        interaction,
        client.embeds.error(Lang.t('commands:embeds.fieldsListEmpty')),
      );
      return;
    }

    const embed = client.embeds.branding({
      fields: setting.fields.map((e, ind) => ({
        name: `#${ind + 1} | ${e.name}`,
        value: e.value,
        inline: e.inline,
      })),
    });

    ConfigureEmbedsCommand.reply(interaction, { embeds: [embed] });
    break;
  }
  }
};
