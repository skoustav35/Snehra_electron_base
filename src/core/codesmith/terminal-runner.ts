import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { RuntimeEnv } from '../shims/runtime-env';
import { eventStore } from '../shims/event-store';
import { EventType } from '../shims/events';
import { CreditManager } from '../shims/credit-manager';
import { AdminConfig } from '../shims/admin-config';
import type { CommandRunResult } from './types';

interface RunCommandParams {
    execution_id: string;
    workspace_id: string;
    user_id: string;
    agent_id: string | null;
    workspace_root: string;
    command: string;
}

type SandboxMode = 'gvisor' | 'firecracker' | 'legacy';

interface SandboxLaunch {
    child: ChildProcess;
    mode: SandboxMode;
    launch_command: string;
}

function parseAllowlist(): string[] {
    return AdminConfig.getCommandPolicy().allowlist;
}

function ensureAllowed(command: string): void {
    const normalized = command.trim().replace(/\s+/g, ' ').toLowerCase();
    const allowlist = parseAllowlist();
    const allowed = allowlist.some((allowedPrefix) =>
        normalized === allowedPrefix.toLowerCase()
        || normalized.startsWith(`${allowedPrefix.toLowerCase()} `)
    );
    if (!allowed) {
        throw new Error(`Command not allowed by policy: ${command}`);
    }
}

function quoteArg(value: string): string {
    if (/^[a-zA-Z0-9_./:-]+$/.test(value)) {
        return value;
    }
    return `"${value.replace(/"/g, '\\"')}"`;
}

function sandboxMode(): SandboxMode {
    const configured = RuntimeEnv.getOrDefault('COMMAND_SANDBOX_MODE', 'gvisor').trim().toLowerCase();
    if (configured === 'firecracker') return 'firecracker';
    if (configured === 'legacy') return 'legacy';
    return 'gvisor';
}

function sandboxStrict(): boolean {
    return RuntimeEnv.getBoolean('COMMAND_SANDBOX_STRICT', true);
}

function launchLegacy(params: RunCommandParams, policy: ReturnType<typeof AdminConfig.getCommandPolicy>): SandboxLaunch {
    const cpuLimitSeconds = policy.cpu_limit_seconds;
    const memoryLimitMb = policy.memory_limit_mb;
    const childEnv = AdminConfig.getChildProcessEnv();

    let child: ChildProcess;
    if ((cpuLimitSeconds > 0 || memoryLimitMb > 0) && process.platform !== 'win32') {
        const limits: string[] = [];
        if (cpuLimitSeconds > 0) {
            limits.push(`ulimit -t ${cpuLimitSeconds}`);
        }
        if (memoryLimitMb > 0) {
            limits.push(`ulimit -v ${memoryLimitMb * 1024}`);
        }
        child = spawn('bash', ['-lc', `${limits.join('; ')}; ${params.command}`], {
            cwd: params.workspace_root,
            env: childEnv
        });
        return {
            child,
            mode: 'legacy',
            launch_command: `bash -lc ${quoteArg(`${limits.join('; ')}; ${params.command}`)}`
        };
    }

    child = spawn(params.command, {
        cwd: params.workspace_root,
        shell: true,
        env: childEnv
    });
    return {
        child,
        mode: 'legacy',
        launch_command: params.command
    };
}

function launchGvisor(params: RunCommandParams, policy: ReturnType<typeof AdminConfig.getCommandPolicy>): SandboxLaunch {
    const image = RuntimeEnv.getOrDefault('COMMAND_SANDBOX_IMAGE', 'node:20-alpine');
    const runtime = RuntimeEnv.getOrDefault('COMMAND_SANDBOX_RUNTIME', 'runsc');
    const network = RuntimeEnv.getOrDefault('COMMAND_SANDBOX_NETWORK', 'none');
    const pidsLimit = Math.max(32, RuntimeEnv.getNumber('COMMAND_SANDBOX_PIDS_LIMIT', 256));
    const readOnlyRoot = RuntimeEnv.getBoolean('COMMAND_SANDBOX_READ_ONLY_ROOT', true);
    const user = RuntimeEnv.get('COMMAND_SANDBOX_USER');
    const cpus = RuntimeEnv.get('COMMAND_SANDBOX_CPUS');
    const childEnv = AdminConfig.getChildProcessEnv();

    const args: string[] = [
        'run',
        '--rm',
        '--runtime',
        runtime,
        '--network',
        network,
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        String(pidsLimit),
        '-v',
        `${params.workspace_root}:/workspace`,
        '-w',
        '/workspace'
    ];

    if (readOnlyRoot) {
        args.push('--read-only');
        args.push('--tmpfs', '/tmp:rw,nosuid,nodev,size=64m');
    }
    if (cpus && cpus.trim()) {
        args.push('--cpus', cpus.trim());
    }
    if (policy.memory_limit_mb > 0) {
        args.push('--memory', `${policy.memory_limit_mb}m`);
    }
    if (user && user.trim()) {
        args.push('--user', user.trim());
    }

    args.push(
        '-e',
        'HOME=/tmp',
        image,
        '/bin/sh',
        '-lc',
        params.command
    );

    const child = spawn('docker', args, {
        cwd: params.workspace_root,
        env: childEnv
    });

    return {
        child,
        mode: 'gvisor',
        launch_command: `docker ${args.map(quoteArg).join(' ')}`
    };
}

