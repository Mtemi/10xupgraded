// app/lib/socket/client.ts
import { io } from 'socket.io-client';
import { API_CONFIG } from '~/lib/config';

let socket: any = null;

export function initializeSocket(username: string) {

  // console.log('[Socket] Initializing new socket connection for user:', username);
  
  socket = io(API_CONFIG.WS_URL, {
    path: '/socket.io/',
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    withCredentials: true
  });

  socket.on('connect', () => {
    // console.log('[Socket] Connected successfully, joining room:', username);
    socket.emit('join', { username });
  });

  socket.on('disconnect', () => {
    // console.log('[Socket] Disconnected');
  });

  socket.on('error', (error: any) => {
    // console.error('[Socket] Connection error:', error);
  });

  socket.on('reconnect_attempt', (attempt: number) => {
    // console.log('[Socket] Reconnection attempt:', attempt);
  });

  socket.on('reconnect', () => {
    // console.log('[Socket] Reconnected, rejoining room:', username);
    socket.emit('join', { username });
  });

  return socket;
}

export { socket };