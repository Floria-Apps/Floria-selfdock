import type { ServerMsg, Service } from '@shared/types';
import { useStore } from './store';

let ws: WebSocket | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
let running = false;

function apply(msg: ServerMsg) {
  const s = useStore;
  switch (msg.type) {
    case 'snapshot':
      s.setState({
        services: Object.fromEntries(msg.services.map(x => [x.id, x])),
        metrics: msg.metrics, alerts: msg.alerts, docker: msg.docker,
      });
      break;
    case 'service.upsert':
      s.setState(st => ({ services: { ...st.services, [msg.service.id]: msg.service } }));
      break;
    case 'service.remove':
      s.setState(st => { const next: Record<string, Service> = { ...st.services }; delete next[msg.id]; return { services: next }; });
      break;
    case 'metrics': s.setState({ metrics: msg.metrics }); break;
    case 'alerts': s.setState({ alerts: msg.alerts }); break;
    case 'docker': s.setState({ docker: msg.docker }); break;
    case 'history.changed': s.setState(st => ({ historyVersion: st.historyVersion + 1 })); break;
    case 'stack.job':
      s.setState(st => {
        const cur = st.jobs[msg.name];
        const base = cur && cur.id === msg.id ? cur : { id: msg.id, action: msg.action, text: '', running: true, code: null };
        return { jobs: { ...st.jobs, [msg.name]: { ...base, text: base.text + (msg.chunk ?? ''), running: !msg.done, code: msg.done ? msg.code ?? null : null } } };
      });
      break;
  }
}

function connect() {
  if (!running) return;
  useStore.setState({ conn: 'connecting' });
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`;
  ws = new WebSocket(url);
  ws.onopen = () => { attempt = 0; useStore.setState({ conn: 'open' }); };
  ws.onmessage = e => { try { apply(JSON.parse(e.data as string) as ServerMsg); } catch { /* unexpected message */ } };
  ws.onclose = e => {
    ws = null;
    useStore.setState({ conn: 'closed' });
    if (!running) return;
    if (e.code === 4401) { useStore.getState().setAuth('login'); return; }
    // retry with growing delays: 1 s, 2 s, 4 s... up to 15 s
    timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** attempt++));
  };
}

export function startLive() {
  if (running) return;
  running = true;
  connect();
}

export function stopLive() {
  running = false;
  clearTimeout(timer);
  ws?.close();
  ws = null;
  useStore.setState({ services: {}, metrics: null, alerts: [], conn: 'closed' });
}
