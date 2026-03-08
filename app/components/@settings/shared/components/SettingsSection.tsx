import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '~/utils/classNames';

export type SettingsAccent = 'neutral' | 'insforge' | 'neon';
export type SettingsBadgeTone = 'active' | 'warning' | 'success' | 'error';

export const settingsInputClassName = 'platinum-input';
export const settingsSurfaceClassName = 'platinum-subpanel';
export const settingsSegmentedClassName = 'platinum-segmented';
export const settingsSegmentOptionClassName = 'platinum-segmented__option';
export const settingsActionClassName = 'platinum-action';

interface SettingsPanelProps extends HTMLAttributes<HTMLDivElement> {
  accent?: SettingsAccent;
}

interface SettingsSectionProps extends SettingsPanelProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  headerAction?: ReactNode;
  contentClassName?: string;
}

interface SettingsBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  accent?: SettingsAccent;
  tone?: SettingsBadgeTone;
  dot?: ReactNode;
}

export function SettingsPanel({ accent = 'neutral', className, ...props }: SettingsPanelProps) {
  return <div className={classNames('platinum-panel', `platinum-panel--${accent}`, className)} {...props} />;
}

export function SettingsSection({
  accent = 'neutral',
  title,
  description,
  icon,
  badge,
  headerAction,
  className,
  contentClassName,
  children,
  ...props
}: SettingsSectionProps) {
  return (
    <SettingsPanel accent={accent} className={className} {...props}>
      <div className="platinum-section__header">
        <div className="min-w-0">
          <div className="platinum-section__eyebrow">
            {icon && <span className="platinum-section__icon">{icon}</span>}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="platinum-section__title">{title}</h3>
                {badge}
              </div>
              {description && <p className="platinum-section__description mt-1">{description}</p>}
            </div>
          </div>
        </div>
        {headerAction}
      </div>

      <div className={contentClassName}>{children}</div>
    </SettingsPanel>
  );
}

export function SettingsBadge({
  accent,
  tone = 'active',
  className,
  dot,
  children,
  ...props
}: SettingsBadgeProps) {
  const accentClass =
    accent === 'insforge' ? 'platinum-chip--insforge' : accent === 'neon' ? 'platinum-chip--neon' : undefined;

  return (
    <span
      className={classNames(
        'platinum-badge',
        tone === 'active' ? 'platinum-badge--active' : `platinum-badge--${tone}`,
        tone === 'active' ? accentClass : undefined,
        className,
      )}
      {...props}
    >
      {dot}
      {children}
    </span>
  );
}

export function getAccentLinkClassName(accent: SettingsAccent = 'neutral') {
  return classNames(
    'platinum-link',
    accent === 'insforge' ? 'platinum-link--insforge' : undefined,
    accent === 'neon' ? 'platinum-link--neon' : undefined,
  );
}

export function getAccentButtonClassName(accent: SettingsAccent = 'neutral', variant: 'default' | 'primary' = 'default') {
  return classNames(
    settingsActionClassName,
    variant === 'primary' ? 'platinum-action--primary' : undefined,
    accent === 'insforge' ? 'platinum-panel--insforge' : accent === 'neon' ? 'platinum-panel--neon' : 'platinum-panel--neutral',
  );
}
