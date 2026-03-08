import fs from 'fs';
import path from 'path';
import net from 'net';
import http from 'http';
import { spawn, spawnSync } from 'child_process';
import type { ChildProcess } from 'child_process';
import { eventStore } from '../shims/event-store';
import { EventType } from '../shims/events';
import { logger } from '../shims/logger';
import { TerminalRunner } from './terminal-runner';
import { CodeSmithWorkspaceManager } from './workspace-manager';
import { AdminConfig } from '../shims/admin-config';
import { DeploymentGeneratorService } from './deployment-generator.service';
import type { InfrastructureScanResult } from './deployment-generator.service';

type PreviewState = 'starting' | 'running' | 'failed' | 'stopped';
type PreviewRuntime = 'single-process' | 'docker-container' | 'docker-compose';

interface ComposeServiceEndpoint {
    service: string;
    port: number;
}

interface PreviewSession {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    workspace_root: string;
    port: number;
    status: PreviewState;
    command: string;
    process: ChildProcess;
    runtime: PreviewRuntime;
    container_name: string | null;
    compose_file: string | null;
    compose_project: string | null;
    service_endpoints: ComposeServiceEndpoint[];
    started_at: Date;
    last_access_at: Date;
    idle_timer: NodeJS.Timeout | null;
}

interface PreviewSessionView {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    status: PreviewState;
    port: number;
    preview_url: string;
    runtime: PreviewRuntime;
    service_endpoints: ComposeServiceEndpoint[];
    started_at: Date;
    last_access_at: Date;
}

export class PreviewRunner {
    private static sessions = new Map<string, PreviewSession>();
    private static dockerChecked = false;
    private static dockerAvailable = false;

    public static async ensurePreview(execution_id: string): Promise<PreviewSessionView> {
        const existing = this.sessions.get(execution_id);
        if (existing && existing.status === 'running') {
            this.bumpSessionAccess(existing);
            return this.toView(existing);
        }

        const created = await eventStore.getLatestEvent(execution_id, EventType.EXECUTION_CREATED);
        if (!created) {
            throw new Error(`Execution not found: ${execution_id}`);
        }

        const workspace_id = created.workspace_id;
        const user_id = created.user_id;
        const paths = CodeSmithWorkspaceManager.getExecutionPaths(workspace_id, execution_id);
        if (!fs.existsSync(paths.root)) {
            throw new Error(`Workspace root does not exist: ${paths.root}`);
        }

        return this.startPreview({
            execution_id,
            workspace_id,
            user_id,
            workspace_root: paths.root
        });
    }

    public static getStatus(execution_id: string): PreviewSessionView | null {
        const session = this.sessions.get(execution_id);
        if (!session) {
            return null;
        }
        return this.toView(session);
    }

    public static async stopPreview(execution_id: string, reason: string = 'manual_stop'): Promise<void> {
        const session = this.sessions.get(execution_id);
        if (!session) {
            return;
        }

        if (session.idle_timer) {
            clearTimeout(session.idle_timer);
            session.idle_timer = null;
        }

        session.status = 'stopped';
        if (!session.process.killed) {
            session.process.kill('SIGTERM');
        }
        if (session.container_name) {
            this.stopDockerContainer(session.container_name);
        }
        if (session.runtime === 'docker-compose' && session.compose_file && session.compose_project) {
            this.stopComposeProject(session.workspace_root, session.compose_file, session.compose_project);
        }

        await eventStore.appendEvent({
            execution_id: session.execution_id,
            workspace_id: session.workspace_id,
            user_id: session.user_id,
            agent_id: null,
            event_type: EventType.PREVIEW_STATUS,
            payload: {
                status: 'stopped',
                reason,
                execution_id: session.execution_id,
                execution_trace_id: session.execution_id
            }
        });

        this.sessions.delete(execution_id);
    }

