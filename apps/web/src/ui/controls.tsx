import type { ReactNode } from 'react';
import { M3eButton } from '@m3e/react/button';
import { M3eFilterChip, M3eFilterChipSet } from '@m3e/react/chips';
import { M3eFormField } from '@m3e/react/form-field';
import { M3eIconButton } from '@m3e/react/icon-button';
import { M3eButtonSegment, M3eSegmentedButton } from '@m3e/react/segmented-button';
import { M3eSlider, M3eSliderThumb } from '@m3e/react/slider';
import { M3eSwitch } from '@m3e/react/switch';
import { M3eTab, M3eTabs } from '@m3e/react/tabs';
import { Icon } from './Icon';

/** These controls are thin wrappers over the Material 3 Expressive components (m3e), with the props the dashboard uses. */

export function IconButton({ icon, label, onClick, className = '', fill, disabled, variant = 'standard' }: {
  icon: string; label: string; onClick?: (e: Event) => void; className?: string; fill?: boolean; disabled?: boolean;
  variant?: 'standard' | 'filled' | 'tonal';
}) {
  return (
    <M3eIconButton variant={variant} aria-label={label} title={label} disabled={disabled} className={className} onClick={disabled ? undefined : onClick}>
      <Icon name={icon} fill={fill} />
    </M3eIconButton>
  );
}

export function Btn({ variant = 'text', icon, children, onClick, disabled, type = 'button' }: {
  variant?: 'text' | 'tonal' | 'filled' | 'danger'; icon?: string; children: ReactNode; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit';
}) {
  return (
    <M3eButton variant={variant === 'danger' ? 'text' : variant} className={variant === 'danger' ? 'btn-danger' : undefined} type={type}
      disabled={disabled} onClick={disabled || !onClick ? undefined : () => onClick()}>
      {icon && <Icon slot="icon" name={icon} />}
      {children}
    </M3eButton>
  );
}

/** Pick one option with filter chips. */
export function ChipSelect<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { v: T; label: string }[]; label: string;
}) {
  return (
    <M3eFilterChipSet aria-label={label} onChange={e => { const v = (e.target as HTMLElement & { value?: string }).value; if (v) onChange(v as T); }}>
      {options.map(o => <M3eFilterChip key={o.v} value={o.v} selected={o.v === value}>{o.label}</M3eFilterChip>)}
    </M3eFilterChipSet>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void;
  options: { v: T; label?: string; icon?: string; aria?: string; iconOnly?: boolean }[];
}) {
  const iconOnly = options.every(option => option.iconOnly);
  return (
    <M3eSegmentedButton className={iconOnly ? 'w-auto' : 'w-full min-w-0'} hideSelectionIndicator={iconOnly} onChange={e => { const v = (e.target as HTMLElement & { value?: string }).value; if (v) onChange(v as T); }}>
      {options.map(o => (
        <M3eButtonSegment key={o.v} value={o.v} checked={value === o.v} aria-label={o.aria ?? o.label} title={o.aria ?? o.label} className={iconOnly ? '' : 'min-w-0 flex-1'}>
          {o.icon && <Icon slot="icon" name={o.icon} />}
          {o.label}
        </M3eButtonSegment>
      ))}
    </M3eSegmentedButton>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <M3eSwitch icons="both" checked={checked} aria-label={label} onChange={e => onChange((e.target as HTMLInputElement).checked)} />;
}

export function Slider({ value, min, max, step, onChange, label }: {
  value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string;
}) {
  const read = (e: Event) => onChange(Number((e.target as HTMLInputElement).value));
  return (
    <M3eSlider min={min} max={max} step={step} labelled className="w-full" aria-label={label}>
      <M3eSliderThumb value={value} aria-label={label} onInput={read} onChange={read} />
    </M3eSlider>
  );
}

export function TextField({ id, label, value, onChange, error, support, ok, type = 'text', inputMode, autoFocus, autoComplete = 'off' }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: boolean; support?: string; ok?: boolean;
  type?: string; inputMode?: 'numeric' | 'text' | 'url'; autoFocus?: boolean; autoComplete?: string;
}) {
  return (
    <M3eFormField variant="outlined" error={error} className="block w-full">
      <label slot="label" htmlFor={id}>{label}</label>
      <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} inputMode={inputMode}
        autoFocus={autoFocus} autoComplete={autoComplete} aria-invalid={!!error} />
      {support && (error
        ? <span slot="error">{support}</span>
        : <span slot="hint" className={ok ? 'text-success' : undefined}>{support}</span>)}
    </M3eFormField>
  );
}

/** Material 3 primary tabs. */
export function Tabs<T extends string>({ value, onChange, tabs, label }: {
  value: T; onChange: (v: T) => void; label: string; tabs: { v: T; label: string; dot?: boolean }[];
}) {
  return (
    <M3eTabs aria-label={label}>
      {tabs.map(tab => (
        <M3eTab key={tab.v} selected={tab.v === value} onClick={() => onChange(tab.v)}>
          {tab.label}
          {tab.dot && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
        </M3eTab>
      ))}
    </M3eTabs>
  );
}
