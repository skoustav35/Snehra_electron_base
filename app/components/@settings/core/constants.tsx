import type { TabType } from './types';
import { User, Settings, Bell, Database, Cloud, Github, Wrench, Server, Rocket, Globe } from 'lucide-react';

const GitLabIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <path
      fill="currentColor"
      d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"
    />
  </svg>
);

const InsforgeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <defs>
      <linearGradient id="insforge-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
    <path fill="url(#insforge-grad)" d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const NeonIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <path fill="#00E599" d="M21 2H3c-.55 0-1 .45-1 1v18c0 .55.45 1 1 1h18c.55 0 1-.45 1-1V3c0-.55-.45-1-1-1Zm-2.5 15.5c-1.38 0-2.5-1.12-2.5-2.5V8.5h-5V15c0 1.38-1.12 2.5-2.5 2.5S6 16.38 6 15V8.5H4V15c0 2.48 2.02 4.5 4.5 4.5 2.12 0 3.91-1.47 4.41-3.44.41 1.94 2.15 3.44 4.09 3.44 2.48 0 4.5-2.02 4.5-4.5V8.5h-2v6.5c0 1.38-1.12 2.5-2.5 2.5Z" />
  </svg>
);

const TestSpriteIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4">
    <defs>
      <linearGradient id="testsprite-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#34d399" />
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="9" stroke="url(#testsprite-grad)" strokeWidth="2" fill="none" />
    <path d="M8 12l3 3 5-5" stroke="url(#testsprite-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export const TAB_ICONS: Record<TabType, React.ComponentType<{ className?: string }>> = {
  profile: User,
  settings: Settings,
  notifications: Bell,
  data: Database,
  'cloud-providers': Cloud,
  github: Github,
  gitlab: () => <GitLabIcon />,
  supabase: Server,
  vercel: Rocket,
  netlify: Globe,
  neon: () => <NeonIcon />,
  insforge: () => <InsforgeIcon />,
  testsprite: () => <TestSpriteIcon />,
  mcp: Wrench,
};

export const TAB_LABELS: Record<TabType, string> = {
  profile: 'Profile',
  settings: 'Settings',
  notifications: 'Notifications',
  data: 'Data Management',
  'cloud-providers': 'Cloud Providers',
  github: 'GitHub',
  gitlab: 'GitLab',
  supabase: 'Supabase',
  vercel: 'Vercel',
  netlify: 'Netlify',
  neon: 'Neon',
  insforge: 'Insforge',
  testsprite: 'TestSprite',
  mcp: 'MCP Servers',
};

export const TAB_DESCRIPTIONS: Record<TabType, string> = {
  profile: 'Manage your profile and account settings',
  settings: 'Configure application preferences and appearance',
  notifications: 'View and manage your notifications',
  data: 'Manage your data and storage',
  'cloud-providers': 'Configure cloud AI providers and models',
  github: 'Connect and manage GitHub integration',
  gitlab: 'Connect and manage GitLab integration',
  supabase: 'Configure and manage Supabase integration',
  vercel: 'Connect and manage Vercel deployment',
  netlify: 'Connect and manage Netlify deployment',
  neon: 'Configure Neon Database - Serverless Postgres',
  insforge: 'Configure Insforge backend - DB, Auth, Deploy, and more',
  testsprite: 'AI-powered automated testing - test, diagnose, and auto-fix',
  mcp: 'Configure MCP (Model Context Protocol) servers',
};

export const DEFAULT_TAB_CONFIG = [
  { id: 'neon', visible: true, window: 'user' as const, order: 1 },
  { id: 'insforge', visible: true, window: 'user' as const, order: 2 },
  { id: 'testsprite', visible: true, window: 'user' as const, order: 3 },
  { id: 'data', visible: true, window: 'user' as const, order: 4 },
  { id: 'cloud-providers', visible: true, window: 'user' as const, order: 5 },
  { id: 'github', visible: true, window: 'user' as const, order: 6 },
  { id: 'gitlab', visible: true, window: 'user' as const, order: 7 },
  { id: 'supabase', visible: true, window: 'user' as const, order: 8 },
  { id: 'vercel', visible: true, window: 'user' as const, order: 9 },
  { id: 'netlify', visible: true, window: 'user' as const, order: 10 },
  { id: 'notifications', visible: true, window: 'user' as const, order: 11 },
  { id: 'mcp', visible: true, window: 'user' as const, order: 12 },
  { id: 'settings', visible: true, window: 'user' as const, order: 13 },
  { id: 'profile', visible: true, window: 'user' as const, order: 14 },
];
