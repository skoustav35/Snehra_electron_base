import { useStore } from '@nanostores/react';
import { useMemo, useState } from 'react';
import type { CustomThemeConfig, ThemeMode } from '~/types/appearance';
import { motionLabels, paletteRoleLabels } from '~/types/appearance';
import {
  customThemeStore,
  getThemePresets,
  resetCustomThemeFromPreset,
  resolvedThemeStore,
  setThemeMode,
  setThemePreset,
  setThemeSource,
  themeActiveSourceStore,
  themeModeStore,
  themePresetStore,
  updateCustomTheme,
} from '~/lib/stores/appearance';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from './Dialog';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { classNames } from '~/utils/classNames';

function cloneTheme(theme: CustomThemeConfig): CustomThemeConfig {
  return {
    ...theme,
    palette: {
      light: { ...theme.palette.light },
      dark: { ...theme.palette.dark },
    },
    effects: { ...theme.effects },
    typography: { ...theme.typography },
  };
}

type ThemeDraftPatch = {
  name?: string;
  motionLevel?: CustomThemeConfig['motionLevel'];
  palette?: {
    light?: Partial<CustomThemeConfig['palette']['light']>;
    dark?: Partial<CustomThemeConfig['palette']['dark']>;
  };
  effects?: Partial<CustomThemeConfig['effects']>;
  typography?: Partial<CustomThemeConfig['typography']>;
};

