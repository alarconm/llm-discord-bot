import { ChatCompletionRequestMessage } from 'openai/resources/chat';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import axios from 'axios';
import userConfig from '../config';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const LMSTUDIO_API_URL = userConfig.api.LMSTUDIO_API_URL;

export enum LLMModel {
  CLAUDE = 'claude-3-5-sonnet-20240620',
  GPT4 = 'gpt-4o',
  LLAMA = 'llama3.1',
}

export async function generateResponse(model: LLMModel, messages: ChatCompletionRequestMessage[]): Promise<string> {
  switch (model) {
    case LLMModel.CLAUDE:
      const claudeResponse = await anthropic.messages.create({
        model: LLMModel.CLAUDE,
        messages: messages,
        max_tokens: 1000,
      });
      return claudeResponse.content[0].text;

    case LLMModel.GPT4:
      const gptResponse = await openai.chat.completions.create({
        model: LLMModel.GPT4,
        messages: messages,
        max_tokens: 1000,
      });
      return gptResponse.choices[0].message.content || '';

    case LLMModel.LLAMA: {
      const systemMessage = messages.find(msg => msg.role === 'system');
      const userMessages = messages.filter(msg => msg.role !== 'system');
      const llamaResponse = await axios.post(LMSTUDIO_API_URL, {
        messages: [
          ...(systemMessage ? [systemMessage] : []),
          ...userMessages
        ],
        max_tokens: 1000,
      });
      return llamaResponse.data.choices[0].message.content;
    }

    default:
      throw new Error('Invalid model specified');
  }
}