import { M3eIcon } from '@m3e/react/icon';

/**
 * A Material Symbols icon (the rounded set, which ships inside the app so it works offline).
 * `slot` lets it sit in a component's icon slot, e.g. inside a button.
 */
export function Icon({ name, fill, size, className = '', slot, id }: { name: string; fill?: boolean; size?: number; className?: string; slot?: string; id?: string }) {
  return <M3eIcon variant="rounded" name={name} filled={fill} slot={slot} id={id} className={className} aria-hidden="true" style={size ? { fontSize: size } : undefined} />;
}
