//app/lib/hooks/types.ts
export interface WebSocketMessage {
  output?: string;
  error?: string;
  status?: string;
  notebook_name?: string;
  type?: 'output' | 'error' | 'status' | 'system';
  timestamp?: string;
}

export interface NotebookStatus {
  status: 'running' | 'failed' | 'stopped';
  error?: string;
  lastUpdate?: string;
}

export interface WebSocketConfig {
  url: string;
  path: string;
  options: {
    transports: string[];
    autoConnect: boolean;
    reconnection: boolean;
    reconnectionAttempts: number;
    reconnectionDelay: number;
    withCredentials: boolean;
  };
}