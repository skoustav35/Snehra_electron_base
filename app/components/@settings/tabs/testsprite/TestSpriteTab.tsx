import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { useTestSpriteStore } from '~/lib/stores/testsprite';

const TestSpriteLogo = () => (
    <svg viewBox="0 0 48 48" className="w-10 h-10">
        <defs>
            <linearGradient id="ts-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="50%" stopColor="#059669" />
                <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill="url(#ts-logo-grad)" opacity="0.1" />
        <circle cx="24" cy="24" r="10" stroke="url(#ts-logo-grad)" strokeWidth="2.5" fill="none" />
        <path
            d="M18 24l4 4 8-8"
            stroke="url(#ts-logo-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
        />
    </svg>
);

interface StatusBadgeProps {
    status: 'not-configured' | 'connected' | 'error';
}

const StatusBadge = ({ status }: StatusBadgeProps) => {
    const config: Record<string, { label: string; bg: string; text: string; dot: string }> = {
        'not-configured': {
            label: 'Not Configured',
            bg: 'bg-gray-100 dark:bg-gray-800/40',
            text: 'text-gray-600 dark:text-gray-400',
            dot: 'bg-gray-400',
        },
        connected: {
            label: 'Active',
            bg: 'bg-green-100 dark:bg-green-900/20',
            text: 'text-green-800 dark:text-green-400',
            dot: 'bg-green-400',
        },
        error: {
            label: 'Error',
            bg: 'bg-red-100 dark:bg-red-900/20',
            text: 'text-red-800 dark:text-red-400',
            dot: 'bg-red-400',
        },
    };

    const c = config[status];

    return (
        <span className={classNames('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', c.bg, c.text)}>
            <span className={classNames('w-1.5 h-1.5 rounded-full', c.dot)} />
            {c.label}
        </span>
    );
};

