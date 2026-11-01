import { useState } from 'react';
import { M3eCard } from '@m3e/react/card';
import { api } from '@/lib/api';
import { errorText } from '@/lib/actions';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { Btn, TextField } from '@/ui/controls';
import { Icon } from '@/ui/Icon';

export function AuthView({ setup }: { setup: boolean }) {
  const t = useT();
  const demo = useStore(s => s.demo);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mismatch = setup && again.length > 0 && again !== password;
  const can = username.trim().length >= 3 && password.length >= (setup ? 8 : 1) && (!setup || again === password) && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can) return;
    setBusy(true); setError('');
    try {
      if (setup) await api.setup(username.trim(), password); else await api.login(username.trim(), password);
      const st = await api.authState();
      useStore.setState({ demo: st.demo });
      useStore.getState().setAuth(st.user ? 'ready' : 'login', st.user?.username ?? null);
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };

  return (
    <main className="auth-page flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className="auth-layout grid w-full max-w-5xl items-stretch gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,.9fr)]">
        <M3eCard variant="filled" className="auth-brand-panel hidden lg:flex">
          <div className="auth-brand-content flex max-w-md flex-col items-start justify-center">
            <img src="/floria-dock.png" alt="" className="h-20 w-20 rounded-[26px] object-cover" />
            <div>
              <p className="t-headline-s">{t('app.name')}</p>
              <p className="t-body-l mt-3 max-w-sm text-on-surface-variant">{t('auth.desktopTagline')}</p>
            </div>
          </div>
        </M3eCard>
        <M3eCard variant="filled" className="auth-panel block">
          <form onSubmit={e => void submit(e)} className="auth-form">
            <div className="auth-form-header mb-7 flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
              <img src="/floria-dock.png" alt="" className="auth-form-logo h-16 w-16 rounded-2xl object-cover" />
              <h1 className="t-headline-s">{setup ? t('auth.welcome') : t('auth.login')}</h1>
              <p className="t-body-m max-w-sm text-on-surface-variant">{setup ? t('auth.setupText') : t('auth.loginText')}</p>
            </div>
            <div className="flex flex-col gap-4">
              <TextField id="u" label={t('auth.username')} value={username} onChange={setUsername} autoFocus autoComplete="username"
                support={setup ? t('auth.usernameHelp') : ''} />
              <TextField id="p" label={t('auth.password')} type="password" value={password} onChange={setPassword}
                autoComplete={setup ? 'new-password' : 'current-password'} support={setup ? t('auth.passwordHelp') : ''} />
              {setup && <TextField id="p2" label={t('auth.repeat')} type="password" value={again} onChange={setAgain} autoComplete="new-password"
                error={mismatch} support={mismatch ? t('auth.mismatch') : ''} />}
            </div>
            {error && <p role="alert" aria-live="polite" className="auth-error t-body-m mt-4 flex items-start gap-2"><Icon name="error" size={18} />{error}</p>}
            <div className="auth-submit mt-7">
              <Btn type="submit" variant="filled" disabled={!can}>
                {busy && <Icon slot="icon" name="progress_activity" className="animate-spin" />}
                {busy ? t('auth.working') : setup ? t('auth.create') : t('auth.submit')}
              </Btn>
            </div>
            {demo && <p className="auth-demo-note t-body-s mt-5 flex items-start gap-2 text-on-surface-variant"><Icon name="info" size={18} />{t('auth.demo')}</p>}
          </form>
        </M3eCard>
      </div>
    </main>
  );
}
