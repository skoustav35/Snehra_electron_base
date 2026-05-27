import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import net from 'net';
import { Deployment } from '../shims/db-models';
import type { IDeployment } from '../shims/db-models';
import { eventStore } from '../shims/event-store';
import { EventType } from '../shims/events';
import { logger } from '../shims/logger';
import { RuntimeEnv } from '../shims/runtime-env';
import { DeploymentGeneratorService } from './deployment-generator.service';
import type { DeploymentConfig } from './deployment-generator.service';
import { MigrationRunnerService } from './migration-runner.service';
import type { MigrationResult } from './migration-runner.service';

const execAsync = promisify(exec);

// Retry configuration
interface RetryConfig {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};

// Health check configuration
interface HealthCheckConfig {
    type: 'http' | 'tcp' | 'command';
    path?: string;
    port: number;
    intervalMs: number;
    timeoutMs: number;
    retries: number;
    startPeriodMs: number;
}

export interface DeploymentStatus {
    deployment_id: string;
    status: 'building' | 'deploying' | 'running' | 'stopped' | 'failed';
    url?: string;
    port?: number;
    container_id?: string;
    image_id?: string;
    error?: string;
}

export class DeploymentExecutorService {
    private static usedPorts: Set<number> = new Set();

    /**
     * Execute a function with retry logic and exponential backoff
     */
    private static async executeWithRetry<T>(
        fn: () => Promise<T>,
        config: RetryConfig = DEFAULT_RETRY_CONFIG,
        operationName: string = 'operation'
    ): Promise<T> {
        let lastError: Error | null = null;
        let delay = config.initialDelayMs;

        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                if (attempt === config.maxRetries) {
                    logger.error(`[DeploymentExecutor] ${operationName} failed after ${attempt} attempts`, {
                        error: lastError.message,
                    });
                    throw lastError;
                }

                logger.warn(`[DeploymentExecutor] ${operationName} failed, retrying...`, {
                    attempt,
                    maxRetries: config.maxRetries,
                    nextDelayMs: delay,
                    error: lastError.message,
                });

                await new Promise(resolve => setTimeout(resolve, delay));
                delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
            }
        }

        throw lastError || new Error(`${operationName} failed`);
    }

    /**
     * Check if a port is available
     */
    private static async isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();

            server.once('error', () => {
                resolve(false);
            });

            server.once('listening', () => {
                server.close();
                resolve(true);
            });

            server.listen(port, '127.0.0.1');
        });
    }

    /**
     * Allocate an available port dynamically
     */
    public static async allocateAvailablePort(startPort: number = 8081, endPort: number = 9999): Promise<number> {
        // First try sequential scan from startPort
        for (let port = startPort; port <= endPort; port++) {
            if (this.usedPorts.has(port)) continue;

            if (await this.isPortAvailable(port)) {
                this.usedPorts.add(port);
                logger.info('[DeploymentExecutor] Allocated port', { port });
                return port;
            }
        }

        throw new Error(`No available ports in range ${startPort}-${endPort}`);
    }

    /**
     * Release a previously allocated port
     */
    public static releasePort(port: number): void {
        this.usedPorts.delete(port);
        logger.info('[DeploymentExecutor] Released port', { port });
    }

    /**
     * Run database migrations before deployment
     */
    public static async runPreDeployMigrations(
        workspaceRoot: string,
        environment: 'development' | 'staging' | 'production',
        dryRun: boolean = false
    ): Promise<MigrationResult | null> {
        const tool = MigrationRunnerService.detectMigrationTool(workspaceRoot);

        if (tool === 'unknown') {
            logger.info('[DeploymentExecutor] No migration tool detected, skipping migrations');
            return null;
        }

        logger.info('[DeploymentExecutor] Running pre-deploy migrations', { tool, environment, dryRun });

        return MigrationRunnerService.runMigrations({
            workspaceRoot,
            tool,
            dryRun,
            environment,
        });
    }

    /**
     * Perform enhanced health check with multiple probe types
     */
    public static async performHealthCheck(
        config: HealthCheckConfig,
        containerName?: string
    ): Promise<{ healthy: boolean; message: string }> {
        // Wait for start period
        if (config.startPeriodMs > 0) {
            await new Promise(resolve => setTimeout(resolve, config.startPeriodMs));
        }

        for (let attempt = 1; attempt <= config.retries; attempt++) {
            try {
                let healthy = false;

                switch (config.type) {
                    case 'http':
                        healthy = await this.httpHealthCheck(config.port, config.path || '/health', config.timeoutMs);
                        break;
                    case 'tcp':
                        healthy = await this.tcpHealthCheck(config.port, config.timeoutMs);
                        break;
                    case 'command':
                        if (containerName) {
                            healthy = await this.commandHealthCheck(containerName, config.timeoutMs);
                        }
                        break;
                }

                if (healthy) {
                    return { healthy: true, message: `Health check passed on attempt ${attempt}` };
                }
            } catch (error) {
                logger.warn('[DeploymentExecutor] Health check attempt failed', {
                    attempt,
                    type: config.type,
                    error: error instanceof Error ? error.message : String(error),
                });
            }

            if (attempt < config.retries) {
                await new Promise(resolve => setTimeout(resolve, config.intervalMs));
            }
        }

        return { healthy: false, message: `Health check failed after ${config.retries} attempts` };
    }

    /**
     * HTTP health check
     */
    private static async httpHealthCheck(port: number, path: string, timeoutMs: number): Promise<boolean> {
        try {
            const response = await fetch(`http://localhost:${port}${path}`, {
                method: 'GET',
                signal: AbortSignal.timeout(timeoutMs),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    /**
     * TCP health check - just verify port is open
     */
    private static async tcpHealthCheck(port: number, timeoutMs: number): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();

            const timer = setTimeout(() => {
                socket.destroy();
                resolve(false);
            }, timeoutMs);

            socket.connect(port, '127.0.0.1', () => {
                clearTimeout(timer);
                socket.destroy();
                resolve(true);
            });

            socket.on('error', () => {
                clearTimeout(timer);
                resolve(false);
            });
        });
    }

    /**
     * Command-based health check inside container
     */
    private static async commandHealthCheck(containerName: string, timeoutMs: number): Promise<boolean> {
        try {
            await execAsync(`docker exec ${containerName} echo "health"`, {
                timeout: timeoutMs,
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Build Docker image with retry logic
     */
    public static async buildDockerImageWithRetry(
        execution_id: string,
        workspace_id: string,
        user_id: string,
        workspace_root: string,
        framework: string,
        retryConfig?: Partial<RetryConfig>
    ): Promise<{ image_tag: string; image_id: string }> {
        const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

        return this.executeWithRetry(
            () => this.buildDockerImage(execution_id, workspace_id, user_id, workspace_root, framework),
            config,
            'Docker build'
        );
    }

    /**
     * Build Docker image from workspace
     */
    public static async buildDockerImage(
        execution_id: string,
        workspace_id: string,
        user_id: string,
        workspace_root: string,
        framework: string
    ): Promise<{ image_tag: string; image_id: string }> {
        const image_tag = `codesmith-${workspace_id}-${execution_id}`.toLowerCase();

        await eventStore.appendEvent({
            execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.DEPLOYMENT_LOG,
            payload: { message: `Building Docker image: ${image_tag}`, level: 'info' }
        });

        try {
            // Build the Docker image
            const buildCommand = `docker build -t ${image_tag} "${workspace_root}"`;
            logger.info('Building Docker image', { image_tag, workspace_root, command: buildCommand });

            const { stdout, stderr } = await execAsync(buildCommand, {
                maxBuffer: 10 * 1024 * 1024 // 10MB buffer
            });

            // Log build output
            if (stdout) {
                await eventStore.appendEvent({
                    execution_id,
                    workspace_id,
                    user_id,
                    agent_id: null,
                    event_type: EventType.DEPLOYMENT_LOG,
                    payload: { message: stdout, level: 'info' }
                });
            }

            if (stderr) {
                await eventStore.appendEvent({
                    execution_id,
                    workspace_id,
                    user_id,
                    agent_id: null,
                    event_type: EventType.DEPLOYMENT_LOG,
                    payload: { message: stderr, level: 'warn' }
                });
            }

            // Get image ID
            const { stdout: inspectOut } = await execAsync(`docker images -q ${image_tag}`);
            const image_id = inspectOut.trim();

            logger.info('Docker image built successfully', { image_tag, image_id });

            return { image_tag, image_id };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to build Docker image', { error: errorMessage, image_tag });

            await eventStore.appendEvent({
                execution_id,
                workspace_id,
                user_id,
                agent_id: null,
                event_type: EventType.DEPLOYMENT_LOG,
                payload: { message: `Build failed: ${errorMessage}`, level: 'error' }
            });

            throw new Error(`Docker build failed: ${errorMessage}`);
        }
    }

    /**
     * Deploy container locally using Docker
     */
    public static async deployLocal(
        execution_id: string,
        workspace_id: string,
        user_id: string,
        image_tag: string,
        config: DeploymentConfig
    ): Promise<DeploymentStatus> {
        const deployment_id = crypto.randomUUID();
        const container_name = `codesmith-${workspace_id}-${Date.now()}`.toLowerCase();
        const port = await this.allocatePort();

        await eventStore.appendEvent({
            execution_id,
            workspace_id,
            user_id,
            agent_id: null,
            event_type: EventType.DEPLOYMENT_STARTED,
            payload: {
                deployment_id,
                image_tag,
                container_name,
                port,
                framework: config.framework
            }
        });

        try {
            // Build environment variable string
            const envVars = config.environmentVars
                .map(env => `-e "${env}"`)
                .join(' ');

            // Run the container
            const runCommand = `docker run -d --name ${container_name} -p ${port}:${config.port} ${envVars} ${image_tag}`;
            logger.info('Starting container', { container_name, port, command: runCommand });

            const { stdout: container_id } = await execAsync(runCommand);
            const trimmedContainerId = container_id.trim();

            // Create deployment record
            const deployment = await Deployment.create({
                execution_id,
                deployment_id,
                agent_id: 'codesmith-deploy',
                user_id,
                workspace_id,
                deployment_target: 'full',
                status: 'deploying',
                started_at: new Date(),
                logs_reference: execution_id,
                deployed_urls: [`http://localhost:${port}`],
                environment_hash: crypto.createHash('sha256').update(JSON.stringify(config.environmentVars)).digest('hex'),
                agentcloud_commit: 'codesmith-v1',
                rollback_available: true
            });

            // Wait a few seconds for container to start
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Check container status
            const isRunning = await this.isContainerRunning(container_name);

            if (isRunning) {
                // Update deployment status
                await Deployment.findOneAndUpdate(
                    { deployment_id },
                    { status: 'success', ended_at: new Date() }
                );

                await eventStore.appendEvent({
                    execution_id,
                    workspace_id,
                    user_id,
                    agent_id: null,
                    event_type: EventType.DEPLOYMENT_COMPLETED,
                    payload: {
                        deployment_id,
                        url: `http://localhost:${port}`,
                        container_id: trimmedContainerId,
                        port
                    }
                });

                logger.info('Deployment successful', {
                    deployment_id,
                    container_name,
                    port,
                    url: `http://localhost:${port}`
                });

                return {
                    deployment_id,
                    status: 'running',
                    url: `http://localhost:${port}`,
                    port,
                    container_id: trimmedContainerId,
                    image_id: image_tag
                };
            } else {
                // Container failed to start
                const logs = await this.getContainerLogs(container_name);

                await Deployment.findOneAndUpdate(
                    { deployment_id },
                    { status: 'failed', error_message: 'Container failed to start', ended_at: new Date() }
                );

                await eventStore.appendEvent({
                    execution_id,
                    workspace_id,
                    user_id,
                    agent_id: null,
                    event_type: EventType.DEPLOYMENT_FAILED,
                    payload: {
                        deployment_id,
                        error: 'Container failed to start',
                        logs
                    }
                });

                throw new Error(`Container failed to start. Logs: ${logs}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Deployment failed', { error: errorMessage, deployment_id });
            this.releasePort(port);

            await eventStore.appendEvent({
                execution_id,
                workspace_id,
                user_id,
                agent_id: null,
                event_type: EventType.DEPLOYMENT_FAILED,
                payload: { deployment_id, error: errorMessage }
            });

            return {
                deployment_id,
                status: 'failed',
                error: errorMessage
            };
        }
    }

    /**
     * Get deployment status
     */
    public static async getDeploymentStatus(deployment_id: string): Promise<DeploymentStatus | null> {
        const deployment = await Deployment.findOne({ deployment_id });

        if (!deployment) {
            return null;
        }

        const url = deployment.deployed_urls?.[0];
        const port = url ? parseInt(url.split(':').pop() || '0') : undefined;

        return {
            deployment_id: deployment.deployment_id,
            status: this.normalizeDeploymentStatus(String(deployment.status || 'failed')),
            url,
                   port,
            error: deployment.error_message
        };
    }

    /**
     * Stop running deployment
     */
    public static async stopDeployment(deployment_id: string): Promise<void> {
        const deployment = await Deployment.findOne({ deployment_id });

        if (!deployment) {
            throw new Error(`Deployment not found: ${deployment_id}`);
        }

        const container_name = `codesmith-${deployment.workspace_id}`;

        try {
            // Find and stop all matching containers
            const { stdout } = await execAsync(`docker ps -a --filter "name=${container_name}" --format "{{.Names}}"`);
            const containers = stdout.split('\n').filter(Boolean);

            for (const container of containers) {
                await execAsync(`docker stop ${container}`);
                logger.info('Container stopped', { container, deployment_id });
            }

            await Deployment.findOneAndUpdate(
                { deployment_id },
                { status: 'rolled_back', ended_at: new Date() }
            );

            for (const url of deployment.deployed_urls || []) {
                const parsedPort = Number(String(url).split(':').pop());
                if (Number.isFinite(parsedPort)) {
                    this.releasePort(parsedPort);
                }
            }

            await eventStore.appendEvent({
                execution_id: deployment.execution_id,
                workspace_id: deployment.workspace_id,
                user_id: deployment.user_id,
                agent_id: null,
                event_type: EventType.DEPLOYMENT_ROLLBACK,
                payload: { deployment_id, reason: 'stopped_by_user' }
            });
        } catch (error) {
            logger.error('Failed to stop deployment', { error, deployment_id });
            throw error;
        }
    }

    /**
     * Cleanup deployment (stop and remove containers/images)
     */
    public static async cleanupDeployment(deployment_id: string): Promise<void> {
        const deployment = await Deployment.findOne({ deployment_id });

        if (!deployment) {
            throw new Error(`Deployment not found: ${deployment_id}`);
        }

        const container_name = `codesmith-${deployment.workspace_id}`;
        const image_tag = `codesmith-${deployment.workspace_id}-${deployment.execution_id}`.toLowerCase();

        try {
            // Stop and remove containers
            const { stdout } = await execAsync(`docker ps -a --filter "name=${container_name}" --format "{{.Names}}"`);
            const containers = stdout.split('\n').filter(Boolean);

            for (const container of containers) {
                await execAsync(`docker stop ${container} || true`);
                await execAsync(`docker rm ${container} || true`);
                logger.info('Container removed', { container, deployment_id });
            }

            // Remove image
            await execAsync(`docker rmi ${image_tag} || true`);
            logger.info('Image removed', { image_tag, deployment_id });

            await Deployment.findOneAndUpdate(
                { deployment_id },
                { status: 'rolled_back', ended_at: new Date() }
            );

            for (const url of deployment.deployed_urls || []) {
                const parsedPort = Number(String(url).split(':').pop());
                if (Number.isFinite(parsedPort)) {
                    this.releasePort(parsedPort);
                }
            }
        } catch (error) {
            logger.error('Failed to cleanup deployment', { error, deployment_id });
            throw error;
        }
    }

    /**
     * Get container logs
     */
    public static async getContainerLogs(containerName: string): Promise<string> {
        try {
            const { stdout, stderr } = await execAsync(`docker logs ${containerName} --tail 100`);
            const stdoutText = typeof stdout === 'string' ? stdout : String(stdout ?? '');
            const stderrText = typeof stderr === 'string' ? stderr : String(stderr ?? '');
            return `${stdoutText}${stderrText}`;
        } catch (error) {
            return `Failed to get logs: ${error}`;
        }
    }

    /**
     * Check if container is running
     */
    private static async isContainerRunning(containerName: string): Promise<boolean> {
        try {
            const { stdout } = await execAsync(`docker ps --filter "name=${containerName}" --format "{{.Names}}"`);
            return stdout.trim() === containerName;
        } catch (error) {
            return false;
        }
    }

    /**
     * Allocate next available port for deployment
     */
    private static async allocatePort(): Promise<number> {
        const start = RuntimeEnv.getNumber('DEPLOY_RUNTIME_PORT_START', 12081);
        const end = RuntimeEnv.getNumber('DEPLOY_RUNTIME_PORT_END', 12999);
        if (start > end) {
            throw new Error(`Invalid deploy runtime port range: ${start}-${end}`);
        }
        return this.allocateAvailablePort(start, end);
    }

    private static normalizeDeploymentStatus(value: string): DeploymentStatus['status'] {
        switch (value) {
            case 'building':
            case 'deploying':
            case 'failed':
                return value;
            case 'pending':
            case 'cloning':
            case 'success':
                return 'running';
            case 'rolled_back':
                return 'stopped';
            default:
                return 'failed';
        }
    }
}
