import { guildSettingsFromCache, updateGuildSettings } from '@/database';
import { LoggingServices } from '@/services';
import { SlashCommandBuilder } from 'discord.js';
import { ChatInputCommand, InteractionUtils, PermLevel } from '@rhidium/core';
import Lang from '@/i18n/i18n';

const ModeratorRoleCommand = new ChatInputCommand({
  permLevel: PermLevel.Administrator,
  isEphemeral: true,
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setDescription('Set the role that determines who can use Moderator commands')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The role that should be able to use Moderator commands')
      .setRequired(false)
    )
    .addBooleanOption((option) => option
      .setName('remove')
      .setDescription('Remove the Moderator role')
      .setRequired(false),
    ),
  run: async (client, interaction) => {
    const { options } = interaction;
    const role = options.getRole('role');
    const remove = options.getBoolean('remove') ?? false;

    const guildAvailable = InteractionUtils.requireAvailableGuild(client, interaction);
    if (!guildAvailable) return;

    await ModeratorRoleCommand.deferReplyInternal(interaction);

    const guildSettings = await guildSettingsFromCache(interaction.guildId);
    if (!guildSettings) {
      ModeratorRoleCommand.reply(
        interaction,
        client.embeds.error(Lang.t('general:settings.notFound')),
      );
      return;
    }

    if (remove) {
      guildSettings.modRoleId = null;
      await updateGuildSettings(guildSettings, {
        data: { modRoleId: null },
      });
      ModeratorRoleCommand.reply(
        interaction,
        client.embeds.success(Lang.t('commands:modRole.removed')),
      );
      LoggingServices.adminLog(
        interaction.guild,
        client.embeds.info({
          title: Lang.t('commands:modRole.removedTitle'),
          description: Lang.t('commands:modRole.removedBy', {
            username: interaction.user.username,
          }),
        }),
      );
      return;
    }

    if (!role) {
      ModeratorRoleCommand.reply(
        interaction,
        client.embeds.branding({
          fields: [{
            name: Lang.t('commands:modRole.title'),
            value: guildSettings.modRoleId
              ? `<@&${guildSettings.modRoleId}>`
              : Lang.t('general:notSet'),
          }],
        })
      );
      return;
    }

    guildSettings.modRoleId = role.id;
    await updateGuildSettings(guildSettings, {
      data: { modRoleId: role.id },
    });
    ModeratorRoleCommand.reply(
      interaction,
      client.embeds.success(Lang.t('commands:modRole.changed', {
        role: `<@&${role.id}>`,
      })),
    );
    LoggingServices.adminLog(
      interaction.guild,
      client.embeds.info({
        title: Lang.t('commands:modRole.changedTitle'),
        fields: [{
          name: Lang.t('general:role'),
          value: `<@&${role.id}>`,
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

export default ModeratorRoleCommand;
