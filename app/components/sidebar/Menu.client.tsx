import { useStore } from '@nanostores/react';
import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IoIosInformationCircleOutline } from "react-icons/io";
import { MdOutlinePrivacyTip } from "react-icons/md";
import { FiFileText } from "react-icons/fi";
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';
import { db, type ChatHistoryItem } from '~/lib/persistence';
import { chatId, urlId } from '~/lib/persistence/useChatHistory';
import { deleteById, getAll } from '~/lib/persistence/db';
import { authStore, hasAccess } from '~/lib/stores/auth';
import { cubicEasingFn } from '~/utils/easings';
import { logger } from '~/utils/logger';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { AuthDialog } from '../auth/AuthDialog';
import { supabase } from '~/lib/superbase/client';
import { Link, useNavigate, useLocation } from '@remix-run/react';
import { classNames } from '~/utils/classNames';
import { TokenCounter } from '../subscription/TokenCounter';

const menuVariants = {
  closed: {
    width: '64px',
    transition: {
      duration: 0.3,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: '225px', // Restored to original size
    transition: {
      duration: 0.3,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

// Helper functions for fetching live bot data (BotDashboard approach)
const heartbeatInterval = 60;
const stalenessThreshold = heartbeatInterval * 2;

const apiHostForExchange = (name?: string) => {
  const n = (name || '').trim().toLowerCase();
  return n === 'binanceus' ? 'https://10xtraders.ai' : 'https://eu.10xtraders.ai';
};

const apiFetch = (path: string, options?: RequestInit, exchangeNameParam?: string) => {
  if (path.startsWith('/apa/')) {
    return fetch(path, options);
  }
  const base = apiHostForExchange(exchangeNameParam);
  const url = path.startsWith('http') ? path : `${base}${path}`;
  return fetch(url, options);
};

// Fetch live bot status using health endpoint
const fetchLiveBotStatus = async (strategy: string, exchange: string): Promise<string> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'stopped';

    const apiUsername = 'meghan';
    const apiPassword = session.user.id;

    const healthResponse = await apiFetch(`/user/${strategy}/api/v1/health`, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
      }
    }, exchange);

    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      const nowTs = Math.floor(Date.now() / 1000);
      const age = nowTs - healthData.last_process_ts;

      return age < stalenessThreshold ? 'running' : 'stopped';
    } else {
      return 'stopped';
    }
  } catch (error) {
    return 'stopped';
  }
};

// Fetch profit data
const fetchBotProfit = async (strategy: string, exchange: string): Promise<number | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const apiUsername = 'meghan';
    const apiPassword = session.user.id;

    const resp = await apiFetch(`/user/${strategy}/api/v1/profit`, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
      }
    }, exchange);

    if (!resp.ok) return null;

    const payload = await resp.json();
    return payload.profit_all_fiat ?? payload.profit_all_coin ?? 0;
  } catch (error) {
    return null;
  }
};

