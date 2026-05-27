import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CodeArtifactVersion } from '../shims/code-artifact-version';
import type { ICodeArtifactVersion } from '../shims/code-artifact-version';
import type { ArtifactDiffSummary } from './types';
import { CodeSmithWorkspaceManager } from './workspace-manager';

function summarizeDiff(before: string, after: string): ArtifactDiffSummary {
    if (before === after) {
        return {
            changed: false,
            lines_added: 0,
            lines_removed: 0
        };
    }

    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    const beforeSet = new Set(beforeLines);
    const afterSet = new Set(afterLines);

    let linesAdded = 0;
    let linesRemoved = 0;
    for (const line of afterLines) {
        if (!beforeSet.has(line)) linesAdded += 1;
    }
    for (const line of beforeLines) {
        if (!afterSet.has(line)) linesRemoved += 1;
    }

    return {
        changed: true,
        lines_added: linesAdded,
        lines_removed: linesRemoved
    };
}

export class ArtifactVersionService {
    public static async recordVersion(params: {
        execution_id: string;
        workspace_id: string;
        user_id: string;
        agent_id: string | null;
        path: string;
        language: string;
        content: string;
    }): Promise<ICodeArtifactVersion> {
        const last = await CodeArtifactVersion.findOne({
            execution_id: params.execution_id,
            path: params.path
        }).sort({ version: -1 }).exec();

        const nextVersion = (last?.version || 0) + 1;
        const contentHash = crypto.createHash('sha256').update(params.content).digest('hex');
        const diffSummary = summarizeDiff(last?.content || '', params.content);

        const doc = await CodeArtifactVersion.create({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: params.agent_id,
            path: params.path,
            language: params.language,
            version: nextVersion,
            content: params.content,
            content_hash: contentHash,
            size_bytes: Buffer.byteLength(params.content, 'utf8'),
            diff_summary: diffSummary,
            created_at: new Date()
        });

        return doc;
    }

    public static async rollbackLatestRevisionSet(params: {
        execution_id: string;
        workspace_root: string;
    }): Promise<{
        restored_files: number;
        removed_files: number;
        skipped_files: number;
    }> {
        const versions = await CodeArtifactVersion.find({ execution_id: params.execution_id })
            .sort({ created_at: -1, version: -1 })
            .exec();

        const latestByPath = new Map<string, ICodeArtifactVersion>();
        for (const version of versions) {
            if (!latestByPath.has(version.path)) {
                latestByPath.set(version.path, version);
            }
        }

        let restoredFiles = 0;
        let removedFiles = 0;
        let skippedFiles = 0;

        for (const [relativePath, latest] of latestByPath.entries()) {
            const absolutePath = CodeSmithWorkspaceManager.resolveWithinWorkspace(params.workspace_root, relativePath);

            if (latest.version <= 1) {
                if (fs.existsSync(absolutePath)) {
                    fs.unlinkSync(absolutePath);
                    removedFiles += 1;
                } else {
                    skippedFiles += 1;
                }
                continue;
            }

            const previous = await CodeArtifactVersion.findOne({
                execution_id: params.execution_id,
                path: relativePath,
                version: latest.version - 1
            }).exec();

            if (!previous) {
                skippedFiles += 1;
                continue;
            }

            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            fs.writeFileSync(absolutePath, previous.content, 'utf8');
            restoredFiles += 1;
        }

        return {
            restored_files: restoredFiles,
            removed_files: removedFiles,
            skipped_files: skippedFiles
        };
    }
}
