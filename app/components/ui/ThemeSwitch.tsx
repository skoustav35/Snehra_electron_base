import { useStore } from '@nanostores/react';
import { memo, useEffect, useState } from 'react';
import { toggleTheme } from '~/lib/stores/theme';
import {
  getThemePresets,
  setThemeMode,
  setThemePreset,
  setThemeSource,
  resolvedThemeStore,
  themeActiveSourceStore,
  themeModeStore,
  themePresetStore,
} from '~/lib/stores/appearance';
import { classNames } from '~/utils/classNames';
import { AppearanceStudioDialog } from './AppearanceStudioDialog';
import { Dropdown, DropdownItem, DropdownSeparator } from './Dropdown';
import { IconButton } from './IconButton';

interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch = memo(({ className }: ThemeSwitchProps) => {
  const resolvedTheme = useStore(resolvedThemeStore);
  const themeMode = useStore(themeModeStore);
  const currentPreset = useStore(themePresetStore);
  const activeSource = useStore(themeActiveSourceStore);
  const [domLoaded, setDomLoaded] = useState(false);

  const presets = getThemePresets();

  useEffect(() => {
    setDomLoaded(true);
  }, []);

  if (!domLoaded) {
    return null;
  }

  return (
    <div className={classNames('flex items-center gap-1', className)}>
      <IconButton
        icon={resolvedTheme === 'dark' ? 'i-ph:sun-dim-duotone' : 'i-ph:moon-stars-duotone'}
        size="xl"
        title="Toggle light/dark"
        onClick={toggleTheme}
      />
      <Dropdown
        trigger={
          <IconButton icon="i-ph:caret-down" size="md" title="Theme presets" className="px-1.5 py-2 rounded-md" />
        }
      >
        <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-bolt-elements-textTertiary">Mode</div>
        {(['system', 'light', 'dark'] as const).map((mode) => (
          <DropdownItem key={mode} onSelect={() => setThemeMode(mode)}>
            <div className="flex items-center justify-between w-full gap-3">
              <span className="capitalize">{mode}</span>
              {themeMode === mode ? <span className="i-ph:check text-bolt-elements-item-contentAccent" /> : null}
            </div>
          </DropdownItem>
        ))}

        <DropdownSeparator />
        <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-bolt-elements-textTertiary">Preset</div>

        {presets.map((preset) => (
          <DropdownItem key={preset.id} onSelect={() => setThemePreset(preset.id)}>
            <div className="flex items-center justify-between w-full gap-3">
              <span>{preset.label}</span>
              {currentPreset === preset.id ? <span className="i-ph:check text-bolt-elements-item-contentAccent" /> : null}
            </div>
          </DropdownItem>
        ))}

        <DropdownSeparator />
        <DropdownItem onSelect={() => setThemeSource(activeSource === 'preset' ? 'custom' : 'preset')}>
          <div className="flex items-center justify-between w-full gap-3">
            <span>Source: {activeSource}</span>
            <span className="i-ph:swap" />
          </div>
        </DropdownItem>
      </Dropdown>
      <AppearanceStudioDialog className="ml-0.5" />
    </div>
  );
});
