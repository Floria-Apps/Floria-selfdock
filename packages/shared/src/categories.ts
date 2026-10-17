/** `t` is the tonal colour number used for the icon (--t1-bg ... --t6-bg). Names live in the dashboard's translations. */
export const CATEGORIES = [
  { id: 'media', t: 1 },
  { id: 'home', t: 2 },
  { id: 'network', t: 3 },
  { id: 'files', t: 4 },
  { id: 'security', t: 5 },
  { id: 'other', t: 6 },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];
export const CATEGORY_IDS: string[] = CATEGORIES.map(c => c.id);
