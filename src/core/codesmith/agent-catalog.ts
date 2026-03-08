import { AgentType } from '../shims/shared-types';

export const CODESMITH_AGENT_KEYS = [
    'ceo',
    'leader_ceo',
    'subsystem_ceo',
    'architect',
    'builder',
    'tester',
    'debugger',
    'reviewer',
    'product_strategist',
    'system_architect',
    'technical_planner',
    'ux_researcher',
    'ui_designer',
    'design_system',
    'frontend_engineer',
    'backend_engineer',
    'database_architect',
    'api_integrations',
    'security_engineer',
    'qa_engineer',
    'performance_engineer',
    'devops_engineer',
    'release_manager',
    'technical_writer',
    'growth_agent',
    'monitoring_engineer',
    'accessibility_specialist',
    'reliability_engineer',
    'site_reliability_engineer',
    'cloud_architect',
    'data_engineer',
    'ml_engineer',
    'infrastructure_optimizer',
    'chaos_engineer',
    'compliance_auditor',
    'market_analyst',
    'growth_strategist',
    'product_manager',
    'business_analyst',
    'mobile_engineer',
    'integration_engineer',
    'observability_engineer',
    'platform_engineer',
    'caching_engineer',
    'auth_engineer',
    'admin_dashboard_engineer',
    'analytics_engineer',
    'documentation_engineer',
    'localization_specialist',
    'cost_optimizer'
] as const;

export type CodeSmithAgentKey = typeof CODESMITH_AGENT_KEYS[number];
export type CodeSmithRole = 'ceo' | 'architect' | 'builder' | 'tester' | 'debugger' | 'reviewer' | 'fixer' | 'generic';

export interface CodeSmithAgentDefinition {
    key: CodeSmithAgentKey;
    name: string;
    type: AgentType;
    role: CodeSmithRole;
    description: string;
    dependencies: CodeSmithAgentKey[];
    base_estimated_cost: number;
    timeout_ms: number;
    max_retries: number;
    capabilities: string[];
    permissions: string[];
    max_concurrent_tasks: number;
}

interface AgentBlueprint {
    key: CodeSmithAgentKey;
    name: string;
    type: AgentType;
    role: CodeSmithRole;
    description: string;
    dependencies?: CodeSmithAgentKey[];
    capabilities?: string[];
    permissions?: string[];
    base_estimated_cost?: number;
    timeout_ms?: number;
    max_retries?: number;
    max_concurrent_tasks?: number;
}

const ROLE_DEFAULTS: Record<CodeSmithRole, {
    type: AgentType;
    base_estimated_cost: number;
    timeout_ms: number;
    max_retries: number;
    max_concurrent_tasks: number;
    permissions: string[];
}> = {
    ceo: {
        type: 'planning',
        base_estimated_cost: 0.1,
        timeout_ms: 180000,
        max_retries: 1,
        max_concurrent_tasks: 1,
        permissions: ['codesmith:workspace:read']
    },
    architect: {
        type: 'planning',
        base_estimated_cost: 0.06,
        timeout_ms: 180000,
        max_retries: 2,
        max_concurrent_tasks: 1,
        permissions: ['codesmith:workspace:read']
    },
    builder: {
        type: 'implementation',
        base_estimated_cost: 0.08,
        timeout_ms: 300000,
        max_retries: 2,
        max_concurrent_tasks: 2,
        permissions: ['codesmith:workspace:read', 'codesmith:workspace:write', 'codesmith:command:run']
    },
    tester: {
        type: 'verification',
        base_estimated_cost: 0.08,
        timeout_ms: 300000,
        max_retries: 2,
        max_concurrent_tasks: 1,
        permissions: ['codesmith:workspace:read', 'codesmith:workspace:write', 'codesmith:command:run']
    },
    debugger: {
        type: 'verification',
        base_estimated_cost: 0.08,
        timeout_ms: 300000,
        max_retries: 2,
        max_concurrent_tasks: 1,
        permissions: ['codesmith:workspace:read', 'codesmith:workspace:write', 'codesmith:command:run']
    },
    reviewer: {
        type: 'verification',
        base_estimated_cost: 0.05,
        timeout_ms: 180000,
        max_retries: 1,
        max_concurrent_tasks: 1,
        permissions: ['codesmith:workspace:read']
    },
    fixer: {
        type: 'implementation',
        base_estimated_cost: 0.06,
        timeout_ms: 240000,
        max_retries: 2,
        max_concurrent_tasks: 1,
        permissions: ['codesmith:workspace:read', 'codesmith:workspace:write', 'codesmith:command:run']
    },
    generic: {
        type: 'discovery',
        base_estimated_cost: 0.04,
        timeout_ms: 180000,
        max_retries: 1,
        max_concurrent_tasks: 1,
        permissions: ['codesmith:workspace:read']
    }
};

