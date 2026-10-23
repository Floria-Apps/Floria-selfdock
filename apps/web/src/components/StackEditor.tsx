import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Issue, StackAction, StackBackup, StackFiles } from '@shared/types';
import { api, ApiError } from '@/lib/api';
import { errorText } from '@/lib/actions';
import { locale, trn, useT, type Key } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { M3eActionList, M3eListAction } from '@m3e/react/list';
import { M3eMenu, M3eMenuItem } from '@m3e/react/menu';
import type { M3eMenuElement } from '@m3e/web/menu';
import { useIsDark } from '@/lib/theme';
import { Btn, IconButton, Segmented, Tabs } from '@/ui/controls';
import { Loading } from '@/ui/Loading';
import { Dialog } from '@/ui/Dialog';
import { Icon } from '@/ui/Icon';
import { CodeEditor, type EditorProblem } from './CodeEditor';

type Panel = 'problems' | 'output';
const ACTIONS: { id: StackAction; icon: string }[] = [
  { id: 'up', icon: 'rocket_launch' }, { id: 'pull', icon: 'cloud_download' }, { id: 'restart', icon: 'restart_alt' },
  { id: 'stop', icon: 'stop_circle' }, { id: 'down', icon: 'delete_sweep' },
];
const say = (text: string, tone?: 'info' | 'success' | 'error') => useStore.getState().say(text, tone);

/* ---------- previous versions ---------- */
function VersionsDialog({ name, onLoad, onClose }: { name: string; onLoad: (file: 'compose' | 'env', content: string) => void; onClose: () => void }) {
  const t = useT();
  const [list, setList] = useState<StackBackup[] | null>(null);
  useEffect(() => { api.stackBackups(name).then(setList).catch(e => { say(errorText(e), 'error'); setList([]); }); }, [name]);

  const load = async (b: StackBackup) => {
    try { onLoad(b.file, (await api.stackBackup(name, b.id)).content); say(t('versions.loaded'), 'success'); onClose(); }
    catch (e) { say(errorText(e), 'error'); }
  };
  return (
    <Dialog title={t('versions.title')} icon="history" onClose={onClose} actions={<Btn variant="tonal" onClick={onClose}>{t('common.close')}</Btn>}>
      {list === null ? <Loading />
        : list.length === 0 ? <p className="t-body-m text-on-surface-variant">{t('versions.empty')}</p> : (
          <ul className="max-h-[50vh] divide-y divide-outline-variant overflow-y-auto rounded-2xl bg-sc-low">
            {list.map(b => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                <Icon name={b.file === 'compose' ? 'description' : 'key'} className="text-on-surface-variant" />
                <div className="min-w-0 flex-1">
                  <p className="t-body-l">{t(b.file === 'compose' ? 'versions.compose' : 'versions.env')}</p>
                  <p className="t-body-s text-on-surface-variant">{new Date(b.at).toLocaleString(locale())}</p>
                </div>
                <Btn onClick={() => void load(b)}>{t('versions.load')}</Btn>
              </li>
            ))}
          </ul>
        )}
    </Dialog>
  );
}

