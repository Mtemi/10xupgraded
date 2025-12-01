import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { type ChatHistoryItem } from '~/lib/persistence';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useNavigate } from '@remix-run/react';
import { classNames } from '~/utils/classNames';
import { FiEdit2 } from 'react-icons/fi';

interface HistoryItemProps {
  item: ChatHistoryItem;
  onDelete?: (event: React.UIEvent) => void;
  onEdit?: (event: React.UIEvent) => void;
}

export function HistoryItem({ item, onDelete, onEdit }: HistoryItemProps) {
  const [hovering, setHovering] = useState(false);
  const hoverRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const currentChatId = useStore(chatId);
  
  // Debug the item being rendered
  useEffect(() => {
    console.log('[HistoryItem] Rendering item:', {
      id: item.id,
      urlId: item.urlId,
      description: item.description,
      messageCount: item.messages?.length || 0,
      isActive: currentChatId === item.id,
      botStatus: item.botStatus,
      hasDeployedBot: item.hasDeployedBot
    });
  }, [item]);

  // Get status badge styling
  const getStatusBadge = (status?: string) => {
    if (!status || status === 'Not Deployed') {
      return {
        text: 'Not Deployed',
        className: 'bg-gray-500/20 text-gray-400'
      };
    }
    if (status === 'Running') {
      return {
        text: '✅ Running',
        className: 'bg-green-500/20 text-green-400'
      };
    }
    if (status === 'Pending' || status === 'Deploying') {
      return {
        text: '🟡 Deploying',
        className: 'bg-yellow-500/20 text-yellow-400'
      };
    }
    if (status === 'Failed') {
      return {
        text: '❌ Failed',
        className: 'bg-red-500/20 text-red-400'
      };
    }
    return {
      text: status,
      className: 'bg-gray-500/20 text-gray-400'
    };
  };

  const statusBadge = getStatusBadge(item.botStatus);

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;

    function mouseEnter() {
      setHovering(true);

      if (timeout) {
        clearTimeout(timeout);
      }
    }

    function mouseLeave() {
      setHovering(false);
    }

    hoverRef.current?.addEventListener('mouseenter', mouseEnter);
    hoverRef.current?.addEventListener('mouseleave', mouseLeave);

    return () => {
      hoverRef.current?.removeEventListener('mouseenter', mouseEnter);
      hoverRef.current?.removeEventListener('mouseleave', mouseLeave);
    };
  }, []);

  return (
    <div
      ref={hoverRef}
      className="group rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 overflow-hidden flex justify-between items-center px-2 py-1"
    >
      <div className="flex flex-col w-full">
        <a
          href={`/chat/${item.id}`}
          className={classNames(
            "flex w-full relative truncate block",
            (currentChatId === item.id || currentChatId === item.urlId) ? "font-medium text-bolt-elements-item-contentAccent" : ""
          )}
          onClick={(e) => {
            e.preventDefault();
            console.log('[HistoryItem] Clicked on chat:', item.description);
            // Force a full page reload to ensure clean state
            window.location.href = `/chat/${item.id}`;
          }}
        >
          <span className="truncate flex-1">{item.description}</span>
          <div className="absolute right-0 z-1 top-0 bottom-0 bg-gradient-to-l from-bolt-elements-background-depth-2 group-hover:from-bolt-elements-background-depth-3 to-transparent w-10 flex justify-end group-hover:w-24 group-hover:from-45%">
            {hovering && (
              <div className="flex items-center gap-1 p-1">
                <button
                  className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                  onClick={(event) => {
                    event.preventDefault();
                    onEdit?.(event);
                  }}
                  title="Edit Bot"
                >
                  <FiEdit2 size={14} />
                </button>
                <Dialog.Trigger asChild>
                  <button
                    className="i-ph:trash scale-110 text-bolt-elements-textSecondary hover:text-bolt-elements-item-contentDanger"
                    onClick={(event) => {
                      event.preventDefault();
                      onDelete?.(event);
                    }}
                    title="Delete Chat"
                  />
                </Dialog.Trigger>
              </div>
            )}
          </div>
        </a>
        {item.botStatus && (
          <div className="flex flex-col gap-0.5 mt-0.5 ml-0.5">
            <div className="flex items-center gap-1">
              <span className={classNames(
                "text-[9px] px-1.5 py-0.5 rounded",
                statusBadge.className
              )}>
                {statusBadge.text}
              </span>
              {item.openTrades !== undefined && item.openTrades > 0 && (
                <span className="text-[9px] text-bolt-elements-textTertiary">
                  {item.openTrades} trade{item.openTrades !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {(item.exchange || item.profit !== undefined || item.balance !== undefined) && (
              <div className="flex items-center gap-1.5 text-[8px] text-bolt-elements-textTertiary">
                {item.exchange && (
                  <span className="truncate">{item.exchange}</span>
                )}
                {item.profit !== undefined && (
                  <span className={classNames(
                    "font-medium",
                    item.profit >= 0 ? "text-green-400" : "text-red-400"
                  )}>
                    ${item.profit.toFixed(2)}
                  </span>
                )}
                {item.balance !== undefined && (
                  <span className="text-gray-500">
                    Bal: ${item.balance.toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
