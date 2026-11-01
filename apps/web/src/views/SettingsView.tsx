import { useEffect, useRef, useState, type ReactNode } from 'react';
import { M3eCard } from '@m3e/react/card';
import { M3eDivider } from '@m3e/react/divider';
import { M3eList, M3eListItem } from '@m3e/react/list';
import { api, type SettingsData } from '@/lib/api';
import { COLOR_STYLES, SEEDS } from '@/lib/color';
import { errorText } from '@/lib/actions';
import { useT, type Key } from '@/lib/i18n';
import { useStore, usePrefs } from '@/lib/store';
import { Btn, ChipSelect, Segmented, Slider, Switch, TextField } from '@/ui/controls';
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

function SectionHeading({ icon, title }: { icon: string; title: string }) {
  return (
    <h2 className="settings-section-heading t-title-m">
      <span className="settings-section-icon"><Icon name={icon} /></span>
      {title}
    </h2>
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

  const updateInfrastructure = (field: keyof SettingsData['infrastructure'], value: string) => {
    setServer(current => current ? { ...current, infrastructure: { ...current.infrastructure, [field]: value } } : current);
  };
  const saveInfrastructure = async () => {
    if (!server) return;
    try {
      const result = await api.saveInfrastructure(server.infrastructure);
      setServer(current => current ? { ...current, infrastructure: result.infrastructure } : current);
      say(t('settings.infrastructureSaved'), 'success');
    } catch (error) {
      say(errorText(error), 'error');
    }
  };

  return (
    <section className="settings-grid max-w-6xl" aria-label={t('nav.settings')}>
      <header className="settings-page-intro settings-grid--full">
        <span className="settings-page-icon"><Icon name="settings" /></span>
        <div className="min-w-0">
          <h2 className="t-headline-s">{t('nav.settings')}</h2>
          <p className="t-body-m mt-1 text-on-surface-variant">{t('settings.pageIntro')}</p>
        </div>
      </header>

      <div className="settings-section">
        <SectionHeading icon="light_mode" title={t('settings.appearance')} />
        <M3eCard variant="filled" className="block">
          <p className="t-body-m mb-4 text-on-surface-variant">{t('settings.appearanceHelp')}</p>
          <Segmented value={prefs.theme} onChange={theme => prefs.set({ theme })} options={[
            { v: 'light', label: t('theme.light') },
            { v: 'dark', label: t('theme.dark') },
            { v: 'auto', label: t('theme.auto') },
          ]} />
          <M3eDivider className="my-5" />
          <p className="t-label-l mb-1">{t('settings.language')}</p>
          <p className="t-body-s mb-3 text-on-surface-variant">{t('settings.languageHelp')}</p>
          <Segmented value={prefs.lang} onChange={lang => prefs.set({ lang })} options={[
            { v: 'auto', label: t('lang.auto') },
            { v: 'en', label: t('lang.en') },
            { v: 'pt-BR', label: t('lang.pt') },
          ]} />
        </M3eCard>
      </div>

      <div className="settings-section">
        <SectionHeading icon="contrast" title={t('settings.color')} />
        <M3eCard variant="filled" className="grid gap-5">
          <div className="settings-section">
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
          <div className="settings-section">
            <p className="t-label-l mb-1 text-on-surface-variant">{t('settings.colorStyle')}</p>
            <p className="t-body-s mb-3 text-on-surface-variant">{t('settings.colorStyleHelp')}</p>
            <ChipSelect label={t('settings.colorStyle')} value={prefs.colorStyle} onChange={colorStyle => prefs.set({ colorStyle })}
              options={COLOR_STYLES.map(v => ({ v, label: t(`style.${v}` as Key) }))} />
          </div>
          <div className="settings-section">
            <p className="t-label-l mb-1 text-on-surface-variant">{t('settings.contrast')}</p>
            <p className="t-body-s mb-3 text-on-surface-variant">{t('settings.contrastHelp')}</p>
            <Segmented value={prefs.contrast} onChange={contrast => prefs.set({ contrast })} options={[
              { v: 'standard', label: t('contrast.standard') },
              { v: 'medium', label: t('contrast.medium') },
              { v: 'high', label: t('contrast.high') },
            ]} />
          </div>
        </M3eCard>
      </div>

      <div className="settings-section settings-grid--full">
        <SectionHeading icon="apps" title={t('settings.dashboard')} />
        <M3eCard variant="filled" className="settings-list-card block">
          <M3eList variant="segmented">
            <Row title={t('settings.showPort')} sub={t('settings.showPortSub')}><Switch checked={prefs.showPort} onChange={v => prefs.set({ showPort: v })} label={t('settings.showPort')} /></Row>
            <Row title={t('settings.showServer')} sub={t('settings.showServerSub')}><Switch checked={prefs.showServer} onChange={v => prefs.set({ showServer: v })} label={t('settings.showServer')} /></Row>
            <Row title={t('settings.showLogos')} sub={t('settings.showLogosSub')}><Switch checked={prefs.showLogos} onChange={v => prefs.set({ showLogos: v })} label={t('settings.showLogos')} /></Row>
            <Row title={t('settings.showHidden')} sub={t('settings.showHiddenSub')}><Switch checked={prefs.showHidden} onChange={v => prefs.set({ showHidden: v })} label={t('settings.showHidden')} /></Row>
            <Row title={t('settings.expressive')} sub={t('settings.expressiveSub')}><Switch checked={prefs.expressive} onChange={v => prefs.set({ expressive: v })} label={t('settings.expressive')} /></Row>
          </M3eList>
        </M3eCard>
      </div>

      <div className="settings-section">
        <SectionHeading icon="schedule" title={t('settings.refresh')} />
        <M3eCard variant="filled" className="block">
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
        </M3eCard>
      </div>

      <div className="settings-section settings-grid--full">
        <SectionHeading icon="lan" title={t('settings.infrastructure')} />
        <M3eCard variant="filled" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <p className="t-body-m text-on-surface-variant md:col-span-2">{t('settings.infrastructureHelp')}</p>
          {!server ? <Loading className="py-2 md:col-span-2" /> : (
            <>
              <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
                <TextField id="infra-local-host" label={t('settings.localHost')} value={server.infrastructure.localHost}
                  onChange={value => updateInfrastructure('localHost', value)} support={t('settings.localHostHelp')} />
                <TextField id="infra-base-domain" label={t('settings.baseDomain')} value={server.infrastructure.baseDomain}
                  onChange={value => updateInfrastructure('baseDomain', value)} support={t('settings.baseDomainHelp')} />
                <TextField id="infra-tailscale" label={t('settings.tailscaleIp')} value={server.infrastructure.tailscaleIp}
                  onChange={value => updateInfrastructure('tailscaleIp', value)} support={t('settings.tailscaleIpHelp')} />
                <TextField id="infra-proxy-domain" label={t('settings.proxyDomain')} value={server.infrastructure.proxyDomain}
                  onChange={value => updateInfrastructure('proxyDomain', value)} support={t('settings.proxyDomainHelp')} />
              </div>
              <div className="flex justify-end md:col-span-2"><Btn variant="filled" icon="save" onClick={() => void saveInfrastructure()}>{t('common.save')}</Btn></div>
            </>
          )}
        </M3eCard>
      </div>

      <div className="settings-section">
        <SectionHeading icon="sync" title={t('settings.connection')} />
        <M3eList variant="segmented">
          <M3eListItem>
            <span slot="leading" className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container"><Icon name="sync" /></span>
            {t('settings.realtime')}
            <span slot="supporting-text">{conn === 'open' ? t('settings.connected') : t('settings.reconnecting')}</span>
          </M3eListItem>
        </M3eList>
        {server && <p className="t-body-s mt-2 px-1 text-on-surface-variant">{t('settings.dockerInfo', { host: server.dockerHost, demo: server.demo ? t('settings.demoTag') : '', version: server.version })}</p>}
      </div>

      <div className="settings-section">
        <SectionHeading icon="person" title={t('settings.account')} />
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
