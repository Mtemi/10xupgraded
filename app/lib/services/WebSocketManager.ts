// app/lib/services/WebSocketManager.ts
import { createScopedLogger } from '~/utils/logger';
import { supabase } from '~/lib/superbase/client';

const logger = createScopedLogger('WebSocketManager');

export type FreqtradeEventType = 
  | 'status' 
  | 'startup' 
  | 'entry' 
  | 'entry_fill' 
  | 'exit' 
  | 'exit_fill' 
  | 'warning' 
  | 'strategy_msg'
  | 'whitelist'
  | 'analyzed_df'
  | 'new_candle'
  | 'candle'
  | 'protection_trigger'
  | 'protection_trigger_global'
  | 'entry_cancel'
  | 'exit_cancel';

export interface FreqtradeEvent {
  type: FreqtradeEventType;
  data: any;
  // For candle events
  ts?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
}

interface WebSocketConnection {
  ws: WebSocket;
  strategyName: string;
  subscribers: Map<string, (event: FreqtradeEvent) => void>;
  isConnected: boolean;
  isConnecting: boolean;
  reconnectAttempts: number;
  reconnectTimeout: NodeJS.Timeout | null;
}

interface SubscriptionOptions {
  strategyName: string;
  subscriberId: string;
  eventTypes?: FreqtradeEventType[];
  onEvent: (event: FreqtradeEvent) => void;
}

class WebSocketManagerClass {
  private connections: Map<string, WebSocketConnection> = new Map();
  private maxReconnectAttempts = 5;

  constructor() {
    logger.info('WebSocket Manager initialized');
  }

  async subscribe({ strategyName, subscriberId, eventTypes = ['status', 'startup', 'entry', 'entry_fill', 'exit', 'exit_fill', 'warning', 'strategy_msg'], onEvent }: SubscriptionOptions): Promise<boolean> {
    if (!strategyName) {
      logger.warn('Cannot subscribe: No strategy name provided');
      return false;
    }

    try {
      // Get the current user for authentication
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('User not authenticated');

      // Get or create connection
      let connection = this.connections.get(strategyName);
      
      if (!connection) {
        // Create a new connection
        connection = {
          ws: null as unknown as WebSocket,
          strategyName,
          subscribers: new Map(),
          isConnected: false,
          isConnecting: false,
          reconnectAttempts: 0,
          reconnectTimeout: null
        };
        
        this.connections.set(strategyName, connection);
        this.initializeConnection(strategyName, user.id);
      }
      
      // Add subscriber
      connection.subscribers.set(subscriberId, onEvent);
      
      // If already connected, subscribe to events
      if (connection.isConnected && connection.ws) {
        this.sendSubscription(connection.ws, eventTypes);
      }
      
      logger.info(`Subscribed ${subscriberId} to ${strategyName} events: ${eventTypes.join(', ')}`);
      return true;
    } catch (error) {
      logger.error('Error subscribing to WebSocket:', error);
      return false;
    }
  }

  unsubscribe(strategyName: string, subscriberId: string): void {
    const connection = this.connections.get(strategyName);
    if (!connection) return;
    
    connection.subscribers.delete(subscriberId);
    logger.info(`Unsubscribed ${subscriberId} from ${strategyName}`);
    
    // If no more subscribers, close the connection
    if (connection.subscribers.size === 0) {
      this.closeConnection(strategyName);
    }
  }

