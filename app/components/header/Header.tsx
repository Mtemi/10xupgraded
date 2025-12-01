import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { AuthButtons } from './AuthButtons';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { useLocation } from '@remix-run/react';
import { useState } from 'react';

export function Header() {
  const chat = useStore(chatStore);
  const location = useLocation();
  const isHomepage = location.pathname === '/';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      className={classNames(
        'flex items-center bg-accent-500/10 p-4 sm:p-6 lg:p-8 border-b h-[var(--header-height)]',
        {
          'border-transparent': !chat.started,
          'border-bolt-elements-borderColor': chat.started,
        },
      )}
    >
      {/* Logo section */}
      <div className={classNames("flex items-center gap-1 sm:gap-2 z-logo text-bolt-elements-textPrimary logo-section flex-shrink-0", isHomepage ? "flex-1" : "")}>
        {!isHomepage && (
          <>
            <div className="i-ph:sidebar-simple-duotone text-xl sm:text-2xl lg:text-3xl cursor-pointer" />
            <a href="/" className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-accent flex items-center" aria-label="10XTraders.AI Home">
              <span className="logo-mask bg-accent-500 w-36 sm:w-44 lg:w-52 h-8 sm:h-10 lg:h-12" role="img" aria-label="10XTraders.AI"></span>
            </a>
          </>
        )}
        {isHomepage && (
          <a href="/" className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-accent flex items-center" aria-label="10XTraders.AI Home">
            <span className="logo-mask bg-accent-500 w-36 sm:w-44 lg:w-52 h-8 sm:h-10 lg:h-12" role="img" aria-label="10XTraders.AI"></span>
          </a>
        )}
      </div>
      <span className="flex-1 px-2 sm:px-4 truncate text-center text-bolt-elements-textPrimary chat-description hidden sm:block text-base sm:text-lg lg:text-xl">
        <ClientOnly>{() => <ChatDescription />}</ClientOnly>
      </span>

      <div className="flex items-center justify-end gap-2 sm:gap-3 lg:gap-6 header-actions relative flex-shrink-0">
        <div className="flex items-center theme-switch flex-shrink-0">
          <ThemeSwitch />
        </div>
        {chat.started && (
          <ClientOnly>
            {() => (
              <div className="mr-0 sm:mr-1">
                <HeaderActionButtons />
              </div>
            )}
          </ClientOnly>
        )}
        {/* Desktop auth buttons */}
        <div className="hidden sm:block">
          <ClientOnly>{() => <AuthButtons />}</ClientOnly>
        </div>
        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-2 rounded-md bg-transparent border border-transparent hover:bg-accent-500/10"
          aria-label="Open menu"
          onClick={() => setMobileMenuOpen((v) => !v)}
        >
          <div className={classNames('text-xl text-accent-500', mobileMenuOpen ? 'i-ph:x' : 'i-ph:list')} />
        </button>
        {mobileMenuOpen && (
          <div className="sm:hidden absolute right-0 top-full mt-2 w-[min(88vw,260px)] bg-accent-500/10 backdrop-blur-md border border-accent-500/30 rounded-md shadow-lg z-[1000] p-3">
            <ClientOnly>{() => <AuthButtons vertical />}</ClientOnly>
          </div>
        )}
      </div>
    </header>
  );
}
