import fs from 'fs';
import path from 'path';
import { applyPatch } from 'diff';
import { eventStore } from '../shims/event-store';
import { EventType } from '../shims/events';
import { CreditManager } from '../shims/credit-manager';
import { CodeSmithWorkspaceManager } from './workspace-manager';
import { ArtifactVersionService } from './artifact-version.service';
import { artifactScanner } from '../shims/artifact-scanner';
import type { ArtifactUpdateMode } from './types';
import { WorkspaceRepository } from '../../../app/lib/firebase/repositories/workspaceRepository';

function inferLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ts') return 'ts';
    if (ext === '.tsx') return 'tsx';
    if (ext === '.js') return 'js';
    if (ext === '.jsx') return 'jsx';
    if (ext === '.json') return 'json';
    if (ext === '.css') return 'css';
    if (ext === '.py') return 'python';
    if (ext === '.md') return 'markdown';
    return ext.replace(/^\./, '') || 'text';
}

function applyUnifiedDiffPatch(currentContent: string, diffContent: string, filePath: string): string {
    const patched = applyPatch(currentContent, diffContent, {
        fuzzFactor: 1
    });

    if (patched === false) {
        throw new Error(`Failed to apply unified diff for ${filePath}`);
    }

    return patched;
}

export class WorkspaceTools {
    public static async writeFile(params: {
        execution_id: string;
        workspace_id: string;
        user_id: string;
        agent_id: string | null;
        workspace_root: string;
        relative_path: string;
        content: string;
        language?: string;
        update_mode?: ArtifactUpdateMode;
    }): Promise<{ path: string; size_bytes: number; version: number }> {
        const absolutePath = CodeSmithWorkspaceManager.resolveWithinWorkspace(
            params.workspace_root,
            params.relative_path
        );
        const updateMode = params.update_mode === 'unified_diff' ? 'unified_diff' : 'full';

        await CreditManager.debit(
            params.execution_id,
            params.user_id,
            params.workspace_id,
            0.02,
            'tool:write_file'
        );

        const previousContent = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : '';
        const nextContent = updateMode === 'unified_diff'
            ? applyUnifiedDiffPatch(previousContent, params.content, params.relative_path)
            : params.content;

        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, nextContent, 'utf8');

        try {
            await WorkspaceRepository.saveFileToCloud(params.user_id, params.workspace_id, params.relative_path, nextContent, false);
        } catch (error) {
            console.error('Failed to sync to cloud', error);
        }

        const versionDoc = await ArtifactVersionService.recordVersion({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: params.agent_id,
            path: params.relative_path,
            language: params.language || inferLanguage(params.relative_path),
            content: nextContent
        });

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: params.agent_id,
            event_type: EventType.FILE_UPDATED,
            payload: {
                path: params.relative_path,
                language: versionDoc.language,
                size_bytes: versionDoc.size_bytes,
                content_hash: versionDoc.content_hash,
                version: versionDoc.version,
                diff_summary: versionDoc.diff_summary,
                content: nextContent,
                update_mode: updateMode
            }
        });

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: params.agent_id,
            event_type: EventType.FILE_WRITTEN,
            payload: {
                path: params.relative_path,
                language: versionDoc.language,
                size_bytes: versionDoc.size_bytes,
                content_hash: versionDoc.content_hash,
                version: versionDoc.version,
                update_mode: updateMode
            }
        });

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: params.agent_id,
            event_type: EventType.ARTIFACT_VERSIONED,
            payload: {
                path: params.relative_path,
                version: versionDoc.version,
                language: versionDoc.language,
                diff_summary: versionDoc.diff_summary,
                update_mode: updateMode
            }
        });

        void artifactScanner.scan({
            artifact_id: `${params.execution_id}:${params.relative_path}:${versionDoc.version}`,
            workspace_id: params.workspace_id,
            execution_id: params.execution_id,
            user_id: params.user_id,
            file_path: params.relative_path,
            content: nextContent,
            metadata: {
                language: versionDoc.language,
                version: versionDoc.version,
                source: 'workspace_tools.write_file',
                update_mode: updateMode
            }
        });

        return {
            path: params.relative_path,
            size_bytes: versionDoc.size_bytes,
            version: versionDoc.version
        };
    }

    public static async readFile(params: {
        execution_id: string;
        workspace_id: string;
        user_id: string;
        agent_id: string | null;
        workspace_root: string;
        relative_path: string;
    }): Promise<string> {
        const absolutePath = CodeSmithWorkspaceManager.resolveWithinWorkspace(
            params.workspace_root,
            params.relative_path
        );
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`File not found: ${params.relative_path}`);
        }

        await CreditManager.debit(
            params.execution_id,
            params.user_id,
            params.workspace_id,
            0.005,
            'tool:read_file'
        );

        const content = fs.readFileSync(absolutePath, 'utf8');

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: params.agent_id,
            event_type: EventType.TOOL_OPERATION,
            payload: {
                tool: 'read_file',
                path: params.relative_path,
                size_bytes: Buffer.byteLength(content, 'utf8')
            }
        });

        return content;
    }

    public static async listDir(params: {
        execution_id: string;
        workspace_id: string;
        user_id: string;
        agent_id: string | null;
        workspace_root: string;
        relative_path?: string;
    }): Promise<string[]> {
        const relPath = params.relative_path || '';
        const absolutePath = relPath
            ? CodeSmithWorkspaceManager.resolveWithinWorkspace(params.workspace_root, relPath)
            : params.workspace_root;
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Directory not found: ${relPath || '.'}`);
        }
        const entries = fs.readdirSync(absolutePath, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name);

        await CreditManager.debit(
            params.execution_id,
            params.user_id,
            params.workspace_id,
            0.005,
            'tool:list_dir'
        );

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: params.agent_id,
            event_type: EventType.TOOL_OPERATION,
            payload: {
                tool: 'list_dir',
                path: relPath || '.',
                count: entries.length
            }
        });

        return entries;
    }

    public static async deleteFile(params: {
        execution_id: string;
        workspace_id: string;
        user_id: string;
        agent_id: string | null;
        workspace_root: string;
        relative_path: string;
    }): Promise<void> {
        const absolutePath = CodeSmithWorkspaceManager.resolveWithinWorkspace(
            params.workspace_root,
            params.relative_path
        );
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`File not found: ${params.relative_path}`);
        }

        await CreditManager.debit(
            params.execution_id,
            params.user_id,
            params.workspace_id,
            0.01,
            'tool:delete_file'
        );

        fs.unlinkSync(absolutePath);

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: params.agent_id,
            event_type: EventType.TOOL_OPERATION,
            payload: {
                tool: 'delete_file',
                path: params.relative_path
            }
        });
    }
}
