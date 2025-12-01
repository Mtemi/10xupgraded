import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { atom } from 'nanostores';
import type { Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { supabase } from '~/lib/superbase/client';
import { webcontainer } from '~/lib/webcontainer';
import { WORK_DIR } from '~/utils/constants';

// Create a logger for debugging
const logger = {
  info: (message: string, ...args: any[]) => console.log(`[ChatHistory] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ChatHistory] ${message}`, ...args)
};

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  botStatus?: string;
  botId?: string;
  openTrades?: number;
  hasDeployedBot?: boolean;
  exchange?: string;
  profit?: number;
  balance?: number;
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

logger.info(`Persistence enabled: ${persistenceEnabled}`);

// Initialize db as undefined first
export let db: IDBDatabase | undefined = undefined;

// Create atoms for chat state
export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const urlId = atom<string | undefined>(undefined);

// 🔧 FIX: Debounced sync to prevent multiple simultaneous syncs of the same chat
const syncDebounceTimers = new Map<string, NodeJS.Timeout>();

// Function to load Python strategy files from database when chat is loaded
async function loadStrategyFilesForChat(chatId: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logger.info('No authenticated user, skipping file load');
      return;
    }

    logger.info(`Loading strategy files for chat: ${chatId}`);

    // Get strategy associated with this chat
    const { data: scriptsData, error: scriptsError } = await supabase
      .from('trading_scripts')
      .select('name, content')
      .eq('chat_id', chatId)
      .eq('user_id', user.id);

    if (scriptsError) {
      logger.error('Error fetching strategy files:', scriptsError);
      return;
    }

    if (!scriptsData || scriptsData.length === 0) {
      logger.info('No strategy files found for this chat');
      return;
    }

    // Load the WebContainer
    const container = await webcontainer;
    if (!container) {
      logger.error('WebContainer not available');
      return;
    }

    // Write each strategy file to WebContainer
    for (const script of scriptsData) {
      const fileName = `${script.name}.py`;
      const filePath = `${WORK_DIR}/${fileName}`;

      logger.info(`Loading strategy file: ${fileName}`);

      try {
        // Ensure the work directory exists
        await container.fs.mkdir(WORK_DIR, { recursive: true });

        // Write the file
        await container.fs.writeFile(filePath, script.content || '');

        logger.info(`Successfully loaded ${fileName} into WebContainer`);

        // Set the file as selected in workbench
        workbenchStore.setSelectedFile(filePath);
      } catch (error) {
        logger.error(`Error writing file ${fileName}:`, error);
      }
    }
  } catch (error) {
    logger.error('Error loading strategy files:', error);
  }
}

// Function to sync chat history with Supabase (debounced and non-blocking)
async function syncChatWithSupabase(id: string, urlIdValue: string, descriptionValue: string, messages: Message[]): Promise<boolean> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return false; // Silently skip if not authenticated
    }

    // 🔧 FIX: Clear any existing debounce timer for this chat
    const existingTimer = syncDebounceTimers.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 🔧 FIX: Debounce the sync by 500ms to prevent rapid-fire syncs
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        try {
          // Use RPC function to save chat with a timeout
          const { error } = await Promise.race([
            supabase.rpc('save_chat_history', {
              p_id: id,
              p_url_id: urlIdValue,
              p_description: descriptionValue,
              p_messages: messages
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Sync timeout')), 5000)
            )
          ]);

          syncDebounceTimers.delete(id);

          if (error) {
            console.error(`[ChatHistory] Error syncing chat ${id}: ${error.message}`);
            resolve(false);
            return;
          }

          resolve(true);
        } catch (error) {
          syncDebounceTimers.delete(id);
          console.error(`[ChatHistory] Sync error for ${id}:`, error);
          resolve(false);
        }
      }, 500);

      syncDebounceTimers.set(id, timer);
    });
  } catch (error) {
    return false;
  }
}

