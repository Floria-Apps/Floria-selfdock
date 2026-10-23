import { useEffect, useRef, useState, type ReactNode } from 'react';
import { M3eList, M3eListItem } from '@m3e/react/list';
import { api, type SettingsData } from '@/lib/api';
import { COLOR_STYLES, SEEDS } from '@/lib/color';
import { errorText } from '@/lib/actions';
import { useT, type Key } from '@/lib/i18n';
import { useStore, usePrefs } from '@/lib/store';
import { Btn, ChipSelect, Segmented, Slider, Switch } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/Loading';

function Row({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <M3eListItem>
      {title}
      <span slot="supporting-text">{sub}</span>
      <div slot="trailing">{children}</div>
    </M3eListItem>
  );
}

export function SettingsView({ onLogout }: { onLogout: () => void }) {
  const t = useT();
  const prefs = usePrefs();
  const conn = useStore(s => s.conn);
  const username = useStore(s => s.username);
  const say = useStore(s => s.say);
  const [server, setServer] = useState<SettingsData | null>(null);
  const loaded = useRef(false);

  useEffect(() => { api.settings().then(s => { setServer(s); loaded.current = true; }).catch(e => say(errorText(e), 'error')); }, [say]);

  // Saves the intervals half a second after you stop moving the slider.
  useEffect(() => {
    if (!server || !loaded.current) return;
    const timer = setTimeout(() => { api.saveSettings({ metricsIntervalSec: server.metricsIntervalSec, checkIntervalSec: server.checkIntervalSec }).catch(e => say(errorText(e), 'error')); }, 500);
    return () => clearTimeout(timer);
  }, [server?.metricsIntervalSec, server?.checkIntervalSec]); // eslint-disable-line react-hooks/exhaustive-deps

  const card = 'rounded-2xl bg-sc-low p-4';
  return (
    <section className="grid max-w-2xl gap-8">
      <div>
        <h2 className="t-title-m mb-3 px-1">{t('settings.appearance')}</h2>
        <div className={card}>
          <p className="t-body-m mb-3 text-on-surface-variant">{t('settings.appearanceHelp')}</p>
          <Segmented value={prefs.theme} onChange={theme => prefs.set({ theme })} options={[
            { v: 'light', label: t('theme.light'), icon: 'light_mode' },
            { v: 'dark', label: t('theme.dark'), icon: 'dark_mode' },
            { v: 'auto', label: t('theme.auto'), icon: 'brightness_auto' },
          ]} />
        </div>
      </div>

      <div>
        <h2 className="t-title-m mb-3 px-1">{t('settings.color')}</h2>
        <div className={`${card} grid gap-5`}>
          <div>
            <p className="t-body-m mb-4 text-on-surface-variant">{t('settings.colorHelp')}</p>
            <div className="flex flex-wrap gap-4" role="radiogroup" aria-label={t('settings.color')}>
              {SEEDS.map(sd => (
                <button key={sd.id} type="button" role="radio" aria-checked={prefs.seed === sd.id} aria-label={t(`seed.${sd.id}` as Key)} title={t(`seed.${sd.id}` as Key)}
                  onClick={() => prefs.set({ seed: sd.id })} className="flex h-14 w-14 items-center justify-center rounded-full transition-transform hover:scale-105"
                  style={{ background: sd.hex, color: '#fff', boxShadow: prefs.seed === sd.id ? '0 0 0 3px var(--surface), 0 0 0 6px var(--primary)' : 'none' }}>
                  {prefs.seed === sd.id && <Icon name="check" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="t-label-l mb-1 text-on-surface-variant">{t('settings.colorStyle')}</p>
            <p className="t-body-s mb-3 text-on-surface-variant">{t('settings.colorStyleHelp')}</p>
            <ChipSelect label={t('settings.colorStyle')} value={prefs.colorStyle} onChange={colorStyle => prefs.set({ colorStyle })}
              options={COLOR_STYLES.map(v => ({ v, label: t(`style.${v}` as Key) }))} />
          </div>
          <div>
            <p className="t-label-l mb-1 text-on-surface-variant">{t('settings.contrast')}</p>
            <p className="t-body-s mb-3 text-on-surface-variant">{t('settings.contrastHelp')}</p>
            <Segmented value={prefs.contrast} onChange={contrast => prefs.set({ contrast })} options={[
              { v: 'standard', label: t('contrast.standard'), icon: 'contrast' },
              { v: 'medium', label: t('contrast.medium'), icon: 'contrast' },
              { v: 'high', label: t('contrast.high'), icon: 'contrast' },
            ]} />
          </div>
        </div>
      </div>

      <div>
        <h2 className="t-title-m mb-3 px-1">{t('settings.language')}</h2>
        <div className={card}>
          <p className="t-body-m mb-3 text-on-surface-variant">{t('settings.languageHelp')}</p>
          <Segmented value={prefs.lang} onChange={lang => prefs.set({ lang })} options={[
            { v: 'auto', label: t('lang.auto'), icon: 'translate' },
            { v: 'en', label: t('lang.en'), icon: 'language' },
            { v: 'pt-BR', label: t('lang.pt'), icon: 'language' },
          ]} />
        </div>
      </div>

      <div>
        <h2 className="t-title-m mb-3 px-1">{t('settings.dashboard')}</h2>
        <M3eList variant="segmented">
          <Row title={t('settings.showPort')} sub={t('settings.showPortSub')}><Switch checked={prefs.showPort} onChange={v => prefs.set({ showPort: v })} label={t('settings.showPort')} /></Row>
          <Row title={t('settings.showServer')} sub={t('settings.showServerSub')}><Switch checked={prefs.showServer} onChange={v => prefs.set({ showServer: v })} label={t('settings.showServer')} /></Row>
          <Row title={t('settings.showLogos')} sub={t('settings.showLogosSub')}><Switch checked={prefs.showLogos} onChange={v => prefs.set({ showLogos: v })} label={t('settings.showLogos')} /></Row>
          <Row title={t('settings.showHidden')} sub={t('settings.showHiddenSub')}><Switch checked={prefs.showHidden} onChange={v => prefs.set({ showHidden: v })} label={t('settings.showHidden')} /></Row>
          <Row title={t('settings.expressive')} sub={t('settings.expressiveSub')}><Switch checked={prefs.expressive} onChange={v => prefs.set({ expressive: v })} label={t('settings.expressive')} /></Row>
        </M3eList>
      </div>

      <div>
        <h2 className="t-title-m mb-3 px-1">{t('settings.refresh')}</h2>
        <div className={card}>
          {!server ? <Loading className="py-4" /> : (
            <>
              <div className="flex items-baseline justify-between"><p className="t-body-l">{t('settings.metricsEvery')}</p><p className="t-title-m text-primary">{t('settings.seconds', { n: server.metricsIntervalSec })}</p></div>
              <Slider value={server.metricsIntervalSec} min={2} max={60} step={1} label={t('settings.metricsEvery')}
                onChange={v => setServer(s => (s ? { ...s, metricsIntervalSec: v } : s))} />
              <div className="mt-2 flex items-baseline justify-between"><p className="t-body-l">{t('settings.checksEvery')}</p><p className="t-title-m text-primary">{t('settings.seconds', { n: server.checkIntervalSec })}</p></div>
              <Slider value={server.checkIntervalSec} min={10} max={300} step={5} label={t('settings.checksEvery')}
                onChange={v => setServer(s => (s ? { ...s, checkIntervalSec: v } : s))} />
              <p className="t-body-s mt-2 text-on-surface-variant">{t('settings.refreshNote')}</p>
            </>
          )}
        </div>
      </div>

      <div>
        <h2 className="t-title-m mb-3 px-1">{t('settings.connection')}</h2>
        <M3eList variant="segmented">
          <M3eListItem>
            <span slot="leading" className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name="sync" /></span>
            {t('settings.realtime')}
            <span slot="supporting-text">{conn === 'open' ? t('settings.connected') : t('settings.reconnecting')}</span>
          </M3eListItem>
        </M3eList>
        {server && <p className="t-body-s mt-2 px-1 text-on-surface-variant">{t('settings.dockerInfo', { host: server.dockerHost, demo: server.demo ? t('settings.demoTag') : '', version: server.version })}</p>}
      </div>

      <div>
        <h2 className="t-title-m mb-3 px-1">{t('settings.account')}</h2>
        <M3eList variant="segmented">
          <M3eListItem>
            <span slot="leading" className="flex h-10 w-10 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary-container"><Icon name="person" fill /></span>
            {username}
            <div slot="trailing"><Btn icon="logout" onClick={onLogout}>{t('settings.logout')}</Btn></div>
          </M3eListItem>
        </M3eList>
      </div>
    </section>
  );
}
