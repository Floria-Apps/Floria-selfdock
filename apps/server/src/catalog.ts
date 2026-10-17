/** Category of popular home-lab apps. The key is the icon name (dashboard-icons). */
export const KNOWN: Record<string, string> = {
  jellyfin: 'media', plex: 'media', emby: 'media', immich: 'media', photoprism: 'media', navidrome: 'media',
  audiobookshelf: 'media', sonarr: 'media', radarr: 'media', prowlarr: 'media', jellyseerr: 'media', overseerr: 'media', bazarr: 'media',
  'home-assistant': 'home', frigate: 'home', zigbee2mqtt: 'home', 'node-red': 'home', mosquitto: 'home', esphome: 'home',
  'pi-hole': 'network', 'adguard-home': 'network', wireguard: 'network', tailscale: 'network', traefik: 'network', caddy: 'network',
  nginx: 'network', 'nginx-proxy-manager': 'network', 'uptime-kuma': 'network', cloudflared: 'network',
  nextcloud: 'files', 'paperless-ngx': 'files', syncthing: 'files', filebrowser: 'files', qbittorrent: 'files',
  transmission: 'files', samba: 'files', duplicati: 'files',
  vaultwarden: 'security', authelia: 'security', authentik: 'security', keycloak: 'security', crowdsec: 'security',
  portainer: 'other', dozzle: 'other', grafana: 'other', homepage: 'other', watchtower: 'other',
};

/** Nice display names for known apps (everything else becomes "Container Name"). */
const NAMES: Record<string, string> = {
  'home-assistant': 'Home Assistant', 'pi-hole': 'Pi-hole', 'adguard-home': 'AdGuard Home', wireguard: 'WireGuard',
  qbittorrent: 'qBittorrent', 'uptime-kuma': 'Uptime Kuma', 'paperless-ngx': 'Paperless-ngx', 'nginx-proxy-manager': 'Nginx Proxy Manager',
  'node-red': 'Node-RED', zigbee2mqtt: 'Zigbee2MQTT', photoprism: 'PhotoPrism', audiobookshelf: 'Audiobookshelf',
  jellyseerr: 'Jellyseerr', overseerr: 'Overseerr', filebrowser: 'File Browser', cloudflared: 'Cloudflared', crowdsec: 'CrowdSec',
};

const ALIASES: Record<string, string> = {
  homeassistant: 'home-assistant',
  pihole: 'pi-hole',
  adguardhome: 'adguard-home',
  uptimekuma: 'uptime-kuma',
  'qbittorrent-nox': 'qbittorrent',
  paperless: 'paperless-ngx',
  paperlessngx: 'paperless-ngx',
  'immich-server': 'immich',
  'immich-machine-learning': 'immich',
  'eclipse-mosquitto': 'mosquitto',
  jc21: 'nginx-proxy-manager',
  'vaultwarden-server': 'vaultwarden',
};

/** Generic image names that do not identify the app (e.g. `vaultwarden/server`): we use the organisation instead. */
const GENERIC = new Set(['server', 'app', 'web', 'core', 'latest', 'main', 'community', 'stable', 'release']);
const SKIP_ORGS = new Set(['library', 'linuxserver', 'lscr.io', 'ghcr.io', 'docker.io', 'hotio', 'bitnami']);

export function normalizeIconName(raw: string): string {
  return raw.toLowerCase().trim().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

const alias = (n: string) => ALIASES[n] ?? n;

/** Builds possible icon names, from most to least likely. */
export function iconCandidates(opts: { label?: string; image?: string; composeService?: string; name?: string }): string[] {
  const out: string[] = [];
  const add = (v?: string) => {
    if (!v) return;
    const n = normalizeIconName(v);
    if (n && n.length <= 60) { out.push(alias(n)); out.push(n); }
  };
  add(opts.label);
  if (opts.image) {
    const noTag = opts.image.split('@')[0].replace(/:[^/:]+$/, '');
    const parts = noTag.split('/').filter(Boolean);
    const last = parts[parts.length - 1] ?? '';
    const org = parts.length >= 2 ? parts[parts.length - 2] : '';
    if (GENERIC.has(last) && org && !SKIP_ORGS.has(org)) add(org);
    add(last);
    add(last.replace(/-(server|app|web|ce|docker|nox)$/, ''));
    if (org && !SKIP_ORGS.has(org) && !org.includes('.')) add(org);
  }
  add(opts.composeService);
  add(opts.name);
  return [...new Set(out)];
}

/** First candidate that is a well-known app. */
export function knownFor(candidates: string[]): { key: string; category: string } | null {
  for (const c of candidates) if (KNOWN[c]) return { key: c, category: KNOWN[c] };
  return null;
}

export function prettifyName(raw: string): string {
  return raw.replace(/[-_.]+/g, ' ').trim().replace(/\b\p{L}/gu, m => m.toUpperCase());
}

export function displayNameFor(candidates: string[]): string | null {
  for (const c of candidates) if (NAMES[c]) return NAMES[c];
  const hit = candidates.find(c => KNOWN[c]);
  return hit ? prettifyName(hit) : null;
}
