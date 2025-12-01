// File: src/components/BotList.tsx

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';
import { BotDeployButton } from './BotDeployButton';
import { useFreqtradeWS, type FreqtradeEvent } from '~/lib/hooks/useFreqtradeWS';

export interface BotConfiguration {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
}

// Function to sanitize logs - replace 'freqtrade' with '10xtraders'
const sanitizeLogs = (logs: string[]): string[] =>
  logs.map(log => log.replace(/freqtrade/gi, '10xtraders'));

export function BotList() {
  // ... unchanged list component
  // (omitted for brevity)
}

// -----------------------------------------------------------------------------
// BotRow: a single row where we can freely call hooks
// -----------------------------------------------------------------------------
function BotRow({
  config,
  index,
  onRemove,
}: {
  config: BotConfiguration;
  index: number;
  onRemove: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState<boolean>(false);
  const [stopping, setStopping] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);
  const [showingLogs, setShowingLogs] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Track if we've ever seen a Running phase
  const [hasRun, setHasRun] = useState(false);

  // Use the hook to get bot status
  const { 
    phase, 
    ready, 
    running, 
    openTradesCount 
  } = useBotStatus(config.config?.strategy, config.user_id);

  // When phase becomes Running, lock it
  useEffect(() => {
    if (phase === 'Running') {
      setHasRun(true);
    }
  }, [phase]);

  // ... other handlers unchanged

  return (
    <tr className={classNames(/* ... */)}>
      {/* Index, name, exchange, strategy cells omitted for brevity */}

      {/* Status badge cell: lock to Deployed once Running */}
      <td className="px-3 py-2 text-xs">
        <span
          className={classNames(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium', {
              'bg-green-500/20 text-green-500': hasRun || ready,
              'bg-blue-500/20 text-blue-500': !hasRun && phase === 'Running' && !ready,
              'bg-yellow-500/20 text-yellow-500': phase === 'Pending',
              'bg-red-500/20 text-red-500': phase === 'Failed',
              'bg-gray-500/20 text-gray-500': phase === 'NotFound',
              'bg-yellow-500/20 text-yellow-500': !phase && config.is_active,
              'bg-gray-500/20 text-gray-500': !phase && !config.is_active,
            }
          )}
        >
          {hasRun
            ? 'Deployed'
            : ready
              ? 'Deployed'
              : phase === 'Running'
                ? 'Deploying'
                : phase === 'Pending'
                  ? 'Pending'
                  : phase === 'Failed'
                    ? 'Failed'
                    : phase === 'NotFound'
                      ? 'Not Deployed'
                      : config.is_active
                        ? 'Deployed'
                        : 'Inactive'}
        </span>
      </td>

      {/* Action/status cell unchanged, showing Start/Stop buttons */}
      {/* ... rest of the row omitted for brevity */}
    </tr>
  );
}

// Custom hook useBotStatus unchanged
function useBotStatus(strategyName?: string, userId?: string) {
  // ...
}
