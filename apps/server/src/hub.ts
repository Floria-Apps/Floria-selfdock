import type { WebSocket } from 'ws';
import type { ServerMsg } from '@shared/types';

export class Hub {
  private clients = new Set<WebSocket>();
  get size() { return this.clients.size; }
  add(ws: WebSocket) { this.clients.add(ws); ws.on('close', () => this.clients.delete(ws)); }
  broadcast(msg: ServerMsg) {
    if (!this.clients.size) return;
    const data = JSON.stringify(msg);
    for (const c of this.clients) if (c.readyState === 1) c.send(data);
  }
  closeAll() { for (const c of this.clients) c.close(1001, 'server shutting down'); }
}
