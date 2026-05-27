export interface ContextWindowResult {
    prompt: string;
    estimated_tokens: number;
    trimmed_tokens: number;
    trimmed: boolean;
}

const HARD_PROMPT_TOKEN_CAP = 8000;

// Character-based heuristic that keeps runtime deterministic without tokenizer dependencies.
export function estimateTokenCount(value: string): number {
    if (!value) {
        return 0;
    }

    return Math.ceil(value.length / 4);
}

export function resolvePromptTokenBudget(configuredMaxTokens: number): number {
    const requested = Number.isFinite(configuredMaxTokens) ? Math.floor(configuredMaxTokens) : HARD_PROMPT_TOKEN_CAP;
    return Math.max(512, Math.min(HARD_PROMPT_TOKEN_CAP, requested));
}

export function prunePromptToWindow(prompt: string, maxTokens: number): ContextWindowResult {
    const normalizedPrompt = String(prompt || '');
    const boundedMaxTokens = resolvePromptTokenBudget(maxTokens);
    const estimatedTokens = estimateTokenCount(normalizedPrompt);

    if (estimatedTokens <= boundedMaxTokens) {
        return {
            prompt: normalizedPrompt,
            estimated_tokens: estimatedTokens,
            trimmed_tokens: 0,
            trimmed: false
        };
    }

    const maxChars = boundedMaxTokens * 4;
    const summary = `\n\n[CodeSmith rolling context window compressed older middle context to stay within the ${boundedMaxTokens.toLocaleString()}-token budget.]\n\n`;
    const availableChars = Math.max(0, maxChars - summary.length);
    let headChars = Math.max(160, Math.floor(availableChars * 0.35));
    let tailChars = Math.max(320, availableChars - headChars);

    if (headChars + tailChars > normalizedPrompt.length) {
        headChars = Math.min(headChars, normalizedPrompt.length);
        tailChars = Math.max(0, normalizedPrompt.length - headChars);
    }

    let head = normalizedPrompt.slice(0, headChars);
    let tail = normalizedPrompt.slice(Math.max(headChars, normalizedPrompt.length - tailChars));
    let windowedPrompt = `${head}${summary}${tail}`;

    if (windowedPrompt.length > maxChars) {
        let overflowChars = windowedPrompt.length - maxChars;

        if (head.length >= overflowChars) {
            head = head.slice(overflowChars);
        } else {
            overflowChars -= head.length;
            head = '';
            tail = tail.slice(Math.min(overflowChars, tail.length));
        }

        windowedPrompt = `${head}${summary}${tail}`;
    }

    if (estimateTokenCount(windowedPrompt) > boundedMaxTokens) {
        windowedPrompt = windowedPrompt.slice(Math.max(0, windowedPrompt.length - maxChars));
    }

    const trimmedTokens = Math.max(0, estimatedTokens - estimateTokenCount(windowedPrompt));

    return {
        prompt: windowedPrompt,
        estimated_tokens: estimatedTokens,
        trimmed_tokens: trimmedTokens,
        trimmed: true
    };
}
