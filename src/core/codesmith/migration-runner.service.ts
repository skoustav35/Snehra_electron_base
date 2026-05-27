/**
 * Database Migration Runner Service
 * 
 * Detects and executes database migrations for various frameworks:
 * - Prisma (Node.js)
 * - Sequelize (Node.js)
 * - TypeORM (Node.js)
 * - Alembic (Python/FastAPI)
 * - Django (Python)
 * - Drizzle (Node.js)
 */

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { logger } from '../shims/logger';
import { AdminConfig } from '../shims/admin-config';

const execAsync = promisify(exec);

// Types
export type MigrationTool =
    | 'prisma'
    | 'sequelize'
    | 'typeorm'
    | 'alembic'
    | 'django'
    | 'drizzle'
    | 'knex'
    | 'unknown';

export interface MigrationConfig {
    workspaceRoot: string;
    tool: MigrationTool;
    dryRun?: boolean;
    timeout?: number;
    environment?: 'development' | 'staging' | 'production';
    databaseUrl?: string;
}

export interface MigrationResult {
    success: boolean;
    tool: MigrationTool;
    migrationsApplied: string[];
    output: string;
    error?: string;
    duration: number;
    dryRun: boolean;
}

export interface MigrationPreview {
    tool: MigrationTool;
    pendingMigrations: PendingMigration[];
    estimatedDuration: number;
    warnings: string[];
    requiresDowntime: boolean;
}

export interface PendingMigration {
    name: string;
    type: 'create' | 'alter' | 'drop' | 'data' | 'unknown';
    tables?: string[];
    estimatedRows?: number;
    isDestructive: boolean;
}

interface ExecErrorLike {
    stdout?: string | Buffer;
    stderr?: string | Buffer;
}

function extractExecOutput(error: unknown): string {
    if (!error || typeof error !== 'object') return '';
    const candidate = error as ExecErrorLike;
    const stdout = typeof candidate.stdout === 'string'
        ? candidate.stdout
        : Buffer.isBuffer(candidate.stdout)
            ? candidate.stdout.toString('utf8')
            : '';
    const stderr = typeof candidate.stderr === 'string'
        ? candidate.stderr
        : Buffer.isBuffer(candidate.stderr)
            ? candidate.stderr.toString('utf8')
            : '';
    return `${stdout}${stderr}`;
}

// Migration tool detection patterns
const TOOL_PATTERNS: Record<MigrationTool, { files: string[]; contents?: RegExp[] }> = {
    prisma: {
        files: ['prisma/schema.prisma', 'schema.prisma'],
    },
    sequelize: {
        files: ['.sequelizerc', 'sequelize.config.js', 'config/config.json'],
        contents: [/sequelize/i],
    },
    typeorm: {
        files: ['ormconfig.json', 'ormconfig.js', 'ormconfig.ts', 'data-source.ts'],
        contents: [/typeorm/i],
    },
    alembic: {
        files: ['alembic.ini', 'alembic/env.py'],
    },
    django: {
        files: ['manage.py'],
        contents: [/django/i],
    },
    drizzle: {
        files: ['drizzle.config.ts', 'drizzle.config.js'],
        contents: [/drizzle-kit/i],
    },
    knex: {
        files: ['knexfile.js', 'knexfile.ts'],
    },
    unknown: {
        files: [],
    },
};

