import { M3eIcon } from '@m3e/react/icon';

/** A registered M3E Material Symbol. `slot` places it in a component's icon slot. */
export function Icon({ name, fill, size, className = '', slot, id }: { name: string; fill?: boolean; size?: number; className?: string; slot?: string; id?: string }) {
  return <M3eIcon variant="rounded" name={name} filled={fill} slot={slot} id={id} className={className} aria-hidden="true" style={size ? { fontSize: size } : undefined} />;
}
