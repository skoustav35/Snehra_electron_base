import fs from 'fs';
import path from 'path';
import { logger } from '../shims/logger';

export type Framework = 'nextjs' | 'nodejs' | 'react' | 'vue' | 'python-fastapi' | 'unknown';

export interface DeploymentConfig {
    framework: Framework;
    port: number;
    buildCommand?: string;
    startCommand?: string;
    environmentVars: string[];
    infrastructure?: {
        classification: InfrastructureClassification;
        docker_compose_path?: string | null;
        docker_compose_services?: string[];
    };
}

export interface DockerfileContent {
    content: string;
    framework: Framework;
}

export interface DockerComposeContent {
    content: string;
}

export type InfrastructureClassification =
    | 'single-container'
    | 'multi-container'
    | 'microservice'
    | 'kubernetes-ready';

export interface InfrastructureScanResult {
    classification: InfrastructureClassification;
    hasDockerCompose: boolean;
    dockerComposePath: string | null;
    dockerComposeValid: boolean;
    dockerComposeWarnings: string[];
    dockerComposeServices: string[];
    dockerComposePorts: number[];
    hasHelmCharts: boolean;
    helmChartPaths: string[];
    hasKubernetesManifests: boolean;
    kubernetesManifestPaths: string[];
    hasTerraform: boolean;
    terraformPaths: string[];
    hasRailwayConfig: boolean;
    hasRenderConfig: boolean;
    authoritativeInfrastructure: string[];
}

