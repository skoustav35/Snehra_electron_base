import { useEffect, useState } from 'react';
import { useNeonStore } from '~/lib/stores/neon';
import { classNames } from '~/utils/classNames';
import { Dialog, DialogRoot, DialogClose, DialogTitle, DialogButton } from '~/components/ui/Dialog';
import { getAccentButtonClassName } from '~/components/@settings/shared/components/SettingsSection';

// Neon logo
const NeonIcon = ({ size = 16 }: { size?: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'inline-block', flexShrink: 0 }}
    >
        <defs>
            <linearGradient id="neon-conn-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00E599" />
                <stop offset="100%" stopColor="#00C482" />
            </linearGradient>
        </defs>
        <path
            d="M24 10C16.268 10 10 16.268 10 24s6.268 14 14 14 14-6.268 14-14S31.732 10 24 10zm-3 20.5v-13l9 6.5-9 6.5z"
            fill="url(#neon-conn-grad)"
        />
    </svg>
);

export function NeonConnection() {
    const { config, connectionStatus, isTestingConnection, updateConfig, testConnection, clearConfig } =
        useNeonStore();

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
        document.addEventListener('open-neon-connection', handler);

        return () => document.removeEventListener('open-neon-connection', handler);
    }, []);

    const handleSave = async () => {
        if (!apiKey.trim()) {
            return;
        }

        setIsSaving(true);
        updateConfig({ apiKey: apiKey.trim() });
        await testConnection();
        setIsSaving(false);
    };

    const handleDisconnect = () => {
        clearConfig();
        setApiKey('');
    };

    const isConnected = connectionStatus === 'connected';

    return (
        <div className="relative">
            <div className="mr-2 flex overflow-hidden rounded-md text-sm">
                <button
                    onClick={() => setIsDialogOpen(!isDialogOpen)}
                    title={isConnected ? 'Neon DB: Connected' : 'Connect Neon DB'}
                    className={classNames(
                        'platinum-subpanel flex items-center gap-2 px-3 py-2 transition-all duration-200',
                        isConnected ? 'text-bolt-elements-textPrimary' : 'text-bolt-elements-textSecondary',
                    )}
                >
                    <NeonIcon size={16} />
                    {/* Status dot */}
                    <span
                        className="platinum-status-dot transition-colors"
                        style={{ color: isConnected ? 'var(--bolt-elements-service-neon)' : 'var(--bolt-elements-textTertiary)' }}
                    />
                    <span
                        className="hidden text-xs font-semibold uppercase tracking-[0.14em] sm:inline"
                        style={{ color: isConnected ? 'var(--bolt-elements-service-neonStrong)' : 'var(--bolt-elements-textTertiary)' }}
                    >
                        Neon DB
                    </span>
                </button>
            </div>

            <DialogRoot open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                {isDialogOpen && (
                    <Dialog className="max-w-[480px] p-6 platinum-panel--neon">
                        {!isConnected ? (
                            <div className="space-y-4">
                                <DialogTitle>
                                    <div className="flex items-center gap-3">
                                        <NeonIcon size={22} />
                                        <span>Connect Neon Serverless Postgres</span>
                                    </div>
                                </DialogTitle>

                                <p className="text-xs text-bolt-elements-textSecondary leading-relaxed">
                                    A serverless Postgres database for modern applications.
                                </p>

                                <div className="space-y-3">
                                    {/* API Key */}
                                    <div>
                                        <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1.5">
                                            API Key
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKey ? 'text' : 'password'}
                                                value={apiKey}
                                                onChange={(e) => setApiKey(e.target.value)}
                                                placeholder="Enter API Key from Console"
                                                className={classNames('platinum-input w-full pr-10 text-sm font-mono')}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowKey(!showKey)}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-colors"
                                            >
                                                <div className={classNames('w-4 h-4', showKey ? 'i-ph:eye-slash' : 'i-ph:eye')} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <button
                                            type="button"
                                            onClick={() => window.open('https://console.neon.tech/app/settings/api-keys', '_blank')}
                                            className={classNames('platinum-action w-full justify-center text-sm font-medium')}
                                        >
                                            <div className="i-ph:browser w-4 h-4" />
                                            Login & Authorize in Browser
                                        </button>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 mt-6">
                                    <DialogClose asChild>
                                        <DialogButton type="secondary">Cancel</DialogButton>
                                    </DialogClose>
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving || isTestingConnection || !apiKey.trim()}
                                        className={classNames(getAccentButtonClassName('neon', 'primary'), 'text-sm font-medium', 'disabled:opacity-50 disabled:cursor-not-allowed')}
                                    >
                                        {isSaving || isTestingConnection ? (
                                            <>
                                                <div className="i-svg-spinners:90-ring-with-bg w-4 h-4 animate-spin" />
                                                Testing...
                                            </>
                                        ) : (
                                            <>
                                                <div className="i-ph:plug-charging w-4 h-4" />
                                                Save &amp; Test
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <DialogTitle>
                                    <div className="flex items-center gap-3">
                                        <NeonIcon size={22} />
                                        <span>Neon Serverless Postgres</span>
                                        <span className="platinum-chip platinum-chip--neon">
                                            <span className="platinum-status-dot animate-pulse" style={{ color: 'var(--bolt-elements-service-neon)' }} />
                                            Connected
                                        </span>
                                    </div>
                                </DialogTitle>

                                <div className="platinum-subpanel p-3">
                                    <div className="flex items-start gap-2">
                                        <div className="i-ph:check-circle-fill w-4 h-4 text-bolt-elements-item-contentAccent mt-0.5 shrink-0" />
                                        <p className="text-xs text-bolt-elements-textSecondary">
                                            Neon MCP is configured. AI agents will use Neon for database interactions.
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="platinum-subpanel p-3">
                                        <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                                            <div className="i-ph:key w-3.5 h-3.5 text-bolt-elements-item-contentAccent" />
                                            <span className="font-mono">
                                                {config.apiKey.slice(0, 8)}{'*'.repeat(Math.max(0, config.apiKey.length - 8))}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 mt-4">
                                    <DialogClose asChild>
                                        <DialogButton type="secondary">Close</DialogButton>
                                    </DialogClose>
                                    <DialogButton type="danger" onClick={handleDisconnect}>
                                        <div className="i-ph:plugs w-4 h-4" />
                                        Disconnect
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
