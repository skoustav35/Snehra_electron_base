import { atom, computed } from 'nanostores';
import { z } from 'zod';
import type {
  AppearanceEffects,
  AppearanceState,
  AppearanceTypography,
  CustomThemeConfig,
  MotionLevel,
  ThemeMode,
  ThemePalette,
  ThemePreset,
  ThemePresetId,
} from '~/types/appearance';

export const APPEARANCE_STORAGE_KEYS = {
  mode: 'snehra_theme_mode',
  preset: 'snehra_theme_preset',
  custom: 'snehra_theme_custom',
  activeSource: 'snehra_theme_active_source',
} as const;

const BOLT_THEME_KEY = 'bolt_theme';

const isBrowser = typeof window !== 'undefined';

const themePaletteSchema: z.ZodType<ThemePalette> = z.object({
  background: z.string(),
  surface: z.string(),
  surfaceElevated: z.string(),
  surfaceInteractive: z.string(),
  textPrimary: z.string(),
  textSecondary: z.string(),
  textTertiary: z.string(),
  border: z.string(),
  borderActive: z.string(),
  accent: z.string(),
  accentStrong: z.string(),
  accentSoft: z.string(),
  success: z.string(),
  warning: z.string(),
  error: z.string(),
  info: z.string(),
  terminalBackground: z.string(),
  terminalForeground: z.string(),
});

const effectsSchema: z.ZodType<AppearanceEffects> = z.object({
  glass: z.number().min(0).max(1),
  shadowDepth: z.number().min(0).max(1),
  grain: z.number().min(0).max(1),
  borderSoftness: z.number().min(0).max(1),
  radiusScale: z.number().min(0.6).max(1.6),
});

const typographySchema: z.ZodType<AppearanceTypography> = z.object({
  displayFamily: z.string().min(1),
  uiFamily: z.string().min(1),
  monoFamily: z.string().min(1),
  fontScale: z.number().min(0.9).max(1.2),
});

const motionSchema = z.enum(['low', 'balanced', 'high']);

const customThemeSchema: z.ZodType<CustomThemeConfig> = z.object({
  name: z.string().min(1),
  palette: z.object({
    light: themePaletteSchema,
    dark: themePaletteSchema,
  }),
  effects: effectsSchema,
  typography: typographySchema,
  motionLevel: motionSchema,
});

const modeSchema = z.enum(['light', 'dark', 'system']);
const sourceSchema = z.enum(['preset', 'custom']);

const baseTypography: AppearanceTypography = {
  displayFamily: 'Sora, "Segoe UI", sans-serif',
  uiFamily: '"Plus Jakarta Sans", "Segoe UI", sans-serif',
  monoFamily: '"JetBrains Mono", "Cascadia Code", monospace',
  fontScale: 1,
};

const baseEffects: AppearanceEffects = {
  glass: 0.4,
  shadowDepth: 0.55,
  grain: 0.1,
  borderSoftness: 0.6,
  radiusScale: 1,
};

function createPreset(
  id: ThemePresetId,
  label: string,
  description: string,
  light: ThemePalette,
  dark: ThemePalette,
  options?: Partial<Pick<ThemePreset, 'motionLevel' | 'effects' | 'typography'>>,
): ThemePreset {
  return {
    id,
    label,
    description,
    palette: { light, dark },
    motionLevel: options?.motionLevel ?? 'balanced',
    effects: options?.effects ?? baseEffects,
    typography: options?.typography ?? baseTypography,
  };
}

