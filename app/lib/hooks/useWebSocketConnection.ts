import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { API_CONFIG } from '~/lib/config';
import { supabase } from '~/lib/superbase/client';
import { WebSocketMessage, NotebookStatus } from '~/types/terminal';

export function useWebSocketConnection() {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [notebookStatuses, setNotebookStatuses] = useState<Record<string, NotebookStatus>>({});

  useEffect(() => {
    const initializeConnection = async () => {
      // Get current user from Supabase
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error || !user?.email) {
        console.error('No authenticated user found:', error);
        return;
      }

      const socket = io(API_CONFIG.WS_URL, {
        path: API_CONFIG.API_BASE,
        transports: ['websocket'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        withCredentials: true
      });

      const handleConnect = () => {
        console.log('WebSocket connected, joining room:', user.email);
        setIsConnected(true);
        socket.emit('join', { username: user.email });
      };

      const handleExecutionLog = (data: WebSocketMessage) => {
        setMessages(prev => [...prev, {
          ...data,
          timestamp: new Date().toISOString()
        }]);
      };

      const handleNotebookStatus = (data: { notebook_name: string; status: string; error?: string }) => {
        if (data.notebook_name) {
          setNotebookStatuses(prev => ({
            ...prev,
            [data.notebook_name]: {
              status: data.status as NotebookStatus['status'],
              error: data.error,
              lastUpdate: new Date().toISOString()
            }
          }));
        }
      };

      socket.on('connect', handleConnect);
      socket.on('execution_log', handleExecutionLog);
      socket.on('notebook_status', handleNotebookStatus);
      socket.on('disconnect', () => setIsConnected(false));

      return () => {
        socket.off('connect', handleConnect);
        socket.off('execution_log', handleExecutionLog);
        socket.off('notebook_status', handleNotebookStatus);
        socket.disconnect();
      };
    };

    initializeConnection();
  }, []);

  const clearMessages = (notebookName: string) => {
    setMessages(prev => prev.filter(msg => msg.notebook_name !== notebookName));
    setNotebookStatuses(prev => {
      const { [notebookName]: _, ...rest } = prev;
      return rest;
    });
  };

  return {
    isConnected,
    messages,
    notebookStatuses,
    clearMessages
  };
}
