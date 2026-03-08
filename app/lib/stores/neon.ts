import { create } from 'zustand';
import { toast } from 'react-toastify';
import { useMCPStore } from './mcp';

const NEON_SETTINGS_KEY = 'neon_settings';
const isBrowser = typeof window !== 'undefined';

export interface NeonConfig {
    apiKey: string;
}

interface NeonStore {
    config: NeonConfig;
    isConfigured: boolean;
    isTestingConnection: boolean;
    connectionStatus: 'not-configured' | 'connected' | 'error';
    initialize: () => void;
    updateConfig: (config: NeonConfig) => void;
    testConnection: () => Promise<boolean>;
    syncToMcp: () => Promise<void>;
    clearConfig: () => Promise<void>;
}

const defaultConfig: NeonConfig = {
    apiKey: '',
};

function loadConfig(): NeonConfig {
    if (!isBrowser) {
        return defaultConfig;
    }

    try {
        const saved = localStorage.getItem(NEON_SETTINGS_KEY);

        if (saved) {
            return JSON.parse(saved) as NeonConfig;
        }
    } catch (e) {
        console.error('Error loading Neon config:', e);
    }

    return defaultConfig;
}

function saveConfig(config: NeonConfig) {
    if (isBrowser) {
        localStorage.setItem(NEON_SETTINGS_KEY, JSON.stringify(config));
    }
}

function checkConfigured(config: NeonConfig): boolean {
    return !!(config.apiKey && config.apiKey.trim().length > 0);
}

export const useNeonStore = create<NeonStore>((set, get) => ({
    config: loadConfig(),
    isConfigured: checkConfigured(loadConfig()),
    isTestingConnection: false,
    connectionStatus: checkConfigured(loadConfig()) ? 'connected' : 'not-configured',

    initialize: () => {
        const config = loadConfig();
        set({
            config,
            isConfigured: checkConfigured(config),
            connectionStatus: checkConfigured(config) ? 'connected' : 'not-configured',
        });
    },

    updateConfig: (config: NeonConfig) => {
        saveConfig(config);
        const configured = checkConfigured(config);
        set({
            config,
            isConfigured: configured,
            connectionStatus: configured ? 'connected' : 'not-configured',
        });

        if (configured) {
            get().syncToMcp();
        }
    },

    testConnection: async () => {
        const { config } = get();

        if (!checkConfigured(config)) {
            set({ connectionStatus: 'not-configured' });
            return false;
        }

        set({ isTestingConnection: true });

        try {
            // Test the API key by fetching Neon projects
            const response = await fetch('https://console.neon.tech/api/v2/projects', {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Accept': 'application/json'
                },
            });

            if (response.ok) {
                set({ connectionStatus: 'connected', isTestingConnection: false });
                toast.success('Successfully connected to Neon!');
                return true;
            } else {
                set({ connectionStatus: 'error', isTestingConnection: false });
                toast.error(`Connection failed: ${response.status} ${response.statusText}`);
                return false;
            }
        } catch (error) {
            set({ connectionStatus: 'error', isTestingConnection: false });
            toast.error(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
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

            const newSettings = structuredClone(settings);
            if (!newSettings.mcpConfig) newSettings.mcpConfig = { mcpServers: {} };
            if (!newSettings.mcpConfig.mcpServers) newSettings.mcpConfig.mcpServers = {};

            newSettings.mcpConfig.mcpServers.neon = {
                type: 'http' as any,
                url: 'https://mcp.neon.tech/mcp',
                env: {
                    NEON_API_KEY: config.apiKey
                }
            };

            await updateSettings(newSettings);
            console.log('Successfully synced Neon to MCP backend');
        } catch (e) {
            console.error('Error syncing Neon config to MCP:', e);
        }
    },

    clearConfig: async () => {
        if (isBrowser) {
            localStorage.removeItem(NEON_SETTINGS_KEY);

            try {
                const { settings, updateSettings } = useMCPStore.getState();

                if (settings?.mcpConfig?.mcpServers?.neon) {
                    const newSettings = structuredClone(settings);
                    delete newSettings.mcpConfig.mcpServers.neon;
                    await updateSettings(newSettings);
                }
            } catch (e) {
                console.error('Error removing Neon from MCP config:', e);
            }
        }

        set({
            config: defaultConfig,
            isConfigured: false,
            connectionStatus: 'not-configured',
        });
    },
}));

export function isNeonReady(): boolean {
    if (!isBrowser) {
        return false;
    }

    try {
        const saved = localStorage.getItem(NEON_SETTINGS_KEY);

        if (saved) {
            const config = JSON.parse(saved) as NeonConfig;
            return checkConfigured(config);
        }
    } catch {
        // ignore
    }

    return false;
}
