import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'default' | 'primary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  default: 'bg-white text-ink border-line hover:bg-canvas',
  primary: 'bg-brand text-white border-brand hover:brightness-90 active:brightness-[.78]',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-brand-50 hover:text-brand',
  danger: 'bg-white text-t-red border-t-red-line hover:bg-t-red-soft',
  success: 'bg-t-green text-white border-t-green hover:brightness-95',
};
const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3 py-1.5 text-dense',
  lg: 'px-4 py-2 text-dense',
};

/** PlBtn -> Button (UI-SPEC 5). Purple = primary action only, never status. */
export function Button({
  variant = 'default',
  size = 'md',
  icon,
  iconRight,
  full,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  full?: boolean;
}) {
  return (
    <button
      {...rest}
      className={clsx(
        'focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold transition disabled:cursor-not-allowed disabled:border-line-subtle disabled:bg-card-sunk disabled:text-ink-3',
        variants[variant],
        sizes[size],
        full && 'w-full',
        className,
      )}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}
