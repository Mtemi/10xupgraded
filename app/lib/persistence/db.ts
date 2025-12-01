import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import type { ChatHistoryItem } from './useChatHistory';
import { generateId, generateUrlId } from '~/utils/generateId';

const logger = createScopedLogger('ChatHistory');

// this is used at the top level and never rejects
export async function openDatabase(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    const request = indexedDB.open('boltHistory', 1);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('chats')) {
        const store = db.createObjectStore('chats', { keyPath: 'id' });
        store.createIndex('id', 'id', { unique: true });
        store.createIndex('urlId', 'urlId', { unique: true });
      }
    };

    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event: Event) => {
      resolve(undefined);
      logger.error((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function getAll(db: IDBDatabase): Promise<ChatHistoryItem[]> {
  return new Promise((resolve, reject) => {
    console.log('[DB] Starting getAll transaction for chats');
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result as ChatHistoryItem[];
      console.log('[DB] Retrieved all chats from IndexedDB:', results.length, 'entries', results);
      
      // Debug each entry
      results.forEach((item, index) => {
        console.log(`[DB] Chat #${index + 1}:`, {
          id: item.id,
          urlId: item.urlId,
          description: item.description,
          messageCount: item.messages?.length || 0,
          timestamp: item.timestamp
        });
      });
      
      resolve(results);
    };
    request.onerror = () => {
      console.error('[DB] Error getting all chats:', request.error);
      reject(request.error);
    };
  });
}

export async function setMessages(
  db: IDBDatabase,
  id: string,
  messages: Message[],
  urlId?: string,
  description?: string,
): Promise<void> {
  console.log('[DB] Setting messages in IndexedDB for chat:', { 
    id, 
    urlId, 
    description, 
    messageCount: messages.length,
    firstUserMessage: messages.find(m => m.role === 'user')?.content?.substring(0, 50),
    firstAssistantMessage: messages.find(m => m.role === 'assistant')?.content?.substring(0, 50)
  });
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');

    const chatData = {
      id,
      messages,
      urlId: urlId || id,
      description: description || messages.find(m => m.role === 'user')?.content?.substring(0, 50) || 'New Chat',
      timestamp: new Date().toISOString(),
    };
    
    console.log('[DB] Storing chat data with ID:', chatData.id, 'and description:', chatData.description);
    const request = store.put(chatData);

    request.onsuccess = () => {
      console.log('[DB] Successfully stored chat data with ID:', id);
      resolve();
    };
    request.onerror = () => {
      console.error('[DB] Error storing messages:', request.error);
      reject(request.error);
    }
  });
}

export async function getMessages(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return (await getMessagesById(db, id)) || (await getMessagesByUrlId(db, id));
}

export async function getMessagesByUrlId(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('urlId');
    const request = index.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function getMessagesById(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteById(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');
    const request = store.delete(id);

    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function getNextId(db: IDBDatabase): Promise<string> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    
    // Generate a unique ID instead of incrementing
    const uniqueId = generateId('chat_');
    resolve(uniqueId);
  });
}

export async function getUrlId(db: IDBDatabase, id: string): Promise<string> {
  // Generate a URL-friendly ID based on the provided ID
  return generateUrlId(id);
}

async function getUrlIds(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const idList: string[] = [];

    const request = store.openCursor();

    request.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

      if (cursor) {
        idList.push(cursor.value.urlId);
        cursor.continue();
      } else {
        resolve(idList);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}