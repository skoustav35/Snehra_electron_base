import { memo } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { classNames } from '~/utils/classNames';

interface SwitchProps {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (event: boolean) => void;
}

export const Switch = memo(({ className, onCheckedChange, checked }: SwitchProps) => {
  return (
    <SwitchPrimitive.Root
      className={classNames(
        'relative h-6 w-11 cursor-pointer rounded-full border border-bolt-elements-borderColor bg-bolt-elements-surface-field p-0.5',
        'shadow-[var(--snr-shadow-soft)] transition-colors duration-200 ease-in-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus focus-visible:ring-offset-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-bolt-elements-borderColorActive data-[state=checked]:bg-bolt-elements-item-backgroundAccent',
        className,
      )}
      checked={checked}
      onCheckedChange={(e) => onCheckedChange?.(e)}
    >
      <SwitchPrimitive.Thumb
        className={classNames(
          'block h-[18px] w-[18px] rounded-full bg-bolt-elements-background-depth-1',
          'shadow-lg shadow-black/20 ring-1 ring-white/10',
          'transition-transform duration-200 ease-in-out',
          'translate-x-0',
          'data-[state=checked]:translate-x-[1.25rem] data-[state=checked]:bg-bolt-elements-item-contentAccent',
          'will-change-transform',
        )}
      />
    </SwitchPrimitive.Root>
  );
});
