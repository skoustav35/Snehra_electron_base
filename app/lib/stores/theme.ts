import { computed } from 'nanostores';
import {
  appearanceStateStore,
  initializeAppearance,
  setThemeMode,
  toggleThemeMode,
  themeIsDark as appearanceThemeIsDark,
} from './appearance';
import { logStore } from './logs';

export type Theme = 'dark' | 'light';

// Legacy storage key kept for compatibility and migration.
export const kTheme = 'bolt_theme';

export const DEFAULT_THEME: Theme = 'light';

export const themeStore = computed(appearanceStateStore, (state) => state.resolvedMode);

initializeAppearance();

export function themeIsDark() {
  return appearanceThemeIsDark();
}

export function toggleTheme() {
  toggleThemeMode();
  const currentTheme = themeStore.get();

  try {
    localStorage.setItem(kTheme, currentTheme);

    const userProfile = localStorage.getItem('bolt_user_profile');

    if (userProfile) {
      const profile = JSON.parse(userProfile);
      profile.theme = currentTheme;
      localStorage.setItem('bolt_user_profile', JSON.stringify(profile));
    }
  } catch {
    // Ignore localStorage exceptions in restricted environments.
  }

  logStore.logSystem(`Theme changed to ${currentTheme} mode`);
}

export function setTheme(theme: Theme) {
  setThemeMode(theme);
}
