import { useEffect, useState } from 'react';
import { M3eCard } from '@m3e/react/card';
import type { StacksInfo, StackSummary } from '@shared/types';
import { api } from '@/lib/api';
import { errorText } from '@/lib/actions';
import { trn, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useUi } from '@/lib/ui';
import { Btn, TextField } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/Loading';

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function NewStackDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bad = name.length > 0 && !NAME_RE.test(name);
  const create = async () => {
    setBusy(true); setError('');
    try { await api.createStack(name); useStore.getState().say(t('stacks.created', { name })); onCreated(name); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog title={t('stacks.new')} icon="add_circle" onClose={onClose}
      actions={<><Btn onClick={onClose}>{t('common.cancel')}</Btn><Btn variant="filled" disabled={!name || bad || busy} onClick={() => void create()}>{t('common.add')}</Btn></>}>
      <div className="pt-2">
        <TextField id="s-name" label={t('stacks.newName')} value={name} onChange={v => { setName(v); setError(''); }} autoFocus error={bad || !!error} support={error || t('stacks.newHelp')} />
      </div>
    </Dialog>
  );
}

function StackCard({ stack, onOpen }: { stack: StackSummary; onOpen: () => void }) {
  const t = useT();
  const all = stack.total > 0 && stack.running === stack.total;
  const none = stack.running === 0;
  const tone = none ? 'bg-secondary-container text-on-secondary-container' : all ? 'bg-success-container text-on-success-container' : 'bg-warning-container text-on-warning-container';
  return (
    <M3eCard variant="filled" actionable className="block h-full" onClick={onOpen}>
      <div className="flex h-full flex-col gap-3 text-left">
        <span className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-secondary-container text-on-secondary-container"><Icon name="deployed_code" fill /></span>
          <span className="min-w-0">
            <span className="t-title-m block truncate">{stack.name}</span>
            <span className="t-body-m block truncate text-on-surface-variant">{trn('stacks.services', stack.services.length)}</span>
          </span>
        </span>
        {stack.services.length > 0 && <span className="t-body-s line-clamp-2 text-on-surface-variant">{stack.services.join(', ')}</span>}
        <span className="mt-auto flex items-center justify-between gap-2">
          <span className={`t-label-m inline-flex h-6 items-center gap-1.5 rounded-lg px-2.5 ${tone}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            {none ? t('stacks.notStarted') : t('stacks.running', { running: stack.running, total: stack.total })}
          </span>
          <span className="t-label-l flex items-center gap-1 text-primary"><Icon name="edit" size={18} />{t('stacks.edit')}</span>
        </span>
      </div>
    </M3eCard>
  );
}

export function StacksView() {
  const t = useT();
  const editing = useUi(s => s.stackEdit);
  const set = useUi(s => s.set);
  const jobs = useStore(s => s.jobs);
  const [info, setInfo] = useState<StacksInfo | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const finished = Object.values(jobs).filter(j => !j.running).length;

  const load = () => api.stacks().then(i => { setInfo(i); setError(''); }).catch(e => setError(errorText(e)));
  useEffect(() => { void load(); }, [editing, finished]);
  useEffect(() => { const timer = setInterval(() => void load(), 10_000); return () => clearInterval(timer); }, []);

  if (error) return <p className="t-body-m flex items-center gap-2 text-error"><Icon name="error" size={18} />{error}</p>;
  if (!info) return <Loading />;

  if (!info.enabled) {
    const code = 'rounded bg-sc-high px-1.5 py-0.5 font-mono text-[13px]';
    return (
      <section className="max-w-2xl rounded-[28px] bg-secondary-container p-6 text-on-secondary-container md:p-8">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary"><Icon name="edit_document" fill /></span>
        <h2 className="t-headline-s mt-4">{t('stacks.off.title')}</h2>
        <p className="t-body-l mt-2">{t('stacks.off.text')}</p>
        <ol className="t-body-m mt-4 list-decimal space-y-2 pl-5">
          <li><span className={code}>{t('stacks.off.step1')}</span></li>
          <li><span className={code}>{t('stacks.off.step2')}</span></li>
          <li>{t('stacks.off.step3')}</li>
        </ol>
        <p className="t-body-m mt-4 flex items-start gap-2"><Icon name="lightbulb" size={20} />{t('stacks.off.shortcut')}</p>
      </section>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="t-body-m min-w-0 flex-1 text-on-surface-variant">{t('stacks.intro')}{info.root && <span className="block t-body-s">{t('stacks.folder', { path: info.root })}</span>}</p>
        <Btn variant="tonal" icon="add" onClick={() => setCreating(true)}>{t('stacks.new')}</Btn>
      </div>

      {info.stacks.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-sc-high text-on-surface-variant"><Icon name="deployed_code" size={32} /></span>
          <p className="t-title-m">{t('stacks.empty')}</p>
          <p className="t-body-m max-w-sm text-on-surface-variant">{t('stacks.emptyText')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {info.stacks.map(s => <StackCard key={s.name} stack={s} onOpen={() => set({ stackEdit: s.name })} />)}
        </div>
      )}

      {creating && <NewStackDialog onClose={() => setCreating(false)} onCreated={name => { setCreating(false); set({ stackEdit: name }); }} />}
    </>
  );
}
