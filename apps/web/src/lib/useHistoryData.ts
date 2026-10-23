import { useEffect, useState } from 'react';
import { api, type HistoryData } from '@/lib/api';
import { errorText } from '@/lib/actions';
import { useStore } from '@/lib/store';

export function useHistoryData() {
  const version = useStore(s => s.historyVersion);
  const [data, setData] = useState<HistoryData | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const result = await api.history();
        if (!alive) return;
        setData(result);
        setNow(Date.now());
        setError('');
        if (result.incidents.some(incident => incident.endedAt === null)) {
          timer = setTimeout(() => void load(), 10_000);
        }
      } catch (cause) {
        if (alive) setError(errorText(cause));
      }
    };
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [version, retry]);

  return { data, error, now, retry: () => setRetry(value => value + 1) };
}
