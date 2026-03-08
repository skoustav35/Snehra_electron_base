import { create } from 'zustand';
import { toast } from 'react-toastify';
import { useMCPStore } from './mcp';

const TESTSPRITE_SETTINGS_KEY = 'testsprite_settings';
const isBrowser = typeof window !== 'undefined';

export interface TestSpriteConfig {
    apiKey: string;
}

interface TestSpriteStore {
    config: TestSpriteConfig;
    isConfigured: boolean;
    connectionStatus: 'not-configured' | 'connected' | 'error';
    initialize: () => void;
    updateConfig: (config: TestSpriteConfig) => void;
    syncToMcp: () => Promise<void>;
    clearConfig: () => Promise<void>;
}

const defaultConfig: TestSpriteConfig = {
    apiKey: '',
};

function loadConfig(): TestSpriteConfig {
    if (!isBrowser) {
        return defaultConfig;
    }

    try {
        const saved = localStorage.getItem(TESTSPRITE_SETTINGS_KEY);

        if (saved) {
            return JSON.parse(saved) as TestSpriteConfig;
        }
    } catch (e) {
        console.error('Error loading TestSprite config:', e);
    }

    return defaultConfig;
}

function saveConfig(config: TestSpriteConfig) {
    if (isBrowser) {
        localStorage.setItem(TESTSPRITE_SETTINGS_KEY, JSON.stringify(config));
    }
}

function checkConfigured(config: TestSpriteConfig): boolean {
    return !!(config.apiKey && config.apiKey.trim().length > 0);
}

export const useTestSpriteStore = create<TestSpriteStore>((set, get) => ({
    config: loadConfig(),
    isConfigured: checkConfigured(loadConfig()),
    connectionStatus: checkConfigured(loadConfig()) ? 'connected' : 'not-configured',

    initialize: () => {
        const config = loadConfig();
        set({
            config,
            isConfigured: checkConfigured(config),
            connectionStatus: checkConfigured(config) ? 'connected' : 'not-configured',
        });
    },

    updateConfig: (config: TestSpriteConfig) => {
        saveConfig(config);
        const configured = checkConfigured(config);
        set({
            config,
            isConfigured: configured,
            connectionStatus: configured ? 'connected' : 'not-configured',
        });

        if (configured) {
            get().syncToMcp();
            toast.success('TestSprite API key saved & MCP configured!');
        }
    },

    syncToMcp: async () => {
        if (!isBrowser) {
            return;
        }

        const { config } = get();

        if (!checkConfigured(config)) {
            return;
        }

        try {
            const { settings, updateSettings } = useMCPStore.getState();

            const newSettings = {
                ...settings,
                mcpConfig: {
                    ...settings.mcpConfig,
                    mcpServers: {
                        ...settings.mcpConfig?.mcpServers,
                        TestSprite: {
                            type: 'stdio' as const,
                            command: 'npx',
                            args: ['@testsprite/testsprite-mcp@latest'],
                            env: {
                                API_KEY: config.apiKey,
                            },
                        },
                    },
                },
            };

            await updateSettings(newSettings);
            console.log('Successfully synced TestSprite to MCP backend');
        } catch (e) {
            console.error('Error syncing TestSprite config to MCP:', e);
        }
    },

    clearConfig: async () => {
        if (isBrowser) {
            localStorage.removeItem(TESTSPRITE_SETTINGS_KEY);

            try {
                const { settings, updateSettings } = useMCPStore.getState();

                if (settings?.mcpConfig?.mcpServers?.TestSprite) {
                    const newSettings = structuredClone(settings);
                    delete newSettings.mcpConfig.mcpServers.TestSprite;
                    await updateSettings(newSettings);
                }
            } catch (e) {
                console.error('Error removing TestSprite from MCP config:', e);
            }
        }

        set({
            config: defaultConfig,
            isConfigured: false,
            connectionStatus: 'not-configured',
        });

        toast.info('TestSprite API key removed.');
    },
}));

// Helper for checking TestSprite readiness from anywhere
export function isTestSpriteReady(): boolean {
    if (!isBrowser) {
        return false;
    }

    try {
        const saved = localStorage.getItem(TESTSPRITE_SETTINGS_KEY);

        if (saved) {
            const config = JSON.parse(saved) as TestSpriteConfig;
            return checkConfigured(config);
        }
    } catch {
        // ignore
    }

    return false;
}
