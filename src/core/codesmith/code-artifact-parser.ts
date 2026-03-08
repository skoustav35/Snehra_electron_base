import path from 'path';
import { parsePatch } from 'diff';
import type { CodeArtifact } from './types';

interface ParsedUnifiedDiff {
    oldFileName?: string;
    newFileName?: string;
    hunks?: Array<{
        oldStart: number;
        oldLines: number;
        newStart: number;
        newLines: number;
        lines: string[];
    }>;
}

function extensionLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ts') return 'ts';
    if (ext === '.tsx') return 'tsx';
    if (ext === '.js') return 'js';
    if (ext === '.jsx') return 'jsx';
    if (ext === '.json') return 'json';
    if (ext === '.css') return 'css';
    if (ext === '.md') return 'markdown';
    if (ext === '.py') return 'python';
    return ext.replace(/^\./, '') || 'text';
}

function normalizeRelativePath(rawPath: string): string {
    const trimmed = rawPath.trim().replace(/\\/g, '/').replace(/^['"]|['"]$/g, '');
    if (!trimmed) throw new Error('Artifact path cannot be empty');
    if (trimmed.startsWith('/')) throw new Error(`Artifact path must be relative: ${trimmed}`);
    if (trimmed.includes('\0')) throw new Error(`Artifact path contains invalid character: ${trimmed}`);
    const normalized = path.posix.normalize(trimmed);
    if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
        throw new Error(`Artifact path escapes workspace: ${trimmed}`);
    }
    return normalized;
}

function normalizeDiffPath(rawPath: string): string {
    return rawPath.trim().replace(/^["']|["']$/g, '').replace(/^a\//, '').replace(/^b\//, '');
}

function pathFromBlockInfo(info: string): string | null {
    const match = info.match(/(?:file|path)\s*[:=]\s*([^\s]+)/i);
    return match ? match[1] : null;
}

function pathFromContentHeader(content: string): { path: string | null; stripped: string } {
    const lines = content.split('\n');
    const first = lines[0] || '';
    const second = lines[1] || '';
    const candidates = [first, second];

    for (let i = 0; i < candidates.length; i++) {
        const line = candidates[i].trim();
        const match = line.match(/^(?:\/\/|#|\/\*+)\s*(?:file|path)\s*[:=]\s*([^\s*]+)\s*\**\/?$/i);
        if (match) {
            const removeIndex = i;
            const strippedLines = lines.filter((_, idx) => idx !== removeIndex);
            return { path: match[1], stripped: strippedLines.join('\n').replace(/^\n+/, '') };
        }
    }
    return { path: null, stripped: content };
}

function parseJsonArtifacts(response: string, sourceAgent: string): CodeArtifact[] {
    const start = response.indexOf('{');
    const end = response.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return [];

    const candidate = response.slice(start, end + 1);
    let parsed: unknown;
    try {
        parsed = JSON.parse(candidate);
    } catch {
        return [];
    }

    const parsedRecord = (parsed && typeof parsed === 'object')
        ? parsed as { artifacts?: unknown }
        : null;

    const artifactsRaw = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsedRecord?.artifacts)
            ? parsedRecord.artifacts
            : null;
    if (!artifactsRaw) return [];

    const artifacts: CodeArtifact[] = [];
    for (const item of artifactsRaw) {
        if (!item || typeof item !== 'object') {
            throw new Error('Invalid artifact object in JSON payload');
        }
        const artifact = item as { path?: unknown; content?: unknown; language?: unknown; update_mode?: unknown };
        if (typeof artifact.path !== 'string' || typeof artifact.content !== 'string') {
            throw new Error('Artifact JSON requires string path and content');
        }
        const normalizedPath = normalizeRelativePath(artifact.path);
        const language = typeof artifact.language === 'string' && artifact.language.trim()
            ? artifact.language.trim().toLowerCase()
            : extensionLanguage(normalizedPath);
        const updateMode = artifact.update_mode === 'unified_diff' ? 'unified_diff' : 'full';
        artifacts.push({
            path: normalizedPath,
            content: artifact.content,
            language,
            sourceAgent,
            update_mode: updateMode
        });
    }
    return artifacts;
}

function toUnifiedRange(start: number, lines: number): string {
    if (!Number.isFinite(start) || !Number.isFinite(lines)) {
        return '0,0';
    }
    return `${start},${lines}`;
}

function renderUnifiedPatch(diffPatch: ParsedUnifiedDiff): string {
    const oldFileName = diffPatch.oldFileName || '/dev/null';
    const newFileName = diffPatch.newFileName || '/dev/null';
    const lines = [`--- ${oldFileName}`, `+++ ${newFileName}`];

    for (const hunk of diffPatch.hunks || []) {
        lines.push(`@@ -${toUnifiedRange(hunk.oldStart, hunk.oldLines)} +${toUnifiedRange(hunk.newStart, hunk.newLines)} @@`);
        lines.push(...hunk.lines);
    }

    return `${lines.join('\n')}\n`;
}

function parseUnifiedDiffArtifacts(response: string, sourceAgent: string): CodeArtifact[] {
    const diffSources: string[] = [];
    const diffFenceRegex = /```(?:diff|patch)[^\n`]*\n([\s\S]*?)```/gi;
    let fenceMatch: RegExpExecArray | null;

    while ((fenceMatch = diffFenceRegex.exec(response)) !== null) {
        const content = (fenceMatch[1] || '').trim();
        if (content) {
            diffSources.push(content);
        }
    }

    if (diffSources.length === 0 && /^\s*---\s+/m.test(response) && /^\s*\+\+\+\s+/m.test(response)) {
        diffSources.push(response);
    }

    const artifacts: CodeArtifact[] = [];
    for (const source of diffSources) {
        const parsedDiffs = parsePatch(source) as ParsedUnifiedDiff[];

        for (const diffPatch of parsedDiffs) {
            const selectedPath = diffPatch.newFileName && diffPatch.newFileName !== '/dev/null'
                ? diffPatch.newFileName
                : diffPatch.oldFileName;

            if (!selectedPath || selectedPath === '/dev/null') {
                continue;
            }

            const normalizedPath = normalizeRelativePath(normalizeDiffPath(selectedPath));
            artifacts.push({
                path: normalizedPath,
                content: renderUnifiedPatch(diffPatch),
                language: extensionLanguage(normalizedPath),
                sourceAgent,
                update_mode: 'unified_diff'
            });
        }
    }

    return artifacts;
}

function dedupeAndValidate(artifacts: CodeArtifact[]): CodeArtifact[] {
    if (artifacts.length === 0) {
        throw new Error('No code artifacts parsed from model response');
    }

    const seen = new Map<string, CodeArtifact>();
    for (const artifact of artifacts) {
        const key = artifact.path;
        if (seen.has(key)) {
            // Last declaration wins to keep parser deterministic.
            seen.set(key, artifact);
        } else {
            seen.set(key, artifact);
        }
    }

    const output = Array.from(seen.values())
        .map((artifact) => ({
            ...artifact,
            path: normalizeRelativePath(artifact.path),
            language: (artifact.language || extensionLanguage(artifact.path)).toLowerCase(),
            update_mode: artifact.update_mode === 'unified_diff' ? 'unified_diff' : 'full'
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

    for (const artifact of output) {
        if (artifact.update_mode === 'unified_diff') {
            if (!artifact.content.includes('@@')) {
                throw new Error(`Unified diff artifact is missing hunk markers: ${artifact.path}`);
            }
            continue;
        }

        if (!artifact.content.trim()) {
            throw new Error(`Artifact content cannot be empty: ${artifact.path}`);
        }
    }

    return output;
}

export class CodeArtifactParser {
    public static parse(response: string, sourceAgent: string): CodeArtifact[] {
        if (!response || !response.trim()) {
            throw new Error('Model response was empty');
        }

        const jsonArtifacts = parseJsonArtifacts(response, sourceAgent);
        if (jsonArtifacts.length > 0) {
            return dedupeAndValidate(jsonArtifacts);
        }

        const artifacts: CodeArtifact[] = parseUnifiedDiffArtifacts(response, sourceAgent);
        const fenceRegex = /```([^\n`]*)\n([\s\S]*?)```/g;
        let match: RegExpExecArray | null;

        while ((match = fenceRegex.exec(response)) !== null) {
            const info = (match[1] || '').trim();
            let content = match[2] || '';
            const infoTokens = info.split(/\s+/).filter(Boolean);
            const languageToken = infoTokens.length > 0 ? infoTokens[0].toLowerCase() : '';

            if (languageToken === 'diff' || languageToken === 'patch') {
                continue;
            }

            const headerHint = pathFromContentHeader(content);
            content = headerHint.stripped;

            const rawPath =
                headerHint.path
                || pathFromBlockInfo(info)
                || null;

            if (!rawPath) {
                continue;
            }

            const normalizedPath = normalizeRelativePath(rawPath);
            const language = languageToken && !languageToken.includes('=')
                ? languageToken
                : extensionLanguage(normalizedPath);

            artifacts.push({
                path: normalizedPath,
                content,
                language,
                sourceAgent,
                update_mode: 'full'
            });
        }

        return dedupeAndValidate(artifacts);
    }
}
