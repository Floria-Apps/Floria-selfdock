import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, catName } from '@/lib/categories';
import { api } from '@/lib/api';
import { errorText, runAction } from '@/lib/actions';
import { useT, type Key } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useUi } from '@/lib/ui';
import { Btn, ChipSelect, TextField } from '@/ui/controls';
import { Loading } from '@/ui/Loading';
import { Dialog } from '@/ui/Dialog';
import { Icon } from '@/ui/Icon';
import { AppIcon } from './AppIcon';

const say = (t: string) => useStore.getState().say(t);

/* ---------- confirmation ---------- */
const CONFIRM_ICON = { restart: 'restart_alt', stop: 'stop_circle', hide: 'visibility_off', remove: 'delete' } as const;

export function ConfirmDialog() {
  const t = useT();
  const confirm = useUi(s => s.confirm);
  const set = useUi(s => s.set);
  const service = useStore(s => (confirm ? s.services[confirm.id] : undefined));
  if (!confirm || !service) return null;
  const close = () => set({ confirm: null });
  const k = confirm.kind;

  const go = async () => {
    close();
    try {
      if (k === 'restart' || k === 'stop') await runAction(service, k);
      else if (k === 'hide') { await api.patch(service.id, { hidden: true }); say(t('toast.hidden', { name: service.name })); }
      else { await api.remove(service.id); say(t('toast.removed', { name: service.name })); }
    } catch (e) { say(errorText(e)); }
  };

  return (
    <Dialog title={t(`confirm.${k}.title` as Key, { name: service.name })} icon={CONFIRM_ICON[k]} onClose={close}
      actions={<><Btn onClick={close}>{t('common.cancel')}</Btn><Btn variant={k === 'remove' ? 'danger' : 'text'} onClick={() => void go()}>{t(`confirm.${k}.ok` as Key)}</Btn></>}>
      <p className="t-body-m text-on-surface-variant">{t(`confirm.${k}.text` as Key)}</p>
    </Dialog>
  );
}

