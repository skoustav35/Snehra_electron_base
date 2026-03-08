import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { BrandLockup } from '~/components/ui/BrandLockup';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header className="sticky top-0 z-logo border-b border-bolt-elements-borderColor bg-[var(--snr-glass-bg)] backdrop-blur-xl">
      <div className="h-[var(--header-height)] px-4 lg:px-6 flex items-center gap-4">
        <a href="/" className="shrink-0">
          <BrandLockup compact={chat.started} />
        </a>

        {chat.started ? (
          <span className="flex-1 min-w-0 px-2 lg:px-4 text-sm truncate text-bolt-elements-textSecondary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
        ) : (
          <div className="flex-1 text-sm text-bolt-elements-textSecondary hidden lg:block">
            Platinum coding studio with multi-theme appearance and live workbench integration.
          </div>
        )}

        <ClientOnly>
          {() => (
            <div className={classNames('flex items-center gap-2', { 'ml-auto': !chat.started })}>
              <ThemeSwitch />
              {chat.started ? <HeaderActionButtons chatStarted={chat.started} /> : null}
            </div>
          )}
        </ClientOnly>
      </div>
    </header>
  );
}
