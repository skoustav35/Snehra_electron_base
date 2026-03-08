export type ThemePresetId =
  | 'platinum-core'
  | 'arctic-alloy'
  | 'sapphire-forge'
  | 'emerald-circuit'
  | 'amber-flux'
  | 'rose-quantum'
  | 'obsidian-neon'
  | 'ivory-terminal';

export type ThemeMode = 'light' | 'dark' | 'system';

export type MotionLevel = 'low' | 'balanced' | 'high';

export interface ThemePalette {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceInteractive: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderActive: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  terminalBackground: string;
  terminalForeground: string;
}

export interface AppearanceEffects {
  glass: number;
  shadowDepth: number;
  grain: number;
  borderSoftness: number;
  radiusScale: number;
}

export interface AppearanceTypography {
  displayFamily: string;
  uiFamily: string;
  monoFamily: string;
  fontScale: number;
}

export interface CustomThemeConfig {
  name: string;
  palette: {
    light: ThemePalette;
    dark: ThemePalette;
  };
  effects: AppearanceEffects;
  typography: AppearanceTypography;
  motionLevel: MotionLevel;
}

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  description: string;
  palette: {
    light: ThemePalette;
    dark: ThemePalette;
  };
  effects: AppearanceEffects;
  typography: AppearanceTypography;
  motionLevel: MotionLevel;
}

export interface AppearanceState {
  mode: ThemeMode;
  resolvedMode: Exclude<ThemeMode, 'system'>;
  preset: ThemePresetId;
  activeSource: 'preset' | 'custom';
  custom: CustomThemeConfig;
}

export const paletteRoleLabels: Array<{ key: keyof ThemePalette; label: string }> = [
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'surfaceElevated', label: 'Surface Elevated' },
  { key: 'surfaceInteractive', label: 'Surface Interactive' },
  { key: 'textPrimary', label: 'Text Primary' },
  { key: 'textSecondary', label: 'Text Secondary' },
  { key: 'textTertiary', label: 'Text Tertiary' },
  { key: 'border', label: 'Border' },
  { key: 'borderActive', label: 'Border Active' },
  { key: 'accent', label: 'Accent' },
  { key: 'accentStrong', label: 'Accent Strong' },
  { key: 'accentSoft', label: 'Accent Soft' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'error', label: 'Error' },
  { key: 'info', label: 'Info' },
  { key: 'terminalBackground', label: 'Terminal Background' },
  { key: 'terminalForeground', label: 'Terminal Foreground' },
];

export const motionLabels: Record<MotionLevel, string> = {
  low: 'Low',
  balanced: 'Balanced',
  high: 'High',
};
