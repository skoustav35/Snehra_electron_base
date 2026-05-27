import {
    CODESMITH_AGENT_KEYS,
    CODESMITH_CORE_17_AGENT_KEYS,
    CODESMITH_ULTIMATE_50_AGENT_KEYS
} from './agent-catalog';
import type { CodeSmithAgentKey } from './agent-catalog';

export type CodeSmithMode = 'eco' | 'balanced' | 'performance' | 'turbo' | 'ultimate';
export type LegacyCodeSmithMode = 'fast' | 'smart' | 'advanced' | 'research';
export type AnyCodeSmithMode = CodeSmithMode | LegacyCodeSmithMode;

const MODE_ALIASES: Record<LegacyCodeSmithMode, CodeSmithMode> = {
    fast: 'eco',
    smart: 'balanced',
    advanced: 'performance',
    research: 'turbo'
};

export const CODESMITH_MANDATORY_AGENT_KEYS: CodeSmithAgentKey[] = ['tester', 'debugger'];

const ECO_AGENT_KEYS: CodeSmithAgentKey[] = [
    'architect',
    'builder',
    'tester',
    'debugger',
    'reviewer'
];

const BALANCED_AGENT_KEYS: CodeSmithAgentKey[] = [
    'ceo',
    'architect',
    'builder',
    'tester',
    'debugger',
    'reviewer'
];

const PERFORMANCE_AGENT_KEYS: CodeSmithAgentKey[] = unique([
    ...CODESMITH_CORE_17_AGENT_KEYS,
    'ceo',
    ...CODESMITH_MANDATORY_AGENT_KEYS
]);

const TURBO_AGENT_KEYS: CodeSmithAgentKey[] = [...PERFORMANCE_AGENT_KEYS];

const ULTIMATE_AGENT_KEYS: CodeSmithAgentKey[] = unique([
    ...CODESMITH_ULTIMATE_50_AGENT_KEYS,
    ...CODESMITH_MANDATORY_AGENT_KEYS
]);

export interface CodeSmithModePolicy {
    mode: CodeSmithMode;
    max_cycles: number;
    max_runtime_ms: number;
    supports_ceo: boolean;
    allow_recursive_expansion: boolean;
    agent_keys: CodeSmithAgentKey[];
}

const MODE_POLICIES: Record<CodeSmithMode, CodeSmithModePolicy> = {
    eco: {
        mode: 'eco',
        max_cycles: 1,
        max_runtime_ms: 10 * 60 * 1000,
        supports_ceo: false,
        allow_recursive_expansion: false,
        agent_keys: ECO_AGENT_KEYS
    },
    balanced: {
        mode: 'balanced',
        max_cycles: 3,
        max_runtime_ms: 30 * 60 * 1000,
        supports_ceo: true,
        allow_recursive_expansion: true,
        agent_keys: BALANCED_AGENT_KEYS
    },
    performance: {
        mode: 'performance',
        max_cycles: 3,
        max_runtime_ms: 2 * 60 * 60 * 1000,
        supports_ceo: true,
        allow_recursive_expansion: true,
        agent_keys: PERFORMANCE_AGENT_KEYS
    },
    turbo: {
        mode: 'turbo',
        max_cycles: 150,
        max_runtime_ms: 7 * 24 * 60 * 60 * 1000,
        supports_ceo: true,
        allow_recursive_expansion: true,
        agent_keys: TURBO_AGENT_KEYS
    },
    ultimate: {
        mode: 'ultimate',
        max_cycles: 500,
        max_runtime_ms: 120 * 24 * 60 * 60 * 1000,
        supports_ceo: true,
        allow_recursive_expansion: true,
        agent_keys: ULTIMATE_AGENT_KEYS
    }
};

function unique<T>(items: T[]): T[] {
    return items.filter((item, index, arr) => arr.indexOf(item) === index);
}

export function normalizeCodeSmithMode(mode?: string): CodeSmithMode {
    const raw = String(mode || '').trim().toLowerCase();
    if (raw in MODE_ALIASES) {
        return MODE_ALIASES[raw as LegacyCodeSmithMode];
    }
    if (raw === 'eco' || raw === 'balanced' || raw === 'performance' || raw === 'turbo' || raw === 'ultimate') {
        return raw as CodeSmithMode;
    }
    return 'balanced';
}

export function resolveLegacyMode(mode: AnyCodeSmithMode): CodeSmithMode {
    return normalizeCodeSmithMode(mode);
}

export function getCodeSmithModePolicy(mode?: string): CodeSmithModePolicy {
    const resolved = normalizeCodeSmithMode(mode);
    return MODE_POLICIES[resolved];
}

export function getCodeSmithModeAgentKeys(mode?: string): CodeSmithAgentKey[] {
    const policy = getCodeSmithModePolicy(mode);
    return [...policy.agent_keys];
}

export function getCodeSmithModeCycleLimit(mode?: string): number {
    return getCodeSmithModePolicy(mode).max_cycles;
}

export function getCodeSmithModeRuntimeLimitMs(mode?: string): number {
    return getCodeSmithModePolicy(mode).max_runtime_ms;
}

export function modeSupportsCEO(mode?: string): boolean {
    return getCodeSmithModePolicy(mode).supports_ceo;
}

export function isLegacyCodeSmithMode(mode?: string): mode is LegacyCodeSmithMode {
    const normalized = String(mode || '').trim().toLowerCase();
    return normalized === 'fast' || normalized === 'smart' || normalized === 'advanced' || normalized === 'research';
}

export function isKnownCodeSmithAgent(agentKey: string): agentKey is CodeSmithAgentKey {
    return (CODESMITH_AGENT_KEYS as readonly string[]).includes(agentKey);
}
