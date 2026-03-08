/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

async function loadAppearanceModule() {
  vi.resetModules();
  return import('./appearance');
}

function resetDomState() {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-theme-mode');
  document.documentElement.removeAttribute('data-snr-preset');
  document.documentElement.removeAttribute('data-snr-source');
  document.documentElement.removeAttribute('style');
}

describe('appearance store', () => {
  beforeEach(() => {
    resetDomState();
  });

  it('migrates legacy bolt_theme when new mode key is missing', async () => {
    localStorage.setItem('bolt_theme', 'dark');

    const appearance = await loadAppearanceModule();

    expect(appearance.appearanceStateStore.get().mode).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('applies selected preset to document attributes and css variables', async () => {
    const appearance = await loadAppearanceModule();

    appearance.setThemeMode('dark');
    appearance.setThemePreset('emerald-circuit');

    expect(document.documentElement.getAttribute('data-snr-preset')).toBe('emerald-circuit');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--snr-color-accent').trim().length).toBeGreaterThan(0);
  });

  it('validates and persists custom themes', async () => {
    const appearance = await loadAppearanceModule();
    const previous = appearance.customThemeStore.get();

    appearance.updateCustomTheme({
      ...previous,
      effects: {
        ...previous.effects,
        glass: 2,
      },
    } as any);

    expect(appearance.customThemeStore.get().effects.glass).toBe(previous.effects.glass);

    const validCustom = {
      ...previous,
      name: 'My Platinum Theme',
      effects: {
        ...previous.effects,
        glass: 0.72,
      },
    };

    appearance.updateCustomTheme(validCustom);

    const persisted = JSON.parse(localStorage.getItem(appearance.APPEARANCE_STORAGE_KEYS.custom) || '{}');
    expect(persisted.name).toBe('My Platinum Theme');
    expect(appearance.customThemeStore.get().effects.glass).toBe(0.72);
  });
});
