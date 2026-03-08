export type AssistantChatMessageRole = 'user' | 'assistant';

export interface AssistantChatMessage {
  role: AssistantChatMessageRole;
  content: string;
  createdAtISO?: string;
}
