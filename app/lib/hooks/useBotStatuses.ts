// ~/lib/hooks/useBotStatuses.ts
import { useMemo, useCallback } from 'react';
import { supabase } from '~/lib/superbase/client';
import { useBotStatus } from './useBotStatus';
import type { BotConfiguration } from '~/components/bots/BotList';

export interface BotStatus {
  status: string;
  running: boolean;
  manualStopped: boolean;
  reason?: string;
  openTradesCount?: number;
  ready?: boolean;
  phase?: string;
}

interface UseBotStatusesResult {
  statuses: Record<string, BotStatus>;
  start: (id: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
  deleteConfig: (id: string) => Promise<void>;
}

export function useBotStatuses(
  configs: BotConfiguration[],
  setConfigurations: React.Dispatch<React.SetStateAction<BotConfiguration[]>>
): UseBotStatusesResult {
  // 1) call useBotStatus for each config (always same order)
  const statusList: { id: string; status: BotStatus }[] = configs.map(cfg => ({
    id: cfg.id,
    status: useBotStatus(cfg.config?.strategy ?? '', cfg.user_id),
  }));

  // 2) zip into a map
  const statuses = useMemo(() => {
    const map: Record<string, BotStatus> = {};
    statusList.forEach(({ id, status }) => {
      map[id] = status;
    });
    return map;
  }, [statusList]);

  // 3) start a bot
  const start = useCallback(
    async (id: string) => {
      const cfg = configs.find(c => c.id === id);
      if (!cfg?.config?.strategy) throw new Error('Strategy not found');
      const strategy = cfg.config.strategy;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in to start bots');
      const res = await fetch(`/user/${strategy}/api/v1/start`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`meghan:${user.id}`),
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        let msg = 'Failed to start bot';
        try {
          const json = await res.json();
          msg = json.error || json.message || msg;
        } catch {}
        throw new Error(msg);
      }
    },
    [configs]
  );

  // 4) stop a bot
  const stop = useCallback(
    async (id: string) => {
      const cfg = configs.find(c => c.id === id);
      if (!cfg?.config?.strategy) throw new Error('Strategy not found');
      const strategy = cfg.config.strategy;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in to stop bots');
      const res = await fetch(`/user/${strategy}/api/v1/stop`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`meghan:${user.id}`),
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        let msg = 'Failed to stop bot';
        try {
          const json = await res.json();
          msg = json.error || json.message || msg;
        } catch {}
        throw new Error(msg);
      }
    },
    [configs]
  );

  // 5) delete a configuration
  const deleteConfig = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from('bot_configurations')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setConfigurations(prev => prev.filter(c => c.id !== id));
    },
    [setConfigurations]
  );

  return { statuses, start, stop, deleteConfig };
}