const AGENT_BLUEPRINTS: AgentBlueprint[] = [
    {
        key: 'ceo',
        name: 'CEOAgent',
        type: 'planning',
        role: 'ceo',
        description: 'Top-level governance: requirement interrogation, preview audits, and cycle commands.',
        dependencies: ['reviewer'],
        capabilities: ['requirement_interrogation', 'preview_audit', 'quality_governance', 'rerun_authority']
    },
    {
        key: 'leader_ceo',
        name: 'LeaderCEO',
        type: 'planning',
        role: 'ceo',
        description: 'Leader CEO for enterprise-scale orchestration in ultimate mode.',
        dependencies: ['subsystem_ceo', 'reviewer'],
        capabilities: ['portfolio_governance', 'cross_subsystem_decisions', 'executive_approval']
    },
    {
        key: 'subsystem_ceo',
        name: 'SubsystemCEO',
        type: 'planning',
        role: 'ceo',
        description: 'Subsystem executive that coordinates domain-level delivery and escalations.',
        dependencies: ['reviewer'],
        capabilities: ['subsystem_governance', 'escalation_management', 'quality_signoff']
    },
    {
        key: 'architect',
        name: 'Architect',
        type: 'planning',
        role: 'architect',
        description: 'Canonical architecture role used by eco and balanced modes.',
        capabilities: ['system_design', 'task_breakdown', 'risk_identification']
    },
    {
        key: 'builder',
        name: 'Builder',
        type: 'implementation',
        role: 'builder',
        description: 'Canonical build role used by eco and balanced modes.',
        dependencies: ['architect'],
        capabilities: ['implementation', 'artifact_generation', 'build_preparation']
    },
    {
        key: 'tester',
        name: 'Tester',
        type: 'verification',
        role: 'tester',
        description: 'Mandatory test gate with unit/integration/build/static validation.',
        dependencies: [],
        capabilities: ['test_execution', 'quality_gate', 'structured_report']
    },
    {
        key: 'debugger',
        name: 'Debugger',
        type: 'verification',
        role: 'debugger',
        description: 'Mandatory debugger gate that analyzes failures and patches issues.',
        dependencies: ['tester'],
        capabilities: ['stack_trace_analysis', 'auto_patch', 'rerun_recommendation']
    },
    {
        key: 'reviewer',
        name: 'Reviewer',
        type: 'verification',
        role: 'reviewer',
        description: 'Final technical reviewer after tester/debugger pass.',
        dependencies: ['debugger'],
        capabilities: ['final_review', 'risk_assessment', 'release_readiness']
    },
    {
        key: 'product_strategist',
        name: 'ProductStrategist',
        type: 'planning',
        role: 'architect',
        description: 'Converts intent into product scope, priorities, and roadmap.',
        capabilities: ['product_vision', 'roadmapping', 'mvp_scoping']
    },
    {
        key: 'system_architect',
        name: 'SystemArchitect',
        type: 'planning',
        role: 'architect',
        description: 'Designs service boundaries, architecture, and scalability baseline.',
        dependencies: ['product_strategist'],
        capabilities: ['system_design', 'scalability_planning', 'integration_contracts']
    },
    {
        key: 'technical_planner',
        name: 'TechnicalPlanner',
        type: 'planning',
        role: 'architect',
        description: 'Creates implementation task graph and execution sequencing.',
        dependencies: ['system_architect'],
        capabilities: ['task_breakdown', 'dependency_planning', 'delivery_plan']
    },
    {
        key: 'ux_researcher',
        name: 'UXResearcher',
        type: 'planning',
        role: 'architect',
        description: 'Produces user flows, interaction priorities, and usability requirements.',
        dependencies: ['product_strategist'],
        capabilities: ['user_flows', 'usability_analysis', 'interaction_requirements']
    },
    {
        key: 'ui_designer',
        name: 'UIDesigner',
        type: 'planning',
        role: 'architect',
        description: 'Defines interface structure and layout decisions.',
        dependencies: ['ux_researcher', 'design_system'],
        capabilities: ['layout_design', 'interaction_specs', 'component_specs'],
        permissions: ['codesmith:workspace:read', 'codesmith:workspace:write']
    },
    {
        key: 'design_system',
        name: 'DesignSystem',
        type: 'planning',
        role: 'architect',
        description: 'Maintains design tokens and reusable UI conventions.',
        dependencies: ['ux_researcher'],
        capabilities: ['design_tokens', 'component_guidelines', 'theme_consistency'],
        permissions: ['codesmith:workspace:read', 'codesmith:workspace:write']
    },
    {
        key: 'frontend_engineer',
        name: 'FrontendEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements user-facing interfaces and client behavior.',
        dependencies: ['technical_planner', 'ui_designer'],
        capabilities: ['component_development', 'state_management', 'responsive_ui'],
        max_concurrent_tasks: 4
    },
    {
        key: 'backend_engineer',
        name: 'BackendEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements service logic, business rules, and server modules.',
        dependencies: ['technical_planner'],
        capabilities: ['service_implementation', 'business_logic', 'backend_refactoring']
    },
    {
        key: 'database_architect',
        name: 'DatabaseArchitect',
        type: 'implementation',
        role: 'builder',
        description: 'Designs and implements schema, migrations, and persistence models.',
        dependencies: ['system_architect'],
        capabilities: ['schema_design', 'migration_planning', 'query_modeling']
    },
    {
        key: 'api_integrations',
        name: 'APIArchitect',
        type: 'implementation',
        role: 'builder',
        description: 'Implements API contracts and external integration adapters.',
        dependencies: ['backend_engineer', 'database_architect'],
        capabilities: ['api_contracts', 'endpoint_implementation', 'integration_clients']
    },
    {
        key: 'security_engineer',
        name: 'SecurityEngineer',
        type: 'verification',
        role: 'reviewer',
        description: 'Audits vulnerabilities, auth surfaces, and secret handling.',
        dependencies: ['backend_engineer', 'frontend_engineer'],
        capabilities: ['security_audit', 'threat_review', 'secret_scanning'],
        permissions: ['codesmith:workspace:read', 'codesmith:command:run']
    },
    {
        key: 'qa_engineer',
        name: 'QAEngineer',
        type: 'verification',
        role: 'tester',
        description: 'Designs and runs functional tests with defect reports.',
        dependencies: ['frontend_engineer', 'backend_engineer', 'database_architect'],
        capabilities: ['test_design', 'test_execution', 'defect_reporting']
    },
    {
        key: 'performance_engineer',
        name: 'PerformanceEngineer',
        type: 'verification',
        role: 'reviewer',
        description: 'Analyzes hot paths, latency, and computational hotspots.',
        dependencies: ['frontend_engineer', 'backend_engineer'],
        capabilities: ['profiling', 'optimization_audit', 'performance_budgeting'],
        permissions: ['codesmith:workspace:read', 'codesmith:command:run']
    },
    {
        key: 'devops_engineer',
        name: 'DevOpsEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements CI/CD, build pipelines, and runtime config.',
        dependencies: ['system_architect', 'backend_engineer'],
        capabilities: ['ci_cd', 'containerization', 'runtime_configuration']
    },
    {
        key: 'release_manager',
        name: 'ReleaseManager',
        type: 'verification',
        role: 'reviewer',
        description: 'Coordinates release packaging after quality gates pass.',
        dependencies: ['qa_engineer', 'security_engineer', 'performance_engineer', 'debugger'],
        capabilities: ['release_validation', 'artifact_packaging', 'deployment_readiness']
    },
    {
        key: 'technical_writer',
        name: 'TechnicalWriter',
        type: 'implementation',
        role: 'builder',
        description: 'Maintains docs, setup instructions, and implementation notes.',
        dependencies: ['frontend_engineer', 'backend_engineer'],
        capabilities: ['documentation', 'api_docs', 'runbook_authoring'],
        permissions: ['codesmith:workspace:read', 'codesmith:workspace:write']
    },
    {
        key: 'growth_agent',
        name: 'GrowthAgent',
        type: 'implementation',
        role: 'builder',
        description: 'Implements analytics hooks and growth instrumentation.',
        dependencies: ['frontend_engineer'],
        capabilities: ['analytics_setup', 'seo_baseline', 'funnel_tracking'],
        permissions: ['codesmith:workspace:read', 'codesmith:workspace:write']
    },
    {
        key: 'monitoring_engineer',
        name: 'MonitoringEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements monitoring, dashboards, and runtime alerting.',
        dependencies: ['devops_engineer'],
        capabilities: ['monitoring_setup', 'alert_policies', 'dashboards']
    },
    {
        key: 'accessibility_specialist',
        name: 'AccessibilitySpecialist',
        type: 'verification',
        role: 'reviewer',
        description: 'Audits and improves accessibility compliance.',
        dependencies: ['frontend_engineer'],
        capabilities: ['a11y_audit', 'semantic_markup', 'assistive_tech_compatibility']
    },
    {
        key: 'reliability_engineer',
        name: 'ReliabilityEngineer',
        type: 'verification',
        role: 'reviewer',
        description: 'Validates fault-tolerance and resiliency risks.',
        dependencies: ['devops_engineer'],
        capabilities: ['resilience_review', 'incident_prevention', 'capacity_checks']
    },
    {
        key: 'site_reliability_engineer',
        name: 'SiteReliabilityEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Automates reliability controls and SLO instrumentation.',
        dependencies: ['reliability_engineer', 'monitoring_engineer'],
        capabilities: ['slo_management', 'auto_recovery', 'operability']
    },
    {
        key: 'cloud_architect',
        name: 'CloudArchitect',
        type: 'planning',
        role: 'architect',
        description: 'Defines cloud topology and infrastructure boundaries.',
        dependencies: ['system_architect'],
        capabilities: ['cloud_topology', 'networking_plan', 'environment_strategy']
    },
    {
        key: 'data_engineer',
        name: 'DataEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Builds data pipelines and transformation workflows.',
        dependencies: ['database_architect'],
        capabilities: ['etl_pipelines', 'data_modeling', 'data_quality']
    },
    {
        key: 'ml_engineer',
        name: 'MLEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements ML inference and model-serving integration.',
        dependencies: ['data_engineer'],
        capabilities: ['model_integration', 'feature_pipeline', 'inference_api']
    },
    {
        key: 'infrastructure_optimizer',
        name: 'InfrastructureOptimizer',
        type: 'verification',
        role: 'reviewer',
        description: 'Optimizes infra resource usage and deployment footprint.',
        dependencies: ['cloud_architect', 'devops_engineer'],
        capabilities: ['infra_optimization', 'resource_tuning', 'cost_efficiency']
    },
    {
        key: 'chaos_engineer',
        name: 'ChaosEngineer',
        type: 'verification',
        role: 'reviewer',
        description: 'Runs reliability fault-injection and chaos validation.',
        dependencies: ['site_reliability_engineer'],
        capabilities: ['chaos_testing', 'failure_scenarios', 'recovery_validation']
    },
    {
        key: 'compliance_auditor',
        name: 'ComplianceAuditor',
        type: 'verification',
        role: 'reviewer',
        description: 'Validates policy, compliance, and regulatory constraints.',
        dependencies: ['security_engineer'],
        capabilities: ['compliance_checks', 'policy_validation', 'audit_readiness']
    },
    {
        key: 'market_analyst',
        name: 'MarketAnalyst',
        type: 'discovery',
        role: 'generic',
        description: 'Analyzes market positioning and competitive context.',
        capabilities: ['market_analysis', 'competitive_landscape', 'trend_mapping']
    },
    {
        key: 'growth_strategist',
        name: 'GrowthStrategist',
        type: 'planning',
        role: 'architect',
        description: 'Shapes growth loops, acquisition strategy, and retention initiatives.',
        dependencies: ['market_analyst'],
        capabilities: ['growth_strategy', 'retention_design', 'funnel_optimization']
    },
    {
        key: 'product_manager',
        name: 'ProductManager',
        type: 'planning',
        role: 'architect',
        description: 'Maintains backlog prioritization and release acceptance criteria.',
        dependencies: ['product_strategist'],
        capabilities: ['backlog_management', 'acceptance_criteria', 'scope_governance']
    },
    {
        key: 'business_analyst',
        name: 'BusinessAnalyst',
        type: 'discovery',
        role: 'generic',
        description: 'Captures domain rules and business process constraints.',
        capabilities: ['domain_analysis', 'process_mapping', 'requirement_traceability']
    },
    {
        key: 'mobile_engineer',
        name: 'MobileEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements mobile client features and native integrations.',
        dependencies: ['technical_planner', 'ui_designer'],
        capabilities: ['mobile_ui', 'native_features', 'app_state']
    },
    {
        key: 'integration_engineer',
        name: 'IntegrationEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Builds service-to-service and third-party integrations.',
        dependencies: ['api_integrations'],
        capabilities: ['adapter_development', 'event_integration', 'api_connectors']
    },
    {
        key: 'observability_engineer',
        name: 'ObservabilityEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements traces, metrics, and log enrichment.',
        dependencies: ['monitoring_engineer'],
        capabilities: ['otel_instrumentation', 'metric_design', 'log_enrichment']
    },
    {
        key: 'platform_engineer',
        name: 'PlatformEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Builds platform abstractions and developer tooling.',
        dependencies: ['devops_engineer', 'cloud_architect'],
        capabilities: ['platform_apis', 'developer_experience', 'internal_tooling']
    },
    {
        key: 'caching_engineer',
        name: 'CachingEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements cache strategy and invalidation policy.',
        dependencies: ['backend_engineer', 'database_architect'],
        capabilities: ['cache_design', 'cache_invalidation', 'latency_optimization']
    },
    {
        key: 'auth_engineer',
        name: 'AuthEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements authentication, authorization, and session flows.',
        dependencies: ['backend_engineer', 'security_engineer'],
        capabilities: ['authentication', 'authorization', 'session_management']
    },
    {
        key: 'admin_dashboard_engineer',
        name: 'AdminDashboardEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Implements admin control surfaces and operational tooling.',
        dependencies: ['frontend_engineer', 'backend_engineer'],
        capabilities: ['admin_ui', 'ops_workflows', 'moderation_tools']
    },
    {
        key: 'analytics_engineer',
        name: 'AnalyticsEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Builds product analytics pipelines and reporting endpoints.',
        dependencies: ['growth_agent', 'data_engineer'],
        capabilities: ['analytics_events', 'reporting_endpoints', 'dashboard_data']
    },
    {
        key: 'documentation_engineer',
        name: 'DocumentationEngineer',
        type: 'implementation',
        role: 'builder',
        description: 'Maintains architecture docs, runbooks, and API references.',
        dependencies: ['technical_writer'],
        capabilities: ['runbooks', 'architecture_docs', 'playbooks']
    },
    {
        key: 'localization_specialist',
        name: 'LocalizationSpecialist',
        type: 'implementation',
        role: 'builder',
        description: 'Implements i18n resource structure and locale readiness.',
        dependencies: ['frontend_engineer'],
        capabilities: ['i18n_setup', 'locale_workflows', 'translation_validation']
    },
    {
        key: 'cost_optimizer',
        name: 'CostOptimizer',
        type: 'verification',
        role: 'reviewer',
        description: 'Audits runtime, model, and infrastructure spend efficiency.',
        dependencies: ['infrastructure_optimizer', 'growth_strategist'],
        capabilities: ['cost_audit', 'budget_optimization', 'finops']
    }
];

