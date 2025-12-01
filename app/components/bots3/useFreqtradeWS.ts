import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';

// Define event types that we'll subscribe to
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
  | 'protection_trigger'
  | 'protection_trigger_global'
  | 'entry_cancel'
  | 'exit_cancel';

// Define the event data structure
export interface FreqtradeEvent {
  type: FreqtradeEventType;
  data: any;
}

// Define the hook props
interface UseFreqtradeWSProps {
  strategyName?: string;
  enabled?: boolean;
  onEvent?: (event: FreqtradeEvent) => void;
  eventTypes?: FreqtradeEventType[];
}

export function useFreqtradeWS({
  strategyName,
  enabled = true,
  onEvent,
  eventTypes = ['status', 'startup', 'entry', 'entry_fill', 'exit', 'exit_fill', 'warning', 'strategy_msg']
}: UseFreqtradeWSProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<FreqtradeEvent | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  
  // Clean up function to handle WebSocket closure
  const cleanUp = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    setIsConnected(false);
  }, []);
  
  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (!strategyName || !enabled || isConnecting || isConnected) return;
    
    try {
      setIsConnecting(true);
      setError(null);
      
      // Get the current user for authentication
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('User not authenticated');
      
      // Create WebSocket URL with user ID as token
      const wsUrl = `wss://10xtraders.ai/user/${strategyName}/api/v1/message/ws?token=${user.id}`;
      // console.log(`[FreqtradeWS] Connecting to ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        // console.log(`[FreqtradeWS] Connected to ${strategyName} WebSocket`);
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
        
        // Subscribe to events
        const subscribeMsg = {
          type: 'subscribe',
          data: eventTypes
        };
        ws.send(JSON.stringify(subscribeMsg));
        // console.log(`[FreqtradeWS] Subscribed to events: ${eventTypes.join(', ')}`);
      };
      
      ws.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data) as FreqtradeEvent;
          // console.log(`[FreqtradeWS] Received event: ${eventData.type}`, eventData.data);
          
          // Update last event state
          setLastEvent(eventData);
          
          // Call the onEvent callback if provided
          if (onEvent) {
            onEvent(eventData);
          }
        } catch (err) {
          // console.error('[FreqtradeWS] Error parsing message:', err, event.data);
        }
      };
      
      ws.onerror = (event) => {
        // console.error(`[FreqtradeWS] WebSocket error:`, event);
        setError('WebSocket connection error');
        setIsConnecting(false);
      };
      
      ws.onclose = (event) => {
        // console.log(`[FreqtradeWS] WebSocket closed: ${event.code} ${event.reason}`);
        setIsConnected(false);
        setIsConnecting(false);
        
        // Attempt to reconnect if not closed cleanly and we haven't exceeded max attempts
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
          // console.log(`[FreqtradeWS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Maximum reconnection attempts reached');
          // console.log(`[FreqtradeWS] Failed to connect to ${strategyName} bot. Please refresh the page.`);
        }
      };
    } catch (err) {
      // console.error('[FreqtradeWS] Connection error:', err);
      setError(err instanceof Error ? err.message : 'Unknown connection error');
      setIsConnecting(false);
    }
  }, [strategyName, enabled, isConnecting, isConnected, eventTypes, onEvent]);
  
  // Reconnect function
  const reconnect = useCallback(() => {
    cleanUp();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [cleanUp, connect]);
  
  // Initialize connection
  useEffect(() => {
    if (enabled && strategyName) {
      connect();
    }
    
    return () => {
      cleanUp();
    };
  }, [strategyName, enabled, connect, cleanUp]);
  
  // Send a message to the WebSocket
  const sendMessage = useCallback((message: any) => {
    if (!isConnected || !wsRef.current) {
      // console.error('[FreqtradeWS] Cannot send message: WebSocket not connected');
      return false;
    }
    
    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch (err) {
      // console.error('[FreqtradeWS] Error sending message:', err);
      return false;
    }
  }, [isConnected]);
  
  return {
    isConnected,
    isConnecting,
    error,
    lastEvent,
    reconnect,
    sendMessage
  };
}