export function AppearanceStudioDialog({ className }: { className?: string }) {
  const mode = useStore(themeModeStore);
  const preset = useStore(themePresetStore);
  const activeSource = useStore(themeActiveSourceStore);
  const customTheme = useStore(customThemeStore);
  const resolvedTheme = useStore(resolvedThemeStore);
  const presets = useMemo(() => getThemePresets(), []);

  const [open, setOpen] = useState(false);
  const [editingMode, setEditingMode] = useState<'light' | 'dark'>(resolvedTheme);
  const [draftCustom, setDraftCustom] = useState<CustomThemeConfig>(cloneTheme(customTheme));

  const onOpenChange = (next: boolean) => {
    setOpen(next);

    if (next) {
      setEditingMode(resolvedTheme);
      setDraftCustom(cloneTheme(customTheme));
    }
  };

  const updateDraft = (patch: ThemeDraftPatch) => {
    setDraftCustom((prev) => ({
      ...prev,
      ...patch,
      palette: {
        light: {
          ...prev.palette.light,
          ...patch.palette?.light,
        },
        dark: {
          ...prev.palette.dark,
          ...patch.palette?.dark,
        },
      },
      effects: {
        ...prev.effects,
        ...patch.effects,
      },
      typography: {
        ...prev.typography,
        ...patch.typography,
      },
    }));
  };

  const handleSave = () => {
    updateCustomTheme(draftCustom);
    setThemeSource('custom');
    setOpen(false);
  };

  return (
    <>
      <IconButton
        className={classNames('transition-all', className)}
        title="Appearance Studio"
        onClick={() => onOpenChange(true)}
      >
        <div className="i-ph:paint-brush-household text-xl" />
      </IconButton>

      <DialogRoot open={open} onOpenChange={onOpenChange}>
        <Dialog className="w-[960px] max-w-[95vw]">
          <div className="p-6 max-h-[88vh] overflow-auto">
            <div className="mb-5">
              <DialogTitle>Snehra Appearance Studio</DialogTitle>
              <DialogDescription>
                Configure platinum themes, custom palettes, typography, and motion for Snehra Codesmith.
              </DialogDescription>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                <h3 className="text-sm font-semibold text-bolt-elements-textPrimary mb-3">Mode and Presets</h3>
                <div className="flex items-center gap-2 mb-3">
                  {(['system', 'light', 'dark'] as ThemeMode[]).map((modeOption) => (
                    <button
                      key={modeOption}
                      type="button"
                      onClick={() => setThemeMode(modeOption)}
                      className={classNames(
                        'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                        mode === modeOption
                          ? 'bg-bolt-elements-item-backgroundAccent border-bolt-elements-borderColorActive text-bolt-elements-item-contentAccent'
                          : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                      )}
                    >
                      {modeOption}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {presets.map((presetItem) => (
                    <button
                      key={presetItem.id}
                      type="button"
                      onClick={() => {
                        setThemePreset(presetItem.id);
                        if (activeSource === 'custom') {
                          setThemeSource('preset');
                        }
                      }}
                      className={classNames(
                        'text-left rounded-lg border p-3 transition-all',
                        presetItem.id === preset
                          ? 'border-bolt-elements-borderColorActive bg-bolt-elements-item-backgroundAccent'
                          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3',
                      )}
                    >
                      <div className="text-sm font-semibold text-bolt-elements-textPrimary">{presetItem.label}</div>
                      <div className="text-xs text-bolt-elements-textSecondary mt-1">{presetItem.description}</div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4">
                <h3 className="text-sm font-semibold text-bolt-elements-textPrimary mb-3">Custom Theme Controls</h3>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setThemeSource('preset')}
                    className={classNames(
                      'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                      activeSource === 'preset'
                        ? 'bg-bolt-elements-item-backgroundAccent border-bolt-elements-borderColorActive text-bolt-elements-item-contentAccent'
                        : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor text-bolt-elements-textSecondary',
                    )}
                  >
                    Preset Source
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeSource('custom')}
                    className={classNames(
                      'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                      activeSource === 'custom'
                        ? 'bg-bolt-elements-item-backgroundAccent border-bolt-elements-borderColorActive text-bolt-elements-item-contentAccent'
                        : 'bg-bolt-elements-background-depth-1 border-bolt-elements-borderColor text-bolt-elements-textSecondary',
                    )}
                  >
                    Custom Source
                  </button>
                </div>
                <div className="space-y-3">
                  <label className="text-xs text-bolt-elements-textSecondary block">
                    Theme name
                    <input
                      value={draftCustom.name}
                      onChange={(event) => updateDraft({ name: event.target.value })}
                      className="mt-1 w-full rounded-md px-2.5 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-bolt-elements-textSecondary block">
                      Motion
                      <select
                        value={draftCustom.motionLevel}
                        onChange={(event) => updateDraft({ motionLevel: event.target.value as CustomThemeConfig['motionLevel'] })}
                        className="mt-1 w-full rounded-md px-2.5 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                      >
                        {Object.entries(motionLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-bolt-elements-textSecondary block">
                      Editing Mode
                      <select
                        value={editingMode}
                        onChange={(event) => setEditingMode(event.target.value as 'light' | 'dark')}
                        className="mt-1 w-full rounded-md px-2.5 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                      >
                        <option value="light">Light Palette</option>
                        <option value="dark">Dark Palette</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-bolt-elements-textSecondary block">
                      Radius
                      <input
                        type="range"
                        min={0.6}
                        max={1.6}
                        step={0.05}
                        value={draftCustom.effects.radiusScale}
                        onChange={(event) => updateDraft({ effects: { radiusScale: Number(event.target.value) } })}
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="text-xs text-bolt-elements-textSecondary block">
                      Glass
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={draftCustom.effects.glass}
                        onChange={(event) => updateDraft({ effects: { glass: Number(event.target.value) } })}
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="text-xs text-bolt-elements-textSecondary block">
                      Shadows
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={draftCustom.effects.shadowDepth}
                        onChange={(event) => updateDraft({ effects: { shadowDepth: Number(event.target.value) } })}
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="text-xs text-bolt-elements-textSecondary block">
                      Border Softness
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={draftCustom.effects.borderSoftness}
                        onChange={(event) => updateDraft({ effects: { borderSoftness: Number(event.target.value) } })}
                        className="mt-1 w-full"
                      />
                    </label>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 mt-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary mb-3">Typography</h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <label className="text-xs text-bolt-elements-textSecondary block">
                  Display Family
                  <input
                    value={draftCustom.typography.displayFamily}
                    onChange={(event) => updateDraft({ typography: { displayFamily: event.target.value } })}
                    className="mt-1 w-full rounded-md px-2.5 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                  />
                </label>
                <label className="text-xs text-bolt-elements-textSecondary block">
                  UI Family
                  <input
                    value={draftCustom.typography.uiFamily}
                    onChange={(event) => updateDraft({ typography: { uiFamily: event.target.value } })}
                    className="mt-1 w-full rounded-md px-2.5 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                  />
                </label>
                <label className="text-xs text-bolt-elements-textSecondary block">
                  Mono Family
                  <input
                    value={draftCustom.typography.monoFamily}
                    onChange={(event) => updateDraft({ typography: { monoFamily: event.target.value } })}
                    className="mt-1 w-full rounded-md px-2.5 py-2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 mt-4">
              <h3 className="text-sm font-semibold text-bolt-elements-textPrimary mb-3">Palette ({editingMode})</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {paletteRoleLabels.map((role) => (
                  <label key={role.key} className="text-xs text-bolt-elements-textSecondary block">
                    {role.label}
                    <div className="mt-1 flex items-center gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2.5 py-2">
                      <input
                        type="color"
                        value={draftCustom.palette[editingMode][role.key]}
                        onChange={(event) =>
                          updateDraft({
                            palette: {
                              [editingMode]: {
                                [role.key]: event.target.value,
                              },
                            },
                          })
                        }
                        className="h-7 w-7 rounded border-0 bg-transparent"
                      />
                      <span className="font-mono text-[11px] text-bolt-elements-textPrimary truncate">
                        {draftCustom.palette[editingMode][role.key]}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <div className="flex justify-between items-center mt-5">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const sourcePreset = getThemePresets().find((item) => item.id === preset);

                    if (sourcePreset) {
                      const resetTheme = cloneTheme({
                        name: `${sourcePreset.label} Custom`,
                        palette: {
                          light: { ...sourcePreset.palette.light },
                          dark: { ...sourcePreset.palette.dark },
                        },
                        effects: { ...sourcePreset.effects },
                        typography: { ...sourcePreset.typography },
                        motionLevel: sourcePreset.motionLevel,
                      });

                      setDraftCustom(resetTheme);
                      resetCustomThemeFromPreset(preset);
                    }
                  }}
                >
                Reset From Preset
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>Save Custom Theme</Button>
              </div>
            </div>
          </div>
        </Dialog>
      </DialogRoot>
    </>
  );
}
