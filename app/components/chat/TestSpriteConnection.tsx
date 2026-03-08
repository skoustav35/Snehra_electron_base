import { useEffect, useState } from 'react';
import { useTestSpriteStore } from '~/lib/stores/testsprite';
import { classNames } from '~/utils/classNames';
import { Dialog, DialogRoot, DialogClose, DialogTitle, DialogButton } from '~/components/ui/Dialog';

// Real TestSprite brand-style SVG logo
const TestSpriteIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'inline-block', flexShrink: 0 }}
  >
    <defs>
      <linearGradient id="ts-icon-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#34d399" />
      </linearGradient>
    </defs>
    {/* Outer ring */}
    <circle cx="16" cy="16" r="14" stroke="url(#ts-icon-grad)" strokeWidth="2" fill="none" />
    {/* Inner shield body */}
    <path
      d="M16 5 L24 9 V17 C24 21.4 20.4 25.2 16 27 C11.6 25.2 8 21.4 8 17 V9 Z"
      fill="url(#ts-icon-grad)"
      opacity="0.15"
    />
    <path
      d="M16 5 L24 9 V17 C24 21.4 20.4 25.2 16 27 C11.6 25.2 8 21.4 8 17 V9 Z"
      stroke="url(#ts-icon-grad)"
      strokeWidth="1.5"
      fill="none"
    />
    {/* Checkmark */}
    <path
      d="M11.5 16.5 L14.5 19.5 L20.5 13"
      stroke="url(#ts-icon-grad)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function TestSpriteConnection() {
  const { config, isConfigured, connectionStatus, updateConfig, clearConfig } = useTestSpriteStore();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync local state when store changes
  useEffect(() => {
    setApiKey(config.apiKey);
  }, [config.apiKey]);

  // Allow opening this dialog via a custom DOM event
  useEffect(() => {
    const handler = () => setIsDialogOpen(true);
    document.addEventListener('open-testsprite-connection', handler);

    return () => document.removeEventListener('open-testsprite-connection', handler);
  }, []);

  const handleSave = () => {
    if (!apiKey.trim()) {
      return;
    }

    setIsSaving(true);
    updateConfig({ apiKey: apiKey.trim() });
    setTimeout(() => setIsSaving(false), 600);
  };

  const handleDisconnect = async () => {
    await clearConfig();
    setApiKey('');
  };

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="relative">
      <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden mr-1 text-sm">
        <button
          onClick={() => setIsDialogOpen(!isDialogOpen)}
          title={isConnected ? 'TestSprite: Active' : 'Connect TestSprite'}
          className={classNames(
            'flex items-center gap-1.5 p-1.5 transition-all duration-200',
            'bg-bolt-elements-item-backgroundDefault hover:bg-bolt-elements-item-backgroundActive',
            isConnected
              ? 'text-emerald-500 hover:text-emerald-400'
              : 'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary',
          )}
        >
          <TestSpriteIcon size={16} />
          {/* Status dot */}
          <span
            className={classNames(
              'w-1.5 h-1.5 rounded-full transition-colors',
              isConnected ? 'bg-emerald-400' : 'bg-gray-400',
            )}
          />
          {isConnected && <span className="text-xs font-medium text-emerald-400 hidden sm:inline">TestSprite</span>}
        </button>
      </div>

      <DialogRoot open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {isDialogOpen && (
          <Dialog className="max-w-[460px] p-6">
            {!isConnected ? (
              <div className="space-y-4">
                <DialogTitle>
                  <div className="flex items-center gap-3">
                    <TestSpriteIcon size={22} />
                    <span>Connect TestSprite</span>
                  </div>
                </DialogTitle>

                <p className="text-xs text-bolt-elements-textSecondary leading-relaxed">
                  AI-powered testing engine that auto-generates test plans, runs them in the cloud, diagnoses failures
                  and applies fixes.
                </p>

                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1.5">API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="ts_xxxxxxxxxxxxxxxxxxxxxxxx"
                      autoFocus
                      className={classNames(
                        'w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-mono',
                        'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                        'border border-[#E5E5E5] dark:border-[#333333]',
                        'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                        'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50',
                        'transition-all duration-200',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-colors"
                    >
                      <div className={classNames('w-4 h-4', showKey ? 'i-ph:eye-slash' : 'i-ph:eye')} />
                    </button>
                  </div>
                  <div className="mt-2">
                    <a
                      href="https://www.testsprite.com/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                      <div className="i-ph:arrow-square-out w-3.5 h-3.5" />
                      Get your API key from TestSprite Dashboard
                    </a>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <DialogClose asChild>
                    <DialogButton type="secondary">Cancel</DialogButton>
                  </DialogClose>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !apiKey.trim()}
                    className={classNames(
                      'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
                      'bg-emerald-500 text-white',
                      'hover:bg-emerald-600',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'transition-all duration-200',
                    )}
                  >
                    {isSaving ? (
                      <>
                        <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <div className="i-ph:plug-charging w-4 h-4" />
                        Save &amp; Activate
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <DialogTitle>
                  <div className="flex items-center gap-3">
                    <TestSpriteIcon size={22} />
                    <span>TestSprite</span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  </div>
                </DialogTitle>

                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30">
                  <div className="flex items-start gap-2">
                    <div className="i-ph:check-circle-fill w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      TestSprite MCP is configured. AI agents will automatically generate test plans, run them in the
                      cloud, and apply fixes after every feature build.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#F8F8F8] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333]">
                  <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                    <div className="i-ph:key w-3.5 h-3.5 text-emerald-500" />
                    <span className="font-mono">
                      {config.apiKey.slice(0, 8)}{'•'.repeat(Math.max(0, config.apiKey.length - 8))}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#F8F8F8] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#333333]">
                  <p className="text-[10px] font-medium text-bolt-elements-textTertiary mb-1.5">MCP Config (active)</p>
                  <pre className="text-[10px] text-bolt-elements-textSecondary leading-relaxed overflow-x-auto">
                    {JSON.stringify(
                      { TestSprite: { command: 'npx', args: ['@testsprite/testsprite-mcp@latest'], env: { API_KEY: '••••••••' } } },
                      null,
                      2,
                    )}
                  </pre>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <DialogClose asChild>
                    <DialogButton type="secondary">Close</DialogButton>
                  </DialogClose>
                  <DialogButton type="danger" onClick={handleDisconnect}>
                    <div className="i-ph:plugs w-4 h-4" />
                    Remove
                  </DialogButton>
                </div>
              </div>
            )}
          </Dialog>
        )}
      </DialogRoot>
    </div>
  );
}
