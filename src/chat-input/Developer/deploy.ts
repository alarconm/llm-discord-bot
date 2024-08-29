import { SlashCommandBuilder } from 'discord.js';
import { ChatInputCommand, PermLevel } from '@rhidium/core';

const DeployCommand = new ChatInputCommand({
  permLevel: PermLevel['Bot Administrator'],
  data: new SlashCommandBuilder()
    .setDescription('Deploy commands globally or in a guild/server')
    .addStringOption((option) =>
      option
        .setName('scope')
        .setDescription('The scope to deploy to')
        .setRequired(true)
        .addChoices(
          { name: 'Global', value: 'global' },
          { name: 'Server', value: 'guild' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('server')
        .setDescription(
          'The server to deploy to, only used if scope is "Server"',
        )
        .setRequired(false),
    ),
  run: async (client, interaction) => {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply('This command can only be used in a server.');
      return;
    }

    await interaction.deferReply();

    try {
      await client.commandManager.deployCommands(guildId);
      await interaction.editReply('Successfully deployed commands to this server.');
    } catch (error) {
      console.error('Error deploying commands:', error);
      await interaction.editReply('An error occurred while deploying commands.');
    }
  },
});

export default DeployCommand;
