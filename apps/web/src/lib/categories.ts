import { CATEGORIES } from '@shared/categories';
import { tr, type Key } from './i18n';

export { CATEGORIES };
export const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<string, (typeof CATEGORIES)[number]>;
export const catOf = (id: string) => CAT[id] ?? CAT.other;
export const catName = (id: string) => tr(`category.${CAT[id] ? id : 'other'}` as Key);

const ICONS: Record<string, string> = { media: 'movie', home: 'home', network: 'lan', files: 'folder', security: 'shield', other: 'apps' };
export const catIcon = (id: string) => ICONS[id] ?? 'apps';
