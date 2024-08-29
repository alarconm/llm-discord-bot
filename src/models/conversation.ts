import { ChatCompletionRequestMessage } from 'openai/resources/chat';
import { LLMModel } from '../services/llm-service';

export interface Conversation {
  id: string;
  userId: string;
  model: LLMModel;
  messages: ChatCompletionRequestMessage[];
  createdAt: Date;
  updatedAt: Date;
}