// Migration commands per tool
const MIGRATION_COMMANDS: Record<MigrationTool, {
    status: string;
    migrate: string;
    migrateProduction: string;
    dryRun?: string;
    rollback?: string;
    generate?: string;
}> = {
    prisma: {
        status: 'npx prisma migrate status',
        migrate: 'npx prisma migrate deploy',
        migrateProduction: 'npx prisma migrate deploy',
        dryRun: 'npx prisma migrate status',
        rollback: 'npx prisma migrate rollback',
        generate: 'npx prisma migrate dev --name',
    },
    sequelize: {
        status: 'npx sequelize-cli db:migrate:status',
        migrate: 'npx sequelize-cli db:migrate',
        migrateProduction: 'NODE_ENV=production npx sequelize-cli db:migrate',
        rollback: 'npx sequelize-cli db:migrate:undo',
    },
    typeorm: {
        status: 'npx typeorm migration:show',
        migrate: 'npx typeorm migration:run',
        migrateProduction: 'NODE_ENV=production npx typeorm migration:run',
        rollback: 'npx typeorm migration:revert',
        generate: 'npx typeorm migration:generate',
    },
    alembic: {
        status: 'alembic current',
        migrate: 'alembic upgrade head',
        migrateProduction: 'alembic upgrade head',
        dryRun: 'alembic upgrade head --sql',
        rollback: 'alembic downgrade -1',
        generate: 'alembic revision --autogenerate -m',
    },
    django: {
        status: 'python manage.py showmigrations',
        migrate: 'python manage.py migrate',
        migrateProduction: 'python manage.py migrate --no-input',
        dryRun: 'python manage.py migrate --plan',
        rollback: 'python manage.py migrate',
    },
    drizzle: {
        status: 'npx drizzle-kit check',
        migrate: 'npx drizzle-kit push',
        migrateProduction: 'npx drizzle-kit push',
        generate: 'npx drizzle-kit generate',
    },
    knex: {
        status: 'npx knex migrate:status',
        migrate: 'npx knex migrate:latest',
        migrateProduction: 'NODE_ENV=production npx knex migrate:latest',
        rollback: 'npx knex migrate:rollback',
    },
    unknown: {
        status: 'echo "No migration tool detected"',
        migrate: 'echo "No migration tool detected"',
        migrateProduction: 'echo "No migration tool detected"',
    },
};