    public static async proxyRequest(
        execution_id: string,
        req: http.IncomingMessage,
        res: http.ServerResponse,
        targetPath: string
    ): Promise<void> {
        await this.ensurePreview(execution_id);
        const session = this.sessions.get(execution_id);
        if (!session) {
            throw new Error('Preview session unavailable after initialization');
        }

        this.bumpSessionAccess(session);
        const sanitizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
        const resolved = this.resolveProxyTarget(session, sanitizedPath);

        await new Promise<void>((resolve, reject) => {
            const proxied = http.request(
                {
                    hostname: '127.0.0.1',
                    port: resolved.port,
                    path: resolved.path,
                    method: req.method,
                    headers: this.filterHeaders(req.headers)
                },
                (proxiedRes) => {
                    res.statusCode = proxiedRes.statusCode || 502;
                    for (const [headerName, headerValue] of Object.entries(proxiedRes.headers)) {
                        if (headerValue !== undefined) {
                            res.setHeader(headerName, headerValue as string);
                        }
                    }
                    proxiedRes.pipe(res);
                    proxiedRes.on('end', () => resolve());
                }
            );

            proxied.on('error', (error) => {
                reject(error);
            });

            req.pipe(proxied);
        });
    }

    private static async startPreview(params: {
        execution_id: string;
        workspace_id: string;
        user_id: string;
        workspace_root: string;
    }): Promise<PreviewSessionView> {
        if (!AdminConfig.isPreviewEnabled(params.workspace_id)) {
            throw new Error('Preview is disabled by admin policy');
        }

        const packageJsonPath = path.join(params.workspace_root, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error('Preview requires package.json in execution workspace root');
        }

        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
            scripts?: Record<string, string>;
        };
        const scripts = pkg.scripts || {};

        await this.emitPreviewProgress(params, 5, 'initializing');
        await this.emitPreviewStage(params, 'installing_dependencies', 'Installing dependencies...', 'running');
        try {
            await TerminalRunner.runCommand({
                execution_id: params.execution_id,
                workspace_id: params.workspace_id,
                user_id: params.user_id,
                agent_id: null,
                workspace_root: params.workspace_root,
                command: 'npm install'
            });
            await this.emitPreviewStage(params, 'installing_dependencies', 'Dependencies installed.', 'completed');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.emitPreviewStage(params, 'installing_dependencies', `Dependency install failed: ${message}`, 'failed');
            throw error;
        }

        await this.emitPreviewProgress(params, 25, 'dependencies_ready');

        if (scripts.build) {
            await this.emitPreviewStage(params, 'building', 'Running build command...', 'running');
            try {
                await TerminalRunner.runCommand({
                    execution_id: params.execution_id,
                    workspace_id: params.workspace_id,
                    user_id: params.user_id,
                    agent_id: null,
                    workspace_root: params.workspace_root,
                    command: 'npm run build'
                });
                await this.emitPreviewStage(params, 'building', 'Build completed.', 'completed');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await this.emitPreviewStage(params, 'building', `Build failed, continuing with runtime start: ${message}`, 'failed');
            }
        } else {
            await this.emitPreviewStage(params, 'building', 'No build script detected. Skipping build stage.', 'completed');
        }

        await this.emitPreviewProgress(params, 45, 'build_stage_complete');

        const useDocker = this.canUseDocker();
        const infra = DeploymentGeneratorService.scanInfrastructure(params.workspace_root);
        if (useDocker && this.shouldUseComposePreview(infra)) {
            return this.startComposePreview(params, infra);
        }

