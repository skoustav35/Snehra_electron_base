import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { Switch } from '~/components/ui/Switch';
import { AppearanceStudioDialog } from '~/components/ui/AppearanceStudioDialog';
import type { UserProfile } from '~/components/@settings/core/types';
import {
  SettingsBadge,
  SettingsSection,
  settingsInputClassName,
  settingsSegmentedClassName,
  settingsSegmentOptionClassName,
  settingsSurfaceClassName,
} from '~/components/@settings/shared/components/SettingsSection';
import { isMac } from '~/utils/os';
import {
  getThemePresets,
  setThemeMode,
  setThemePreset,
  themeActiveSourceStore,
  themeModeStore,
  themePresetStore,
} from '~/lib/stores/appearance';

const getModifierSymbol = (modifier: string): string => {
  switch (modifier) {
    case 'meta':
      return isMac ? 'Cmd' : 'Win';
    case 'alt':
      return 'Alt';
    case 'shift':
      return 'Shift';
    default:
      return modifier;
  }
};

export default function SettingsTab() {
  const [currentTimezone, setCurrentTimezone] = useState('');
  const currentThemeMode = useStore(themeModeStore);
  const currentPreset = useStore(themePresetStore);
  const activeSource = useStore(themeActiveSourceStore);

  const [settings, setSettings] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('bolt_user_profile');

    return saved
      ? JSON.parse(saved)
      : {
          notifications: true,
          language: 'en',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
  });

  useEffect(() => {
    setCurrentTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  useEffect(() => {
    try {
      const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');
      const updatedProfile = {
        ...existingProfile,
        notifications: settings.notifications,
        language: settings.language,
        timezone: settings.timezone,
      };

      localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to update settings');
    }
  }, [settings]);

  const currentPresetMeta = getThemePresets().find((item) => item.id === currentPreset);

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
        <SettingsSection
          accent="neutral"
          className="p-5"
          title="Appearance Engine"
          description={`Active preset: ${currentPresetMeta?.label || currentPreset} (${activeSource})`}
          badge={<SettingsBadge>Theme Studio</SettingsBadge>}
          icon={<div className="i-ph:palette-fill h-4 w-4" />}
          headerAction={<AppearanceStudioDialog />}
          contentClassName="grid grid-cols-1 gap-4 md:grid-cols-2"
        >
          <div className={settingsSurfaceClassName + ' p-4'}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-bolt-elements-textTertiary">
              Mode
            </p>
            <div className={settingsSegmentedClassName}>
              {(['system', 'light', 'dark'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setThemeMode(mode)}
                  className={classNames(
                    settingsSegmentOptionClassName,
                    currentThemeMode === mode ? 'platinum-segmented__option--active' : undefined,
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className={settingsSurfaceClassName + ' p-4'}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-bolt-elements-textTertiary">
              Preset
            </p>
            <div className="grid grid-cols-2 gap-2">
              {getThemePresets().slice(0, 4).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setThemePreset(preset.id)}
                  className={classNames(
                    'platinum-subpanel min-h-[72px] px-3 py-3 text-left',
                    currentPreset === preset.id ? 'border-bolt-elements-borderColorActive bg-bolt-elements-item-backgroundAccent' : undefined,
                  )}
                >
                  <div className="text-sm font-semibold text-bolt-elements-textPrimary">{preset.label}</div>
                  <div className="mt-1 text-xs text-bolt-elements-textSecondary">{preset.description}</div>
                </button>
              ))}
            </div>
          </div>
        </SettingsSection>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.05 }}>
        <SettingsSection
          accent="neutral"
          className="p-5"
          title="Preferences"
          description="Personal defaults, language controls, and attention management."
          icon={<div className="i-ph:sliders-fill h-4 w-4" />}
        >
          <div className="space-y-3">
            <label className="block text-xs text-bolt-elements-textSecondary">
              Language
              <select
                value={settings.language}
                onChange={(event) => setSettings((prev) => ({ ...prev, language: event.target.value }))}
                className={classNames(settingsInputClassName, 'mt-1 appearance-none')}
              >
                <option value="en">English</option>
                <option value="es">Espanol</option>
                <option value="fr">Francais</option>
                <option value="de">Deutsch</option>
                <option value="it">Italiano</option>
                <option value="pt">Portugues</option>
                <option value="ja">Japanese</option>
              </select>
            </label>

            <label className="block text-xs text-bolt-elements-textSecondary">
              Timezone
              <select
                value={settings.timezone}
                onChange={(event) => setSettings((prev) => ({ ...prev, timezone: event.target.value }))}
                className={classNames(settingsInputClassName, 'mt-1 appearance-none')}
              >
                <option value={currentTimezone}>{currentTimezone}</option>
              </select>
            </label>

            <div className={classNames(settingsSurfaceClassName, 'flex items-center justify-between px-4 py-3')}>
              <div>
                <div className="text-sm text-bolt-elements-textPrimary">Notifications</div>
                <div className="text-xs text-bolt-elements-textSecondary">
                  {settings.notifications ? 'Enabled' : 'Disabled'}
                </div>
              </div>
              <Switch
                checked={settings.notifications}
                onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, notifications: checked }))}
              />
            </div>
          </div>
        </SettingsSection>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: 0.1 }}>
        <SettingsSection
          accent="neutral"
          className="p-5"
          title="Keyboard Shortcuts"
          description="Fast access to appearance controls without leaving the workspace."
          icon={<div className="i-ph:keyboard-fill h-4 w-4" />}
        >
          <div className={classNames(settingsSurfaceClassName, 'flex items-center justify-between gap-4 p-4')}>
            <div>
              <div className="text-sm text-bolt-elements-textPrimary">Toggle Theme Mode</div>
              <div className="text-xs text-bolt-elements-textSecondary">
                Switches between light and dark mode quickly
              </div>
            </div>
            <div className="flex items-center gap-1">
              {[getModifierSymbol('meta'), getModifierSymbol('alt'), getModifierSymbol('shift'), 'D'].map((label) => (
                <kbd key={label} className="platinum-chip px-2 py-1 text-xs text-bolt-elements-textPrimary">
                  {label}
                </kbd>
              ))}
            </div>
          </div>
        </SettingsSection>
      </motion.div>
    </div>
  );
}
