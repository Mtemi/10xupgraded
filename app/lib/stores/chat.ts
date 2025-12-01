import { map } from 'nanostores';
import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatStore');

export const chatStore = map<ChatState>({
  started: false,
  aborted: false,
  showChat: true,
});


export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatState {
  messages?: ChatMessage[];
  started: boolean;
  aborted: boolean;
  showChat: boolean;
}

export async function sendChatMessage(message: string): Promise<Message> {
  logger.info('Sending chat message');
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: message
        }
      ]
    })
  });

  if (!response.ok) {
    logger.error('Failed to send message:', response.status, response.statusText);
    throw new Error('Failed to send message');
  }

  const reader = response.body?.getReader();
  let result = '';

  if (reader) {
    while (true) {
      logger.debug('Reading response stream');
      const { done, value } = await reader.read();
      if (done) break;
      result += new TextDecoder().decode(value);
    }
  }

  return {
    id: Date.now().toString(),
    role: 'assistant',
    content: result
  };
}