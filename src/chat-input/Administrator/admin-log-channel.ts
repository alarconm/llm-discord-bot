import { guildSettingsFromCache, updateGuildSettings } from '@/database';
import { LoggingServices } from '@/services';
import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { ChatInputCommand, InteractionUtils, PermLevel } from '@rhidium/core';
import Lang from '@/i18n/i18n';

const AdminLogChannelCommand = new ChatInputCommand({
  permLevel: PermLevel.Administrator,
  isEphemeral: true,
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setDescription('Set the channel to send admin log (audit) messages to')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel to send admin log (audit) messages to')
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addBooleanOption((option) => option
      .setName('disable')
      .setDescription('Disable admin log messages')
      .setRequired(false),
    ),
  run: async (client, interaction) => {
    const { options } = interaction;
    const channel = options.getChannel('channel');
    const disable = options.getBoolean('disable') ?? false;

    const guildAvailable = InteractionUtils.requireAvailableGuild(client, interaction);
    if (!guildAvailable) return;

    await AdminLogChannelCommand.deferReplyInternal(interaction);

    const guildSettings = await guildSettingsFromCache(interaction.guildId);
    if (!guildSettings) {
      AdminLogChannelCommand.reply(
        interaction,
        client.embeds.error(Lang.t('general:settings.notFound')),
      );
      return;
    }

    if (disable) {
      guildSettings.adminLogChannelId = null;
      await updateGuildSettings(guildSettings, {
        data: { adminLogChannelId: null },
      });
      AdminLogChannelCommand.reply(
        interaction,
        client.embeds.success(Lang.t('commands:adminLogChannel.disabled')),
      );
      LoggingServices.adminLog(
        interaction.guild,
        client.embeds.info({
          title: Lang.t('commands:adminLogChannel.disabled'),
          description: Lang.t('commands:adminLogChannel.disabledBy', {
            username: interaction.user.username,
          }),
        }),
      );
      return;
    }

    if (!channel) {
      AdminLogChannelCommand.reply(
        interaction,
        client.embeds.branding({
          fields: [{
            name: Lang.t('commands:adminLogChannel.title'),
            value: guildSettings.adminLogChannelId
              ? `<#${guildSettings.adminLogChannelId}>`
              : Lang.t('general:notSet'),
          }],
        })
      );
      return;
    }

    guildSettings.adminLogChannelId = channel.id;
    await updateGuildSettings(guildSettings, {
      data: { adminLogChannelId: channel.id },
    });
    AdminLogChannelCommand.reply(
      interaction,
      client.embeds.success(Lang.t('commands:adminLogChannel.changed', {
        channel: channel.toString(),
      })),
    );
    LoggingServices.adminLog(
      interaction.guild,
      client.embeds.info({
        title: Lang.t('commands:adminLogChannel.changedTitle'),
        fields: [{
          name: Lang.t('general:channel'),
          value: `<#${channel.id}>`,
          inline: true,
        }, {
          name: Lang.t('general:member'),
          value: interaction.user.toString(),
          inline: true,
        }],
      }),
    );
    return;
  },
});

export default AdminLogChannelCommand;
