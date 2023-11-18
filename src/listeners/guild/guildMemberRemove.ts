import { embedFromEmbedModel } from '@/chat-input/Administrator/embeds/helpers';
import { guildSettingsFromCache } from '@/database';
import { buildDiscordPlaceholders, replacePlaceholders, replacePlaceholdersAcrossEmbed } from '@/placeholders';
import { LoggingServices } from '@/services';
import { EmbedBuilder, Events, PermissionFlagsBits } from 'discord.js';
import { ClientEventListener, PermissionUtils, TimeUtils } from '@rhidium/core';
import Lang from '@/i18n/i18n';

const requiredPermissions = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
];

export default new ClientEventListener({
  event: Events.GuildMemberRemove,
  run: async (client, member) => {
    const { logger } = client;
    const { guild } = member;

    const guildSettings = await guildSettingsFromCache(guild.id);
    if (!guildSettings || !guildSettings.memberLeaveChannelId) return;

    const channel = guild.channels.cache.get(guildSettings.memberLeaveChannelId);
    if (!channel) {
      LoggingServices.adminLog(
        guild,
        client.embeds.error({
          title: Lang.t('commands:memberLeave.errorLabel'),
          description: Lang.t('general:errors.noChannel'),
        }),
      );
      return;
    }

    if (!channel.permissionsFor(client.user.id)?.has(requiredPermissions)) {
      LoggingServices.adminLog(
        guild,
        client.embeds.error({
          title: Lang.t('commands:memberLeave.errorLabel'),
          description: Lang.t('general:errors.missingPerms', {
            permissions: PermissionUtils.bigIntPermOutput(
              requiredPermissions.filter((permission) => !channel.permissionsFor(client.user.id)?.has(permission))
            ),
            channel: channel.toString(),
          }),
        }),
      );
      return;
    }

    if (!channel.isTextBased()) {
      LoggingServices.adminLog(
        guild,
        client.embeds.error({
          title: Lang.t('commands:memberLeave.errorLabel'),
          description: Lang.t('general:errors.notTextChannel', {
            channel: channel.toString(),
          }),
        }),
      );
      return;
    }

    const accountCreatedOutput = TimeUtils.discordInfoTimestamp(member.user.createdTimestamp);
    const joinedAtOutput = member.joinedTimestamp
      ? TimeUtils.discordInfoTimestamp(member.joinedTimestamp)
      : 'Unknown';
    const { memberLeaveEmbed } = guildSettings;
    const baseEmbed = new EmbedBuilder()
      .setColor(client.colors.primary)
      .setAuthor({
        name: member.user.username,
        iconURL: member.user.displayAvatarURL({ forceStatic: false }),
      })
      .setTitle(Lang.t('commands:memberLeave.label'))
      .setDescription(Lang.t('commands:memberLeave.goodbye', {
        user: member.toString(),
        guild: guild.name,
      }))
      .setThumbnail(member.user.displayAvatarURL({ forceStatic: false }))
      .addFields({
        name: Lang.t('general:discord.accountCreated'),
        value: accountCreatedOutput,
        inline: true,
      }, {
        name: Lang.t('general:discord.joinedAt'),
        value: joinedAtOutput,
        inline: true,
      }, {
        name: Lang.t('general:discord.memberCount'),
        value: guild.memberCount.toLocaleString(),
        inline: true,
      });

    const rawEmbed = embedFromEmbedModel(memberLeaveEmbed, baseEmbed);
    const placeholders = buildDiscordPlaceholders(
      channel,
      guild,
      member,
      member.user
    );
    const embed = replacePlaceholdersAcrossEmbed(rawEmbed, placeholders);
    const resolvedMessage = guildSettings.memberJoinEmbed?.messageText
      ? replacePlaceholders(guildSettings.memberJoinEmbed.messageText, placeholders)
      : '';

    channel.send({ content: resolvedMessage, embeds: [embed] })
      .catch((error) => {
        logger.error('Error encountered while sending member leave message, after checking permissions', error);
        LoggingServices.adminLog(
          guild,
          client.embeds.error({
            title: Lang.t('commands:memberLeave.errorLabel'),
            description: Lang.t('general:errors.errAfterPermCheck'),
          }),
        );
      });
  },
});
