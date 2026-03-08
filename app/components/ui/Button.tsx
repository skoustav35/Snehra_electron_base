import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { classNames } from '~/utils/classNames';

const buttonVariants = cva(
  'platinum-action inline-flex items-center justify-center whitespace-nowrap text-sm font-medium focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'platinum-action--primary text-bolt-elements-item-contentAccent',
        destructive: 'platinum-action--danger',
        outline:
          'bg-transparent text-bolt-elements-textPrimary hover:border-bolt-elements-borderColorActive hover:bg-bolt-elements-surface-platinumHover',
        secondary:
          'text-bolt-elements-textPrimary hover:border-bolt-elements-borderColorActive hover:bg-bolt-elements-surface-platinumHover',
        ghost:
          'border-transparent bg-transparent text-bolt-elements-textSecondary shadow-none hover:bg-bolt-elements-item-backgroundActive hover:text-bolt-elements-textPrimary',
        link: 'text-bolt-elements-textPrimary underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-10 px-4 py-2',
        sm: 'min-h-8 px-3 py-1.5 text-xs',
        lg: 'min-h-11 px-8 py-3',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  _asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, _asChild = false, ...props }, ref) => {
    return <button className={classNames(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
