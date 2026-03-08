import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { useNeonStore } from '~/lib/stores/neon';
import { getAccentButtonClassName } from '~/components/@settings/shared/components/SettingsSection';

// Neon branded logo
const NeonLogo = () => (
    <svg viewBox="0 0 48 48" className="w-10 h-10">
        <defs>
            <linearGradient id="neon-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00E599" />
                <stop offset="100%" stopColor="#00C482" />
            </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill="url(#neon-logo-grad)" opacity="0.1" />
        <path
            fill="url(#neon-logo-grad)"
            d="M24 10C16.268 10 10 16.268 10 24s6.268 14 14 14 14-6.268 14-14S31.732 10 24 10zm-3 20.5v-13l9 6.5-9 6.5z"
        />
    </svg>
);

interface StatusBadgeProps {
    status: 'not-configured' | 'connected' | 'error';
}

const StatusBadge = ({ status }: StatusBadgeProps) => {
    const config: Record<string, { label: string; tone: string; dot: string }> = {
        'not-configured': {
            label: 'Not Configured',
            tone: 'platinum-badge--warning',
            dot: 'bg-yellow-400',
        },
        connected: {
            label: 'Connected',
            tone: 'platinum-badge--success',
            dot: 'bg-green-400',
        },
        error: {
            label: 'Connection Error',
            tone: 'platinum-badge--error',
            dot: 'bg-red-400',
        },
    };

    const c = config[status];

    return (
        <span className={classNames('platinum-badge', c.tone)}>
            <span className={classNames('w-1.5 h-1.5 rounded-full', c.dot)} />
            {c.label}
        </span>
    );
};

export default function NeonTab() {
    const { config, isConfigured, connectionStatus, isTestingConnection, updateConfig, testConnection, clearConfig } =
        useNeonStore();

    const [apiKey, setApiKey] = useState(config.apiKey);
    const [showKey, setShowKey] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setApiKey(config.apiKey);
    }, [config]);

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

    const setupSteps = [
        {
            step: 1,
            title: 'Create a Neon account',
            description: (
                <>
                    Visit{' '}
                    <a
                        href="https://neon.tech"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-500 hover:text-emerald-600 underline font-medium"
                    >
                        neon.tech
                    </a>{' '}
                    and sign up if you haven't already.
                </>
            ),
        },
        {
            step: 2,
            title: 'Generate an API Key',
            description: (
                <>
                    Go to your{' '}
                    <a
                        href="https://console.neon.tech/app/settings/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-500 hover:text-emerald-600 underline font-medium"
                    >
                        Developer Settings
                    </a>{' '}
                    and create a new API Key.
                </>
            ),
        },
        {
            step: 3,
            title: 'Paste credentials below',
            description: 'Enter your API Key in the field below, then click "Save & Test Connection".',
        },
        {
            step: 4,
            title: 'Start building!',
            description:
                'Once connected, your AI agents will automatically use Neon for Postgres database management via MCP.',
        },
    ];

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header Card */}
            <motion.div
                className="platinum-panel platinum-panel--neon p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <div className="flex items-start gap-4">
                    <NeonLogo />
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Neon DB</h2>
                            <StatusBadge status={connectionStatus} />
                        </div>
                        <p className="text-sm text-bolt-elements-textSecondary leading-relaxed">
                            Serverless Postgres built for developers. Provides seamless database provisioning, branching, and automated scaling via the Neon MCP.
                        </p>
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={() => window.open('https://console.neon.tech/app/settings/api-keys', '_blank')}
                                className={classNames(
                                    'platinum-action text-sm font-medium'
                                )}
                            >
                                <div className="i-ph:browser w-4 h-4" />
                                Login & Authorize Neon MCP
                            </button>
                        </div>
                    </div>
                </div>

                {!isConfigured && (
                    <div className="platinum-subpanel mt-4 p-3">
                        <div className="flex items-start gap-2">
                            <div className="i-ph:warning-fill w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-yellow-700 dark:text-yellow-400">
                                <strong>Configuration required.</strong> Neon must be configured before serverless Postgres execution can take
                                place when selected as the active backend. Follow the setup steps below.
                            </p>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Configuration Form */}
            <motion.div
                className="platinum-panel platinum-panel--neon p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
            >
                <div className="flex items-center gap-2 mb-5">
                    <div className="i-ph:key-fill w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">API Configuration</h3>
                </div>

                <div className="space-y-4">
                    {/* API Key Field */}
                    <div>
                        <label htmlFor="neon-api-key" className="block text-sm font-medium text-bolt-elements-textSecondary mb-1.5">
                            API Key
                        </label>
                        <div className="relative">
                            <input
                                id="neon-api-key"
                                type={showKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Enter your Neon API Key"
                                className={classNames('platinum-input w-full pr-10 text-sm font-mono')}
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-colors"
                                title={showKey ? 'Hide API key' : 'Show API key'}
                            >
                                <div className={classNames('w-4 h-4', showKey ? 'i-ph:eye-slash' : 'i-ph:eye')} />
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={handleSave}
                            disabled={isSaving || isTestingConnection || !apiKey.trim()}
                            className={classNames(
                                getAccentButtonClassName('neon', 'primary'),
                                'text-sm font-medium',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                            )}
                        >
                            {isSaving || isTestingConnection ? (
                                <>
                                    <div className="i-svg-spinners:90-ring-with-bg w-4 h-4 animate-spin" />
                                    Testing...
                                </>
                            ) : (
                                <>
                                    <div className="i-ph:floppy-disk w-4 h-4" />
                                    Save & Test Connection
                                </>
                            )}
                        </button>

                        {isConfigured && (
                            <button
                                onClick={handleDisconnect}
                                className={classNames(
                                    'platinum-action platinum-action--danger text-sm font-medium',
                                )}
                            >
                                <div className="i-ph:sign-out w-4 h-4" />
                                Disconnect
                            </button>
                        )}
                    </div>
                </div>

                {/* MCP Sync Note */}
                {isConfigured && (
                    <div className="platinum-subpanel mt-4 p-3">
                        <div className="flex items-start gap-2">
                            <div className="i-ph:check-circle-fill w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-bolt-elements-textSecondary">
                                Your Neon credentials have been successfully synced to the MCP server configuration. AI agents will use Neon MCP when it is selected as the active backend.
                            </p>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Setup Guide */}
            <motion.div
                className="platinum-panel platinum-panel--neon p-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
            >
                <div className="flex items-center gap-2 mb-5">
                    <div className="i-ph:book-open-fill w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">Setup Guide</h3>
                </div>

                <div className="space-y-4">
                    {setupSteps.map(({ step, title, description }) => (
                        <div key={step} className="flex gap-3">
                            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{step}</span>
                            </div>
                            <div className="flex-1 pt-0.5">
                                <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-0.5">{title}</h4>
                                <p className="text-xs text-bolt-elements-textSecondary leading-relaxed">{description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
