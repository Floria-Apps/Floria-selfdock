import { usePrefs, type LangPref } from '../store';
import { en } from './en';
import { ptBR } from './pt-BR';

export type Key = keyof typeof en;
export type Lang = 'en' | 'pt-BR';
type Params = Record<string, string | number>;

export function resolveLang(pref: LangPref): Lang {
  if (pref !== 'auto') return pref;
  return (navigator.language ?? 'en').toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export const currentLang = (): Lang => resolveLang(usePrefs.getState().lang);
/** Locale for number and date formatting. */
export const locale = () => currentLang();

function fill(text: string, params?: Params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Translate a key. Falls back to English if the current language lacks it. */
export function tr(key: Key, params?: Params): string {
  const dict: Record<string, string> = currentLang() === 'pt-BR' ? ptBR : en;
  return fill(dict[key] ?? en[key] ?? key, params);
}

/** Key without the `_one` / `_other` suffix. */
export type PluralBase = Key extends infer K ? (K extends `${infer B}_one` ? B : never) : never;

/** Pick the singular or plural form. `n` is also available to the text as `{n}`. */
export function trn(base: PluralBase, n: number, params: Params = {}): string {
  return tr(`${base}_${n === 1 ? 'one' : 'other'}` as Key, { n, ...params });
}

/** Description of a known app, or '' when there is none. */
export function describeCatalog(catalog: string | null): string {
  if (!catalog) return '';
  const key = `desc.${catalog}` as Key;
  return key in en ? tr(key) : '';
}

/** Use in components so they re-render when the language changes. */
export function useT() {
  usePrefs(s => s.lang);
  return tr;
}