/* ---------- the editor ---------- */
export default function StackEditor({ name, onClose }: { name: string; onClose: () => void }) {
  const t = useT();
  const job = useStore(s => s.jobs[name]);
  const [files, setFiles] = useState<StackFiles | null>(null);
  const [loadError, setLoadError] = useState('');
  const [compose, setCompose] = useState('');
  const [env, setEnv] = useState('');
  const [tab, setTab] = useState<'compose' | 'env'>('compose');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkNonce, setCheckNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<Panel>('problems');
  const [collapsed, setCollapsed] = useState(false);
  const [applyOn, setApplyOn] = useState(false);
  const menuRef = useRef<M3eMenuElement>(null);
  const [discard, setDiscard] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [versions, setVersions] = useState(false);
  const [confirm, setConfirm] = useState<StackAction | null>(null);
  const [jump, setJump] = useState<{ line: number; col: number; nonce: number } | null>(null);
  const reqId = useRef(0);
  const outBox = useRef<HTMLPreElement>(null);
  const dark = useIsDark();

  const load = useCallback(async () => {
    try {
      const f = await api.stack(name);
      setFiles(f); setCompose(f.compose); setEnv(f.env ?? ''); setLoadError('');
    } catch (e) { setLoadError(errorText(e)); }
  }, [name]);
  useEffect(() => { void load(); api.stacks().then(i => setApplyOn(i.apply)).catch(() => undefined); }, [load]);

  const dirty = !!files && (compose !== files.compose || env !== (files.env ?? ''));
  const envForCheck = files && files.env === null && env === '' ? null : env;

  // Check the text half a second after you stop typing
  useEffect(() => {
    if (!files) return;
    const id = ++reqId.current;
    setChecking(true);
    const timer = setTimeout(() => {
      api.validateStack({ name, compose, env: envForCheck })
        .then(r => { if (id === reqId.current) setIssues(r.issues); })
        .catch(() => undefined)
        .finally(() => { if (id === reqId.current) setChecking(false); });
    }, 500);
    return () => clearTimeout(timer);
  }, [compose, env, files, name, checkNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const message = useCallback((i: Issue) => t(`issue.${i.code}` as Key, i.params), [t]);
  const problems = (file: 'compose' | 'env'): EditorProblem[] =>
    issues.filter(i => i.file === file).map(i => ({ line: i.line, col: i.col, level: i.level, message: message(i) }));
  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.filter(i => i.level === 'warning').length;
  const composeProblems = useMemo(() => problems('compose'), [issues, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const envProblems = useMemo(() => problems('env'), [issues, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async (): Promise<boolean> => {
    if (!files || saving) return false;
    if (!dirty) return true;
    setSaving(true);
    try {
      const body: Parameters<typeof api.saveStack>[1] = {};
      if (compose !== files.compose) { body.compose = compose; body.composeHash = files.composeHash; }
      if (env !== (files.env ?? '')) { body.env = env; body.envHash = files.envHash; }
      const next = await api.saveStack(name, body);
      setFiles(next); setCompose(next.compose); setEnv(next.env ?? '');
      say(t('editor.saved'), 'success');
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'stack_conflict') setConflict(true); else say(errorText(e), 'error');
      return false;
    } finally { setSaving(false); }
  }, [files, saving, dirty, compose, env, name, t]);

  const saveRef = useRef(save);
  saveRef.current = save;

  const requestClose = () => (dirty ? setDiscard(true) : onClose());

  const run = async (action: StackAction) => {
    setConfirm(null);
    if (dirty && !(await save())) return;
    try { await api.applyStack(name, action); setPanel('output'); setCollapsed(false); }
    catch (e) { say(errorText(e), 'error'); }
  };
  const pick = (action: StackAction) => { if (action === 'pull') void run(action); else setConfirm(action); };

  useEffect(() => { if (outBox.current) outBox.current.scrollTop = outBox.current.scrollHeight; }, [job?.text, panel, collapsed]);

  const goTo = (i: Issue) => {
    if (!i.line) return;
    setTab(i.file);
    setJump({ line: i.line, col: i.col ?? 1, nonce: Date.now() });
  };

  /* ----- states before the files are loaded ----- */
  if (loadError || !files) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-4 bg-surface p-6 text-center">
        {loadError ? (<>
          <Icon name="error" size={32} className="text-error" />
          <p className="t-body-l">{t('editor.loadError')} {loadError}</p>
          <Btn variant="tonal" onClick={onClose}>{t('common.close')}</Btn>
        </>) : <Loading />}
      </div>
    );
  }

  const statusChip = job && (
    <span className={`t-label-m inline-flex h-6 items-center gap-1.5 rounded-lg px-2.5 ${
      job.running ? 'bg-tertiary-container text-on-tertiary-container' : job.code === 0 ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {job.running ? t('apply.running') : job.code === 0 ? t('apply.finished') : t('apply.failed', { code: job.code ?? '?' })}
    </span>
  );

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-surface text-on-surface" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* top bar */}
      <header className="flex h-16 shrink-0 items-center gap-1 px-2 md:gap-2 md:px-4">
        <IconButton icon="arrow_back" label={t('editor.close')} onClick={requestClose} />
        <div className="min-w-0 flex-1 px-1">
          <p className="t-title-m flex items-center gap-2 truncate">
            {name}
            {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" title={t('editor.unsaved')} aria-label={t('editor.unsaved')} />}
          </p>
          <p className="t-body-s truncate text-on-surface-variant">{files.composeFile}</p>
        </div>
        <IconButton icon="fact_check" label={t('editor.check')} onClick={() => { setPanel('problems'); setCollapsed(false); setCheckNonce(n => n + 1); }} />
        <IconButton icon="history" label={t('editor.history')} onClick={() => setVersions(true)} />
        {applyOn && <IconButton icon="rocket_launch" label={t('editor.apply')} onClick={e => menuRef.current?.show(e.currentTarget as HTMLElement)} />}
        <span className="ml-1 hidden sm:block"><Btn variant="filled" icon="save" disabled={!dirty || saving} onClick={() => void save()}>{t('editor.save')}</Btn></span>
        <span className="sm:hidden"><IconButton icon="save" fill label={t('editor.save')} variant={dirty && !saving ? 'filled' : 'standard'} disabled={!dirty || saving} onClick={() => void save()} /></span>
      </header>

      <Tabs value={tab} onChange={setTab} label={name} tabs={[
        { v: 'compose', label: files.composeFile, dot: composeProblems.some(p => p.level !== 'info') },
        { v: 'env', label: '.env', dot: envProblems.some(p => p.level !== 'info') },
      ]} />
      {tab === 'env' && (
        <p className="t-body-s shrink-0 bg-sc-low px-4 py-2 text-on-surface-variant">{files.env === null && env === '' ? t('editor.noEnv') : t('editor.envHelp')}</p>
      )}

      {/* the editors stay mounted so each keeps its own undo history */}
      <div className="min-h-0 flex-1">
        <div className={tab === 'compose' ? 'h-full' : 'hidden'}>
          <CodeEditor value={compose} language="yaml" onChange={setCompose} onSave={() => void saveRef.current()} problems={composeProblems}
            ariaLabel={t('editor.aria', { file: files.composeFile })} dark={dark} jump={tab === 'compose' ? jump : null} />
        </div>
        <div className={tab === 'env' ? 'h-full' : 'hidden'}>
          <CodeEditor value={env} language="env" onChange={setEnv} onSave={() => void saveRef.current()} problems={envProblems}
            ariaLabel={t('editor.aria', { file: '.env' })} dark={dark} jump={tab === 'env' ? jump : null} />
        </div>
      </div>

      {/* problems and command output */}
      <section className="shrink-0 border-t border-outline-variant bg-sc-low" aria-label={t('editor.problems')}>
        <div className="flex items-center gap-2 px-2 py-2">
          <Segmented value={panel} onChange={v => { setPanel(v); setCollapsed(false); }} options={[
            { v: 'problems', icon: errors ? 'error' : warnings ? 'warning' : 'check_circle',
              label: `${t('editor.problems')}${checking ? ' …' : errors || warnings ? ` · ${[errors && trn('editor.errors', errors), warnings && trn('editor.warnings', warnings)].filter(Boolean).join(', ')}` : ''}` },
            ...(job || applyOn ? [{ v: 'output' as Panel, icon: 'terminal', label: t('editor.output') }] : []),
          ]} />
          <span className="ml-auto">{panel === 'output' && statusChip}</span>
          <IconButton icon={collapsed ? 'expand_less' : 'expand_more'} label={collapsed ? t('common.expand') : t('common.collapse')} onClick={() => setCollapsed(c => !c)} />
        </div>
        {!collapsed && (
          <div className="h-44 overflow-auto md:h-52">
            {panel === 'problems' ? (
              issues.length === 0 ? (
                <p className="t-body-m flex items-center gap-2 px-4 py-3 text-on-surface-variant"><Icon name="check_circle" fill size={18} className="text-success" />{checking ? t('editor.checking') : t('editor.noProblems')}</p>
              ) : (
                <M3eActionList>
                  {issues.map((i, n) => (
                    <M3eListAction key={n} disabled={!i.line} onClick={() => goTo(i)}>
                      <Icon slot="leading" name={i.level === 'error' ? 'error' : i.level === 'warning' ? 'warning' : 'info'} fill
                        className={i.level === 'error' ? 'text-error' : i.level === 'warning' ? 'text-warning' : 'text-on-surface-variant'} />
                      {message(i)}
                      {i.line && <span slot="trailing-supporting-text">{i.file === 'env' ? '.env' : files.composeFile}:{i.line}</span>}
                    </M3eListAction>
                  ))}
                </M3eActionList>
              )
            ) : (
              <pre ref={outBox} className="h-full overflow-auto whitespace-pre-wrap break-words p-3 text-[12px] leading-5 text-on-surface-variant"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{job ? job.text : t('apply.empty')}</pre>
            )}
          </div>
        )}
      </section>

      {/* Apply menu */}
      <M3eMenu ref={menuRef}>
        {ACTIONS.map(a => (
          <M3eMenuItem key={a.id} onClick={() => pick(a.id)}>
            <Icon slot="icon" name={a.icon} />
            <span className="block">{t(`apply.${a.id}` as Key)}</span>
            <span className="t-body-s block opacity-70">{t(`apply.${a.id}.hint` as Key)}</span>
          </M3eMenuItem>
        ))}
      </M3eMenu>

      {versions && <VersionsDialog name={name} onClose={() => setVersions(false)} onLoad={(file, content) => (file === 'compose' ? (setCompose(content), setTab('compose')) : (setEnv(content), setTab('env')))} />}

      {confirm && (
        <Dialog title={t('apply.confirmTitle', { action: t(`apply.${confirm}` as Key), name })} icon="rocket_launch" onClose={() => setConfirm(null)}
          actions={<><Btn onClick={() => setConfirm(null)}>{t('common.cancel')}</Btn><Btn variant={confirm === 'down' ? 'danger' : 'text'} onClick={() => void run(confirm)}>{t('apply.run')}</Btn></>}>
          <p className="t-body-m text-on-surface-variant">{t(`apply.${confirm}.hint` as Key)} {t('apply.confirmText')}{dirty ? ` ${t('apply.saveFirst')}` : ''}</p>
        </Dialog>
      )}

      {discard && (
        <Dialog title={t('editor.discardTitle')} icon="delete" onClose={() => setDiscard(false)}
          actions={<><Btn onClick={() => setDiscard(false)}>{t('editor.keepEditing')}</Btn><Btn variant="danger" onClick={onClose}>{t('editor.discard')}</Btn></>}>
          <p className="t-body-m text-on-surface-variant">{t('editor.discardText')}</p>
        </Dialog>
      )}

      {conflict && (
        <Dialog title={t('editor.conflictTitle')} icon="sync_problem" onClose={() => setConflict(false)}
          actions={<><Btn onClick={() => setConflict(false)}>{t('editor.keepEditing')}</Btn><Btn variant="filled" onClick={() => { setConflict(false); void load(); }}>{t('editor.reload')}</Btn></>}>
          <p className="t-body-m text-on-surface-variant">{t('editor.conflictText')}</p>
        </Dialog>
      )}
    </div>
  );
}