const PRESET_LIST: ThemePreset[] = [
  createPreset(
    'platinum-core',
    'Platinum Core',
    'Graphite and platinum with cool cyan highlights.',
    {
      background: '#F7F8FA',
      surface: '#FFFFFF',
      surfaceElevated: '#F0F3F7',
      surfaceInteractive: '#E8EDF3',
      textPrimary: '#121723',
      textSecondary: '#4C5872',
      textTertiary: '#6B7690',
      border: '#CFD7E6',
      borderActive: '#19A0FF',
      accent: '#1294F2',
      accentStrong: '#0A71C1',
      accentSoft: '#D8EEFF',
      success: '#0F9F6E',
      warning: '#CC8500',
      error: '#CF3052',
      info: '#2676D5',
      terminalBackground: '#F1F4FA',
      terminalForeground: '#1F2B3D',
    },
    {
      background: '#0D111B',
      surface: '#121826',
      surfaceElevated: '#1A2235',
      surfaceInteractive: '#232E46',
      textPrimary: '#F6F8FC',
      textSecondary: '#ADB9D4',
      textTertiary: '#8090B3',
      border: '#2A3652',
      borderActive: '#38B4FF',
      accent: '#38B4FF',
      accentStrong: '#74C9FF',
      accentSoft: '#1B3954',
      success: '#2FD49A',
      warning: '#F8B347',
      error: '#FF6C8E',
      info: '#7AA8FF',
      terminalBackground: '#0B1322',
      terminalForeground: '#E2E8F4',
    },
  ),
  createPreset(
    'arctic-alloy',
    'Arctic Alloy',
    'Steel neutrals with icy blue accents.',
    {
      background: '#F4F8FB',
      surface: '#FFFFFF',
      surfaceElevated: '#EBF2F8',
      surfaceInteractive: '#DFEAF4',
      textPrimary: '#0E1D2D',
      textSecondary: '#3F556D',
      textTertiary: '#667B90',
      border: '#C8D7E6',
      borderActive: '#33A7FF',
      accent: '#168FE2',
      accentStrong: '#086FB8',
      accentSoft: '#D7EEFF',
      success: '#149571',
      warning: '#C68900',
      error: '#C73E52',
      info: '#2E73C7',
      terminalBackground: '#EDF4FD',
      terminalForeground: '#1A2E45',
    },
    {
      background: '#081019',
      surface: '#0F1926',
      surfaceElevated: '#172535',
      surfaceInteractive: '#21354A',
      textPrimary: '#F2F8FF',
      textSecondary: '#9FB6CB',
      textTertiary: '#7490A8',
      border: '#274058',
      borderActive: '#52BAFF',
      accent: '#43ABF1',
      accentStrong: '#7FD0FF',
      accentSoft: '#173549',
      success: '#28CC97',
      warning: '#F2B34A',
      error: '#F17689',
      info: '#82B8FF',
      terminalBackground: '#081422',
      terminalForeground: '#DDEBFA',
    },
  ),
  createPreset(
    'sapphire-forge',
    'Sapphire Forge',
    'Bold cobalt workspace with metallic depth.',
    {
      background: '#F4F6FE',
      surface: '#FFFFFF',
      surfaceElevated: '#ECF0FD',
      surfaceInteractive: '#E0E7FB',
      textPrimary: '#131B39',
      textSecondary: '#445083',
      textTertiary: '#6170A7',
      border: '#CAD2F2',
      borderActive: '#4D74FF',
      accent: '#3F66F0',
      accentStrong: '#1A45DC',
      accentSoft: '#DCE5FF',
      success: '#09966D',
      warning: '#C47E00',
      error: '#C93862',
      info: '#2651DA',
      terminalBackground: '#EFF2FF',
      terminalForeground: '#232C57',
    },
    {
      background: '#0B1124',
      surface: '#101933',
      surfaceElevated: '#162346',
      surfaceInteractive: '#1F2F5D',
      textPrimary: '#F3F6FF',
      textSecondary: '#ACBAE9',
      textTertiary: '#7F93CF',
      border: '#2B3D75',
      borderActive: '#6993FF',
      accent: '#678FFF',
      accentStrong: '#8FAEFF',
      accentSoft: '#1D2D5B',
      success: '#2FD2A2',
      warning: '#F7BB59',
      error: '#FF7399',
      info: '#87A3FF',
      terminalBackground: '#0C1530',
      terminalForeground: '#E2E9FF',
    },
  ),
  createPreset(
    'emerald-circuit',
    'Emerald Circuit',
    'Fresh emerald signal with dark circuit boards.',
    {
      background: '#F4FBF8',
      surface: '#FFFFFF',
      surfaceElevated: '#EAF7F1',
      surfaceInteractive: '#DFF1E8',
      textPrimary: '#10261E',
      textSecondary: '#345A4D',
      textTertiary: '#567A6F',
      border: '#C7E0D4',
      borderActive: '#2FB487',
      accent: '#1A9C72',
      accentStrong: '#0D7A59',
      accentSoft: '#D8F4E8',
      success: '#129D70',
      warning: '#AF8300',
      error: '#C9445E',
      info: '#2D7CBE',
      terminalBackground: '#EDF9F3',
      terminalForeground: '#1F3B30',
    },
    {
      background: '#071610',
      surface: '#0D2219',
      surfaceElevated: '#133027',
      surfaceInteractive: '#1C4034',
      textPrimary: '#EBFFF5',
      textSecondary: '#9CCFBA',
      textTertiary: '#76A792',
      border: '#295342',
      borderActive: '#43D5A0',
      accent: '#33C68F',
      accentStrong: '#5DDEAF',
      accentSoft: '#174734',
      success: '#4BDAA7',
      warning: '#E7B45A',
      error: '#F27A9A',
      info: '#78B8F5',
      terminalBackground: '#081B13',
      terminalForeground: '#DDF5E9',
    },
  ),
  createPreset(
    'amber-flux',
    'Amber Flux',
    'Warm amber highlights over modern slate.',
    {
      background: '#F9F6F1',
      surface: '#FFFFFF',
      surfaceElevated: '#F4EFE5',
      surfaceInteractive: '#ECE4D8',
      textPrimary: '#23180E',
      textSecondary: '#5F4A33',
      textTertiary: '#82684A',
      border: '#DECDB7',
      borderActive: '#DA9300',
      accent: '#BD7800',
      accentStrong: '#9C5E00',
      accentSoft: '#F9EBCF',
      success: '#1C9667',
      warning: '#B67300',
      error: '#BE4155',
      info: '#2B68BF',
      terminalBackground: '#F5EFE3',
      terminalForeground: '#3A2817',
    },
    {
      background: '#15110A',
      surface: '#21180E',
      surfaceElevated: '#2C2115',
      surfaceInteractive: '#3B2A19',
      textPrimary: '#FFF5E6',
      textSecondary: '#D0B48C',
      textTertiary: '#AB8A60',
      border: '#5A4026',
      borderActive: '#F6A11D',
      accent: '#F2A72E',
      accentStrong: '#F8BC58',
      accentSoft: '#4B341D',
      success: '#39C896',
      warning: '#F4BA54',
      error: '#F07A8A',
      info: '#83B0F8',
      terminalBackground: '#161007',
      terminalForeground: '#F4E2CA',
    },
  ),
  createPreset(
    'rose-quantum',
    'Rose Quantum',
    'Rose and fuchsia accents with deep slate contrast.',
    {
      background: '#FBF4F8',
      surface: '#FFFFFF',
      surfaceElevated: '#F7EAF2',
      surfaceInteractive: '#F0DCE9',
      textPrimary: '#2A1121',
      textSecondary: '#704363',
      textTertiary: '#966784',
      border: '#E5C8DA',
      borderActive: '#E04E9E',
      accent: '#CC3E8B',
      accentStrong: '#A52D70',
      accentSoft: '#FBD8EB',
      success: '#1C9867',
      warning: '#C28000',
      error: '#C93C5D',
      info: '#315DCC',
      terminalBackground: '#F8EAF4',
      terminalForeground: '#4A1D3A',
    },
    {
      background: '#170B15',
      surface: '#211021',
      surfaceElevated: '#2E1630',
      surfaceInteractive: '#3F1D42',
      textPrimary: '#FFEFF9',
      textSecondary: '#D2A8C5',
      textTertiary: '#B57FA4',
      border: '#623368',
      borderActive: '#FF66B7',
      accent: '#F75CAF',
      accentStrong: '#FF8BC8',
      accentSoft: '#532448',
      success: '#39CD99',
      warning: '#F6BE58',
      error: '#FF7F9D',
      info: '#8BA8FF',
      terminalBackground: '#170A13',
      terminalForeground: '#F3D9E9',
    },
  ),
  createPreset(
    'obsidian-neon',
    'Obsidian Neon',
    'High contrast obsidian with electric neon accents.',
    {
      background: '#EEF2F4',
      surface: '#FFFFFF',
      surfaceElevated: '#E3EBEF',
      surfaceInteractive: '#D8E2E8',
      textPrimary: '#121A22',
      textSecondary: '#41576C',
      textTertiary: '#627991',
      border: '#BFD0DB',
      borderActive: '#00B8C8',
      accent: '#0A9BAA',
      accentStrong: '#007A87',
      accentSoft: '#CCF2F5',
      success: '#119A73',
      warning: '#B38409',
      error: '#BF4561',
      info: '#2776C8',
      terminalBackground: '#E6EDF1',
      terminalForeground: '#213646',
    },
    {
      background: '#050A0F',
      surface: '#0B131B',
      surfaceElevated: '#101D2A',
      surfaceInteractive: '#17283A',
      textPrimary: '#EBF7FF',
      textSecondary: '#95B8CF',
      textTertiary: '#6D91A8',
      border: '#24435A',
      borderActive: '#00D8F5',
      accent: '#00C9E5',
      accentStrong: '#54ECFF',
      accentSoft: '#103A4D',
      success: '#2FD5A5',
      warning: '#E7B95D',
      error: '#EE8399',
      info: '#7EBCFF',
      terminalBackground: '#040D14',
      terminalForeground: '#D6EEFF',
    },
    {
      motionLevel: 'high',
      effects: {
        ...baseEffects,
        glass: 0.55,
        shadowDepth: 0.7,
      },
    },
  ),
  createPreset(
    'ivory-terminal',
    'Ivory Terminal',
    'Paper-light coding aesthetic with terminal heritage.',
    {
      background: '#FFFDF8',
      surface: '#FFFFFF',
      surfaceElevated: '#F8F4E9',
      surfaceInteractive: '#F0EBDD',
      textPrimary: '#1E1A13',
      textSecondary: '#5B5241',
      textTertiary: '#7A715F',
      border: '#DED5C3',
      borderActive: '#7F63FF',
      accent: '#6552D9',
      accentStrong: '#4E3FB1',
      accentSoft: '#E8E2FF',
      success: '#148B66',
      warning: '#A37A05',
      error: '#B94A4F',
      info: '#3B63C2',
      terminalBackground: '#F6F1E6',
      terminalForeground: '#2E271D',
    },
    {
      background: '#14110A',
      surface: '#1C170F',
      surfaceElevated: '#272013',
      surfaceInteractive: '#362C19',
      textPrimary: '#F6EFDE',
      textSecondary: '#BEAE8E',
      textTertiary: '#998669',
      border: '#4C3E26',
      borderActive: '#9C85FF',
      accent: '#8D77FF',
      accentStrong: '#B2A1FF',
      accentSoft: '#3A2F66',
      success: '#3CCEA0',
      warning: '#E5B45A',
      error: '#E07A88',
      info: '#8FB2FF',
      terminalBackground: '#161109',
      terminalForeground: '#E8DAC0',
    },
  ),
];

