import { useState } from 'react';
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
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={e => void submit(e)} className="w-full max-w-md rounded-[28px] bg-sc-low p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-on-primary"><Icon name="anchor" fill size={36} /></span>
          <h1 className="t-headline-s">{setup ? t('auth.welcome') : t('auth.login')}</h1>
          <p className="t-body-m text-on-surface-variant">{setup ? t('auth.setupText') : t('auth.loginText')}</p>
        </div>
        <div className="flex flex-col gap-3">
          <TextField id="u" label={t('auth.username')} value={username} onChange={setUsername} autoFocus autoComplete="username"
            support={setup ? t('auth.usernameHelp') : ''} />
          <TextField id="p" label={t('auth.password')} type="password" value={password} onChange={setPassword}
            autoComplete={setup ? 'new-password' : 'current-password'} support={setup ? t('auth.passwordHelp') : ''} />
          {setup && <TextField id="p2" label={t('auth.repeat')} type="password" value={again} onChange={setAgain} autoComplete="new-password"
            error={mismatch} support={mismatch ? t('auth.mismatch') : ''} />}
        </div>
        {error && <p role="alert" className="t-body-m mt-2 flex items-start gap-2 text-error"><Icon name="error" size={18} />{error}</p>}
        <div className="mt-6 flex justify-end"><Btn type="submit" variant="filled" disabled={!can}>{setup ? t('auth.create') : t('auth.submit')}</Btn></div>
        {demo && <p className="t-body-s mt-4 text-center text-on-surface-variant">{t('auth.demo')}</p>}
      </form>
    </main>
  );
}
