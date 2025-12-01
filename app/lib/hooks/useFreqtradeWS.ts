import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '~/lib/superbase/client';

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

export interface FreqtradeEvent {
  type: FreqtradeEventType;
  data: any;
}

type UseFreqtradeWSProps = {
  strategyName?: string;
  enabled?: boolean;
  onEvent?: (event: FreqtradeEvent) => void;
  eventTypes?: FreqtradeEventType[];
  exchangeName?: string; // PATCH: provide host context from caller
};

// PATCH: same single source of truth as backend (only binanceus => US, else EU)
const apiHostForExchange = (name?: string) => {
  const n = (name || '').trim().toLowerCase();
  return n === 'binanceus' ? 'https://10xtraders.ai' : 'https://eu.10xtraders.ai';
};

export function useFreqtradeWS({
  strategyName,
  enabled = true,
  onEvent,
  exchangeName,
  eventTypes = ['status', 'startup', 'entry', 'entry_fill', 'exit', 'exit_fill', 'warning', 'strategy_msg'],
}: UseFreqtradeWSProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<FreqtradeEvent | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  const cleanUp = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(async () => {
    if (!strategyName || !enabled || isConnecting || isConnected) return;

    try {
      setIsConnecting(true);
      setError(null);

      // Only need the user id for ws token (bot-side ws_token == user.id)
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('User not authenticated');

      const domain = apiHostForExchange(exchangeName);
      const wsUrl = `wss://${domain.replace(/^https?:\/\//, '')}/user/${strategyName}/api/v1/message/ws?token=${user.id}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        reconnectAttemptsRef.current = 0;
        ws.send(JSON.stringify({ type: 'subscribe', data: eventTypes }));
      };

      ws.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data) as FreqtradeEvent;
          setLastEvent(eventData);
          onEvent?.(eventData);
        } catch {
          // swallow parse errors
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection error');
        setIsConnecting(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        if (enabled && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Maximum reconnection attempts reached');
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown connection error');
      setIsConnecting(false);
    }
  }, [strategyName, enabled, isConnecting, isConnected, eventTypes, onEvent, exchangeName]);

  const reconnect = useCallback(() => {
    cleanUp();
    reconnectAttemptsRef.current = 0;
    connect();
  }, [cleanUp, connect]);

  useEffect(() => {
    if (enabled && strategyName) connect();
    return () => { cleanUp(); };
  }, [strategyName, enabled, connect, cleanUp]);

  const sendMessage = useCallback((message: any) => {
    if (!isConnected || !wsRef.current) return false;
    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }, [isConnected]);

  return { isConnected, isConnecting, error, lastEvent, reconnect, sendMessage };
}
