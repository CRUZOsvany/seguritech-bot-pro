/**
 * Modelos de dominio para usuarios del chatbot
 */

export interface UserState {
  jid: string;
  state: 'IDLE' | 'MENU' | 'ORDERING' | 'WAITING_CONFIRMATION';
  createdAt: Date;
  updatedAt: Date;
  orderData?: {
    product?: string;
    quantity?: number;
    name?: string;
  };
}

export interface ChatMessage {
  id: string;
  senderJid: string;
  content: string;
  timestamp: Date;
  isFromBot: boolean;
  type: 'text' | 'image' | 'document';
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  whatsappNumber: string;
  timezone: string;
  settings: {
    greeting: string;
    autoReply: boolean;
    workingHours?: {
      start: string;
      end: string;
    };
  };
  createdAt: Date;
}