function launchFirecracker(params: RunCommandParams, policy: ReturnType<typeof AdminConfig.getCommandPolicy>): SandboxLaunch {
    const runner = RuntimeEnv.get('FIRECRACKER_RUNNER_BIN');
    if (!runner) {
        throw new Error('FIRECRACKER_RUNNER_BIN is required when COMMAND_SANDBOX_MODE=firecracker');
    }

    const args = [
        '--ephemeral',
        '--destroy-on-exit',
        '--workspace',
        params.workspace_root,
        '--command',
        params.command,
        '--timeout-ms',
        String(policy.timeout_ms),
        '--max-output-bytes',
        String(policy.max_output_bytes)
    ];

    if (policy.cpu_limit_seconds > 0) {
        args.push('--cpu-limit-seconds', String(policy.cpu_limit_seconds));
    }
    if (policy.memory_limit_mb > 0) {
        args.push('--memory-limit-mb', String(policy.memory_limit_mb));
    }

    const child = spawn(runner, args, {
        cwd: params.workspace_root,
        env: AdminConfig.getChildProcessEnv()
    });

    return {
        child,
        mode: 'firecracker',
        launch_command: `${quoteArg(runner)} ${args.map(quoteArg).join(' ')}`
    };
}

function launchSandbox(params: RunCommandParams, policy: ReturnType<typeof AdminConfig.getCommandPolicy>): SandboxLaunch {
    const mode = sandboxMode();

    try {
        if (mode === 'firecracker') {
            return launchFirecracker(params, policy);
        }
        if (mode === 'legacy') {
            return launchLegacy(params, policy);
        }
        return launchGvisor(params, policy);
    } catch (error) {
        if (sandboxStrict() || mode === 'legacy') {
            throw error;
        }
        return launchLegacy(params, policy);
    }
}

export class TerminalRunner {
    public static async runCommand(params: RunCommandParams): Promise<CommandRunResult> {
        ensureAllowed(params.command);

        const policy = AdminConfig.getCommandPolicy();
        const timeoutMs = policy.timeout_ms;
        const maxOutputBytes = policy.max_output_bytes;

        await CreditManager.debit(
            params.execution_id,
            params.user_id,
            params.workspace_id,
            0.05,
            'tool:run_command'
        );

        const launch = launchSandbox(params, policy);

        await eventStore.appendEvent({
            execution_id: params.execution_id,
            workspace_id: params.workspace_id,
            user_id: params.user_id,
            agent_id: params.agent_id,
            event_type: EventType.COMMAND_STARTED,
            payload: {
                command: params.command,
                cwd: params.workspace_root,
                timeout_ms: timeoutMs,
                cpu_limit_seconds: policy.cpu_limit_seconds,
                memory_limit_mb: policy.memory_limit_mb,
                sandbox_mode: launch.mode,
                sandbox_launch_command: launch.launch_command
            }
        });

        const start = Date.now();
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const result = await new Promise<CommandRunResult>((resolve, reject) => {
            const child = launch.child;

            const timeout = setTimeout(() => {
                timedOut = true;
                child.kill('SIGKILL');
            }, timeoutMs);

            const appendOutput = async (stream: 'stdout' | 'stderr', data: Buffer): Promise<void> => {
                const chunk = data.toString();
                if (stream === 'stdout') {
                    stdout = `${stdout}${chunk}`.slice(-maxOutputBytes);
                } else {
                    stderr = `${stderr}${chunk}`.slice(-maxOutputBytes);
                }

                await eventStore.appendEvent({
                    execution_id: params.execution_id,
                    workspace_id: params.workspace_id,
                    user_id: params.user_id,
                    agent_id: params.agent_id,
                    event_type: EventType.COMMAND_OUTPUT,
                    payload: {
                        command: params.command,
                        stream,
                        chunk: chunk.slice(-2000)
                    }
                });
            };

            child.stdout?.on('data', (data: Buffer) => {
                void appendOutput('stdout', data);
            });
            child.stderr?.on('data', (data: Buffer) => {
                void appendOutput('stderr', data);
            });

            child.on('error', (error) => {
                clearTimeout(timeout);
                void eventStore.appendEvent({
                    execution_id: params.execution_id,
                    workspace_id: params.workspace_id,
                    user_id: params.user_id,
                    agent_id: params.agent_id,
                    event_type: EventType.SECURITY_ALERT,
                    payload: {
                        reason: 'sandbox_launch_failed',
                        sandbox_mode: launch.mode,
                        error: error.message
                    }
                }).catch(() => {
                    // Command launch already failed; ignore secondary event-store failure.
                });
                reject(error);
            });

            child.on('close', async (code, signal) => {
                clearTimeout(timeout);
                const durationMs = Date.now() - start;
                const runResult: CommandRunResult = {
                    command: params.command,
                    exit_code: code,
                    signal: signal || null,
                    timed_out: timedOut,
                    stdout,
                    stderr,
                    duration_ms: durationMs
                };

                try {
                    await eventStore.appendEvent({
                        execution_id: params.execution_id,
                        workspace_id: params.workspace_id,
                        user_id: params.user_id,
                        agent_id: params.agent_id,
                        event_type: EventType.COMMAND_EXITED,
                        payload: {
                            command: params.command,
                            exit_code: code,
                            signal,
                            timed_out: timedOut,
                            duration_ms: durationMs
                        }
                    });

                    await eventStore.appendEvent({
                        execution_id: params.execution_id,
                        workspace_id: params.workspace_id,
                        user_id: params.user_id,
                        agent_id: params.agent_id,
                        event_type: EventType.COMMAND_EXECUTED,
                        payload: {
                            command: params.command,
                            exit_code: code,
                            signal,
                            timed_out: timedOut,
                            duration_ms: durationMs,
                            sandbox_mode: launch.mode,
                            succeeded: !timedOut && code === 0
                        }
                    });
                } catch (eventError) {
                    reject(eventError);
                    return;
                }

                resolve(runResult);
            });
        });

        return result;
    }
}