export class DeploymentGeneratorService {
    /**
     * Detect application framework from workspace structure
     */
    public static detectFramework(workspaceRoot: string): Framework {
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        
        // Check for Python FastAPI
        const requirementsTxtPath = path.join(workspaceRoot, 'requirements.txt');
        const pyprojectPath = path.join(workspaceRoot, 'pyproject.toml');
        
        if (fs.existsSync(requirementsTxtPath) || fs.existsSync(pyprojectPath)) {
            const reqContent = fs.existsSync(requirementsTxtPath) 
                ? fs.readFileSync(requirementsTxtPath, 'utf8')
                : '';
            const pyContent = fs.existsSync(pyprojectPath)
                ? fs.readFileSync(pyprojectPath, 'utf8')
                : '';
            
            if (reqContent.includes('fastapi') || pyContent.includes('fastapi')) {
                return 'python-fastapi';
            }
        }

        // Check for Node.js frameworks
        if (!fs.existsSync(packageJsonPath)) {
            return 'unknown';
        }

        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

            // Check for Next.js
            if (dependencies.next) {
                return 'nextjs';
            }

            // Check for React
            if (dependencies.react && !dependencies.next) {
                // Check if it's a React app (CRA or Vite)
                return 'react';
            }

            // Check for Vue
            if (dependencies.vue) {
                return 'vue';
            }

            // Default to generic Node.js
            return 'nodejs';
        } catch (error) {
            logger.error('Failed to parse package.json', { error, workspaceRoot });
            return 'unknown';
        }
    }

    public static validateDockerCompose(
        workspaceRoot: string,
        composePath?: string
    ): { valid: boolean; filePath: string | null; services: string[]; ports: number[]; warnings: string[] } {
        const candidate = composePath || this.findDockerComposeFile(workspaceRoot);
        if (!candidate || !fs.existsSync(candidate)) {
            return {
                valid: false,
                filePath: null,
                services: [],
                ports: [],
                warnings: ['docker-compose file not found']
            };
        }

        const content = fs.readFileSync(candidate, 'utf8');
        const warnings: string[] = [];
        if (!/^\s*services\s*:/m.test(content)) {
            return {
                valid: false,
                filePath: candidate,
                services: [],
                ports: [],
                warnings: ['services block missing in compose file']
            };
        }

        const services = this.extractComposeServices(content);
        const ports = this.extractComposePorts(content);
        if (services.length === 0) {
            warnings.push('compose file has services block but no detectable service keys');
        }

        return {
            valid: services.length > 0,
            filePath: candidate,
            services,
            ports,
            warnings
        };
    }

    public static scanInfrastructure(workspaceRoot: string): InfrastructureScanResult {
        const dockerComposePath = this.findDockerComposeFile(workspaceRoot);
        const composeValidation = this.validateDockerCompose(workspaceRoot, dockerComposePath || undefined);

        const allFiles = this.listWorkspaceFiles(workspaceRoot, 5);
        const helmChartPaths = allFiles.filter((file) =>
            /(^|\/)(helm|charts)(\/|$)/i.test(file) && /chart\.ya?ml$/i.test(file)
        );
        if (fs.existsSync(path.join(workspaceRoot, 'Chart.yaml'))) {
            helmChartPaths.push('Chart.yaml');
        }

        const kubernetesManifestPaths = allFiles.filter((file) =>
            /(k8s|kubernetes|manifests?)/i.test(file)
            && /\.(ya?ml)$/i.test(file)
        );

        const terraformPaths = allFiles.filter((file) => /\.tf$/i.test(file) || /\.tfvars$/i.test(file));
        const hasRailwayConfig = fs.existsSync(path.join(workspaceRoot, 'railway.json'))
            || fs.existsSync(path.join(workspaceRoot, 'railway.toml'));
        const hasRenderConfig = fs.existsSync(path.join(workspaceRoot, 'render.yaml'))
            || fs.existsSync(path.join(workspaceRoot, 'render.yml'));

        const hasHelmCharts = helmChartPaths.length > 0;
        const hasKubernetesManifests = kubernetesManifestPaths.length > 0;
        const hasTerraform = terraformPaths.length > 0;
        const hasDockerCompose = Boolean(dockerComposePath);

        const classification = this.classifyInfrastructure({
            hasDockerCompose,
            dockerComposeServices: composeValidation.services,
            hasHelmCharts,
            hasKubernetesManifests,
            hasTerraform,
            hasRailwayConfig,
            hasRenderConfig
        });

        const authoritativeInfrastructure: string[] = [];
        if (composeValidation.valid && composeValidation.filePath) {
            authoritativeInfrastructure.push(composeValidation.filePath);
        }
        if (hasKubernetesManifests) {
            authoritativeInfrastructure.push(...kubernetesManifestPaths.map((entry) => path.join(workspaceRoot, entry)));
        }
        if (hasHelmCharts) {
            authoritativeInfrastructure.push(...helmChartPaths.map((entry) => path.join(workspaceRoot, entry)));
        }

        return {
            classification,
            hasDockerCompose,
            dockerComposePath: composeValidation.filePath,
            dockerComposeValid: composeValidation.valid,
            dockerComposeWarnings: composeValidation.warnings,
            dockerComposeServices: composeValidation.services,
            dockerComposePorts: composeValidation.ports,
            hasHelmCharts,
            helmChartPaths: Array.from(new Set(helmChartPaths)),
            hasKubernetesManifests,
            kubernetesManifestPaths: Array.from(new Set(kubernetesManifestPaths)),
            hasTerraform,
            terraformPaths,
            hasRailwayConfig,
            hasRenderConfig,
            authoritativeInfrastructure: Array.from(new Set(authoritativeInfrastructure))
        };
    }

    public static classifyInfrastructure(input: {
        hasDockerCompose: boolean;
        dockerComposeServices: string[];
        hasHelmCharts: boolean;
        hasKubernetesManifests: boolean;
        hasTerraform: boolean;
        hasRailwayConfig: boolean;
        hasRenderConfig: boolean;
    }): InfrastructureClassification {
        if (input.hasHelmCharts || input.hasKubernetesManifests) {
            return 'kubernetes-ready';
        }
        if (input.hasDockerCompose) {
            if (input.dockerComposeServices.length >= 3) {
                return 'microservice';
            }
            if (input.dockerComposeServices.length > 1) {
                return 'multi-container';
            }
            return 'single-container';
        }
        if (input.hasTerraform || input.hasRailwayConfig || input.hasRenderConfig) {
            return 'microservice';
        }
        return 'single-container';
    }

    /**
     * Generate Dockerfile based on detected framework
     */
    public static generateDockerfile(workspaceRoot: string, framework?: Framework): DockerfileContent {
        const detectedFramework = framework || this.detectFramework(workspaceRoot);
        
        let content = '';
        
        switch (detectedFramework) {
            case 'nextjs':
                content = this.generateNextJsDockerfile(workspaceRoot);
                break;
            case 'nodejs':
                content = this.generateNodeJsDockerfile(workspaceRoot);
                break;
            case 'react':
                content = this.generateReactDockerfile(workspaceRoot);
                break;
            case 'vue':
                content = this.generateVueDockerfile(workspaceRoot);
                break;
            case 'python-fastapi':
                content = this.generatePythonFastApiDockerfile(workspaceRoot);
                break;
            default:
                content = this.generateGenericDockerfile();
                break;
        }

        return { content, framework: detectedFramework };
    }

    /**
     * Generate docker-compose.yml for local deployment
     */
    public static generateDockerCompose(
        workspaceRoot: string,
        config: DeploymentConfig,
        imageName: string,
        containerName: string
    ): DockerComposeContent {
        const content = `version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: ${imageName}
    container_name: ${containerName}
    ports:
      - "${config.port}:${config.port}"
    environment:
${config.environmentVars.map(env => `      - ${env}`).join('\n')}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${config.port}"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
`;

        return { content };
    }

    /**
     * Extract environment variables from workspace files
     */
    public static extractEnvironmentVars(workspaceRoot: string): string[] {
        const envFiles = ['.env', '.env.example', '.env.local'];
        const envVars: Set<string> = new Set();

        for (const envFile of envFiles) {
            const envPath = path.join(workspaceRoot, envFile);
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf8');
                const lines = content.split('\n');
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        const [key] = trimmed.split('=');
                        if (key) {
                            envVars.add(`${key.trim()}=`);
                        }
                    }
                }
            }
        }

        return Array.from(envVars);
    }

    /**
     * Generate deployment configuration
     */
    public static generateDeploymentConfig(workspaceRoot: string): DeploymentConfig {
        const framework = this.detectFramework(workspaceRoot);
        const environmentVars = this.extractEnvironmentVars(workspaceRoot);
        const infra = this.scanInfrastructure(workspaceRoot);

        const config: DeploymentConfig = {
            framework,
            port: 3000,
            environmentVars,
            infrastructure: {
                classification: infra.classification,
                docker_compose_path: infra.dockerComposePath,
                docker_compose_services: infra.dockerComposeServices
            }
        };

        // Set framework-specific ports and commands
        switch (framework) {
            case 'nextjs':
                config.port = 3000;
                config.buildCommand = 'npm run build';
                config.startCommand = 'npm start';
                break;
            case 'python-fastapi':
                config.port = 8000;
                config.buildCommand = 'pip install -r requirements.txt';
                config.startCommand = 'uvicorn main:app --host 0.0.0.0 --port 8000';
                break;
            case 'react':
            case 'vue':
                config.port = 80;
                config.buildCommand = 'npm run build';
                config.startCommand = 'serve -s build -l 80';
                break;
            case 'nodejs':
            default:
                config.port = 3000;
                config.buildCommand = 'npm install';
                config.startCommand = 'npm start';
                break;
        }

        return config;
    }

    // Private helper methods for generating framework-specific Dockerfiles

    private static generateNextJsDockerfile(workspaceRoot: string): string {
        return `# Next.js Production Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
`;
    }

    private static generateNodeJsDockerfile(workspaceRoot: string): string {
        return `# Node.js Production Dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# If there's a build script, run it
RUN npm run build || true

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

CMD ["npm", "start"]
`;
    }

    private static generateReactDockerfile(workspaceRoot: string): string {
        return `# React Production Dockerfile
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Build the application
COPY . .
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built assets to nginx
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration if exists
COPY nginx.conf /etc/nginx/conf.d/default.conf || echo "server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files \\$uri \\$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;
    }

    private static generateVueDockerfile(workspaceRoot: string): string {
        return `# Vue.js Production Dockerfile
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Build the application
COPY . .
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built assets to nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration if exists
COPY nginx.conf /etc/nginx/conf.d/default.conf || echo "server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files \\$uri \\$uri/ /index.html; } }" > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
`;
    }

    private static generatePythonFastApiDockerfile(workspaceRoot: string): string {
        return `# Python FastAPI Production Dockerfile
FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    build-essential \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \\
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
`;
    }

    private static generateGenericDockerfile(): string {
        return `# Generic Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Build if build script exists
RUN npm run build || true

EXPOSE 3000

CMD ["npm", "start"]
`;
    }

    private static findDockerComposeFile(workspaceRoot: string): string | null {
        const candidates = [
            'docker-compose.yml',
            'docker-compose.yaml',
            'compose.yml',
            'compose.yaml'
        ];
        for (const candidate of candidates) {
            const absolute = path.join(workspaceRoot, candidate);
            if (fs.existsSync(absolute)) {
                return absolute;
            }
        }
        return null;
    }

    private static extractComposeServices(content: string): string[] {
        const lines = content.split(/\r?\n/);
        let inServices = false;
        let servicesIndent = -1;
        const services: string[] = [];

        for (const line of lines) {
            if (!inServices && /^\s*services\s*:\s*$/.test(line)) {
                inServices = true;
                servicesIndent = line.search(/\S/);
                continue;
            }
            if (!inServices) continue;

            if (!line.trim() || line.trim().startsWith('#')) {
                continue;
            }

            const indent = line.search(/\S/);
            if (indent <= servicesIndent) {
                break;
            }

            const match = line.match(/^\s{2,}([a-zA-Z0-9._-]+)\s*:\s*$/);
            if (match && indent === servicesIndent + 2) {
                services.push(match[1]);
            }
        }

        return Array.from(new Set(services));
    }

    private static extractComposePorts(content: string): number[] {
        const ports: number[] = [];
        const regex = /-\s*["']?(\d{2,5})\s*:\s*(\d{2,5})/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            const hostPort = Number(match[1]);
            if (Number.isFinite(hostPort) && hostPort > 0 && hostPort <= 65535) {
                ports.push(hostPort);
            }
        }
        return Array.from(new Set(ports));
    }

    private static listWorkspaceFiles(workspaceRoot: string, maxDepth: number, relative: string = '', depth: number = 0): string[] {
        if (depth > maxDepth) return [];

        const target = relative ? path.join(workspaceRoot, relative) : workspaceRoot;
        if (!fs.existsSync(target)) return [];

        const entries = fs.readdirSync(target, { withFileTypes: true });
        const files: string[] = [];

        for (const entry of entries) {
            const rel = relative ? path.posix.join(relative, entry.name) : entry.name;
            if (entry.isDirectory()) {
                if (['.git', 'node_modules', 'dist', 'build', '.next'].includes(entry.name)) {
                    continue;
                }
                files.push(...this.listWorkspaceFiles(workspaceRoot, maxDepth, rel, depth + 1));
            } else {
                files.push(rel);
            }
        }

        return files;
    }

    /**
     * Write generated files to workspace
     */
    public static async writeDeploymentFiles(
        workspaceRoot: string,
        framework?: Framework
    ): Promise<{ dockerfile: string; dockerCompose: string; config: DeploymentConfig }> {
        const config = this.generateDeploymentConfig(workspaceRoot);
        const infra = this.scanInfrastructure(workspaceRoot);
        const dockerfilePath = path.join(workspaceRoot, 'Dockerfile');
        const dockerComposePath = infra.dockerComposePath || path.join(workspaceRoot, 'docker-compose.yml');

        if (infra.classification === 'kubernetes-ready') {
            logger.info('Preserving existing Kubernetes/Helm infrastructure; skipping Dockerfile/compose generation', {
                workspaceRoot,
                framework: config.framework,
                classification: infra.classification
            });
            return {
                dockerfile: dockerfilePath,
                dockerCompose: dockerComposePath,
                config
            };
        }

        if (infra.hasDockerCompose && infra.dockerComposePath) {
            if (!infra.dockerComposeValid) {
                logger.warn('docker-compose file detected but failed validation; preserving as authoritative infrastructure', {
                    workspaceRoot,
                    compose: infra.dockerComposePath,
                    warnings: infra.dockerComposeWarnings
                });
            }

            logger.info('Preserving authoritative docker-compose infrastructure', {
                workspaceRoot,
                framework: config.framework,
                classification: infra.classification,
                compose: infra.dockerComposePath,
                services: infra.dockerComposeServices,
                compose_valid: infra.dockerComposeValid
            });

            if (!fs.existsSync(dockerfilePath)) {
                const { content: dockerfileContent } = this.generateDockerfile(workspaceRoot, framework);
                fs.writeFileSync(dockerfilePath, dockerfileContent, 'utf8');
            }

            return {
                dockerfile: dockerfilePath,
                dockerCompose: infra.dockerComposePath,
                config
            };
        }

        const { content: dockerfileContent } = this.generateDockerfile(workspaceRoot, framework);
        const imageName = `codesmith-app-${Date.now()}`;
        const containerName = `codesmith-container-${Date.now()}`;
        const { content: dockerComposeContent } = this.generateDockerCompose(
            workspaceRoot,
            config,
            imageName,
            containerName
        );

        fs.writeFileSync(dockerfilePath, dockerfileContent, 'utf8');
        fs.writeFileSync(dockerComposePath, dockerComposeContent, 'utf8');

        logger.info('Generated deployment files', {
            workspaceRoot,
            framework: config.framework,
            classification: infra.classification,
            port: config.port
        });

        return {
            dockerfile: dockerfilePath,
            dockerCompose: dockerComposePath,
            config
        };
    }
}
