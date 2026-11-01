import type { ReactNode } from 'react';
import { M3eButton } from '@m3e/react/button';
import { M3eIconButton } from '@m3e/react/icon-button';
import { Icon } from '@/ui/Icon';

export function M3eActionButton({
  children,
  icon,
  onClick,
  variant = 'filled',
  disabled,
  title,
  className = '',
}: {
  children?: ReactNode;
  icon?: string;
  onClick?: () => void;
  variant?: 'text' | 'tonal' | 'filled' | 'elevated' | 'outlined';
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <M3eButton
      variant={variant}
      disabled={disabled}
      onClick={disabled || !onClick ? undefined : onClick}
      title={title}
      className={className}
    >
      {icon && <Icon slot="icon" name={icon} />}
      {children}
    </M3eButton>
  );
}

export function M3eActionIconButton({
  icon,
  label,
  onClick,
  variant = 'standard',
  disabled,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
  variant?: 'standard' | 'filled' | 'tonal' | 'outlined';
  disabled?: boolean;
}) {
  return (
    <M3eIconButton
      variant={variant}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={disabled || !onClick ? undefined : onClick}
    >
      <Icon name={icon} />
    </M3eIconButton>
  );
}