  private async initializeConnection(strategyName: string, userId: string): Promise<void> {
    const connection = this.connections.get(strategyName);
    if (!connection || connection.isConnecting) return;
    
    connection.isConnecting = true;
    
    try {
      // Create WebSocket URL with user ID as token
      const wsUrl = `wss://10xtraders.ai/user/${strategyName}/api/v1/message/ws?token=${userId}`;
      logger.info(`Connecting to ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      connection.ws = ws;
      
      ws.onopen = () => {
        logger.info(`Connected to ${strategyName} WebSocket`);
        connection.isConnected = true;
        connection.isConnecting = false;
        connection.reconnectAttempts = 0;
        
        // Subscribe to events for all subscribers
        const allEventTypes = new Set<FreqtradeEventType>();
        connection.subscribers.forEach((_, subscriberId) => {
          // Default event types if not specified
          ['status', 'startup', 'entry', 'entry_fill', 'exit', 'exit_fill', 'warning', 'strategy_msg'].forEach(
            type => allEventTypes.add(type as FreqtradeEventType)
          );
        });
        
        this.sendSubscription(ws, Array.from(allEventTypes));
      };
      
      ws.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data) as FreqtradeEvent;
          
          // Dispatch to all subscribers
          connection.subscribers.forEach((callback) => {
            callback(eventData);
          });
        } catch (err) {
          logger.error('Error parsing WebSocket message:', err);
        }
      };
      
      ws.onerror = (event) => {
        logger.error(`WebSocket error for ${strategyName}:`, event);
        connection.isConnected = false;
        connection.isConnecting = false;
      };
      
      ws.onclose = (event) => {
        logger.info(`WebSocket closed for ${strategyName}: ${event.code} ${event.reason}`);
        connection.isConnected = false;
        connection.isConnecting = false;
        
        // Attempt to reconnect if not closed cleanly
        this.scheduleReconnect(strategyName, userId);
      };
    } catch (error) {
      logger.error(`Error initializing WebSocket for ${strategyName}:`, error);
      connection.isConnecting = false;
      
      // Schedule reconnect
      this.scheduleReconnect(strategyName, userId);
    }
  }

  private scheduleReconnect(strategyName: string, userId: string): void {
    const connection = this.connections.get(strategyName);
    if (!connection) return;
    
    // Clear any existing reconnect timeout
    if (connection.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout);
      connection.reconnectTimeout = null;
    }
    
    // Check if we've exceeded max attempts
    if (connection.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn(`Maximum reconnection attempts reached for ${strategyName}`);
      return;
    }
    
    // Exponential backoff
    const delay = Math.min(1000 * Math.pow(2, connection.reconnectAttempts), 30000);
    logger.info(`Scheduling reconnect for ${strategyName} in ${delay}ms (attempt ${connection.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
    
    connection.reconnectTimeout = setTimeout(() => {
      connection.reconnectAttempts += 1;
      this.initializeConnection(strategyName, userId);
    }, delay);
  }

  private closeConnection(strategyName: string): void {
    const connection = this.connections.get(strategyName);
    if (!connection) return;
    
    logger.info(`Closing connection for ${strategyName}`);
    
    // Clear any reconnect timeout
    if (connection.reconnectTimeout) {
      clearTimeout(connection.reconnectTimeout);
      connection.reconnectTimeout = null;
    }
    
    // Close WebSocket
    if (connection.ws) {
      try {
        connection.ws.close();
      } catch (error) {
        logger.error(`Error closing WebSocket for ${strategyName}:`, error);
      }
    }
    
    // Remove connection
    this.connections.delete(strategyName);
  }

  private sendSubscription(ws: WebSocket, eventTypes: FreqtradeEventType[]): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    const subscribeMsg = {
      type: 'subscribe',
      data: eventTypes
    };
    
    try {
      ws.send(JSON.stringify(subscribeMsg));
      logger.info(`Subscribed to events: ${eventTypes.join(', ')}`);
    } catch (error) {
      logger.error('Error sending subscription message:', error);
    }
  }

  // Method to check if a connection exists and is connected
  isConnected(strategyName: string): boolean {
    const connection = this.connections.get(strategyName);
    return !!connection && connection.isConnected;
  }

  // Method to get connection stats for debugging
  getConnectionStats(): { strategyName: string; subscribers: number; connected: boolean }[] {
    return Array.from(this.connections.entries()).map(([strategyName, connection]) => ({
      strategyName,
      subscribers: connection.subscribers.size,
      connected: connection.isConnected
    }));
  }
}

// Create a singleton instance
export const WebSocketManager = new WebSocketManagerClass();