export default function TestSpriteTab() {
    const { config, isConfigured, connectionStatus, updateConfig, clearConfig } = useTestSpriteStore();

    const [apiKey, setApiKey] = useState(config.apiKey);
    const [showKey, setShowKey] = useState(false);

    useEffect(() => {
        setApiKey(config.apiKey);
    }, [config]);

    const handleSave = () => {
        if (!apiKey.trim()) {
            return;
        }

        updateConfig({ apiKey: apiKey.trim() });
    };

    const handleDisconnect = async () => {
        await clearConfig();
        setApiKey('');
    };

    const setupSteps = [
        {
            step: 1,
            title: 'Create a TestSprite account',
            description: (
                <>
                    Visit{' '}
                    <a
                        href="https://www.testsprite.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-500 hover:text-emerald-600 underline font-medium"
                    >
                        testsprite.com
                    </a>{' '}
                    and sign up for free.
                </>
            ),
        },
        {
            step: 2,
            title: 'Open your dashboard',
            description: (
                <>
                    Sign in to the{' '}
                    <a
                        href="https://www.testsprite.com/dashboard"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-500 hover:text-emerald-600 underline font-medium"
                    >
                        TestSprite Dashboard
                    </a>
                    .
                </>
            ),
        },
        {
            step: 3,
            title: 'Generate an API Key',
            description: 'Navigate to Settings → API Keys, then click "New API Key". Give it a descriptive name like "Snehra App". Copy the generated key.',
        },
        {
            step: 4,
            title: 'Paste your API Key below',
            description: 'Enter the key in the field below and click "Save". The MCP will be automatically configured.',
        },
        {
            step: 5,
            title: 'Let the AI test your app!',
            description:
                'Once active, the AI agents will automatically run TestSprite after every feature build — generating test plans, executing them in the cloud, diagnosing failures, and applying fixes.',
        },
    ];

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <motion.div
                className="bg-gradient-to-br from-emerald-500/5 via-green-500/5 to-teal-500/5 dark:from-emerald-500/10 dark:via-green-500/10 dark:to-teal-500/10 rounded-xl p-6 border border-emerald-200/30 dark:border-emerald-500/20"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
            >
                <div className="flex items-start gap-4">
                    <TestSpriteLogo />
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">TestSprite</h2>
                            <StatusBadge status={connectionStatus} />
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                Optional
                            </span>
                        </div>
                        <p className="text-sm text-bolt-elements-textSecondary leading-relaxed">
                            AI-powered testing engine. Automatically generates smart test plans, executes them in the cloud, diagnoses
                            failures with pinpoint precision, and auto-fixes bugs — all without leaving your editor.
                        </p>
                        <div className="mt-3 flex items-center gap-4">
                            <a
                                href="https://www.testsprite.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm text-emerald-500 hover:text-emerald-600 font-medium transition-colors"
                            >
                                <div className="i-ph:arrow-square-out w-4 h-4" />
                                Open TestSprite
                            </a>
                            <a
                                href="https://docs.testsprite.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary transition-colors"
                            >
                                <div className="i-ph:book-open w-4 h-4" />
                                Documentation
                            </a>
                        </div>
                    </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30">
                    <div className="flex items-start gap-2">
                        <div className="i-ph:info-fill w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                            TestSprite is <strong>optional</strong>. Your app will work without it, but when configured, the AI will
                            automatically run tests after every feature build, catch bugs early, and apply fixes — making your app
                            significantly more reliable.
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Configuration */}
            <motion.div
                className="bg-white dark:bg-[#0A0A0A] rounded-xl shadow-sm dark:shadow-none p-6 border border-[#E5E5E5] dark:border-[#1A1A1A]"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
            >
                <div className="flex items-center gap-2 mb-5">
                    <div className="i-ph:key-fill w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">API Key Configuration</h3>
                </div>

                <div className="space-y-4">
                    <div>
                        <label htmlFor="testsprite-api-key" className="block text-sm font-medium text-bolt-elements-textSecondary mb-1.5">
                            API Key
                        </label>
                        <div className="relative">
                            <input
                                id="testsprite-api-key"
                                type={showKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="ts_xxxxxxxxxxxxxxxxxxxxxxxx"
                                className={classNames(
                                    'w-full px-3 py-2.5 pr-10 rounded-lg text-sm font-mono',
                                    'bg-[#FAFAFA] dark:bg-[#111111]',
                                    'border border-[#E5E5E5] dark:border-[#2A2A2A]',
                                    'text-bolt-elements-textPrimary',
                                    'placeholder:text-bolt-elements-textTertiary',
                                    'focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50',
                                    'transition-all duration-200',
                                )}
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

                    {/* MCP Config Preview */}
                    {isConfigured && (
                        <div className="rounded-lg bg-[#FAFAFA] dark:bg-[#111111] border border-[#E5E5E5] dark:border-[#1A1A1A] p-3">
                            <p className="text-xs font-medium text-bolt-elements-textTertiary mb-2">MCP Configuration (auto-applied)</p>
                            <pre className="text-[11px] text-bolt-elements-textSecondary leading-relaxed overflow-x-auto">
                                {JSON.stringify(
                                    {
                                        TestSprite: {
                                            command: 'npx',
                                            args: ['@testsprite/testsprite-mcp@latest'],
                                            env: { API_KEY: '••••••••' },
                                        },
                                    },
                                    null,
                                    2,
                                )}
                            </pre>
                        </div>
                    )}

                    <div className="flex items-center gap-3 pt-1">
                        <button
                            onClick={handleSave}
                            disabled={!apiKey.trim()}
                            className={classNames(
                                'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
                                'bg-emerald-500 text-white',
                                'hover:bg-emerald-600',
                                'disabled:opacity-50 disabled:cursor-not-allowed',
                                'transition-all duration-200',
                            )}
                        >
                            <div className="i-ph:floppy-disk w-4 h-4" />
                            Save API Key
                        </button>

                        {isConfigured && (
                            <button
                                onClick={handleDisconnect}
                                className={classNames(
                                    'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2',
                                    'border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400',
                                    'hover:bg-red-50 dark:hover:bg-red-900/20',
                                    'transition-all duration-200',
                                )}
                            >
                                <div className="i-ph:sign-out w-4 h-4" />
                                Remove
                            </button>
                        )}
                    </div>
                </div>

                {isConfigured && (
                    <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30">
                        <div className="flex items-start gap-2">
                            <div className="i-ph:check-circle-fill w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                            <p className="text-xs text-green-700 dark:text-green-400">
                                TestSprite is active. AI agents will automatically run test plans, diagnose failures, and apply code
                                fixes after every feature build.
                            </p>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Setup Guide */}
            <motion.div
                className="bg-white dark:bg-[#0A0A0A] rounded-xl shadow-sm dark:shadow-none p-6 border border-[#E5E5E5] dark:border-[#1A1A1A]"
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

            {/* Testing Capabilities */}
            <motion.div
                className="bg-white dark:bg-[#0A0A0A] rounded-xl shadow-sm dark:shadow-none p-6 border border-[#E5E5E5] dark:border-[#1A1A1A]"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
            >
                <div className="flex items-center gap-2 mb-5">
                    <div className="i-ph:test-tube-fill w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-semibold text-bolt-elements-textPrimary">What TestSprite Does</h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {[
                        { icon: 'i-ph:list-checks', label: 'Smart Test Plans', desc: 'AI generates tests from your code & PRDs' },
                        { icon: 'i-ph:cloud-check', label: 'Cloud Execution', desc: 'Tests run in isolated cloud sandboxes' },
                        { icon: 'i-ph:magnifying-glass', label: 'Failure Diagnosis', desc: 'Pinpoint root cause with execution logs' },
                        { icon: 'i-ph:wrench', label: 'Auto-Fix Code', desc: 'AI patches the failing code automatically' },
                        { icon: 'i-ph:globe', label: 'UI Flow Testing', desc: 'Clicks, forms, navigation & rendering' },
                        { icon: 'i-ph:plugs-connected', label: 'API Testing', desc: 'Endpoints, contracts & schema validation' },
                        { icon: 'i-ph:shield-check', label: 'Security Tests', desc: 'Auth guards & unauthorized access checks' },
                        { icon: 'i-ph:arrows-clockwise', label: 'Regression Guard', desc: 'Re-runs on every change to catch regressions' },
                    ].map(({ icon, label, desc }) => (
                        <div
                            key={label}
                            className="p-3 rounded-lg bg-[#FAFAFA] dark:bg-[#111111] border border-[#E5E5E5] dark:border-[#1A1A1A]"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <div className={classNames(icon, 'w-4 h-4 text-emerald-500')} />
                                <span className="text-xs font-medium text-bolt-elements-textPrimary">{label}</span>
                            </div>
                            <p className="text-[10px] text-bolt-elements-textTertiary leading-relaxed">{desc}</p>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}
