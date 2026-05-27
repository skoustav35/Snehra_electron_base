import type { CodeSmithAgentKey } from './agent-catalog';
import type { CodeSmithMode } from './mode-policy';

export type { CodeSmithAgentKey };
export type ArtifactUpdateMode = 'full' | 'unified_diff';

export interface CodeArtifact {
    path: string;
    content: string;
    language: string;
    sourceAgent: string; // ID of the agent that produced this
    update_mode?: ArtifactUpdateMode;
}

export interface ArtifactDiffSummary {
    changed: boolean;
    lines_added: number;
    lines_removed: number;
}

export interface ExecutionWorkspacePaths {
    root: string;
    src: string;
    build: string;
}

export interface CommandRunResult {
    command: string;
    exit_code: number | null;
    signal: string | null;
    timed_out: boolean;
    stdout: string;
    stderr: string;
    duration_ms: number;
}

export interface ExecutionConfig {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    mode: CodeSmithMode;
    query: string;
    workspace_root: string;
    cycle?: number;
}

export type CodeSmithTool = 'write_file' | 'read_file' | 'list_dir' | 'run_command' | 'delete_file';

export interface CodeSmithAgentPolicy {
    agentKey: CodeSmithAgentKey;
    agentId: string; // The specific runtime instance ID (e.g. "codesmith:architect:123")
    model: string;
    maxTokens: number;
    creditMultiplier: number;
    enabled: boolean;
    allowedTools: CodeSmithTool[];
}

export interface CodeSmithContext {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    workspace_root: string;

    // Core memory slots
    architect_notes: string;
    planning_notes: string;

    // Latest state
    latest_diff_summary: string;
    latest_command_log: string;
    latest_failure: string;

    // Agent-specific memory
    specialist_notes: Record<string, string>;

    // Execution state
    dag_state: Record<string, {
        status: 'pending' | 'running' | 'completed' | 'failed';
        started_at?: string;
        completed_at?: string;
    }>;
    completed_nodes: string[];
    failed_nodes: string[];

    // File tracking
    file_structure_diff: Record<string, {
        version?: number;
        language?: string;
        size_bytes?: number;
        updated_at: string;
    }>;

    // Build status
    build_status: 'idle' | 'running' | 'success' | 'failed' | 'unknown';
}

export type CodeSmithQuestionKind = 'mcq' | 'subjective';
export type CodeSmithQuestionScope = 'design' | 'environment' | 'implementation' | 'general';
export type CodeSmithQuestionAnswerMode = 'manual' | 'hybrid' | 'auto';
export type CodeSmithQuestionAnswerSource = 'user' | 'auto' | 'default';

export interface CodeSmithQuestionOption {
    id: string;
    label: string;
    description?: string;
}

export interface CodeSmithQuestion {
    id: string;
    kind: CodeSmithQuestionKind;
    scope: CodeSmithQuestionScope;
    question: string;
    required: boolean;
    allow_auto_answer: boolean;
    answer_hint?: string;
    options?: CodeSmithQuestionOption[];
    meta?: Record<string, string | number | boolean | null>;
}

export interface CodeSmithQuestionAnswer {
    question_id: string;
    value: string;
    source: CodeSmithQuestionAnswerSource;
    confidence: number;
}

export interface CodeSmithQuestionnaireResult {
    answer_mode: CodeSmithQuestionAnswerMode;
    questions: CodeSmithQuestion[];
    answers: CodeSmithQuestionAnswer[];
    unresolved_questions: CodeSmithQuestion[];
    prompt_for_user: string;
    prompt_for_model: string;
    response_template: string;
}
