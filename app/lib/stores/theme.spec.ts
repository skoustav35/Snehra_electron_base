/** @vitest-environment jsdom */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      media: '(prefers-color-scheme: dark)',
      dispatchEvent: vi.fn(),
    }));
  }
});

describe('theme store compatibility', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
  });

  it('toggles theme and persists legacy key', async () => {
    const themeModule = await import('./theme');

    themeModule.setTheme('light');
    themeModule.toggleTheme();

    expect(themeModule.themeStore.get()).toBe('dark');
    expect(localStorage.getItem('bolt_theme')).toBe('dark');
  });
});