        const port = await this.allocatePort();
        const command = this.resolvePreviewCommand(scripts, port, useDocker);
        const processEnv = this.previewEnvironment({
            PORT: String(port),
            HOST: '0.0.0.0'
        });
        await this.emitPreviewStage(params, 'starting_server', 'Starting preview server...', 'running', {
            command,
            port
        });
        await this.emitPreviewProgress(params, 60, 'server_starting');

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: null,
            event_type: EventType.PREVIEW_STATUS,
            payload: {
                status: 'starting',
                port,
                execution_id: params.execution_id,
                execution_trace_id: params.execution_id
            }
        });

        const container_name = useDocker ? `preview-${params.execution_id}`.replace(/[^a-zA-Z0-9_-]/g, '_') : null;
        const child = useDocker
            ? spawn(
                'docker',
                [
                    'run',
                    '--rm',
                    '--name',
                    container_name!,
                    '-p',
                    `${port}:${port}`,
                    '-v',
                    `${params.workspace_root}:/workspace`,
                    '-w',
                    '/workspace',
                    'node:20-alpine',
                    'sh',
                    '-lc',
                    command
                ],
                {
                    env: processEnv,
                    shell: true
                }
            )
            : spawn(command, {
                cwd: params.workspace_root,
                shell: true,
                env: processEnv
            });

        const session: PreviewSession = {
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            workspace_root: params.workspace_root,
            port,
            status: 'starting',
            command,
            process: child,
            runtime: useDocker ? 'docker-container' : 'single-process',
            container_name,
            compose_file: null,
            compose_project: null,
            service_endpoints: [
                {
                    service: 'app',
                    port
                }
            ],
            started_at: new Date(),
            last_access_at: new Date(),
            idle_timer: null
        };
        this.sessions.set(params.execution_id, session);

        child.stdout.on('data', (data: Buffer) => {
            void this.emitPreviewLog(session, 'stdout', data.toString());
        });
        child.stderr.on('data', (data: Buffer) => {
            void this.emitPreviewLog(session, 'stderr', data.toString());
        });

        child.on('close', (code) => {
            if (!this.sessions.has(session.execution_id)) {
                return;
            }
            session.status = session.status === 'stopped'
                ? 'stopped'
                : (code === 0 ? 'stopped' : 'failed');
            void this.emitPreviewStage(
                session,
                'container_ready',
                session.status === 'stopped'
                    ? 'Preview process stopped.'
                    : `Preview process exited with code ${code}.`,
                session.status === 'stopped' ? 'completed' : 'failed',
                { exit_code: code }
            );
            void eventStore.appendEvent({
                execution_id: session.execution_id,
                workspace_id: session.workspace_id,
                user_id: session.user_id,
                agent_id: null,
                event_type: EventType.PREVIEW_STATUS,
                payload: {
                    status: session.status,
                    exit_code: code,
                    execution_id: session.execution_id,
                    execution_trace_id: session.execution_id
                }
            });
            this.sessions.delete(session.execution_id);
        });

        await this.waitForReady(port, session);
        session.status = 'running';
        this.bumpSessionAccess(session);
        await this.emitPreviewProgress(session, 100, 'container_ready');
        await this.emitPreviewStage(session, 'container_ready', 'Container ready and serving traffic.', 'completed', {
            preview_url: `/api/preview/${session.execution_id}`,
            port: session.port,
            runtime: session.runtime,
            services: session.service_endpoints
        });

        await eventStore.appendEvent({
            execution_id: session.execution_id,
            workspace_id: session.workspace_id,
            user_id: session.user_id,
            agent_id: null,
            event_type: EventType.PREVIEW_STATUS,
            payload: {
                status: 'running',
                port: session.port,
                runtime: session.runtime,
                services: session.service_endpoints,
                preview_url: `/api/preview/${session.execution_id}`,
                execution_id: session.execution_id,
                execution_trace_id: session.execution_id
            }
        });

        return this.toView(session);
    }

    private static shouldUseComposePreview(infra: InfrastructureScanResult): boolean {
        const composeBacked = infra.classification === 'multi-container' || infra.classification === 'microservice';
        return composeBacked
            && infra.hasDockerCompose
            && infra.dockerComposeValid
            && Boolean(infra.dockerComposePath);
    }

    private static async startComposePreview(
        params: {
            execution_id: string;
            workspace_id: string;
            user_id: string;
            workspace_root: string;
        },
        infra: InfrastructureScanResult
    ): Promise<PreviewSessionView> {
        const composeFile = infra.dockerComposePath!;
        const composeProject = this.buildComposeProjectName(params.execution_id);
        const composeUpArgs = ['compose', '-f', composeFile, '-p', composeProject, 'up', '-d', '--remove-orphans'];
        const processEnv = this.previewEnvironment({});

        await this.emitPreviewStage(
            params,
            'starting_server',
            'Starting multi-container preview with docker-compose...',
            'running',
            {
                command: `docker ${composeUpArgs.join(' ')}`,
                compose_file: composeFile,
                compose_project: composeProject
            }
        );
        await this.emitPreviewProgress(params, 60, 'server_starting');

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: null,
            event_type: EventType.PREVIEW_STATUS,
            payload: {
                status: 'starting',
                runtime: 'docker-compose',
                compose_file: composeFile,
                compose_project: composeProject,
                execution_id: params.execution_id,
                execution_trace_id: params.execution_id
            }
        });

        try {
            await this.runComposeCommand(params.workspace_root, composeUpArgs, processEnv);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.emitPreviewStage(params, 'starting_server', `docker-compose failed: ${message}`, 'failed');
            throw error;
        }

        const serviceEndpoints = this.buildComposeServiceEndpoints(composeFile, infra);
        if (!serviceEndpoints.length) {
            await this.stopComposeProject(params.workspace_root, composeFile, composeProject);
            throw new Error('docker-compose preview requires at least one exposed host port');
        }

        const logsArgs = ['compose', '-f', composeFile, '-p', composeProject, 'logs', '-f', '--tail', '100'];
        const logsProcess = spawn('docker', logsArgs, {
            cwd: params.workspace_root,
            shell: true,
            env: processEnv
        });

        const session: PreviewSession = {
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            workspace_root: params.workspace_root,
            port: serviceEndpoints[0].port,
            status: 'starting',
            command: `docker ${logsArgs.join(' ')}`,
            process: logsProcess,
            runtime: 'docker-compose',
            container_name: null,
            compose_file: composeFile,
            compose_project: composeProject,
            service_endpoints: serviceEndpoints,
            started_at: new Date(),
            last_access_at: new Date(),
            idle_timer: null
        };
        this.sessions.set(params.execution_id, session);

        logsProcess.stdout.on('data', (data: Buffer) => {
            void this.emitPreviewLog(session, 'stdout', data.toString());
        });
        logsProcess.stderr.on('data', (data: Buffer) => {
            void this.emitPreviewLog(session, 'stderr', data.toString());
        });
        logsProcess.on('close', (code) => {
            if (!this.sessions.has(session.execution_id)) {
                return;
            }
            session.status = session.status === 'stopped' ? 'stopped' : 'failed';
            void this.emitPreviewStage(
                session,
                'container_ready',
                session.status === 'stopped'
                    ? 'Compose preview process stopped.'
                    : `Compose log stream exited with code ${code}.`,
                session.status === 'stopped' ? 'completed' : 'failed',
                { exit_code: code }
            );
            void eventStore.appendEvent({
                execution_id: session.execution_id,
                workspace_id: session.workspace_id,
                user_id: session.user_id,
                agent_id: null,
                event_type: EventType.PREVIEW_STATUS,
                payload: {
                    status: session.status,
                    runtime: 'docker-compose',
                    exit_code: code,
                    execution_id: session.execution_id,
                    execution_trace_id: session.execution_id
                }
            });
            this.sessions.delete(session.execution_id);
        });

        await this.waitForAllServiceHealthchecks(session, serviceEndpoints);
        session.status = 'running';
        this.bumpSessionAccess(session);
        await this.emitPreviewProgress(session, 100, 'container_ready');
        await this.emitPreviewStage(session, 'container_ready', 'Container ready and serving traffic.', 'completed', {
            preview_url: `/api/preview/${session.execution_id}`,
            port: session.port,
            runtime: session.runtime,
            services: serviceEndpoints
        });

        await eventStore.appendEvent({
            execution_id: session.execution_id,
            workspace_id: session.workspace_id,
            user_id: session.user_id,
            agent_id: null,
            event_type: EventType.PREVIEW_STATUS,
            payload: {
                status: 'running',
                runtime: session.runtime,
                port: session.port,
                services: serviceEndpoints,
                preview_url: `/api/preview/${session.execution_id}`,
                execution_id: session.execution_id,
                execution_trace_id: session.execution_id
            }
        });

        return this.toView(session);
    }

    private static buildComposeProjectName(executionId: string): string {
        return `preview_${executionId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    }

    private static async runComposeCommand(
        cwd: string,
        args: string[],
        env: NodeJS.ProcessEnv
    ): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const child = spawn('docker', args, {
                cwd,
                shell: true,
                env
            });
            let stderr = '';
            child.stderr.on('data', (chunk: Buffer) => {
                stderr += chunk.toString();
            });
            child.on('error', reject);
            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                    return;
                }
                reject(new Error(`docker ${args.join(' ')} exited with code ${code}. ${stderr.slice(-2000)}`));
            });
        });
    }

    private static buildComposeServiceEndpoints(
        composePath: string,
        infra: InfrastructureScanResult
    ): ComposeServiceEndpoint[] {
        const portHints = this.parseComposeServicePortHints(composePath);
        const endpoints: ComposeServiceEndpoint[] = [];
        const usedPorts = new Set<number>();

        for (const service of infra.dockerComposeServices) {
            const hinted = (portHints.get(service) || []).find((port) => !usedPorts.has(port));
            const fallback = infra.dockerComposePorts.find((port) => !usedPorts.has(port));
            const port = hinted || fallback;
            if (!port) continue;
            endpoints.push({ service, port });
            usedPorts.add(port);
        }

        if (!endpoints.length) {
            infra.dockerComposePorts.forEach((port, index) => {
                if (usedPorts.has(port)) return;
                endpoints.push({
                    service: `service-${index + 1}`,
                    port
                });
                usedPorts.add(port);
            });
        }

        return endpoints;
    }

    private static parseComposeServicePortHints(composePath: string): Map<string, number[]> {
        const out = new Map<string, number[]>();
        if (!fs.existsSync(composePath)) {
            return out;
        }

        const content = fs.readFileSync(composePath, 'utf8');
        const lines = content.split(/\r?\n/);
        let inServices = false;
        let servicesIndent = -1;
        let currentService: string | null = null;

        for (const line of lines) {
            if (!inServices && /^\s*services\s*:\s*$/.test(line)) {
                inServices = true;
                servicesIndent = line.search(/\S/);
                currentService = null;
                continue;
            }
            if (!inServices) continue;
            if (!line.trim() || line.trim().startsWith('#')) continue;

            const indent = line.search(/\S/);
            if (indent <= servicesIndent) {
                break;
            }

            const serviceMatch = line.match(/^\s{2,}([a-zA-Z0-9._-]+)\s*:\s*$/);
            if (serviceMatch && indent === servicesIndent + 2) {
                currentService = serviceMatch[1];
                if (!out.has(currentService)) {
                    out.set(currentService, []);
                }
                continue;
            }

            if (!currentService) continue;
            const hostPortMatch = line.match(/-\s*["']?(\d{2,5})\s*:\s*\d{2,5}/);
            if (!hostPortMatch) continue;

            const hostPort = Number(hostPortMatch[1]);
            if (!Number.isFinite(hostPort) || hostPort <= 0 || hostPort > 65535) continue;
            const ports = out.get(currentService) || [];
            if (!ports.includes(hostPort)) {
                ports.push(hostPort);
            }
            out.set(currentService, ports);
        }

        return out;
    }

    private static resolvePreviewCommand(
        scripts: Record<string, string>,
        port: number,
        dockerMode: boolean
    ): string {
        if (scripts.dev) {
            return `npm run dev -- --host 0.0.0.0 --port ${port}`;
        }

        if (scripts.start) {
            return `npm run start -- --host 0.0.0.0 --port ${port}`;
        }

        throw new Error('Preview requires a dev or start script in package.json');
    }

    private static previewEnvironment(extra: Record<string, string>): NodeJS.ProcessEnv {
        const env = AdminConfig.getChildProcessEnv({ include_openrouter_key: false, extra });
        for (const key of Object.keys(env)) {
            if (/(SECRET|TOKEN|KEY|PASSWORD)/i.test(key)) {
                delete env[key];
            }
        }
        return env;
    }

    private static async waitForReady(port: number, session: PreviewSession): Promise<void> {
        const policy = AdminConfig.getPreviewPolicy();
        const startedAt = Date.now();
        const target = `http://127.0.0.1:${port}${policy.healthcheck_path}`;
        let lastError: string | null = null;

        await this.emitPreviewStage(session, 'healthcheck', 'Waiting for healthcheck...', 'running', { target });
        await this.emitPreviewProgress(session, 75, 'healthcheck_started');

        while ((Date.now() - startedAt) < policy.ready_timeout_ms) {
            if (session.status === 'failed' || session.status === 'stopped') {
                throw new Error('Preview process exited before readiness');
            }

            try {
                const response = await fetch(target, {
                    method: 'GET',
                    signal: AbortSignal.timeout(2000)
                });
                if (response.status < 500) {
                    await this.emitPreviewStage(
                        session,
                        'healthcheck',
                        `Healthcheck passed with status ${response.status}.`,
                        'completed',
                        { status_code: response.status }
                    );
                    await this.emitPreviewProgress(session, 94, 'healthcheck_ready');
                    return;
                }
                lastError = `HTTP ${response.status}`;
                await this.emitPreviewStage(session, 'healthcheck', `Healthcheck pending (${lastError}).`, 'running');
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                await this.emitPreviewStage(session, 'healthcheck', `Healthcheck retry: ${lastError}`, 'running');
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        await this.stopPreview(session.execution_id, 'preview_readiness_timeout');
        await this.emitPreviewStage(
            session,
            'healthcheck',
            `Healthcheck timeout: ${lastError || 'unknown error'}`,
            'failed'
        );
        throw new Error(`Preview readiness check timed out: ${lastError || 'unknown error'}`);
    }

    private static async waitForAllServiceHealthchecks(
        session: PreviewSession,
        endpoints: ComposeServiceEndpoint[]
    ): Promise<void> {
        const policy = AdminConfig.getPreviewPolicy();
        const startedAt = Date.now();
        const ready = new Set<string>();
        let lastError: string | null = null;

        await this.emitPreviewStage(session, 'healthcheck', 'Waiting for service healthchecks...', 'running', {
            targets: endpoints.map((entry) => `http://127.0.0.1:${entry.port}${policy.healthcheck_path}`)
        });
        await this.emitPreviewProgress(session, 75, 'healthcheck_started');

        while ((Date.now() - startedAt) < policy.ready_timeout_ms) {
            if (session.status === 'failed' || session.status === 'stopped') {
                throw new Error('Preview process exited before readiness');
            }

            for (const endpoint of endpoints) {
                if (ready.has(endpoint.service)) {
                    continue;
                }
                const target = `http://127.0.0.1:${endpoint.port}${policy.healthcheck_path}`;
                try {
                    const response = await fetch(target, {
                        method: 'GET',
                        signal: AbortSignal.timeout(2000)
                    });
                    if (response.status < 500) {
                        ready.add(endpoint.service);
                        continue;
                    }
                    lastError = `${endpoint.service}: HTTP ${response.status}`;
                } catch (error) {
                    lastError = `${endpoint.service}: ${error instanceof Error ? error.message : String(error)}`;
                }
            }

            if (ready.size === endpoints.length) {
                await this.emitPreviewStage(
                    session,
                    'healthcheck',
                    `Healthchecks passed for ${endpoints.length} service(s).`,
                    'completed'
                );
                await this.emitPreviewProgress(session, 94, 'healthcheck_ready');
                return;
            }

            const pending = endpoints
                .filter((endpoint) => !ready.has(endpoint.service))
                .map((endpoint) => endpoint.service);
            await this.emitPreviewStage(
                session,
                'healthcheck',
                `Healthcheck pending for services: ${pending.join(', ')}${lastError ? ` (${lastError})` : ''}`,
                'running'
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        await this.stopPreview(session.execution_id, 'preview_readiness_timeout');
        await this.emitPreviewStage(
            session,
            'healthcheck',
            `Healthcheck timeout: ${lastError || 'unknown error'}`,
            'failed'
        );
        throw new Error(`Preview readiness check timed out: ${lastError || 'unknown error'}`);
    }

    private static async allocatePort(): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const server = net.createServer();
            server.on('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                server.close();
                if (!address || typeof address === 'string') {
                    reject(new Error('Failed to allocate preview port'));
                    return;
                }
                resolve(address.port);
            });
        });
    }

    private static bumpSessionAccess(session: PreviewSession): void {
        session.last_access_at = new Date();
        const ttl = AdminConfig.getPreviewPolicy().idle_ttl_seconds;

        if (session.idle_timer) {
            clearTimeout(session.idle_timer);
        }

        session.idle_timer = setTimeout(() => {
            void this.stopPreview(session.execution_id, 'preview_idle_timeout');
        }, ttl * 1000);
    }

    private static resolveProxyTarget(
        session: PreviewSession,
        targetPath: string
    ): { port: number; path: string } {
        let requestedService: string | null = null;
        const parsedUrl = new URL(targetPath, 'http://preview.local');

        const prefixed = parsedUrl.pathname.match(/^\/__service\/([a-zA-Z0-9._-]+)(\/.*)?$/);
        if (prefixed) {
            requestedService = prefixed[1];
            parsedUrl.pathname = prefixed[2] || '/';
        }

        const queryService = parsedUrl.searchParams.get('service');
        if (queryService) {
            requestedService = queryService;
            parsedUrl.searchParams.delete('service');
        }

        let resolvedPort = session.port;
        if (requestedService && session.service_endpoints.length > 0) {
            const endpoint = session.service_endpoints.find((entry) => entry.service === requestedService);
            if (endpoint) {
                resolvedPort = endpoint.port;
            }
        }

        const query = parsedUrl.searchParams.toString();
        return {
            port: resolvedPort,
            path: `${parsedUrl.pathname}${query ? `?${query}` : ''}`
        };
    }

    private static async emitPreviewStage(
        input: { execution_id: string; workspace_id: string; user_id: string },
        stage: string,
        message: string,
        status: 'running' | 'completed' | 'failed',
        extra?: Record<string, unknown>
    ): Promise<void> {
        await eventStore.appendEvent({
            execution_id: input.execution_id,
            workspace_id: input.workspace_id,
            user_id: input.user_id,
            agent_id: null,
            event_type: EventType.PREVIEW_STATUS,
            payload: {
                type: 'preview_stage',
                stage,
                message,
                status,
                execution_id: input.execution_id,
                execution_trace_id: input.execution_id,
                ...extra
            }
        });
    }

    private static async emitPreviewProgress(
        input: { execution_id: string; workspace_id: string; user_id: string },
        percent: number,
        stage?: string
    ): Promise<void> {
        await eventStore.appendEvent({
            execution_id: input.execution_id,
            workspace_id: input.workspace_id,
            user_id: input.user_id,
            agent_id: null,
            event_type: EventType.PREVIEW_STATUS,
            payload: {
                type: 'progress',
                percent: Math.max(0, Math.min(100, Math.floor(percent))),
                stage: stage || null,
                execution_id: input.execution_id,
                execution_trace_id: input.execution_id
            }
        });
    }

    private static async emitPreviewLog(session: PreviewSession, stream: 'stdout' | 'stderr', chunk: string): Promise<void> {
        await eventStore.appendEvent({
            execution_id: session.execution_id,
            workspace_id: session.workspace_id,
            user_id: session.user_id,
            agent_id: null,
            event_type: EventType.COMMAND_OUTPUT,
            payload: {
                command: session.command,
                stream,
                chunk: chunk.slice(-2000),
                execution_id: session.execution_id,
                execution_trace_id: session.execution_id
            }
        });
    }

    private static canUseDocker(): boolean {
        if (!this.dockerChecked) {
            const probe = spawnSync('docker', ['--version'], { shell: true });
            this.dockerAvailable = probe.status === 0;
            this.dockerChecked = true;
        }
        return this.dockerAvailable;
    }

    private static stopDockerContainer(containerName: string): void {
        try {
            spawnSync('docker', ['stop', containerName], { shell: true, stdio: 'ignore' });
        } catch (error) {
            logger.warn('Failed to stop preview container', {
                container: containerName,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private static stopComposeProject(workspaceRoot: string, composeFile: string, composeProject: string): void {
        try {
            spawnSync(
                'docker',
                ['compose', '-f', composeFile, '-p', composeProject, 'down', '--remove-orphans'],
                {
                    cwd: workspaceRoot,
                    shell: true,
                    stdio: 'ignore'
                }
            );
        } catch (error) {
            logger.warn('Failed to stop compose preview project', {
                compose_file: composeFile,
                compose_project: composeProject,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private static toView(session: PreviewSession): PreviewSessionView {
        return {
            execution_id: session.execution_id,
            workspace_id: session.workspace_id,
            user_id: session.user_id,
            status: session.status,
            port: session.port,
            preview_url: `/api/preview/${session.execution_id}`,
            runtime: session.runtime,
            service_endpoints: session.service_endpoints,
            started_at: session.started_at,
            last_access_at: session.last_access_at
        };
    }

    private static filterHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
        const output: http.OutgoingHttpHeaders = {};
        for (const [key, value] of Object.entries(headers)) {
            if (key.toLowerCase() === 'host') {
                continue;
            }
            if (value !== undefined) {
                output[key] = value;
            }
        }
        return output;
    }
}
