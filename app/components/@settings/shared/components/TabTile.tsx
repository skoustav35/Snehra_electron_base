import * as Tooltip from '@radix-ui/react-tooltip';
import { classNames } from '~/utils/classNames';
import type { TabVisibilityConfig } from '~/components/@settings/core/types';
import { TAB_LABELS, TAB_ICONS } from '~/components/@settings/core/constants';
import { GlowingEffect } from '~/components/ui/GlowingEffect';

interface TabTileProps {
  tab: TabVisibilityConfig;
  onClick?: () => void;
  isActive?: boolean;
  hasUpdate?: boolean;
  statusMessage?: string;
  description?: string;
  isLoading?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const TabTile: React.FC<TabTileProps> = ({
  tab,
  onClick,
  isActive,
  hasUpdate,
  statusMessage,
  description,
  isLoading,
  className,
  children,
}: TabTileProps) => {
  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div className={classNames('min-h-[160px] list-none', className || '')}>
            <div className="platinum-panel platinum-panel--neutral relative h-full p-1">
              <GlowingEffect
                blur={0}
                borderWidth={1}
                spread={20}
                glow={true}
                disabled={false}
                proximity={40}
                inactiveZone={0.3}
                movementDuration={0.4}
              />
              <div
                onClick={onClick}
                className={classNames(
                  'relative flex h-full flex-col items-center justify-center rounded-[calc(var(--snr-radius-lg)-2px)] p-4',
                  'bg-transparent',
                  'group cursor-pointer',
                  'hover:bg-bolt-elements-item-backgroundActive',
                  'transition-colors duration-100 ease-out',
                  isActive ? 'bg-bolt-elements-item-backgroundAccent' : '',
                  isLoading ? 'cursor-wait opacity-70 pointer-events-none' : '',
                )}
              >
                {/* Icon */}
                <div
                  className={classNames(
                    'relative',
                    'w-14 h-14',
                    'flex items-center justify-center',
                    'rounded-xl',
                    'bg-bolt-elements-surface-field',
                    'ring-1 ring-bolt-elements-borderColor',
                    'group-hover:bg-bolt-elements-surface-platinumHover',
                    'group-hover:ring-bolt-elements-borderColorActive',
                    'transition-all duration-100 ease-out',
                    isActive ? 'bg-bolt-elements-item-backgroundAccent ring-bolt-elements-borderColorActive' : '',
                  )}
                >
                  {(() => {
                    const IconComponent = TAB_ICONS[tab.id];
                    return (
                      <IconComponent
                        className={classNames(
                          'w-8 h-8',
                          'text-bolt-elements-textSecondary',
                          'group-hover:text-bolt-elements-item-contentAccent',
                          'transition-colors duration-100 ease-out',
                          isActive ? 'text-bolt-elements-item-contentAccent' : '',
                        )}
                      />
                    );
                  })()}
                </div>

                {/* Label and Description */}
                <div className="flex flex-col items-center mt-4 w-full">
                  <h3
                    className={classNames(
                      'text-[15px] font-medium leading-snug mb-2',
                      'text-bolt-elements-textPrimary',
                      'group-hover:text-bolt-elements-item-contentAccent',
                      'transition-colors duration-100 ease-out',
                      isActive ? 'text-bolt-elements-item-contentAccent' : '',
                    )}
                  >
                    {TAB_LABELS[tab.id]}
                  </h3>
                  {description && (
                    <p
                      className={classNames(
                        'text-[13px] leading-relaxed',
                        'text-bolt-elements-textSecondary',
                        'max-w-[85%]',
                        'text-center',
                        'group-hover:text-bolt-elements-textPrimary',
                        'transition-colors duration-100 ease-out',
                        isActive ? 'text-bolt-elements-item-contentAccent' : '',
                      )}
                    >
                      {description}
                    </p>
                  )}
                </div>

                {/* Update Indicator with Tooltip */}
                {hasUpdate && (
                  <>
                    <div className="platinum-status-dot absolute top-4 right-4 animate-pulse text-bolt-elements-item-contentAccent" />
                    <Tooltip.Portal>
                      <Tooltip.Content
                        className={classNames(
                          'px-3 py-1.5 rounded-lg',
                          'platinum-subpanel text-bolt-elements-textPrimary',
                          'text-sm font-medium',
                          'select-none',
                          'z-[100]',
                        )}
                        side="top"
                        sideOffset={5}
                      >
                        {statusMessage}
                        <Tooltip.Arrow style={{ fill: 'var(--bolt-elements-bg-depth-3)' }} />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </>
                )}

                {/* Children (e.g. Beta Label) */}
                {children}
              </div>
            </div>
          </div>
        </Tooltip.Trigger>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};
