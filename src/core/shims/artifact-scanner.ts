import { z } from 'zod';

const scanParamsSchema = z.object({
    artifact_id: z.string().min(1),
    workspace_id: z.string().min(1),
    execution_id: z.string().min(1),
    user_id: z.string().min(1),
    file_path: z.string().min(1),
    content: z.string(),
    metadata: z.record(z.unknown()).optional()
}).strict();

const DEFAULT_CHUNK_CHARS = 4000;
const DEFAULT_CHUNK_OVERLAP = 240;
const MAX_INDEXED_CHARS = 1_500_000;

export interface ArtifactChunk {
    chunk_id: string;
    artifact_id: string;
    workspace_id: string;
    execution_id: string;
    user_id: string;
    file_path: string;
    chunk_index: number;
    char_start: number;
    char_end: number;
    token_estimate: number;
    preview: string;
    content: string;
    created_at: Date;
}

export interface ArtifactScanResult {
    artifact_id: string;
    workspace_id: string;
    file_path: string;
    chunk_count: number;
    indexed_chars: number;
    truncated: boolean;
}

export interface ContextCompressionResult {
    summary: string;
    included_chunks: number;
    token_estimate: number;
}

function estimateTokens(value: string): number {
    if (!value) {
        return 0;
    }

    return Math.ceil(value.length / 4);
}

function chunkContent(content: string, maxChunkChars: number, overlapChars: number): Array<{ start: number; end: number; value: string }> {
    const chunks: Array<{ start: number; end: number; value: string }> = [];
    const boundedChunkSize = Math.max(400, maxChunkChars);
    const boundedOverlap = Math.max(0, Math.min(overlapChars, Math.floor(boundedChunkSize / 2)));

    let cursor = 0;
    while (cursor < content.length) {
        const end = Math.min(content.length, cursor + boundedChunkSize);
        const value = content.slice(cursor, end);
        chunks.push({ start: cursor, end, value });

        if (end >= content.length) {
            break;
        }

        cursor = Math.max(0, end - boundedOverlap);
    }

    return chunks;
}

class InMemoryArtifactScanner {
    private chunksByArtifact = new Map<string, ArtifactChunk[]>();
    private artifactsByWorkspace = new Map<string, Set<string>>();
    private scanClock = 0;

    scan(rawParams: Record<string, unknown>): ArtifactScanResult {
        const params = scanParamsSchema.parse(rawParams);
        const configuredChunkSize = Number(params.metadata?.chunk_chars);
        const configuredChunkOverlap = Number(params.metadata?.chunk_overlap_chars);
        const chunkSize = Number.isFinite(configuredChunkSize) && configuredChunkSize > 0
            ? Math.floor(configuredChunkSize)
            : DEFAULT_CHUNK_CHARS;
        const chunkOverlap = Number.isFinite(configuredChunkOverlap) && configuredChunkOverlap >= 0
            ? Math.floor(configuredChunkOverlap)
            : DEFAULT_CHUNK_OVERLAP;

        const truncatedContent = params.content.length > MAX_INDEXED_CHARS
            ? params.content.slice(0, MAX_INDEXED_CHARS)
            : params.content;
        const scanTimestamp = Date.now() + this.scanClock++ * 1000;
        const chunks = chunkContent(truncatedContent, chunkSize, chunkOverlap).map((chunk, index) => ({
            chunk_id: `${params.artifact_id}#${index}`,
            artifact_id: params.artifact_id,
            workspace_id: params.workspace_id,
            execution_id: params.execution_id,
            user_id: params.user_id,
            file_path: params.file_path,
            chunk_index: index,
            char_start: chunk.start,
            char_end: chunk.end,
            token_estimate: estimateTokens(chunk.value),
            preview: chunk.value.slice(0, 220),
            content: chunk.value,
            created_at: new Date(scanTimestamp + index)
        }));

        this.chunksByArtifact.set(params.artifact_id, chunks);

        const workspaceArtifacts = this.artifactsByWorkspace.get(params.workspace_id) || new Set<string>();
        workspaceArtifacts.add(params.artifact_id);
        this.artifactsByWorkspace.set(params.workspace_id, workspaceArtifacts);

        return {
            artifact_id: params.artifact_id,
            workspace_id: params.workspace_id,
            file_path: params.file_path,
            chunk_count: chunks.length,
            indexed_chars: truncatedContent.length,
            truncated: truncatedContent.length < params.content.length
        };
    }

