import fs from 'fs';
import path from 'path';
import { AdminConfig } from '../shims/admin-config';
import type { ExecutionWorkspacePaths } from './types';

function sanitizeId(raw: string): string {
    const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    if (!safe) {
        throw new Error(`Invalid identifier for workspace path: ${raw}`);
    }
    return safe;
}

export class CodeSmithWorkspaceManager {
    public static baseRoot(): string {
        return AdminConfig.getWorkspaceRoot();
    }

    public static getExecutionPaths(workspaceId: string, executionId: string): ExecutionWorkspacePaths {
        const workspaceSafe = sanitizeId(workspaceId);
        const executionSafe = sanitizeId(executionId);
        const root = path.resolve(
            this.baseRoot(),
            `workspace_${workspaceSafe}`,
            `execution_${executionSafe}`
        );
        return {
            root,
            src: path.join(root, 'src'),
            build: path.join(root, 'build')
        };
    }

    public static ensureExecutionWorkspace(workspaceId: string, executionId: string): ExecutionWorkspacePaths {
        const paths = this.getExecutionPaths(workspaceId, executionId);
        fs.mkdirSync(paths.root, { recursive: true });
        fs.mkdirSync(paths.src, { recursive: true });
        fs.mkdirSync(paths.build, { recursive: true });
        return paths;
    }

    public static resolveWithinWorkspace(workspaceRoot: string, relativePath: string): string {
        const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
        if (!normalized) {
            throw new Error('Relative path cannot be empty');
        }

        const resolved = path.resolve(workspaceRoot, normalized);
        const normalizedRoot = path.resolve(workspaceRoot);
        if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
            throw new Error(`Path escapes workspace boundary: ${relativePath}`);
        }
        return resolved;
    }

    public static cleanupExecutionWorkspace(workspaceId: string, executionId: string): void {
        const paths = this.getExecutionPaths(workspaceId, executionId);
        if (fs.existsSync(paths.root)) {
            fs.rmSync(paths.root, { recursive: true, force: true });
        }
    }

    public static listTree(root: string, relativeRoot: string = '', depth: number = 0, maxDepth: number = 8): string[] {
        if (depth > maxDepth) {
            return [];
        }
        const dir = relativeRoot ? this.resolveWithinWorkspace(root, relativeRoot) : root;
        if (!fs.existsSync(dir)) {
            return [];
        }
        const entries = fs.readdirSync(dir, { withFileTypes: true })
            .filter((entry) => !entry.name.startsWith('.git') && entry.name !== 'node_modules')
            .sort((a, b) => a.name.localeCompare(b.name));

        const out: string[] = [];
        for (const entry of entries) {
            const rel = relativeRoot ? path.posix.join(relativeRoot, entry.name) : entry.name;
            if (entry.isDirectory()) {
                out.push(`${rel}/`);
                out.push(...this.listTree(root, rel, depth + 1, maxDepth));
            } else {
                out.push(rel);
            }
        }
        return out;
    }
}
