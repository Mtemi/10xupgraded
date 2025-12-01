// app/lib/config/websocket.ts
export const WS_CONFIG = {
  url: window.location.origin, // Use current domain
  path: '/socket.io',
  options: {
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    withCredentials: true,
  },
};