    getArtifactChunks(artifact_id: string): ArtifactChunk[] {
        return [...(this.chunksByArtifact.get(artifact_id) || [])];
    }

    listWorkspaceChunks(workspace_id: string, limit: number = 200): ArtifactChunk[] {
        const artifactIds = this.artifactsByWorkspace.get(workspace_id);

        if (!artifactIds || artifactIds.size === 0) {
            return [];
        }

        const chunks: ArtifactChunk[] = [];
        for (const artifactId of artifactIds) {
            const artifactChunks = this.chunksByArtifact.get(artifactId);
            if (artifactChunks) {
                chunks.push(...artifactChunks);
            }
        }

        return chunks
            .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
            .slice(0, Math.max(1, Math.floor(limit)));
    }

    searchWorkspaceChunks(workspace_id: string, query: string, limit: number = 20): ArtifactChunk[] {
        const terms = query
            .toLowerCase()
            .split(/\s+/)
            .map((term) => term.trim())
            .filter(Boolean);

        if (terms.length === 0) {
            return this.listWorkspaceChunks(workspace_id, limit);
        }

        const scored = this.listWorkspaceChunks(workspace_id, 2000)
            .map((chunk) => {
                const haystack = `${chunk.file_path}\n${chunk.content}`.toLowerCase();
                const score = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
                return { chunk, score };
            })
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || b.chunk.created_at.getTime() - a.chunk.created_at.getTime());

        return scored.slice(0, Math.max(1, Math.floor(limit))).map((entry) => entry.chunk);
    }

    clear(workspace_id?: string): void {
        if (!workspace_id) {
            this.chunksByArtifact.clear();
            this.artifactsByWorkspace.clear();
            return;
        }

        const artifactIds = this.artifactsByWorkspace.get(workspace_id);
        if (!artifactIds) {
            return;
        }

        for (const artifactId of artifactIds) {
            this.chunksByArtifact.delete(artifactId);
        }

        this.artifactsByWorkspace.delete(workspace_id);
    }

    compressWorkspaceContext(params: {
        workspace_id: string;
        query?: string;
        max_tokens?: number;
        max_chunks?: number;
    }): ContextCompressionResult {
        const maxTokens = Math.max(256, Math.floor(params.max_tokens || 1400));
        const maxChunks = Math.max(1, Math.floor(params.max_chunks || 24));
        const sourceChunks = params.query
            ? this.searchWorkspaceChunks(params.workspace_id, params.query, maxChunks * 4)
            : this.listWorkspaceChunks(params.workspace_id, maxChunks * 4);

        if (sourceChunks.length === 0) {
            return {
                summary: '',
                included_chunks: 0,
                token_estimate: 0
            };
        }

        const sections: string[] = [];
        let consumedTokens = 0;
        let included = 0;

        for (const chunk of sourceChunks) {
            if (included >= maxChunks) {
                break;
            }

            const excerpt = chunk.preview
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 240);

            if (!excerpt) {
                continue;
            }

            const section = `[${chunk.file_path}#${chunk.chunk_index}] ${excerpt}`;
            const sectionTokens = estimateTokens(section);

            if (consumedTokens + sectionTokens > maxTokens) {
                break;
            }

            sections.push(section);
            consumedTokens += sectionTokens;
            included += 1;
        }

        if (sections.length === 0) {
            return {
                summary: '',
                included_chunks: 0,
                token_estimate: 0
            };
        }

        return {
            summary: sections.join('\n'),
            included_chunks: included,
            token_estimate: consumedTokens
        };
    }
}

export const artifactScanner = new InMemoryArtifactScanner();