function toDefinition(blueprint: AgentBlueprint): CodeSmithAgentDefinition {
    const defaults = ROLE_DEFAULTS[blueprint.role];
    return {
        key: blueprint.key,
        name: blueprint.name,
        type: blueprint.type || defaults.type,
        role: blueprint.role,
        description: blueprint.description,
        dependencies: [...(blueprint.dependencies || [])],
        base_estimated_cost: blueprint.base_estimated_cost ?? defaults.base_estimated_cost,
        timeout_ms: blueprint.timeout_ms ?? defaults.timeout_ms,
        max_retries: blueprint.max_retries ?? defaults.max_retries,
        capabilities: [...(blueprint.capabilities || [])],
        permissions: [...(blueprint.permissions || defaults.permissions)],
        max_concurrent_tasks: blueprint.max_concurrent_tasks ?? defaults.max_concurrent_tasks
    };
}

export const CODESMITH_AGENT_CATALOG: CodeSmithAgentDefinition[] = AGENT_BLUEPRINTS.map(toDefinition);

export const CODESMITH_AGENT_KEY_SET = new Set<CodeSmithAgentKey>(CODESMITH_AGENT_KEYS);

export const CODESMITH_CORE_17_AGENT_KEYS: CodeSmithAgentKey[] = [
    'product_strategist',
    'system_architect',
    'technical_planner',
    'ux_researcher',
    'ui_designer',
    'design_system',
    'frontend_engineer',
    'backend_engineer',
    'database_architect',
    'api_integrations',
    'security_engineer',
    'qa_engineer',
    'performance_engineer',
    'devops_engineer',
    'monitoring_engineer',
    'accessibility_specialist',
    'reviewer'
];