/* ---------- edit ---------- */
export function EditDialog() {
  const t = useT();
  const id = useUi(s => s.edit);
  const set = useUi(s => s.set);
  const service = useStore(s => (id ? s.services[id] : undefined));
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [cat, setCat] = useState('other');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (service && id) { setName(service.name); setCat(service.category); setIcon(''); setError(''); } }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id || !service) return null;
  const close = () => set({ edit: null });

  const save = async () => {
    setBusy(true); setError('');
    try {
      const body: Parameters<typeof api.patch>[1] = { name: name.trim() === service.name ? undefined : name.trim(), category: cat === service.category ? undefined : cat };
      if (icon.trim()) body.icon = icon.trim();
      await api.patch(id, body);
      say(t('edit.saved'));
      close();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const resetIcon = async () => {
    setBusy(true);
    try { await api.patch(id, { icon: '' }); say(t('edit.iconReset')); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  return (
    <Dialog title={t('edit.title')} icon="edit" onClose={close}
      actions={<><Btn onClick={close}>{t('common.cancel')}</Btn><Btn variant="filled" disabled={busy || !name.trim()} onClick={() => void save()}>{t('common.save')}</Btn></>}>
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex items-center gap-4">
          <AppIcon service={service} size={56} radius={18} />
          <div className="min-w-0">
            <p className="t-title-m truncate">{service.name}</p>
            <p className="t-body-s text-on-surface-variant">{service.icon ? t('edit.iconCurrent', { icon: service.icon }) : t('edit.noIcon')}</p>
          </div>
        </div>
        <TextField id="e-name" label={t('common.name')} value={name} onChange={setName} />
        <TextField id="e-icon" label={t('edit.icon')} value={icon} onChange={v => { setIcon(v); setError(''); }} error={!!error}
          support={error || t('edit.iconHelp')} />
        {service.icon && <div className="-mt-1 px-1"><Btn onClick={() => void resetIcon()}>{t('edit.resetIcon')}</Btn></div>}
        <div>
          <p className="t-label-l mb-2 px-1 text-on-surface-variant">{t('category.label')}</p>
          <ChipSelect label={t('category.label')} value={cat} onChange={setCat} options={CATEGORIES.map(c => ({ v: c.id, label: catName(c.id) }))} />
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- add a service outside Docker ---------- */
export function AddDialog() {
  const t = useT();
  const adding = useUi(s => s.adding);
  const set = useUi(s => s.set);
  const services = useStore(s => s.services);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('http://');
  const [cat, setCat] = useState('other');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) && u.hostname ? u : null; } catch { return null; } }, [url]);
  const owner = useMemo(() => {
    const localHosts = [location.hostname, 'localhost', '127.0.0.1'];
    if (!parsed?.port || !localHosts.includes(parsed.hostname)) return null;
    return Object.values(services).find(s => s.source === 'docker' && s.port === Number(parsed.port)) ?? null;
  }, [parsed, services]);

  if (!adding) return null;
  const close = () => { set({ adding: false }); setName(''); setUrl('http://'); setCat('other'); setError(''); };
  const can = name.trim().length > 0 && !!parsed && !busy;

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.addManual({ name: name.trim(), url: url.trim(), category: cat });
      say(t('add.done', { name: name.trim() }));
      close();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  const badUrl = url.length > 8 && !parsed;
  return (
    <Dialog title={t('add.title')} icon="add_circle" onClose={close}
      actions={<><Btn onClick={close}>{t('common.cancel')}</Btn><Btn variant="filled" disabled={!can} onClick={() => void save()}>{t('common.add')}</Btn></>}>
      <p className="t-body-m mb-4 text-on-surface-variant">{t('add.intro')}</p>
      <div className="flex flex-col gap-3 pt-1">
        <TextField id="a-name" label={t('common.name')} value={name} onChange={setName} autoFocus />
        <TextField id="a-url" label={t('add.address')} value={url} onChange={v => { setUrl(v); setError(''); }} inputMode="url"
          error={!!error || badUrl}
          support={error || (badUrl ? t('add.addressBad') : owner ? t('add.portInUse', { port: parsed!.port, name: owner.name }) : t('add.help'))} />
        <div>
          <p className="t-label-l mb-2 px-1 text-on-surface-variant">{t('category.label')}</p>
          <ChipSelect label={t('category.label')} value={cat} onChange={setCat} options={CATEGORIES.map(c => ({ v: c.id, label: catName(c.id) }))} />
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- logs ---------- */
export function LogsDialog() {
  const t = useT();
  const id = useUi(s => s.logs);
  const set = useUi(s => s.set);
  const service = useStore(s => (id ? s.services[id] : undefined));
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLPreElement>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true); setError('');
    try { setText((await api.logs(id, 200)).text); } catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  };
  useEffect(() => { setText(null); if (id) void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [text]);

  if (!id || !service) return null;
  const close = () => set({ logs: null });
  const lines = (text ?? '').split('\n').filter(Boolean);

  return (
    <Dialog title={t('logs.title', { name: service.name })} icon="terminal" wide onClose={close}
      actions={<>
        <Btn icon="content_copy" onClick={() => { void navigator.clipboard?.writeText(text ?? ''); say(t('logs.copied')); }}>{t('common.copy')}</Btn>
        <Btn icon="refresh" onClick={() => void load()} disabled={loading}>{t('common.refresh')}</Btn>
        <Btn variant="tonal" onClick={close}>{t('common.close')}</Btn>
      </>}>
      {error && <p className="t-body-m flex items-center gap-2 text-error"><Icon name="error" size={18} />{error}</p>}
      {!error && text === null && <Loading />}
      {!error && text !== null && (
        <pre ref={box} className="max-h-[50vh] overflow-auto rounded-xl bg-sc-lowest p-3 text-[12px] leading-5" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
          {lines.length === 0 ? t('logs.empty') : lines.map((l, i) => (
            <span key={i} className={`block whitespace-pre-wrap break-words ${/error|erro|fatal|panic|exception/i.test(l) ? 'text-error' : /warn|aviso/i.test(l) ? 'text-warning' : 'text-on-surface-variant'}`}>{l}</span>
          ))}
        </pre>
      )}
    </Dialog>
  );
}
