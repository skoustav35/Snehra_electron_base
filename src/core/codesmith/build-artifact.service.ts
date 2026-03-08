import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BuildArtifact } from '../shims/db-models';
import { eventStore } from '../shims/event-store';
import { EventType } from '../shims/events';
import { CodeSmithWorkspaceManager } from './workspace-manager';

function sha256(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const content = fs.readFileSync(filePath);
    hash.update(content);
    return hash.digest('hex');
}

function listFilesRecursive(root: string, relative: string = ''): string[] {
    const dir = relative ? path.join(root, relative) : root;
    if (!fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const out: string[] = [];

    for (const entry of entries) {
        const rel = relative ? path.posix.join(relative, entry.name) : entry.name;
        if (entry.isDirectory()) {
            out.push(...listFilesRecursive(root, rel));
        } else {
            out.push(rel);
        }
    }
    return out.sort((a, b) => a.localeCompare(b));
}

function listInfraFiles(root: string): string[] {
    const skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.next']);
    const candidates = new Set<string>();

    const walk = (relative: string = '', depth: number = 0) => {
        if (depth > 5) return;
        const current = relative ? path.join(root, relative) : root;
        if (!fs.existsSync(current)) return;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const rel = relative ? path.posix.join(relative, entry.name) : entry.name;
            if (entry.isDirectory()) {
                if (skipDirs.has(entry.name)) continue;
                walk(rel, depth + 1);
                continue;
            }

            const normalized = rel.toLowerCase();
            if (
                normalized === 'docker-compose.yml'
                || normalized === 'docker-compose.yaml'
                || normalized === 'compose.yml'
                || normalized === 'compose.yaml'
                || normalized === 'dockerfile'
                || normalized === 'render.yaml'
                || normalized === 'render.yml'
                || normalized === 'railway.json'
                || normalized === 'railway.toml'
                || normalized.endsWith('.tf')
                || normalized.endsWith('.tfvars')
                || /(^|\/)(k8s|kubernetes|manifests?)\/.*\.(yml|yaml)$/.test(normalized)
                || /(^|\/)(helm|charts)\/.*chart\.ya?ml$/.test(normalized)
            ) {
                candidates.add(rel);
            }
        }
    };

    walk();
    return Array.from(candidates).sort((a, b) => a.localeCompare(b));
}

export class BuildArtifactService {
    public static async persistBuildArtifacts(params: {
        execution_id: string;
        workspace_id: string;
        user_id: string;
        workspace_root: string;
        agent_id: string | null;
    }): Promise<number> {
        const candidateDirs = ['build', 'dist', '.next', 'out'];
        let persisted = 0;

        for (const candidate of candidateDirs) {
            const absoluteDir = CodeSmithWorkspaceManager.resolveWithinWorkspace(params.workspace_root, candidate);
            if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
                continue;
            }

            const files = listFilesRecursive(absoluteDir);
            for (const rel of files) {
                const abs = path.join(absoluteDir, rel);
                const stats = fs.statSync(abs);
                const relativePath = path.posix.join(candidate, rel);
                const fileHash = sha256(abs);
                const prior = await BuildArtifact.findOne({
                    execution_id: params.execution_id,
                    relative_path: relativePath
                }).exec();
                if (prior && prior.sha256 !== fileHash) {
                    await eventStore.appendEvent({
                        execution_id: params.execution_id,
                        workspace_id: params.workspace_id,
                        user_id: params.user_id,
                        agent_id: params.agent_id,
                        event_type: EventType.SECURITY_ALERT,
                        payload: {
                            reason: 'artifact_hash_changed',
                            relative_path: relativePath,
                            previous_sha256: prior.sha256,
                            current_sha256: fileHash
                        }
                    });
                }

                await BuildArtifact.findOneAndUpdate(
                    { execution_id: params.execution_id, relative_path: relativePath },
                    {
                        execution_id: params.execution_id,
                        workspace_id: params.workspace_id,
                        user_id: params.user_id,
                        relative_path: relativePath,
                        absolute_path: abs,
                        size_bytes: stats.size,
                        sha256: fileHash,
                        created_at: new Date()
                    },
                    { upsert: true, new: true }
                ).exec();

                await eventStore.appendEvent({
                    execution_id: params.execution_id,
                    workspace_id: params.workspace_id,
                    user_id: params.user_id,
                    agent_id: params.agent_id,
                    event_type: EventType.BUILD_ARTIFACT_PERSISTED,
                    payload: {
                        relative_path: relativePath,
                        size_bytes: stats.size,
                        sha256: fileHash
                    }
                });

                persisted += 1;
            }
        }

        const infraFiles = listInfraFiles(params.workspace_root);
        for (const relativePath of infraFiles) {
            const abs = CodeSmithWorkspaceManager.resolveWithinWorkspace(params.workspace_root, relativePath);
            if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
            const stats = fs.statSync(abs);
            const fileHash = sha256(abs);
            const prior = await BuildArtifact.findOne({
                execution_id: params.execution_id,
                relative_path: relativePath
            }).exec();
            if (prior && prior.sha256 !== fileHash) {
                await eventStore.appendEvent({
                    execution_id: params.execution_id,
                    workspace_id: params.workspace_id,
                    user_id: params.user_id,
                    agent_id: params.agent_id,
                    event_type: EventType.SECURITY_ALERT,
                    payload: {
                        reason: 'infrastructure_hash_changed',
                        relative_path: relativePath,
                        previous_sha256: prior.sha256,
                        current_sha256: fileHash
                    }
                });
            }

            await BuildArtifact.findOneAndUpdate(
                { execution_id: params.execution_id, relative_path: relativePath },
                {
                    execution_id: params.execution_id,
                    workspace_id: params.workspace_id,
                    user_id: params.user_id,
                    relative_path: relativePath,
                    absolute_path: abs,
                    size_bytes: stats.size,
                    sha256: fileHash,
                    created_at: new Date()
                },
                { upsert: true, new: true }
            ).exec();

            await eventStore.appendEvent({
                execution_id: params.execution_id,
                workspace_id: params.workspace_id,
                user_id: params.user_id,
                agent_id: params.agent_id,
                event_type: EventType.BUILD_ARTIFACT_PERSISTED,
                payload: {
                    relative_path: relativePath,
                    size_bytes: stats.size,
                    sha256: fileHash,
                    artifact_kind: 'infrastructure'
                }
            });
            persisted += 1;
        }

        return persisted;
    }
}
