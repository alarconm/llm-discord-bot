import { SlashCommandBuilder } from 'discord.js';
import { ChatInputCommand, CommandType, PermissionUtils } from '@rhidium/core';
import CommandOption, { CommandAutoCompleteQueryType } from '../../auto-completes/command';

const CommandsHelpCommand =  new ChatInputCommand({
  isEphemeral: true,
  data: new SlashCommandBuilder().setDescription(
    'Receive detailed information and usage help for commands',
  ).addStringOption(CommandOption.addOptionHandler),
  run: async (client, interaction) => {
    // Declarations
    const { member, guild } = interaction;
    const [ group, name ] = CommandOption.getRawValue(interaction).split('@');
    const isCategoryQuery = group === CommandAutoCompleteQueryType.CATEGORY;
    const queryOutput = typeof name === 'undefined' ? (group ?? '""') : `${name} (${group})`;

    let cmd: CommandType | null = null;
    if (group === CommandAutoCompleteQueryType.CATEGORY) {
      cmd = client.commandManager.apiCommands.find((c) => c.category === name) ?? null;
    }
    else if (group === CommandAutoCompleteQueryType.SLASH) {
      cmd = client.commandManager.chatInput.find((c) => c.data.name === name) ?? null;
    }
    else if (group === CommandAutoCompleteQueryType.USER_CONTEXT) {
      cmd = client.commandManager.userContextMenus.find((c) => c.data.name === name) ?? null;
    }
    else if (group === CommandAutoCompleteQueryType.MESSAGE_CONTEXT) {
      cmd = client.commandManager.messageContextMenus.find((c) => c.data.name === name) ?? null;
    }

    // Make sure an option was selected
    if (!cmd) {
      CommandsHelpCommand.reply(interaction, client.embeds.error(
        `No command found for query: **\`${queryOutput}\`**`,
      ));
      return;
    }

    // Only use commands usable by the member
    const memberPermLevel = await PermissionUtils.resolveMemberPermLevel(client, member, guild);
    const commands = client.commandManager.apiCommands
      .filter((c) => client.commandManager.isAppropriateCommandFilter(c, member, memberPermLevel));

    // Overview of Category
    if (isCategoryQuery) {
      const categoryCommands = commands.filter((c) => c.category === name);
      const embed = await client.commandManager.categoryEmbed(name ?? '', categoryCommands);
      await CommandsHelpCommand.reply(interaction, embed);
      return;
    }

    // Overview of selected command
    const embed = client.commandManager.commandEmbed(cmd);
    await CommandsHelpCommand.reply(interaction, embed);
  },
});

export default CommandsHelpCommand;