// Fetch balance data
const fetchBotBalance = async (strategy: string, exchange: string): Promise<number | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const apiUsername = 'meghan';
    const apiPassword = session.user.id;

    const resp = await apiFetch(`/user/${strategy}/api/v1/balance`, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`)
      }
    }, exchange);

    if (!resp.ok) return null;

    const payload = await resp.json();

    // Calculate total balance from all currencies
    if (Array.isArray(payload.currencies)) {
      return payload.currencies.reduce((sum: number, c: any) => sum + (c.total || 0), 0);
    }

    return null;
  } catch (error) {
    return null;
  }
};

export function Menu() {
  const { isAuthenticated } = useStore(authStore);
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [allBotConfigurations, setAllBotConfigurations] = useState<any[]>([]);
  const [strategyChatIds, setStrategyChatIds] = useState<Record<string, string>>({}); // Strategy name → Chat ID (BotList.tsx approach)
  const [open, setOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<{ type: 'delete'; item: ChatHistoryItem } | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [supabaseChats, setSupabaseChats] = useState<ChatHistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'bots'>('all');
  const navigate = useNavigate();
  const location = useLocation();
  const isHomepage = location.pathname === '/';

  // Filter list based on active filter (BotList.tsx verbatim approach)
  // A chat is a "bot" if its chat_id appears in strategyChatIds (created from bot_configurations)
  const filteredList = historyFilter === 'bots'
    ? list.filter(item => {
        // Check if this chat's ID appears in the strategy-to-chat mapping
        // This matches how BotList.tsx determines if a strategy has a chat
        const chatIsLinkedToStrategy = Object.values(strategyChatIds).includes(item.id);

        if (chatIsLinkedToStrategy) {
          console.log('[Menu] Chat matched as bot:', item.description, '→ Chat ID:', item.id);
        }

        return chatIsLinkedToStrategy;
      })
    : list;

  console.log('[Menu] Filter:', historyFilter, '| Total chats:', list.length, '| Filtered (bots):', filteredList.length, '| Bot configs:', allBotConfigurations.length, '| Strategy mappings:', Object.keys(strategyChatIds).length);

  // Handle edit bot configuration
  const handleEditBot = (item: ChatHistoryItem) => {
    if (item.botId) {
      navigate(`/bots/edit/${item.botId}`);
    } else {
      toast.info('This chat has no deployed bot yet');
    }
  };

  // Keep track of current chat ID
  useEffect(() => {
    const id = chatId.get();
    if (id) {
      setCurrentChatId(id);
      console.log('[Menu] Current chat ID set to:', id);
    }
  }, [chatId.get()]);

  const refreshSubscription = async (userId: string) => {
    try {
      console.log('[Menu] Refreshing subscription for user:', userId);
      
      const { data: sub, error: subError } = await supabase
        .from('subscriptions')
        .select(`
          *,
          subscription_plans (
            id,
            name,
            price_monthly,
            tokens_included
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      
      if (subError) {
        console.error('[Menu] Error fetching subscription:', subError);
        return;
      }

      console.log('[Menu] Updated subscription:', sub);
      setSubscription(sub);

    } catch (error) {
      console.error('[Menu] Error refreshing subscription:', error);
    }
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            // console.log("Access Token:", session.access_token);
            // console.log("User ID:", session.user.id);  // The unique user_id from Supabase Auth
            console.log("User ID:");  // The unique user_id from Supabase Auth
        }
        
        if (error) {
          console.error('[Menu] Error fetching user:', error);
          return;
        }

        if (user) {
          setUserData({
            ...user,
            user_metadata: {
              ...user.user_metadata,
              avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || "/profile.png",
            }
          });
          
          await refreshSubscription(user.id);

          // Subscribe to subscription changes
          const subscriptionChannel = supabase
            .channel('subscription_changes')
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'subscriptions',
                filter: `user_id=eq.${user.id}`
              },
              async (payload) => {
                console.log('[Menu] Subscription change detected:', payload);
                await refreshSubscription(user.id);
              }
            )
            .subscribe();

          return () => {
            subscriptionChannel.unsubscribe();
          };
        }
      } catch (error) {
        console.error('[Menu] Error in fetchUserData:', error);
      }
    };

    if (isAuthenticated) {
      fetchUserData();
    }
  }, [isAuthenticated]);

  const loadEntries = useCallback(() => {
    if (db && isAuthenticated) {
      setLoadingHistory(true);
      loadChatHistory();
      loadBotConfigurations(); // Load bot_configurations directly like BotList.tsx

      // Note: Chat sync to Supabase is now handled separately to avoid conflicts
      // with ActionRunner database operations during message processing
    }
  }, [isAuthenticated]);
  
  // Function to load chat history from both IndexedDB and Supabase
  const loadChatHistory = async () => {
    console.log('[Menu] Loading chat history entries');
    try {
      // First load from IndexedDB
      let localChats: ChatHistoryItem[] = [];
      if (db) {
        const indexedDBList = await getAll(db);
        console.log('[Menu] Retrieved chat history from IndexedDB:', indexedDBList.length, 'entries');
        
        // Make sure we only show items with a description
        localChats = indexedDBList.filter((item) => item.description);
        console.log('[Menu] Filtered chat history from IndexedDB:', localChats.length, 'entries');
      }
      
      // If user is authenticated, try to load from Supabase as well
      if (isAuthenticated) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            try {
              // Try RPC function first
              const rpcResult = await supabase.rpc('get_user_chat_history');
              
              if (rpcResult.error) {
                console.log('[Menu] RPC function failed, trying direct query:', rpcResult.error.message);
                throw rpcResult.error;
              }
              
              if (rpcResult.data) {
                console.log('[Menu] Retrieved chat history from Supabase RPC:', rpcResult.data.length, 'entries');
                
                // Convert Supabase data to ChatHistoryItem format
                const supabaseItems: ChatHistoryItem[] = rpcResult.data.map(item => ({
                  id: item.id,
                  urlId: item.url_id,
                  description: item.description,
                  messages: item.messages,
                  timestamp: item.chat_timestamp || item.timestamp,
                  botStatus: item.bot_status,
                  botId: item.bot_id,
                  openTrades: item.open_trades,
                  hasDeployedBot: item.has_deployed_bot
                }));
                
                setSupabaseChats(supabaseItems);
                
                // Merge lists, preferring Supabase items when IDs match
                const mergedList = [...localChats];
                
                for (const supabaseItem of supabaseItems) {
                  const existingIndex = mergedList.findIndex(item => 
                    item.id === supabaseItem.id || item.urlId === supabaseItem.urlId
                  );
                  
                  if (existingIndex >= 0) {
                    // Replace with Supabase version
                    mergedList[existingIndex] = supabaseItem;
                  } else {
                    // Add new item
                    mergedList.push(supabaseItem);
                  }
                }
                
                console.log('[Menu] Merged chat history:', mergedList.length, 'entries');
                setList(mergedList);
                setLoadingHistory(false);

                // Fetch live data for deployed bots
                fetchLiveDataForBots(mergedList);
                return;
              }
            } catch (rpcError) {
              // Fallback to direct query
              console.log('[Menu] RPC function failed, trying direct query');
              try {
                const directResult = await supabase
                  .from('chat_history')
                  .select('*')
                  .eq('user_id', user.id)
                  .order('timestamp', { ascending: false });
                  
                if (directResult.error) {
                  console.error('[Menu] Error with direct query:', directResult.error);
                  throw directResult.error;
                }
                
                if (directResult.data) {
                  console.log('[Menu] Retrieved chat history from direct query:', directResult.data.length, 'entries');
                  
                  // Convert Supabase data to ChatHistoryItem format (fallback without bot status)
                  const supabaseItems: ChatHistoryItem[] = directResult.data.map(item => ({
                    id: item.id,
                    urlId: item.url_id,
                    description: item.description,
                    messages: item.messages,
                    timestamp: item.timestamp
                  }));
                  
                  setSupabaseChats(supabaseItems);
                  
                  // Merge lists, preferring Supabase items when IDs match
                  const mergedList = [...localChats];
                  
                  for (const supabaseItem of supabaseItems) {
                    const existingIndex = mergedList.findIndex(item => 
                      item.id === supabaseItem.id || item.urlId === supabaseItem.urlId
                    );
                    
                    if (existingIndex >= 0) {
                      // Replace with Supabase version
                      mergedList[existingIndex] = supabaseItem;
                    } else {
                      // Add new item
                      mergedList.push(supabaseItem);
                    }
                  }
                  
                  console.log('[Menu] Merged chat history:', mergedList.length, 'entries');
                  setList(mergedList);
                  setLoadingHistory(false);

                  // Fetch live data for deployed bots
                  fetchLiveDataForBots(mergedList);
                  return;
                }
              } catch (directError) {
                console.error('[Menu] Error with direct query:', directError);
              }
            }
          }
        } catch (supabaseError) {
          console.error('[Menu] Error in Supabase chat history fetch:', supabaseError);
        }
      }
      
      // If we get here, either user is not authenticated or Supabase fetch failed
      setList(localChats);
    } catch (error) {
      console.error('[Menu] Error loading chat history:', error);
      toast.error('Failed to load chat history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load bot configurations with CORRECT relationship: bot_configurations.name = trading_scripts.name
  const loadBotConfigurations = async () => {
    if (!isAuthenticated) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('[Menu] 🔄 Loading bot_configurations (using name field as join key)');

      const { data, error } = await supabase
        .from('bot_configurations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Menu] ❌ Error loading bot_configurations:', error);
        return;
      }

      console.log('[Menu] ✅ Loaded', data?.length || 0, 'bot_configurations');
      setAllBotConfigurations(data || []);

      // CORRECT APPROACH: Use bot_configurations.name (not config.strategy)
      // bot_configurations.name is the authoritative strategy/bot name
      if (data && data.length > 0) {
        const botNames = data
          .map(config => config.name) // ← Use name field directly
          .filter(Boolean);

        if (botNames.length > 0) {
          console.log('[Menu] 🔍 Fetching chat_ids for bot names:', botNames);

          // Join with trading_scripts using name field
          const { data: scriptsData, error: scriptsError } = await supabase
            .from('trading_scripts')
            .select('name, chat_id, content') // ← Include content for Python code
            .eq('user_id', user.id)
            .in('name', botNames); // ← Join on name field

          if (scriptsError) {
            console.error('[Menu] ❌ Error fetching chat_ids:', scriptsError);
          } else if (scriptsData) {
            console.log('[Menu] ✅ Retrieved', scriptsData.length, 'trading_scripts with chat_ids');

            // Create bot name → chat_id mapping
            const chatIdMap: Record<string, string> = {};
            scriptsData.forEach(script => {
              if (script.chat_id) {
                chatIdMap[script.name] = script.chat_id;
                console.log(`[Menu] 🔗 Bot "${script.name}" → Chat ID: ${script.chat_id}`);
              }
            });

            setStrategyChatIds(chatIdMap);
            console.log('[Menu] ✅ Bot-to-Chat mapping complete:', Object.keys(chatIdMap).length, 'bots');
          }
        }
      }
    } catch (error) {
      console.error('[Menu] ❌ Error in loadBotConfigurations:', error);
    }
  };

  // Fetch live data for deployed bots
  const fetchLiveDataForBots = async (chatList: ChatHistoryItem[]) => {
    if (!isAuthenticated) return;

    console.log('[Menu] Fetching live data for', chatList.length, 'chats');

    // Only fetch for bots that have been deployed
    const deployedBots = chatList.filter(item => item.has_deployed_bot);

    if (deployedBots.length === 0) return;

    // Fetch strategy names and exchange info for each deployed bot
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch all bot configs in one query
    const { data: botConfigs } = await supabase
      .from('bot_configurations')
      .select('id, config')
      .eq('user_id', user.id);

    if (!botConfigs) return;

    // Fetch live data for each bot
    const updatedList = await Promise.all(
      chatList.map(async (item) => {
        if (!item.has_deployed_bot) return item;

        try {
          // Find the bot config
          const { data: scriptData } = await supabase
            .from('trading_scripts')
            .select('name')
            .eq('chat_id', item.id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (!scriptData) return item;

          const botConfig = botConfigs.find((bc: any) => {
            const config = typeof bc.config === 'string' ? JSON.parse(bc.config) : bc.config;
            return config.strategy === scriptData.name;
          });

          if (!botConfig) return item;

          const config = typeof botConfig.config === 'string' ? JSON.parse(botConfig.config) : botConfig.config;
          const exObj = config?.exchange;
          const exchange = typeof exObj === 'string' ? exObj : (exObj?.name || exObj?.exchange?.name || '');

          // Fetch live status, profit, balance in parallel
          const [liveStatus, profit, balance, tradesResp] = await Promise.allSettled([
            fetchLiveBotStatus(scriptData.name, exchange),
            fetchBotProfit(scriptData.name, exchange),
            fetchBotBalance(scriptData.name, exchange),
            apiFetch(`/user/${scriptData.name}/api/v1/status`, {
              headers: {
                'Authorization': 'Basic ' + btoa(`meghan:${user.id}`)
              }
            }, exchange)
          ]);

          // Process results
          const status = liveStatus.status === 'fulfilled' ? liveStatus.value : item.bot_status;
          const profitValue = profit.status === 'fulfilled' ? profit.value : null;
          const balanceValue = balance.status === 'fulfilled' ? balance.value : null;

          let openTrades = item.open_trades || 0;
          if (tradesResp.status === 'fulfilled' && tradesResp.value.ok) {
            const tradesData = await tradesResp.value.json();
            openTrades = Array.isArray(tradesData) ? tradesData.length : (tradesData.open_trades?.length || 0);
          }

          return {
            ...item,
            bot_status: status,
            open_trades: openTrades,
            profit: profitValue,
            balance: balanceValue,
            exchange: exchange
          };
        } catch (error) {
          console.error(`[Menu] Error fetching live data for ${item.id}:`, error);
          return item;
        }
      })
    );

    setList(updatedList);
  };

  const deleteItem = useCallback(
    (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();
      
      const deleteChat = async () => {
        try {
          // Delete from IndexedDB if available
          if (db) {
            await deleteById(db, item.id);
          }
          
          // Delete from Supabase if authenticated
          if (isAuthenticated) {
            try {
              // Try RPC function first
              const { error } = await supabase.rpc('delete_chat_by_id', {
                p_id: item.id
              });
              
              if (error) {
                console.error('[Menu] Error deleting chat from Supabase RPC:', error);
                throw error;
              }
            } catch (rpcError) {
              console.log('[Menu] RPC delete failed, trying direct delete');
              
              // Fallback to direct delete
              const { error: deleteError } = await supabase
                .from('chat_history')
                .delete()
                .eq('id', item.id)
                .eq('user_id', (await supabase.auth.getUser()).data.user?.id);
                
              if (deleteError) {
                console.error('[Menu] Error with direct delete:', deleteError);
                throw deleteError;
              }
            }
          }
          
          // Reload the chat list
          loadChatHistory();
          
          // If the deleted chat is the current one, navigate to home
          if (chatId.get() === item.id || urlId.get() === item.id) {
            // Clear chat state
            chatId.set(undefined);
            urlId.set(undefined);
            
            // Navigate to home
            window.location.href = '/';
          }
        } catch (error) {
          toast.error('Failed to delete conversation');
          logger.error(error);
        }
      };
      
      if (db || isAuthenticated) {
        deleteChat();
      }
    },
    [isAuthenticated, db],
  );

  useEffect(() => {
    if (open) {
      loadEntries();
    } else {
      console.log('[Menu] Not loading entries:', { open, isAuthenticated });
    }
  }, [open, loadEntries, isAuthenticated]);

  useEffect(() => {
    const enterThreshold = 40;
    const exitThreshold = 40;

    function onMouseMove(event: MouseEvent) {
      if (event.pageX < enterThreshold) {
        setOpen(true);
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        setOpen(false);
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  // Hide sidebar completely when not authenticated - cleaner UX
  if (!isAuthenticated) {
    return (
      <>
        <AuthDialog isOpen={showAuthDialog} onClose={() => setShowAuthDialog(false)} mode="signin" />
        {/* No sidebar shown when not authenticated - user uses header auth buttons */}
      </>
    );
  }

  return (
    <motion.div
      ref={menuRef}
      initial="closed"
      animate={open ? 'open' : 'closed'}
      variants={menuVariants}
      className="flex flex-col side-menu fixed left-0 bg-bolt-elements-background-depth-2 border-r border-bolt-elements-borderColor z-sidebar shadow-lg overflow-hidden"
      style={{
        top: 'var(--header-height)',
        height: 'calc(100vh - var(--header-height) - var(--footer-height))',
        bottom: 'var(--footer-height)'
      }}
    >
      <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
        {/* Top Section - No padding top, starts at the very top */}
        <div className={open ? "px-4 pt-3 pb-2" : "p-2 pb-2"}>
          {/* New Chat Button */}
          <a
            href="/"
            className={classNames(
              "flex gap-2 items-center w-full rounded-lg transition-colors",
              "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text",
              "hover:bg-bolt-elements-button-primary-backgroundHover",
              "font-medium text-sm",
              open ? "px-4 py-2.5" : "px-2 py-2 justify-center"
            )}
            title="New Chat"
          >
            {open ? (
              <>
                <span className="inline-block i-bolt:chat scale-110" />
                <span>New Chat</span>
              </>
            ) : (
              <div className="flex items-center gap-0.5">
                <span className="inline-block i-bolt:chat scale-90" />
                <div className="i-ph:robot text-base scale-90" />
              </div>
            )}
          </a>
        </div>

        {/* Chat History Section - Expanded to fill remaining space */}
        <div className={classNames("flex-1 overflow-auto pb-2", open ? "px-4" : "hidden")}>
          {/* Section Header with Filter Tabs */}
          <div className="pt-2 mb-2 border-t border-bolt-elements-borderColor/30">
            <div className="flex gap-1 text-xs font-medium">
              <button
                onClick={() => setHistoryFilter('all')}
                className={classNames(
                  "px-2 py-1 rounded transition-colors",
                  historyFilter === 'all'
                    ? "bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary"
                    : "text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
                )}
              >
                All Chats
              </button>
              <button
                onClick={() => setHistoryFilter('bots')}
                className={classNames(
                  "px-2 py-1 rounded transition-colors",
                  historyFilter === 'bots'
                    ? "bg-bolt-elements-item-backgroundActive text-bolt-elements-textPrimary"
                    : "text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
                )}
              >
                Bots Only
              </button>
            </div>
          </div>
          {loadingHistory ? (
            <div className="text-bolt-elements-textTertiary flex items-center justify-center py-4">
              <div className="i-svg-spinners:90-ring-with-bg animate-spin mr-2" />
              Loading...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="text-bolt-elements-textTertiary py-2">
              {historyFilter === 'bots' ? 'No deployed bots yet' : 'No previous conversations'}
            </div>
          ) : null}
          <DialogRoot open={dialogContent !== null}>
            {binDates(filteredList).map(({ category, items }) => (
              <div key={category} className="mt-2 first:mt-0 space-y-1">
                <div className="text-bolt-elements-textTertiary text-xs sticky top-0 z-1 bg-bolt-elements-background-depth-2 py-1">
                  {category}
                </div>
                {items.map((item) => (
                  <HistoryItem
                    key={item.id}
                    item={item}
                    onDelete={() => setDialogContent({ type: 'delete', item })}
                    onEdit={() => handleEditBot(item)}
                  />
                ))}
              </div>
            ))}
            <Dialog onBackdrop={() => setDialogContent(null)} onClose={() => setDialogContent(null)}>
              {dialogContent?.type === 'delete' && (
                <>
                  <DialogTitle>Delete Chat?</DialogTitle>
                  <DialogDescription asChild>
                    <div>
                      <p>
                        You are about to delete <strong>{dialogContent.item.description}</strong>.
                      </p>
                      <p className="mt-1">Are you sure you want to delete this chat?</p>
                    </div>
                  </DialogDescription>
                  <div className="px-5 pb-4 bg-bolt-elements-background-depth-2 flex gap-2 justify-end">
                    <DialogButton type="secondary" onClick={() => setDialogContent(null)}>
                      Cancel
                    </DialogButton>
                    <DialogButton
                      type="danger"
                      onClick={(event) => {
                        deleteItem(event, dialogContent.item);
                        setDialogContent(null);
                      }}
                    >
                      Delete
                    </DialogButton>
                  </div>
                </>
              )}
            </Dialog>
          </DialogRoot>
        </div>

        {/* Menu Items Section */}
        <div className="mt-auto border-t border-bolt-elements-borderColor">
          <div className={open ? "p-2 space-y-0" : "p-1 space-y-1"}>
            {/* Admin Statistics - Only visible to admin users */}
            {userData && (
              userData.app_metadata?.is_admin === true ||
              userData.email === '10xtraders.ai@gmail.com' ||
              userData.email === 'bmutua350@gmail.com'
            ) && (
              <Link
                to="/admin/statistics"
                className={classNames(
                  "flex items-center gap-2 bg-white/0 hover:bg-gray-100 dark:hover:bg-gray-100/10 duration-300 w-full text-accent-500 hover:text-accent-600 text-xs",
                  open ? "p-2" : "p-2 justify-center"
                )}
                title="Statistics"
              >
                <div className="i-ph:chart-bar text-lg" />
                {open && <span>Statistics</span>}
              </Link>
            )}

            <Link
              to="/subscription/plans"
              className={classNames(
                "flex items-center gap-2 bg-white/0 hover:bg-gray-100 dark:hover:bg-gray-100/10 duration-300 w-full text-accent-500 hover:text-accent-600 text-xs",
                open ? "p-2" : "p-2 justify-center"
              )}
              title="My Subscription"
            >
              <div className="i-ph:star text-lg" />
              {open && <span>My Subscription</span>}
            </Link>
          </div>
        </div>
        
      </div>
    </motion.div>
  );
}