export const CODESMITH_ULTIMATE_50_AGENT_KEYS: CodeSmithAgentKey[] = [...CODESMITH_AGENT_KEYS];

export function toCodeSmithAgentId(agentKey: CodeSmithAgentKey): string {
    return `codesmith:${agentKey}`;
}

function asConfigRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object') return {};
    return input as Record<string, unknown>;
}

export function inferAgentKey(agentConfig: unknown): CodeSmithAgentKey | null {
    const config = asConfigRecord(agentConfig);
    const explicit = String(config.key || '').trim().toLowerCase();
    if (isValidAgentKey(explicit)) {
        return explicit as CodeSmithAgentKey;
    }

    const agentId = String(config.agent_id || '').trim();
    const fromId = fromCodeSmithAgentId(agentId);
    if (fromId) return fromId;

    const name = String(config.name || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (isValidAgentKey(name)) {
        return name as CodeSmithAgentKey;
    }
    return null;
}

export function inferRole(agentConfig: unknown, agentKey: CodeSmithAgentKey | null): CodeSmithRole {
    const config = asConfigRecord(agentConfig);
    if (agentKey) {
        const definition = CODESMITH_AGENT_CATALOG.find((agent) => agent.key === agentKey);
        if (definition) {
            return definition.role;
        }
    }

    const id = String(config.agent_id || '').toLowerCase();
    const role = String(config.role || '').toLowerCase();
    const name = String(config.name || '').toLowerCase();

    if (id.includes('ceo') || role.includes('ceo') || name.includes('ceo')) {
        return 'ceo';
    }
    if (id.includes('debug') || role.includes('debug') || name.includes('debug')) {
        return 'debugger';
    }
    if (id.includes('tester') || role.includes('quality') || name.includes('qa') || name.includes('tester')) {
        return 'tester';
    }
    if (id.includes('architect') || role.includes('architect') || name.includes('architect')) {
        return 'architect';
    }
    if (id.includes('builder') || role.includes('builder') || name.includes('engineer') || role.includes('implementation')) {
        return 'builder';
    }
    if (id.includes('review') || role.includes('review') || name.includes('reviewer') || name.includes('auditor')) {
        return 'reviewer';
    }
    return 'generic';
}

export function isValidAgentKey(key: string): key is CodeSmithAgentKey {
    return CODESMITH_AGENT_KEY_SET.has(key as CodeSmithAgentKey);
}

export function fromCodeSmithAgentId(agentId: string): CodeSmithAgentKey | null {
    const value = String(agentId || '').trim().toLowerCase();
    if (!value) return null;

    if (isValidAgentKey(value)) {
        return value;
    }
    if (value.startsWith('codesmith:')) {
        const keyCandidate = value.slice('codesmith:'.length);
        if (isValidAgentKey(keyCandidate)) {
            return keyCandidate;
        }
    }

    const directMatch = CODESMITH_AGENT_KEYS.find((key) => value.includes(key));
    return directMatch || null;
}
