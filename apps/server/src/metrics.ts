import fs from 'node:fs';
import os from 'node:os';
import type { Metrics } from '@shared/types';

function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function memory(): { used: number; total: number } {
  try {
    const txt = fs.readFileSync('/proc/meminfo', 'utf8');
    const total = Number(/MemTotal:\s+(\d+)/.exec(txt)?.[1]) * 1024;
    const avail = Number(/MemAvailable:\s+(\d+)/.exec(txt)?.[1]) * 1024;
    if (total > 0 && avail >= 0) return { used: total - avail, total };
  } catch { /* not on Linux */ }
  const total = os.totalmem();
  return { used: total - os.freemem(), total };
}

export class MetricsCollector {
  private prev = cpuTimes();
  constructor(private diskPath: string) {}

  async sample(containers: { running: number; total: number }): Promise<Metrics> {
    const cur = cpuTimes();
    const dTotal = cur.total - this.prev.total, dIdle = cur.idle - this.prev.idle;
    this.prev = cur;
    const cpu = dTotal > 0 ? Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100)) : 0;

    const mem = memory();
    let disk = { used: 0, total: 0, percent: 0 };
    try {
      const s = await fs.promises.statfs(this.diskPath);
      const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
      disk = { used: total - free, total, percent: total ? ((total - free) / total) * 100 : 0 };
    } catch { /* invalid path: report zeros */ }

    return {
      at: Date.now(),
      cpu,
      ram: { ...mem, percent: mem.total ? (mem.used / mem.total) * 100 : 0 },
      disk,
      uptime: os.uptime(),
      containers,
    };
  }
}
