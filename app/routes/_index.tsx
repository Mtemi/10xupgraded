import { json, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { useStore } from '@nanostores/react';
import { themeStore } from '~/lib/stores/theme';
import { ToastContainer } from 'react-toastify';

export const meta: MetaFunction = () => {
  return [
    { title: 'TradeBotBuilder(TBB)' }, 
    { name: 'description', content: 'Talk with TBB, an AI assistant from 10XTraders.ai' }
  ];
};

export const loader = () => json({});

export default function Index() {
  const theme = useStore(themeStore);
  
  return (
    <div className="flex flex-col w-full min-h-screen relative">
      {/* Background Image */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300"
        style={{
          backgroundImage: theme === 'dark' 
            ? 'url(/trading-bg.jpeg)' 
            : 'url(/trading-bg-light.jpeg)',
          opacity: 0.3,
          pointerEvents: 'none'
        }}
      />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col">
        <Header />
        <main className="w-full">
          <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
        </main>
      </div>
    </div>
  );
}