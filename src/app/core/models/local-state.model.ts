import { AssistantChatMessage } from './assistant-chat-message.model';
import { GiftCard } from './gift-card.model';
import { Transaction } from './transaction.model';

export interface LocalStateData {
  version: 1;
  updatedAtISO: string;
  serviceOverrides: any[];
  inventoryAdjustments: any[];
  clientsOverrides: any[];
  transactions: Transaction[];
  assistantChatHistory: AssistantChatMessage[];
  giftCards: GiftCard[];
}
