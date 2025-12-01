// app/lib/hooks/useFreqtradeWebSocket.ts
import { useState, useEffect, useRef } from 'react';
import { WebSocketManager, type FreqtradeEvent, type FreqtradeEventType } from '~/lib/services/WebSocketManager';
import { createScopedLogger } from '~/utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createScopedLogger('useFreqtradeWebSocket');

interface UseFreqtradeWebSocketProps {
  strategyName?: string;
  enabled?: boolean;
  eventTypes?: FreqtradeEventType[];
  onEvent?: (event: FreqtradeEvent) => void;
}

export function useFreqtradeWebSocket({
  strategyName,
  enabled = true,
  eventTypes = ['status', 'startup', 'entry', 'entry_fill', 'exit', 'exit_fill', 'warning', 'strategy_msg'],
  onEvent
}: UseFreqtradeWebSocketProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<FreqtradeEvent | null>(null);
  const subscriberId = useRef<string>(uuidv4());
  
  useEffect(() => {
    if (!strategyName || !enabled) return;
    
    const handleEvent = (event: FreqtradeEvent) => {
      setLastEvent(event);
      
      // Call the onEvent callback if provided
      if (onEvent) {
        onEvent(event);
      }
      
      // Update connection status for 'status' events
      if (event.type === 'status') {
        setIsConnected(true);
      }
    };
    
    // Subscribe to WebSocket events
    const subscribe = async () => {
      const success = await WebSocketManager.subscribe({
        strategyName,
        subscriberId: subscriberId.current,
        eventTypes,
        onEvent: handleEvent
      });
      
      if (success) {
        logger.info(`Successfully subscribed to ${strategyName} events`);
      } else {
        logger.error(`Failed to subscribe to ${strategyName} events`);
      }
    };
    
    subscribe();
    
    // Cleanup function
    return () => {
      logger.info(`Unsubscribing ${subscriberId.current} from ${strategyName}`);
      WebSocketManager.unsubscribe(strategyName, subscriberId.current);
    };
  }, [strategyName, enabled, eventTypes, onEvent]);
  
  return {
    isConnected,
    lastEvent
  };
}
