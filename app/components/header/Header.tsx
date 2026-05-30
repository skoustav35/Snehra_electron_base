import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { toggleSidebar } from '~/lib/stores/sidebar';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames(
        'flex items-center px-4 h-[var(--header-height)] relative',
        'glass-panel-strong',
        'transition-colors-smooth',
        {
          'border-transparent': !chat.started,
          'border-b border-bolt-elements-borderColor': chat.started,
        },
      )}
    >
      <div className="flex items-center gap-3 z-logo text-bolt-elements-textPrimary cursor-pointer">
        <div
          className="i-ph:sidebar-simple-duotone text-xl hover:text-[var(--primary-color)] transition-colors-smooth hover:scale-110 active:scale-95"
          onClick={toggleSidebar}
          title="Toggle Sidebar"
          style={{ transition: 'color 0.2s ease, transform 0.15s ease' }}
        />
        <a href="/" className="flex items-center gap-2.5 group">
          <img
            src="/favicon.ico"
            alt="Snehra logo"
            className="w-8 h-8 rounded-lg shadow-sm group-hover:shadow-md group-hover:scale-105 transition-all duration-200"
          />
          <div className="flex flex-col">
            <span className="text-lg font-semibold leading-tight text-bolt-elements-textPrimary tracking-tight">
              Snehra codesmith
            </span>
            <span className="text-[10px] font-medium text-bolt-elements-textTertiary leading-tight tracking-wide uppercase">
              by Koustav Sarkar
            </span>
          </div>
        </a>
      </div>
      {chat.started && (
        <>
          <span className="flex-1 px-4 truncate text-center text-bolt-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div>
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}

      {/* Gradient separator line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 header-separator" />
    </header>
  );
}
