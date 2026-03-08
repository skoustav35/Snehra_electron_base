import { classNames } from '~/utils/classNames';

interface BrandLockupProps {
  compact?: boolean;
  className?: string;
}

export function BrandLockup({ compact = false, className }: BrandLockupProps) {
  return (
    <div className={classNames('inline-flex items-center gap-2.5', className)}>
      <div
        aria-hidden="true"
        className="relative w-8 h-8 rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 overflow-hidden"
      >
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <defs>
            <linearGradient id="snr-monogram-gradient" x1="10%" y1="5%" x2="95%" y2="95%">
              <stop offset="0%" stopColor="var(--snr-color-accent-strong)" />
              <stop offset="55%" stopColor="var(--snr-color-accent)" />
              <stop offset="100%" stopColor="var(--snr-color-info)" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="64" height="64" fill="var(--bolt-elements-bg-depth-2)" />
          <path d="M17 45V18h13c7 0 11 3 11 8 0 3-2 5-4 6 3 1 6 3 6 7 0 6-5 9-12 9H17zm8-17h5c2 0 3-1 3-2s-1-2-3-2h-5v4zm0 11h6c3 0 4-1 4-3 0-2-1-3-4-3h-6v6z" fill="url(#snr-monogram-gradient)" />
          <path d="M45 19l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" fill="url(#snr-monogram-gradient)" opacity="0.9" />
        </svg>
      </div>

      <div className="flex flex-col leading-tight">
        <span className={classNames('font-semibold tracking-tight text-bolt-elements-textPrimary', compact ? 'text-base' : 'text-lg')}>
          Snehra Codesmith
        </span>
        {!compact ? <span className="text-xs text-bolt-elements-textSecondary">by Koustav Sarkar</span> : null}
      </div>
    </div>
  );
}
