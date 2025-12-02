import type { Message } from 'ai';
import React from 'react';
import { classNames } from '~/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: Message[];
}

export const Messages = React.forwardRef<HTMLDivElement, MessagesProps>((props: MessagesProps, ref) => {
  const { id, isStreaming = false, messages = [] } = props;

  return (
    <div id={id} ref={ref} className={classNames(props.className, 'messages-container')}>
      {messages.length > 0
        ? messages.map((message, index) => {
            const { role, content } = message;
            const isUserMessage = role === 'user';
            const isFirst = index === 0;
            const isLast = index === messages.length - 1;

            return (
              <div
                key={index}
                className={classNames('flex gap-2 sm:gap-4 px-3 sm:px-6 w-full rounded-[calc(0.75rem-1px)] max-w-full overflow-hidden message', {
                  'bg-bolt-elements-messages-background': isUserMessage || !isStreaming || (isStreaming && !isLast),
                  'bg-gradient-to-b from-bolt-elements-messages-background from-30% to-transparent':
                    isStreaming && isLast,
                  'mt-1.5 sm:mt-2': !isFirst,
                  'py-2 sm:py-3': !isLast,
                  'pt-2 sm:pt-3 pb-0': isLast,
                  'user-message': isUserMessage,
                  'assistant-message': !isUserMessage,
                })}
                style={{ maxWidth: '100%', wordWrap: 'break-word', overflowWrap: 'break-word' }}
              >
                {isUserMessage && (
                  <div className="flex items-center justify-center w-[28px] h-[28px] sm:w-[34px] sm:h-[34px] overflow-hidden bg-white text-gray-600 rounded-full shrink-0 self-start">
                    <div className="i-ph:user-fill text-base sm:text-xl"></div>
                  </div>
                )}
                <div className="grid grid-col-1 w-full max-w-full overflow-hidden message-content" style={{ maxWidth: '100%' }}>
                  {isUserMessage ? <UserMessage content={content} /> : <AssistantMessage content={content} />}
                </div>
              </div>
            );
          })
        : null}
      {isStreaming && (
        <div className="text-center w-full text-bolt-elements-textSecondary i-svg-spinners:3-dots-fade text-3xl sm:text-4xl mt-3 sm:mt-4 streaming-indicator"></div>
      )}
    </div>
  );
});
