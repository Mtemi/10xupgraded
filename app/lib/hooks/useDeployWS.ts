import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { supabase } from '~/lib/superbase/client';
import { APA_DOMAIN } from '~/lib/api/routing';

type DeployEvent = {
  type: 'deploy:event';
  data: {
    step: string;
    status: 'ok' | 'error' | 'pending';
    namespace: string;
    user_id?: string;
    context?: string;
    [k: string]: any;
  };
};

export function useDeployWS({
  strategyName,
  enabled = true,
  onEvent,
}: {
  strategyName?: string;
  enabled?: boolean;
  onEvent?: (ev: DeployEvent) => void;
}) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!enabled || !strategyName) return;

      // auth just for joining payload (not as Bearer)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // NOTE: connect to the Flask-SocketIO server (control plane), not the bot
      const socket = io(APA_DOMAIN, {
        path: '/apa/socket.io',
        transports: ['websocket'],
        withCredentials: true,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        // Join the per-bot room on the backend
        socket.emit('join', {
          namespace: strategyName,
          strategyName,
          user_id: user.id,
        });
      });

      socket.on('deploy:event', (payload: DeployEvent) => {
        if (cancelled) return;
        if (payload?.type === 'deploy:event' && onEvent) onEvent(payload);
      });

      socket.on('disconnect', () => {});
      socket.on('connect_error', () => {});

    })();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [enabled, strategyName, onEvent]);
}
