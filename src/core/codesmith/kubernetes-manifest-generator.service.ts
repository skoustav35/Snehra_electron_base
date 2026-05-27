/**
 * Kubernetes Manifest Generator Service
 * 
 * Generates production-ready Kubernetes manifests from workspace analysis:
 * - Deployment manifests with rolling updates
 * - Service manifests (ClusterIP/NodePort/LoadBalancer)
 * - Ingress manifests with TLS
 * - ConfigMap/Secret manifests
 * - HorizontalPodAutoscaler manifests
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from '../shims/logger';
import { DeploymentGeneratorService } from './deployment-generator.service';
import type { Framework, DeploymentConfig } from './deployment-generator.service';

// Types
export interface K8sDeploymentConfig {
    name: string;
    namespace: string;
    image: string;
    replicas: number;
    port: number;
    resources: ResourceRequirements;
    env: EnvVar[];
    labels: Record<string, string>;
    annotations?: Record<string, string>;
    healthCheck?: HealthCheckConfig;
    strategy?: DeploymentStrategy;
}

export interface ResourceRequirements {
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
}

export interface EnvVar {
    name: string;
    value?: string;
    valueFrom?: {
        configMapKeyRef?: { name: string; key: string };
        secretKeyRef?: { name: string; key: string };
    };
}

export interface HealthCheckConfig {
    path: string;
    port: number;
    initialDelaySeconds: number;
    periodSeconds: number;
    timeoutSeconds: number;
    failureThreshold: number;
}

export interface DeploymentStrategy {
    type: 'RollingUpdate' | 'Recreate';
    rollingUpdate?: {
        maxSurge: string | number;
        maxUnavailable: string | number;
    };
}

export interface K8sServiceConfig {
    name: string;
    namespace: string;
    type: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
    port: number;
    targetPort: number;
    nodePort?: number;
    selector: Record<string, string>;
}

export interface K8sIngressConfig {
    name: string;
    namespace: string;
    host: string;
    path: string;
    serviceName: string;
    servicePort: number;
    tls?: {
        secretName: string;
        hosts: string[];
    };
    annotations?: Record<string, string>;
}

export interface K8sConfigMapConfig {
    name: string;
    namespace: string;
    data: Record<string, string>;
}

export interface K8sSecretConfig {
    name: string;
    namespace: string;
    type: 'Opaque' | 'kubernetes.io/tls';
    data: Record<string, string>;
}

export interface K8sHPAConfig {
    name: string;
    namespace: string;
    targetDeployment: string;
    minReplicas: number;
    maxReplicas: number;
    targetCPUUtilization: number;
    targetMemoryUtilization?: number;
}

export interface K8sManifestBundle {
    deployment: string;
    service: string;
    ingress?: string;
    configMap?: string;
    secret?: string;
    hpa?: string;
    combined: string;
    config: {
        framework: Framework;
        namespace: string;
        appName: string;
    };
}

// Framework-specific resource recommendations
const FRAMEWORK_RESOURCES: Record<Framework, ResourceRequirements> = {
    'nextjs': {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
    },
    'nodejs': {
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '500m', memory: '384Mi' },
    },
    'react': {
        requests: { cpu: '50m', memory: '64Mi' },
        limits: { cpu: '200m', memory: '128Mi' },
    },
    'vue': {
        requests: { cpu: '50m', memory: '64Mi' },
        limits: { cpu: '200m', memory: '128Mi' },
    },
    'python-fastapi': {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
    },
    'unknown': {
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '500m', memory: '256Mi' },
    },
};

export class KubernetesManifestGenerator {
    /**
     * Generate Kubernetes Deployment manifest
     */
    public static generateDeployment(config: K8sDeploymentConfig): string {
        const deployment: Record<string, unknown> = {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: {
                name: config.name,
                namespace: config.namespace,
                labels: config.labels,
                ...(config.annotations && { annotations: config.annotations }),
            },
            spec: {
                replicas: config.replicas,
                selector: {
                    matchLabels: config.labels,
                },
                strategy: config.strategy || {
                    type: 'RollingUpdate',
                    rollingUpdate: {
                        maxSurge: '25%',
                        maxUnavailable: '25%',
                    },
                },
                template: {
                    metadata: {
                        labels: config.labels,
                    },
                    spec: {
                        containers: [
                            {
                                name: config.name,
                                image: config.image,
                                ports: [
                                    {
                                        containerPort: config.port,
                                        protocol: 'TCP',
                                    },
                                ],
                                resources: config.resources,
                                env: config.env,
                                ...(config.healthCheck && {
                                    livenessProbe: {
                                        httpGet: {
                                            path: config.healthCheck.path,
                                            port: config.healthCheck.port,
                                        },
                                        initialDelaySeconds: config.healthCheck.initialDelaySeconds,
                                        periodSeconds: config.healthCheck.periodSeconds,
                                        timeoutSeconds: config.healthCheck.timeoutSeconds,
                                        failureThreshold: config.healthCheck.failureThreshold,
                                    },
                                    readinessProbe: {
                                        httpGet: {
                                            path: config.healthCheck.path,
                                            port: config.healthCheck.port,
                                        },
                                        initialDelaySeconds: 5,
                                        periodSeconds: 10,
                                        timeoutSeconds: 5,
                                        failureThreshold: 3,
                                    },
                                }),
                            },
                        ],
                        restartPolicy: 'Always',
                        terminationGracePeriodSeconds: 30,
                    },
                },
            },
        };

        return yaml.dump(deployment, { lineWidth: -1, noRefs: true });
    }

    /**
     * Generate Kubernetes Service manifest
     */
    public static generateService(config: K8sServiceConfig): string {
        const service: Record<string, unknown> = {
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
                name: config.name,
                namespace: config.namespace,
            },
            spec: {
                type: config.type,
                selector: config.selector,
                ports: [
                    {
                        port: config.port,
                        targetPort: config.targetPort,
                        protocol: 'TCP',
                        ...(config.type === 'NodePort' && config.nodePort && { nodePort: config.nodePort }),
                    },
                ],
            },
        };

        return yaml.dump(service, { lineWidth: -1, noRefs: true });
    }

    /**
     * Generate Kubernetes Ingress manifest
     */
    public static generateIngress(config: K8sIngressConfig): string {
        const ingress: Record<string, unknown> = {
            apiVersion: 'networking.k8s.io/v1',
            kind: 'Ingress',
            metadata: {
                name: config.name,
                namespace: config.namespace,
                annotations: {
                    'kubernetes.io/ingress.class': 'nginx',
                    'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
                    ...config.annotations,
                },
            },
            spec: {
                ...(config.tls && {
                    tls: [
                        {
                            hosts: config.tls.hosts,
                            secretName: config.tls.secretName,
                        },
                    ],
                }),
                rules: [
                    {
                        host: config.host,
                        http: {
                            paths: [
                                {
                                    path: config.path,
                                    pathType: 'Prefix',
                                    backend: {
                                        service: {
                                            name: config.serviceName,
                                            port: {
                                                number: config.servicePort,
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
        };

        return yaml.dump(ingress, { lineWidth: -1, noRefs: true });
    }

    /**
     * Generate Kubernetes ConfigMap manifest
     */
    public static generateConfigMap(config: K8sConfigMapConfig): string {
        const configMap: Record<string, unknown> = {
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: {
                name: config.name,
                namespace: config.namespace,
            },
            data: config.data,
        };

        return yaml.dump(configMap, { lineWidth: -1, noRefs: true });
    }

    /**
     * Generate Kubernetes Secret manifest
     */
    public static generateSecret(config: K8sSecretConfig): string {
        // Base64 encode secret values
        const encodedData: Record<string, string> = {};
        for (const [key, value] of Object.entries(config.data)) {
            encodedData[key] = Buffer.from(value).toString('base64');
        }

        const secret: Record<string, unknown> = {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {
                name: config.name,
                namespace: config.namespace,
            },
            type: config.type,
            data: encodedData,
        };

        return yaml.dump(secret, { lineWidth: -1, noRefs: true });
    }

    /**
     * Generate HorizontalPodAutoscaler manifest
     */
    public static generateHPA(config: K8sHPAConfig): string {
        const hpa: Record<string, unknown> = {
            apiVersion: 'autoscaling/v2',
            kind: 'HorizontalPodAutoscaler',
            metadata: {
                name: config.name,
                namespace: config.namespace,
            },
            spec: {
                scaleTargetRef: {
                    apiVersion: 'apps/v1',
                    kind: 'Deployment',
                    name: config.targetDeployment,
                },
                minReplicas: config.minReplicas,
                maxReplicas: config.maxReplicas,
                metrics: [
                    {
                        type: 'Resource',
                        resource: {
                            name: 'cpu',
                            target: {
                                type: 'Utilization',
                                averageUtilization: config.targetCPUUtilization,
                            },
                        },
                    },
                    ...(config.targetMemoryUtilization
                        ? [
                            {
                                type: 'Resource',
                                resource: {
                                    name: 'memory',
                                    target: {
                                        type: 'Utilization',
                                        averageUtilization: config.targetMemoryUtilization,
                                    },
                                },
                            },
                        ]
                        : []),
                ],
            },
        };

        return yaml.dump(hpa, { lineWidth: -1, noRefs: true });
    }

    /**
     * Generate all Kubernetes manifests from workspace analysis
     */
    public static generateAll(
        workspaceRoot: string,
        options: {
            namespace?: string;
            appName?: string;
            domain?: string;
            replicas?: number;
            enableHPA?: boolean;
            enableIngress?: boolean;
            registry?: string;
        } = {}
    ): K8sManifestBundle {
        const framework = DeploymentGeneratorService.detectFramework(workspaceRoot);
        const deployConfig = DeploymentGeneratorService.generateDeploymentConfig(workspaceRoot);

        const namespace = options.namespace || 'default';
        const appName = options.appName || this.deriveAppName(workspaceRoot);
        const imageName = options.registry
            ? `${options.registry}/${appName}:latest`
            : `${appName}:latest`;

        const labels = {
            app: appName,
            'app.kubernetes.io/name': appName,
            'app.kubernetes.io/managed-by': 'codesmith',
        };

        // Extract environment variables
        const envVars = this.extractEnvVarsForK8s(workspaceRoot, appName);

        // Generate Deployment
        const deploymentConfig: K8sDeploymentConfig = {
            name: appName,
            namespace,
            image: imageName,
            replicas: options.replicas || 2,
            port: deployConfig.port,
            resources: FRAMEWORK_RESOURCES[framework],
            env: envVars.envVars,
            labels,
            healthCheck: {
                path: this.getHealthCheckPath(framework),
                port: deployConfig.port,
                initialDelaySeconds: 30,
                periodSeconds: 10,
                timeoutSeconds: 5,
                failureThreshold: 3,
            },
        };
        const deploymentYaml = this.generateDeployment(deploymentConfig);

        // Generate Service
        const serviceConfig: K8sServiceConfig = {
            name: appName,
            namespace,
            type: 'ClusterIP',
            port: 80,
            targetPort: deployConfig.port,
            selector: labels,
        };
        const serviceYaml = this.generateService(serviceConfig);

        // Generate ConfigMap (if non-secret env vars exist)
        let configMapYaml: string | undefined;
        if (envVars.configMapData && Object.keys(envVars.configMapData).length > 0) {
            configMapYaml = this.generateConfigMap({
                name: `${appName}-config`,
                namespace,
                data: envVars.configMapData,
            });
        }

        // Generate Secret placeholder
        let secretYaml: string | undefined;
        if (envVars.secretData && Object.keys(envVars.secretData).length > 0) {
            secretYaml = this.generateSecret({
                name: `${appName}-secrets`,
                namespace,
                type: 'Opaque',
                data: envVars.secretData,
            });
        }

        // Generate Ingress (if domain provided)
        let ingressYaml: string | undefined;
        if (options.enableIngress && options.domain) {
            ingressYaml = this.generateIngress({
                name: `${appName}-ingress`,
                namespace,
                host: options.domain,
                path: '/',
                serviceName: appName,
                servicePort: 80,
                tls: {
                    secretName: `${appName}-tls`,
                    hosts: [options.domain],
                },
            });
        }

        // Generate HPA (if enabled)
        let hpaYaml: string | undefined;
        if (options.enableHPA) {
            hpaYaml = this.generateHPA({
                name: `${appName}-hpa`,
                namespace,
                targetDeployment: appName,
                minReplicas: 2,
                maxReplicas: 10,
                targetCPUUtilization: 70,
                targetMemoryUtilization: 80,
            });
        }

        // Combine all manifests
        const manifests = [deploymentYaml, serviceYaml];
        if (configMapYaml) manifests.push(configMapYaml);
        if (secretYaml) manifests.push(secretYaml);
        if (ingressYaml) manifests.push(ingressYaml);
        if (hpaYaml) manifests.push(hpaYaml);

        const combined = manifests.join('---\n');

        logger.info('[KubernetesManifestGenerator] Generated manifests', {
            appName,
            namespace,
            framework,
            hasIngress: !!ingressYaml,
            hasHPA: !!hpaYaml,
        });

        return {
            deployment: deploymentYaml,
            service: serviceYaml,
            ingress: ingressYaml,
            configMap: configMapYaml,
            secret: secretYaml,
            hpa: hpaYaml,
            combined,
            config: {
                framework,
                namespace,
                appName,
            },
        };
    }

    /**
     * Write manifests to workspace
     */
    public static async writeManifests(
        workspaceRoot: string,
        bundle: K8sManifestBundle
    ): Promise<{ directory: string; files: string[] }> {
        const k8sDir = path.join(workspaceRoot, 'k8s');

        if (!fs.existsSync(k8sDir)) {
            fs.mkdirSync(k8sDir, { recursive: true });
        }

        const files: string[] = [];

        // Write individual manifests
        const writeFile = (name: string, content: string) => {
            const filePath = path.join(k8sDir, name);
            fs.writeFileSync(filePath, content, 'utf8');
            files.push(filePath);
        };

        writeFile('deployment.yaml', bundle.deployment);
        writeFile('service.yaml', bundle.service);

        if (bundle.configMap) writeFile('configmap.yaml', bundle.configMap);
        if (bundle.secret) writeFile('secret.yaml', bundle.secret);
        if (bundle.ingress) writeFile('ingress.yaml', bundle.ingress);
        if (bundle.hpa) writeFile('hpa.yaml', bundle.hpa);

        // Write combined manifest
        writeFile('all-in-one.yaml', bundle.combined);

        logger.info('[KubernetesManifestGenerator] Wrote manifests to disk', {
            directory: k8sDir,
            fileCount: files.length,
        });

        return { directory: k8sDir, files };
    }

    // Private helpers

    private static deriveAppName(workspaceRoot: string): string {
        const packageJsonPath = path.join(workspaceRoot, 'package.json');

        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                if (pkg.name) {
                    // Sanitize for K8s naming
                    return pkg.name
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '-')
                        .replace(/--+/g, '-')
                        .replace(/^-|-$/g, '')
                        .substring(0, 63);
                }
            } catch (e) {
                // Ignore
            }
        }

        // Fallback to directory name
        return path.basename(workspaceRoot)
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .substring(0, 63);
    }

    private static getHealthCheckPath(framework: Framework): string {
        switch (framework) {
            case 'nextjs':
            case 'react':
            case 'vue':
                return '/';
            case 'python-fastapi':
                return '/health';
            case 'nodejs':
            default:
                return '/health';
        }
    }

    private static extractEnvVarsForK8s(
        workspaceRoot: string,
        appName: string
    ): {
        envVars: EnvVar[];
        configMapData: Record<string, string>;
        secretData: Record<string, string>;
    } {
        const envVars: EnvVar[] = [];
        const configMapData: Record<string, string> = {};
        const secretData: Record<string, string> = {};

        const secretPatterns = [
            /password/i,
            /secret/i,
            /key/i,
            /token/i,
            /api_key/i,
            /auth/i,
            /credential/i,
            /private/i,
        ];

        const envFiles = ['.env', '.env.example', '.env.local'];

        for (const envFile of envFiles) {
            const envPath = path.join(workspaceRoot, envFile);
            if (fs.existsSync(envPath)) {
                const content = fs.readFileSync(envPath, 'utf8');
                const lines = content.split('\n');

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        const eqIdx = trimmed.indexOf('=');
                        if (eqIdx > 0) {
                            const key = trimmed.substring(0, eqIdx).trim();
                            const value = trimmed.substring(eqIdx + 1).trim();

                            const isSecret = secretPatterns.some(p => p.test(key));

                            if (isSecret) {
                                secretData[key] = value || 'CHANGE_ME';
                                envVars.push({
                                    name: key,
                                    valueFrom: {
                                        secretKeyRef: {
                                            name: `${appName}-secrets`,
                                            key: key,
                                        },
                                    },
                                });
                            } else {
                                configMapData[key] = value || '';
                                envVars.push({
                                    name: key,
                                    valueFrom: {
                                        configMapKeyRef: {
                                            name: `${appName}-config`,
                                            key: key,
                                        },
                                    },
                                });
                            }
                        }
                    }
                }
                break; // Only use first found env file
            }
        }

        return { envVars, configMapData, secretData };
    }
}
