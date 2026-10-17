import fs from 'node:fs';
import path from 'node:path';

/** Sample stacks for demo mode. "monitoring" has a few problems on purpose, to show what the checker finds. */
export function seedDemoStacks(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  if (fs.readdirSync(dir).length > 0) return;
  const put = (stack: string, file: string, text: string) => {
    fs.mkdirSync(path.join(dir, stack), { recursive: true });
    fs.writeFileSync(path.join(dir, stack, file), text);
  };

  put('media', 'compose.yaml', `# Movies, TV shows and music
services:
  jellyfin:
    image: jellyfin/jellyfin:10.10.3
    restart: unless-stopped
    ports:
      - "8096:8096"
    volumes:
      - \${MEDIA_PATH}/jellyfin:/config
      - \${MEDIA_PATH}/movies:/media
    environment:
      TZ: \${TZ:-UTC}

  navidrome:
    image: deluan/navidrome:0.53.3
    restart: unless-stopped
    ports:
      - "4533:4533"
    volumes:
      - \${MEDIA_PATH}/music:/music:ro
`);
  put('media', '.env', 'MEDIA_PATH=/srv/media\nTZ=America/Sao_Paulo\n');

  put('monitoring', 'compose.yaml', `services:
  uptime-kuma:
    image: louislam/uptime-kuma:1
    ports:
      - "8081:3001"          # 8081 is already used by Pi-hole
    volumes:
      - kuma-data:/app/data

  grafana:
    image: grafana/grafana
    ports:
      - "\${GRAFANA_PORT}:3000"
    privileged: true

volumes:
  kuma-data:
`);
  put('monitoring', '.env', '# GRAFANA_PORT is missing on purpose\nTZ=UTC\n');
}