// Generate a unique ID
function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}${timestamp}${randomPart}`;
}

// Open the IndexedDB database
export async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('chatHistory', 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('chats')) {
        const store = db.createObjectStore('chats', { keyPath: 'id' });
        store.createIndex('urlId', 'urlId', { unique: true });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject(new Error(`Failed to open database: ${(event.target as IDBOpenDBRequest).error}`));
    };
  });
}

// Get messages from IndexedDB
export async function getMessages(db: IDBDatabase, id: string): Promise<ChatHistoryItem | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chats'], 'readonly');
    const store = transaction.objectStore('chats');
    
    // Try to get by ID first
    const request = store.get(id);
    
    request.onsuccess = (event) => {
      const result = (event.target as IDBRequest).result;
      if (result) {
        resolve(result);
        return;
      }
      
      // If not found by ID, try by urlId
      const urlIndex = store.index('urlId');
      const urlRequest = urlIndex.get(id);
      
      urlRequest.onsuccess = (event) => {
        resolve((event.target as IDBRequest).result);
      };
      
      urlRequest.onerror = (event) => {
        reject(new Error(`Failed to get chat by urlId: ${(event.target as IDBRequest).error}`));
      };
    };
    
    request.onerror = (event) => {
      reject(new Error(`Failed to get chat: ${(event.target as IDBRequest).error}`));
    };
  });
}

// Set messages in IndexedDB
export async function setMessages(
  db: IDBDatabase,
  id: string,
  messages: Message[],
  urlIdValue?: string,
  descriptionValue?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chats'], 'readwrite');
    const store = transaction.objectStore('chats');
    
    const item: ChatHistoryItem = {
      id,
      urlId: urlIdValue || id,
      description: descriptionValue || 'New Chat',
      messages,
      timestamp: new Date().toISOString(),
    };
    
    const request = store.put(item);
    
    request.onsuccess = () => {
      resolve();
    };
    
    request.onerror = (event) => {
      reject(new Error(`Failed to set messages: ${(event.target as IDBRequest).error}`));
    };
  });
}

// Delete a chat by ID
export async function deleteById(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chats'], 'readwrite');
    const store = transaction.objectStore('chats');
    const request = store.delete(id);
    
    request.onsuccess = () => {
      resolve();
    };
    
    request.onerror = (event) => {
      reject(new Error(`Failed to delete chat: ${(event.target as IDBRequest).error}`));
    };
  });
}

// Get all chats
export async function getAll(db: IDBDatabase): Promise<ChatHistoryItem[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chats'], 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAll();
    
    request.onsuccess = (event) => {
      resolve((event.target as IDBRequest).result);
    };
    
    request.onerror = (event) => {
      reject(new Error(`Failed to get all chats: ${(event.target as IDBRequest).error}`));
    };
  });
}

// Get the next ID
export async function getNextId(db: IDBDatabase): Promise<string> {
  return `chat_${generateId()}`;
}

// Get a URL ID from an artifact ID
export async function getUrlId(db: IDBDatabase, artifactId: string): Promise<string> {
  return `${artifactId}_${generateId()}`;
}

// Initialize the database if persistence is enabled
if (persistenceEnabled && typeof window !== 'undefined') {
  (async () => {
    try {
      db = await openDatabase();
      logger.info('IndexedDB opened successfully');
    } catch (error) {
      logger.error('Error opening IndexedDB:', error);
    }
  })();
}

export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();

  const [initialMessages, setInitialMessages] = useState<Message[]>([]); 
  const [ready, setReady] = useState<boolean>(false);
  const [currentId, setCurrentId] = useState<string | undefined>(mixedId);
  const [syncedWithSupabase, setSyncedWithSupabase] = useState<boolean>(false);

  // Check for pending fine tune data when chat loads
  useEffect(() => {
    if (mixedId && ready) {
      // Check if there's pending fine tune data for this specific chat
      const hasPendingFineTune = localStorage.getItem('hasPendingFineTune');
      const storageKey = `pendingFineTuneMessage_${mixedId}`;
      const pendingMessage = localStorage.getItem(storageKey);
      
      if (hasPendingFineTune === 'true' && pendingMessage) {
        console.log('[ChatHistory] Found pending fine tune data for this chat:', mixedId);
        console.log('[ChatHistory] Message length:', pendingMessage.length);
        // The Chat component will handle loading this data
      }
    }
  }, [mixedId, ready]);
  useEffect(() => {
    logger.info('useChatHistory effect running with mixedId:', mixedId, 'currentId:', currentId);
    
    // If the ID hasn't changed, don't reload
    if (mixedId === currentId && ready) {
      logger.info('ID unchanged, skipping reload');
      return;
    }
    
    // Update current ID
    setCurrentId(mixedId);
    
    if (!db) {
      setReady(true);

      if (persistenceEnabled) {
        logger.error('Chat persistence is unavailable despite being enabled');
        toast.error('Chat persistence is unavailable');
      }

      return;
    }

    if (mixedId) {
      // Reset state for new chat
      setInitialMessages([]);
      
      logger.info(`Loading chat with ID: ${mixedId}`);
      const loadChatHistory = async () => {
        try {
          // First try to load from IndexedDB
          const storedMessages = await getMessages(db, mixedId);
          
          if (storedMessages && storedMessages.messages.length > 0) {
            logger.info(`Found chat in IndexedDB with ${storedMessages.messages.length} messages`);
            setInitialMessages(storedMessages.messages);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id); // Use the stored ID, not mixedId
            urlId.set(storedMessages.urlId || storedMessages.id);
            chatId.set(storedMessages.id);
            setReady(true);

            // Load associated Python strategy files from database
            await loadStrategyFilesForChat(storedMessages.id);
            return;
          }
          
          // If not found in IndexedDB, try to load from Supabase
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            logger.info(`Trying to load chat from Supabase: ${mixedId}`);
            
            try {
              // Try RPC function first
              const rpcResult = await supabase.rpc('get_chat_by_id', {
                p_id: mixedId
              });
              
              if (rpcResult.error) {
                logger.info('RPC function failed, trying direct query');
                throw rpcResult.error;
              }
              
              if (rpcResult.data && rpcResult.data.length > 0) {
                const supabaseChat = rpcResult.data[0];
                logger.info(`Found chat in Supabase with ID: ${supabaseChat.id}`);

                // Parse messages from JSON
                const messages = typeof supabaseChat.messages === 'string'
                  ? JSON.parse(supabaseChat.messages)
                  : supabaseChat.messages;

                setInitialMessages(messages);
                description.set(supabaseChat.description);
                chatId.set(supabaseChat.id); // Use the actual stored ID
                urlId.set(supabaseChat.url_id);

                // Also save to IndexedDB for faster access next time
                if (db) {
                  await setMessages(
                    db,
                    supabaseChat.id,
                    messages,
                    supabaseChat.url_id,
                    supabaseChat.description
                  );
                }

                setReady(true);

                // Load associated Python strategy files from database
                await loadStrategyFilesForChat(supabaseChat.id);
                return;
              }
            } catch (rpcError) {
              // Fallback to direct query if RPC fails
              logger.info('RPC function failed, trying direct query');
            
              const directResult = await supabase
                .from('chat_history')
                .select('*')
                .or(`id.eq.${mixedId},url_id.eq.${mixedId}`)
                .eq('user_id', user.id)
                .limit(1);
                
              if (directResult.error) {
                logger.error(`Error loading chat from Supabase: ${directResult.error.message}`);
              } else if (directResult.data && directResult.data.length > 0) {
                const supabaseChat = directResult.data[0];
                logger.info(`Found chat in Supabase with ID: ${supabaseChat.id}`);

                // Parse messages from JSON
                const messages = typeof supabaseChat.messages === 'string'
                  ? JSON.parse(supabaseChat.messages)
                  : supabaseChat.messages;

                setInitialMessages(messages);
                description.set(supabaseChat.description);
                chatId.set(supabaseChat.id); // Use the actual stored ID
                urlId.set(supabaseChat.url_id);

                // Also save to IndexedDB for faster access next time
                if (db) {
                  await setMessages(
                    db,
                    supabaseChat.id,
                    messages,
                    supabaseChat.url_id,
                    supabaseChat.description
                  );
                }

                setReady(true);

                // Load associated Python strategy files from database
                await loadStrategyFilesForChat(supabaseChat.id);
                return;
              }
            }
          }
          
          // If we get here, the chat wasn't found anywhere
          // BUT: Check if there's a pending bot prompt - if so, allow the empty chat to exist
          const hasPendingBotPrompt = localStorage.getItem('pendingBotPrompt');
          if (hasPendingBotPrompt) {
            logger.info(`No messages found for ID: ${mixedId}, but pending bot prompt detected - allowing empty chat`);
            setInitialMessages([]);
            setReady(true);
            return;
          }
          
          logger.info(`No messages found for ID: ${mixedId}, redirecting to home`);
          navigate(`/`, { replace: true });
        } catch (error) {
          logger.error(`Error loading chat: ${error instanceof Error ? error.message : String(error)}`);
          toast.error('Failed to load chat history');
          setReady(true);
        }
      };
      
      loadChatHistory();
      setReady(true);

      // 🔧 FIX: Sync chats to Supabase asynchronously without blocking
      // This runs in the background and doesn't block UI operations
      setTimeout(() => {
        syncChatsToSupabase().catch(error => {
          console.error('[ChatHistory] Background sync failed:', error);
        });
      }, 100); // Small delay to let UI settle
    }
  }, [mixedId, navigate]);

  // 🔧 FIX: Function to sync chats to Supabase - runs asynchronously without blocking
  const syncChatsToSupabase = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !db) return;

      console.log('[ChatHistory] Starting background sync to Supabase');

      // Get all chats from IndexedDB
      const localChats = await getAll(db);

      // 🔧 FIX: Limit to syncing only the 10 most recent chats to reduce blocking
      // Sort by timestamp descending and take first 10
      const recentChats = localChats
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);

      console.log(`[ChatHistory] Syncing ${recentChats.length} most recent chats (of ${localChats.length} total)`);

      // 🔧 FIX: Use Promise.allSettled to sync in parallel without blocking each other
      const syncPromises = recentChats.map(chat =>
        syncChatWithSupabase(
          chat.id,
          chat.urlId || chat.id,
          chat.description || 'New Chat',
          chat.messages
        ).catch(error => {
          console.error(`[ChatHistory] Error syncing chat ${chat.id}:`, error);
          return null;
        })
      );

      await Promise.allSettled(syncPromises);

      console.log('[ChatHistory] Completed background sync to Supabase');
    } catch (error) {
      console.error('[ChatHistory] Error in syncChatsToSupabase:', error);
    }
  };
  
  return {
    ready: !mixedId || ready,
    initialMessages: initialMessages,
    storeMessageHistory: async (messages: Message[]) => {
      logger.info(`Storing ${messages.length} messages`);
      
      if (!db) {
        logger.info('IndexedDB not available, trying to store directly in Supabase');
        // Even without IndexedDB, we can still try to sync with Supabase
      }

      try {
        const firstArtifact = workbenchStore.firstArtifact;

        // Generate a description from the first user message if none exists
        if (!description.get() && messages.length > 0) {
          const firstUserMessage = messages.find(m => m.role === 'user')?.content;
          if (firstUserMessage) {
            const shortDescription = firstUserMessage.split('\n')[0].substring(0, 50);
            logger.info(`Setting description from first user message: ${shortDescription}`);
            description.set(shortDescription);
          }
        }

        // Get the current chat ID
        let currentChatId = chatId.get();
        let currentUrlIdValue = urlId.get();

        // If we have an artifact but no URL ID, generate one only if we don't have a current chat ID
        if (!currentUrlIdValue && firstArtifact?.id && !currentChatId) {
          logger.info(`Generating urlId from artifact ID: ${firstArtifact.id}`);
          const generatedUrlId = await getUrlId(db, firstArtifact.id);
          urlId.set(generatedUrlId);
          currentUrlIdValue = generatedUrlId;
          currentChatId = generatedUrlId; // Use the same ID for both
          chatId.set(currentChatId);

          navigateChat(generatedUrlId);
        }

        if (!description.get() && firstArtifact?.title) {
          logger.info(`Setting description from artifact title: ${firstArtifact.title}`);
          description.set(firstArtifact?.title);
        }

        // If this is a new chat and we don't have any ID, generate a new one
        if (initialMessages.length === 0 && !currentChatId && !currentUrlIdValue) {
          logger.info('Generating new chat ID for first-time chat');
          const nextId = await getNextId(db);
          chatId.set(nextId);
          currentChatId = nextId;
          currentUrlIdValue = nextId;
          urlId.set(nextId);

          logger.info(`Navigating to new chat: ${nextId}`);
          navigateChat(nextId);
        } else {
          // Use existing IDs if available
          currentChatId = currentChatId || currentUrlIdValue || 'default_chat_id';
          currentUrlIdValue = currentUrlIdValue || currentChatId;
        }

        const descriptionValue = description.get() || messages.find(m => m.role === 'user')?.content?.substring(0, 50) || 'New Chat';
        
        logger.info(`Saving chat with ID: ${currentChatId}, urlId: ${currentUrlIdValue}, description: ${descriptionValue}`);
        
        // Save to IndexedDB only - Supabase sync happens after file save
        if (db) {
          await setMessages(db, currentChatId, messages, currentUrlIdValue, descriptionValue);
          logger.info('Chat saved to IndexedDB, waiting for file save to complete before Supabase sync');
        }
        
      } catch (error) {
        logger.error(`Error in storeMessageHistory: ${error instanceof Error ? error.message : String(error)}`);
        toast.error('Failed to save chat history');
        throw error;
      }
    },
  };
}

function navigateChat(nextId: string) {
  logger.info(`Navigating to chat: ${nextId}`);
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}