export class MigrationRunnerService {
    /**
     * Detect migration tool from workspace
     */
    public static detectMigrationTool(workspaceRoot: string): MigrationTool {
        for (const [tool, patterns] of Object.entries(TOOL_PATTERNS)) {
            if (tool === 'unknown') continue;

            // Check for indicator files
            for (const file of patterns.files) {
                const filePath = path.join(workspaceRoot, file);
                if (fs.existsSync(filePath)) {
                    logger.info('[MigrationRunner] Detected migration tool by file', { tool, file });
                    return tool as MigrationTool;
                }
            }
        }

        // Check package.json for dependencies
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

                if (allDeps['prisma'] || allDeps['@prisma/client']) return 'prisma';
                if (allDeps['sequelize']) return 'sequelize';
                if (allDeps['typeorm']) return 'typeorm';
                if (allDeps['drizzle-orm']) return 'drizzle';
                if (allDeps['knex']) return 'knex';
            } catch (e) {
                // Ignore
            }
        }

        // Check requirements.txt for Python deps
        const requirementsPath = path.join(workspaceRoot, 'requirements.txt');
        if (fs.existsSync(requirementsPath)) {
            const content = fs.readFileSync(requirementsPath, 'utf8');
            if (content.includes('alembic')) return 'alembic';
            if (content.includes('django')) return 'django';
        }

        return 'unknown';
    }

    /**
     * Get migration status
     */
    public static async getMigrationStatus(
        workspaceRoot: string,
        tool?: MigrationTool
    ): Promise<{ tool: MigrationTool; status: string; hasPending: boolean }> {
        const detectedTool = tool || this.detectMigrationTool(workspaceRoot);
        const command = MIGRATION_COMMANDS[detectedTool]?.status;

        if (!command || detectedTool === 'unknown') {
            return { tool: 'unknown', status: 'No migration tool detected', hasPending: false };
        }

        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: workspaceRoot,
                timeout: 30000,
            });

            const output = stdout + stderr;
            const hasPending = this.detectPendingMigrations(output, detectedTool);

            return {
                tool: detectedTool,
                status: output.trim(),
                hasPending,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                tool: detectedTool,
                status: `Error: ${errorMsg}`,
                hasPending: false,
            };
        }
    }

    /**
     * Preview migrations without executing
     */
    public static async previewMigrations(
        workspaceRoot: string,
        tool?: MigrationTool
    ): Promise<MigrationPreview> {
        const detectedTool = tool || this.detectMigrationTool(workspaceRoot);
        const commands = MIGRATION_COMMANDS[detectedTool];

        const preview: MigrationPreview = {
            tool: detectedTool,
            pendingMigrations: [],
            estimatedDuration: 0,
            warnings: [],
            requiresDowntime: false,
        };

        if (!commands || detectedTool === 'unknown') {
            preview.warnings.push('No migration tool detected');
            return preview;
        }

        try {
            // Get status
            const status = await this.getMigrationStatus(workspaceRoot, detectedTool);

            if (!status.hasPending) {
                return preview;
            }

            // Parse pending migrations from status
            preview.pendingMigrations = this.parsePendingMigrations(status.status, detectedTool);

            // Analyze migrations for destructive operations
            for (const migration of preview.pendingMigrations) {
                if (migration.isDestructive) {
                    preview.warnings.push(`Migration '${migration.name}' contains destructive operations`);
                    preview.requiresDowntime = true;
                }
            }

            // Estimate duration (rough: 5s per migration)
            preview.estimatedDuration = preview.pendingMigrations.length * 5000;

            // If dry-run is available, run it for more info
            if (commands.dryRun) {
                try {
                    const { stdout } = await execAsync(commands.dryRun, {
                        cwd: workspaceRoot,
                        timeout: 60000,
                    });

                    // Check for destructive keywords
                    const lowerOutput = stdout.toLowerCase();
                    if (lowerOutput.includes('drop table') || lowerOutput.includes('drop column')) {
                        preview.requiresDowntime = true;
                        preview.warnings.push('Migrations include DROP operations - may cause downtime');
                    }
                } catch (e) {
                    // Dry run failed, continue with basic preview
                }
            }

        } catch (error) {
            preview.warnings.push(`Preview failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        return preview;
    }

    /**
     * Run migrations
     */
    public static async runMigrations(config: MigrationConfig): Promise<MigrationResult> {
        const startTime = Date.now();
        const tool = config.tool || this.detectMigrationTool(config.workspaceRoot);
        const commands = MIGRATION_COMMANDS[tool];

        const result: MigrationResult = {
            success: false,
            tool,
            migrationsApplied: [],
            output: '',
            duration: 0,
            dryRun: config.dryRun || false,
        };

        if (!commands || tool === 'unknown') {
            result.error = 'No migration tool detected';
            result.duration = Date.now() - startTime;
            return result;
        }

        logger.info('[MigrationRunner] Running migrations', {
            tool,
            workspaceRoot: config.workspaceRoot,
            dryRun: config.dryRun,
            environment: config.environment,
        });

        try {
            // Prepare environment
            const env: NodeJS.ProcessEnv = { ...AdminConfig.getChildProcessEnv() };
            if (config.databaseUrl) {
                env['DATABASE_URL'] = config.databaseUrl;
            }

            // Select command based on dry-run and environment
            let command: string;
            if (config.dryRun && commands.dryRun) {
                command = commands.dryRun;
            } else if (config.environment === 'production') {
                command = commands.migrateProduction;
            } else {
                command = commands.migrate;
            }

            // Execute migration
            const { stdout, stderr } = await execAsync(command, {
                cwd: config.workspaceRoot,
                timeout: config.timeout || 300000, // 5 min default
                env,
            });

            result.output = stdout + stderr;
            result.success = true;

            // Parse applied migrations from output
            result.migrationsApplied = this.parseAppliedMigrations(result.output, tool);

            logger.info('[MigrationRunner] Migrations completed successfully', {
                tool,
                migrationsApplied: result.migrationsApplied.length,
            });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.error = errorMsg;
            result.output = extractExecOutput(error);

            logger.error('[MigrationRunner] Migration failed', {
                tool,
                error: errorMsg,
            });
        }

        result.duration = Date.now() - startTime;
        return result;
    }

    /**
     * Rollback last migration
     */
    public static async rollbackMigration(
        workspaceRoot: string,
        tool?: MigrationTool,
        target?: string
    ): Promise<MigrationResult> {
        const startTime = Date.now();
        const detectedTool = tool || this.detectMigrationTool(workspaceRoot);
        const commands = MIGRATION_COMMANDS[detectedTool];

        const result: MigrationResult = {
            success: false,
            tool: detectedTool,
            migrationsApplied: [],
            output: '',
            duration: 0,
            dryRun: false,
        };

        if (!commands?.rollback) {
            result.error = `Rollback not supported for ${detectedTool}`;
            result.duration = Date.now() - startTime;
            return result;
        }

        try {
            let command = commands.rollback;

            // Add target for Django-style migrations
            if (target && detectedTool === 'django') {
                command = `${command} ${target}`;
            }

            const { stdout, stderr } = await execAsync(command, {
                cwd: workspaceRoot,
                timeout: 120000,
            });

            result.output = stdout + stderr;
            result.success = true;

            logger.info('[MigrationRunner] Rollback completed', { tool: detectedTool });

        } catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
            logger.error('[MigrationRunner] Rollback failed', { tool: detectedTool, error: result.error });
        }

        result.duration = Date.now() - startTime;
        return result;
    }

    /**
     * Generate a new migration (for dev)
     */
    public static async generateMigration(
        workspaceRoot: string,
        name: string,
        tool?: MigrationTool
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        const detectedTool = tool || this.detectMigrationTool(workspaceRoot);
        const commands = MIGRATION_COMMANDS[detectedTool];

        if (!commands?.generate) {
            return { success: false, error: `Migration generation not supported for ${detectedTool}` };
        }

        try {
            const command = `${commands.generate} "${name}"`;
            const { stdout } = await execAsync(command, {
                cwd: workspaceRoot,
                timeout: 60000,
            });

            // Try to extract file path from output
            const fileMatch = stdout.match(/(?:Created|Generated)[^\n]*?([\/\\][\w\-\.\/\\]+\.(?:ts|js|py|sql))/i);

            return {
                success: true,
                filePath: fileMatch?.[1],
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // Private helpers

    private static detectPendingMigrations(output: string, tool: MigrationTool): boolean {
        const lowerOutput = output.toLowerCase();

        switch (tool) {
            case 'prisma':
                return lowerOutput.includes('pending') || lowerOutput.includes('not yet applied');
            case 'sequelize':
                return lowerOutput.includes('pending');
            case 'typeorm':
                return lowerOutput.includes('pending') || lowerOutput.includes('[ ]');
            case 'alembic':
                return lowerOutput.includes('head') && lowerOutput.includes('->');
            case 'django':
                return lowerOutput.includes('[ ]');
            case 'drizzle':
                return lowerOutput.includes('pending');
            case 'knex':
                return lowerOutput.includes('pending');
            default:
                return false;
        }
    }

    private static parsePendingMigrations(output: string, tool: MigrationTool): PendingMigration[] {
        const migrations: PendingMigration[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            let migration: PendingMigration | null = null;

            // Parse based on tool-specific output formats
            switch (tool) {
                case 'prisma':
                    if (trimmed.includes('Not yet applied')) {
                        const match = trimmed.match(/(\d{14}_\w+)/);
                        if (match) {
                            migration = {
                                name: match[1],
                                type: 'unknown',
                                isDestructive: false,
                            };
                        }
                    }
                    break;

                case 'django':
                    if (trimmed.startsWith('[ ]')) {
                        const parts = trimmed.replace('[ ]', '').trim().split('.');
                        migration = {
                            name: parts.join('.'),
                            type: 'unknown',
                            isDestructive: false,
                        };
                    }
                    break;

                case 'sequelize':
                case 'typeorm':
                case 'knex':
                    // Generic pattern: look for migration file names
                    const fileMatch = trimmed.match(/(\d{8,14}[-_]\w+)/);
                    if (fileMatch && trimmed.toLowerCase().includes('pending')) {
                        migration = {
                            name: fileMatch[1],
                            type: 'unknown',
                            isDestructive: false,
                        };
                    }
                    break;
            }

            if (migration) {
                // Detect destructive operations from name
                const lowerName = migration.name.toLowerCase();
                migration.isDestructive =
                    lowerName.includes('drop') ||
                    lowerName.includes('delete') ||
                    lowerName.includes('remove') ||
                    lowerName.includes('truncate');

                // Detect type from name
                if (lowerName.includes('create')) migration.type = 'create';
                else if (lowerName.includes('alter') || lowerName.includes('modify')) migration.type = 'alter';
                else if (lowerName.includes('drop')) migration.type = 'drop';
                else if (lowerName.includes('seed') || lowerName.includes('data')) migration.type = 'data';

                migrations.push(migration);
            }
        }

        return migrations;
    }

    private static parseAppliedMigrations(output: string, tool: MigrationTool): string[] {
        const migrations: string[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            // Look for applied/success patterns
            const lowerLine = line.toLowerCase();
            if (
                lowerLine.includes('applied') ||
                lowerLine.includes('migrated') ||
                lowerLine.includes('success') ||
                lowerLine.includes('completed')
            ) {
                // Extract migration name
                const match = line.match(/(\d{8,14}[-_]\w+|[\w_]+_\d{4,})/);
                if (match) {
                    migrations.push(match[1]);
                }
            }
        }

        return migrations;
    }
}
