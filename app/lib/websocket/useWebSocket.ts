import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_CONFIG } from '~/lib/config/websocket';
import { supabase } from '~/lib/superbase/client';
import type { WebSocketMessage, NotebookStatus } from './types';

export function useWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [notebookStatuses, setNotebookStatuses] = useState<Record<string, NotebookStatus>>({});

  useEffect(() => {
    let socketInstance: Socket | null = null;

    const initializeSocket = async () => {
      try {
        // Get current user from Supabase
        const { data: { user } } = await supabase.auth.getUser();

        if (!user?.email) {
          console.error('No username found for WebSocket connection');
          return;
        }

        const username = user.email;

        // Initialize socket connection
        console.log('Initializing WebSocket connection to:', WS_CONFIG.url);
        // socketInstance = io(WS_CONFIG.url, {
        //   path: WS_CONFIG.path,
        //   ...WS_CONFIG.options,
        // });

        const socketInstance = io('https://10xtraders.ai', {
          transports: ['websocket'],
          autoConnect: true,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000
        });

        // Socket event handlers
        const handleConnect = () => {
          console.log('WebSocket connected');
          setIsConnected(true);
          console.log('Emitting join event with username:', username);
          socketInstance.emit('join', {username});
          // socketInstance?.emit('join', { username: username });
        };

        const handleExecutionLog = (data: WebSocketMessage) => {
          console.log('Received execution_log:', data);
          setMessages((prev) => [
            ...prev,
            {
              ...data,
              timestamp: new Date().toISOString(),
            },
          ]);
        };

        const handleNotebookStatus = (data: { notebook_name: string; status: string; error?: string }) => {
          console.log('Received notebook_status:', data);
          if (data.notebook_name) {
            setNotebookStatuses((prev) => ({
              ...prev,
              [data.notebook_name]: {
                status: data.status as NotebookStatus['status'],
                error: data.error,
                lastUpdate: new Date().toISOString(),
              },
            }));
          }
        };

        const handleDisconnect = () => {
          console.log('WebSocket disconnected');
          setIsConnected(false);
        };

        // Attach event listeners
        socketInstance.on('connect', handleConnect);
        socketInstance.on('execution_log', handleExecutionLog);
        socketInstance.on('notebook_status', handleNotebookStatus);
        socketInstance.on('disconnect', handleDisconnect);

        setSocket(socketInstance);
      } catch (error) {
        console.error('Error initializing WebSocket:', error);
      }
    };

    initializeSocket();

    // Cleanup function
    return () => {
      if (socketInstance) {
        console.log('Cleaning up WebSocket connection');
        socketInstance.off('connect');
        socketInstance.off('execution_log');
        socketInstance.off('notebook_status');
        socketInstance.off('disconnect');
        socketInstance.disconnect();
        setSocket(null);
      }
    };
  }, []); // Empty dependency array means this effect runs once on mount

  const clearMessages = (notebookName: string) => {
    console.log('Clearing messages for notebook:', notebookName);
    setMessages((prev) => prev.filter((msg) => msg.notebook_name !== notebookName));
    setNotebookStatuses((prev) => {
      const { [notebookName]: _, ...rest } = prev;
      return rest;
    });
  };

  return {
    socket,
    isConnected,
    messages,
    notebookStatuses,
    clearMessages,
  };
}
