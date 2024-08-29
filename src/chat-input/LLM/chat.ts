import { SlashCommandBuilder } from 'discord.js';
import { ChatInputCommand, PermLevel } from '@rhidium/core';
import { LLMModel, generateResponse } from '../../services/llm-service';
import { prisma } from '../../database';
import { getSystemPrompt } from '../../services/system-prompts';

const ChatCommand = new ChatInputCommand({
  permLevel: PermLevel.Everyone,
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Chat with an LLM model')
    .addStringOption(option =>
      option.setName('model')
        .setDescription('Choose the LLM model')
        .setRequired(true)
        .addChoices(
          { name: 'Claude 3.5 Sonnet', value: LLMModel.CLAUDE },
          { name: 'GPT-4', value: LLMModel.GPT4 },
          { name: 'Llama 3.1 8b (Local)', value: LLMModel.LLAMA },
        )
    )
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Your message to the LLM')
        .setRequired(true)
    ),
  run: async (client, interaction) => {
    const model = interaction.options.getString('model', true) as LLMModel;
    const message = interaction.options.getString('message', true);
    const userId = interaction.user.id;

    await interaction.deferReply();

    let conversation = await prisma.conversation.findFirst({
      where: { userId, model },
      orderBy: { updatedAt: 'desc' },
    });

    if (!conversation) {
      const systemPrompt = getSystemPrompt(model);
      conversation = await prisma.conversation.create({
        data: {
          userId,
          model,
          messages: [{ role: 'system', content: systemPrompt }],
        },
      });
    }           
  

    const messages = [...conversation.messages, { role: 'user', content: message }];
    const response = await generateResponse(model, messages);

    messages.push({ role: 'assistant', content: response });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { messages, updatedAt: new Date() },
    });

    await interaction.editReply(response);
  },
});

export default ChatCommand;