export const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = PRESET_LIST.reduce(
  (acc, preset) => {
    acc[preset.id] = preset;
    return acc;
  },
  {} as Record<ThemePresetId, ThemePreset>,
);

export const THEME_PRESET_ORDER = PRESET_LIST.map((preset) => preset.id);

export const DEFAULT_THEME_PRESET: ThemePresetId = 'platinum-core';

function resolveSystemMode(): 'light' | 'dark' {
  if (!isBrowser) {
    return 'light';
  }

  if (typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? resolveSystemMode() : mode;
}

function clonePresetToCustom(preset: ThemePreset): CustomThemeConfig {
  return {
    name: `${preset.label} Custom`,
    palette: {
      light: { ...preset.palette.light },
      dark: { ...preset.palette.dark },
    },
    effects: { ...preset.effects },
    typography: { ...preset.typography },
    motionLevel: preset.motionLevel,
  };
}

const defaultCustomTheme = clonePresetToCustom(THEME_PRESETS[DEFAULT_THEME_PRESET]);

function readModeFromStorage(): ThemeMode {
  if (!isBrowser) {
    return 'light';
  }

  const storedMode = localStorage.getItem(APPEARANCE_STORAGE_KEYS.mode);
  const parsedMode = modeSchema.safeParse(storedMode);

  if (parsedMode.success) {
    return parsedMode.data;
  }

  const legacyBoltTheme = localStorage.getItem(BOLT_THEME_KEY);

  if (legacyBoltTheme === 'light' || legacyBoltTheme === 'dark') {
    return legacyBoltTheme;
  }

  return 'system';
}

function readPresetFromStorage(): ThemePresetId {
  if (!isBrowser) {
    return DEFAULT_THEME_PRESET;
  }

  const storedPreset = localStorage.getItem(APPEARANCE_STORAGE_KEYS.preset);

  if (storedPreset && storedPreset in THEME_PRESETS) {
    return storedPreset as ThemePresetId;
  }

  return DEFAULT_THEME_PRESET;
}

function readActiveSourceFromStorage(): 'preset' | 'custom' {
  if (!isBrowser) {
    return 'preset';
  }

  const storedSource = localStorage.getItem(APPEARANCE_STORAGE_KEYS.activeSource);
  const parsedSource = sourceSchema.safeParse(storedSource);

  return parsedSource.success ? parsedSource.data : 'preset';
}

function readCustomThemeFromStorage(): CustomThemeConfig {
  if (!isBrowser) {
    return defaultCustomTheme;
  }

  const storedCustom = localStorage.getItem(APPEARANCE_STORAGE_KEYS.custom);

  if (!storedCustom) {
    return defaultCustomTheme;
  }

  try {
    const parsedCustom = customThemeSchema.safeParse(JSON.parse(storedCustom));
    return parsedCustom.success ? parsedCustom.data : defaultCustomTheme;
  } catch {
    return defaultCustomTheme;
  }
}

function getInitialAppearanceState(): AppearanceState {
  const mode = readModeFromStorage();
  const preset = readPresetFromStorage();
  const activeSource = readActiveSourceFromStorage();
  const custom = readCustomThemeFromStorage();

  return {
    mode,
    preset,
    activeSource,
    custom,
    resolvedMode: resolveMode(mode),
  };
}

function persistAppearanceState(state: AppearanceState) {
  if (!isBrowser) {
    return;
  }

  localStorage.setItem(APPEARANCE_STORAGE_KEYS.mode, state.mode);
  localStorage.setItem(APPEARANCE_STORAGE_KEYS.preset, state.preset);
  localStorage.setItem(APPEARANCE_STORAGE_KEYS.activeSource, state.activeSource);
  localStorage.setItem(APPEARANCE_STORAGE_KEYS.custom, JSON.stringify(state.custom));
}

function getActiveThemeConfig(state: AppearanceState): Pick<ThemePreset, 'palette' | 'effects' | 'typography' | 'motionLevel'> | CustomThemeConfig {
  if (state.activeSource === 'custom') {
    return state.custom;
  }

  return THEME_PRESETS[state.preset];
}

function motionLevelToDurationScale(level: MotionLevel): number {
  if (level === 'low') {
    return 0.75;
  }

  if (level === 'high') {
    return 1.2;
  }

  return 1;
}

function applyAppearanceToDom(state: AppearanceState) {
  if (!isBrowser) {
    return;
  }

  const root = document.documentElement;
  const activeTheme = getActiveThemeConfig(state);
  const palette = activeTheme.palette[state.resolvedMode];
  const durationScale = motionLevelToDurationScale(activeTheme.motionLevel);

  root.setAttribute('data-theme', state.resolvedMode);
  root.setAttribute('data-theme-mode', state.mode);
  root.setAttribute('data-snr-preset', state.preset);
  root.setAttribute('data-snr-source', state.activeSource);

  root.style.setProperty('--snr-color-bg', palette.background);
  root.style.setProperty('--snr-color-surface', palette.surface);
  root.style.setProperty('--snr-color-surface-elevated', palette.surfaceElevated);
  root.style.setProperty('--snr-color-surface-interactive', palette.surfaceInteractive);
  root.style.setProperty('--snr-color-text-primary', palette.textPrimary);
  root.style.setProperty('--snr-color-text-secondary', palette.textSecondary);
  root.style.setProperty('--snr-color-text-tertiary', palette.textTertiary);
  root.style.setProperty('--snr-color-border', palette.border);
  root.style.setProperty('--snr-color-border-active', palette.borderActive);
  root.style.setProperty('--snr-color-accent', palette.accent);
  root.style.setProperty('--snr-color-accent-strong', palette.accentStrong);
  root.style.setProperty('--snr-color-accent-soft', palette.accentSoft);
  root.style.setProperty('--snr-color-success', palette.success);
  root.style.setProperty('--snr-color-warning', palette.warning);
  root.style.setProperty('--snr-color-error', palette.error);
  root.style.setProperty('--snr-color-info', palette.info);
  root.style.setProperty('--snr-color-terminal-bg', palette.terminalBackground);
  root.style.setProperty('--snr-color-terminal-fg', palette.terminalForeground);

  root.style.setProperty('--snr-effect-glass', String(activeTheme.effects.glass));
  root.style.setProperty('--snr-effect-shadow-depth', String(activeTheme.effects.shadowDepth));
  root.style.setProperty('--snr-effect-grain', String(activeTheme.effects.grain));
  root.style.setProperty('--snr-effect-border-softness', String(activeTheme.effects.borderSoftness));
  root.style.setProperty('--snr-radius-scale', String(activeTheme.effects.radiusScale));

  root.style.setProperty('--snr-font-display', activeTheme.typography.displayFamily);
  root.style.setProperty('--snr-font-ui', activeTheme.typography.uiFamily);
  root.style.setProperty('--snr-font-mono', activeTheme.typography.monoFamily);
  root.style.setProperty('--snr-font-scale', String(activeTheme.typography.fontScale));

  root.style.setProperty('--snr-motion-duration-scale', String(durationScale));
}

function updateAppearanceState(mutator: (state: AppearanceState) => AppearanceState) {
  const current = appearanceStateStore.get();
  const next = mutator(current);

  appearanceStateStore.set(next);
  persistAppearanceState(next);
  applyAppearanceToDom(next);
}

export const appearanceStateStore = atom<AppearanceState>(getInitialAppearanceState());

export const resolvedThemeStore = computed(appearanceStateStore, (state) => state.resolvedMode);
export const themeModeStore = computed(appearanceStateStore, (state) => state.mode);
export const themePresetStore = computed(appearanceStateStore, (state) => state.preset);
export const themeActiveSourceStore = computed(appearanceStateStore, (state) => state.activeSource);
export const customThemeStore = computed(appearanceStateStore, (state) => state.custom);

export function initializeAppearance() {
  const current = appearanceStateStore.get();
  const normalized = { ...current, resolvedMode: resolveMode(current.mode) };
  appearanceStateStore.set(normalized);
  applyAppearanceToDom(normalized);
  persistAppearanceState(normalized);
}

export function setThemeMode(mode: ThemeMode) {
  updateAppearanceState((state) => ({
    ...state,
    mode,
    resolvedMode: resolveMode(mode),
  }));
}

export function setThemePreset(preset: ThemePresetId) {
  updateAppearanceState((state) => {
    const nextPreset = THEME_PRESETS[preset] ? preset : DEFAULT_THEME_PRESET;

    return {
      ...state,
      preset: nextPreset,
      custom: state.activeSource === 'custom' ? state.custom : clonePresetToCustom(THEME_PRESETS[nextPreset]),
    };
  });
}

export function cycleThemePreset() {
  const state = appearanceStateStore.get();
  const currentIndex = THEME_PRESET_ORDER.indexOf(state.preset);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % THEME_PRESET_ORDER.length;
  setThemePreset(THEME_PRESET_ORDER[nextIndex]);
}

export function setThemeSource(source: 'preset' | 'custom') {
  updateAppearanceState((state) => ({
    ...state,
    activeSource: source,
  }));
}

export function updateCustomTheme(nextCustom: CustomThemeConfig) {
  const validated = customThemeSchema.safeParse(nextCustom);

  if (!validated.success) {
    return;
  }

  updateAppearanceState((state) => ({
    ...state,
    custom: validated.data,
    activeSource: 'custom',
  }));
}

export function patchCustomTheme(patch: Partial<CustomThemeConfig>) {
  const state = appearanceStateStore.get();
  const merged: CustomThemeConfig = {
    ...state.custom,
    ...patch,
    palette: {
      light: {
        ...state.custom.palette.light,
        ...patch.palette?.light,
      },
      dark: {
        ...state.custom.palette.dark,
        ...patch.palette?.dark,
      },
    },
    effects: {
      ...state.custom.effects,
      ...patch.effects,
    },
    typography: {
      ...state.custom.typography,
      ...patch.typography,
    },
  };

  updateCustomTheme(merged);
}

export function resetCustomThemeFromPreset(presetId?: ThemePresetId) {
  updateAppearanceState((state) => {
    const sourcePreset = presetId ? THEME_PRESETS[presetId] : THEME_PRESETS[state.preset];

    return {
      ...state,
      custom: clonePresetToCustom(sourcePreset),
      activeSource: 'custom',
    };
  });
}

export function toggleThemeMode() {
  const current = appearanceStateStore.get();
  const resolved = current.resolvedMode;
  const nextResolved = resolved === 'dark' ? 'light' : 'dark';

  setThemeMode(nextResolved);
}

export function themeIsDark() {
  return appearanceStateStore.get().resolvedMode === 'dark';
}

export function getThemePresets(): ThemePreset[] {
  return PRESET_LIST;
}

if (isBrowser) {
  initializeAppearance();

  if (typeof window.matchMedia !== 'function') {
    // Browsers without matchMedia support still use persisted explicit mode.
    // No system listener is attached in this case.
  } else {
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      const current = appearanceStateStore.get();

      if (current.mode === 'system') {
        updateAppearanceState((state) => ({
          ...state,
          resolvedMode: resolveMode(state.mode),
        }));
      }
    };

    if (typeof matcher.addEventListener === 'function') {
      matcher.addEventListener('change', handleSystemThemeChange);
    } else {
      matcher.addListener(handleSystemThemeChange);
    }
  }
}
