import { isIP } from 'node:net';
import { z } from 'zod';
import type { InfrastructureSettings, PublishedPort, ServiceAddressOverrides, ServiceAddresses } from '@shared/types';
import { getSetting, setSetting, type DB } from './db';

const portSchema = z.number().int().min(1).max(65535);
const domainLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function isHostname(value: string): boolean {
  if (isIP(value) === 4) return true;
  if (value.length > 253 || value.endsWith('.')) return false;
  return value.split('.').every(label => label.length <= 63 && domainLabel.test(label));
}

function isDomain(value: string, wildcard = false): boolean {
  const domain = wildcard && value.startsWith('*.') ? value.slice(2) : value;
  return isHostname(domain) && isIP(domain) === 0;
}

export const infrastructureSchema = z.object({
  localHost: z.string().trim().refine(value => !value || isHostname(value), 'enter an IPv4 address or hostname'),
  baseDomain: z.string().trim().toLowerCase().refine(value => !value || isDomain(value), 'enter a domain without a scheme'),
  tailscaleIp: z.string().trim().refine(value => !value || isIP(value) === 4, 'enter a Tailscale IPv4 address'),
  proxyDomain: z.string().trim().toLowerCase().refine(value => !value || isDomain(value, true), 'enter a domain or wildcard such as *.example.com'),
}).strict();

export const addressOverridesSchema = z.object({
  webPort: portSchema.nullable().optional(),
  publishedPort: z.object({
    containerPort: portSchema,
    hostPort: portSchema,
    hostIp: z.string().nullable(),
    protocol: z.literal('tcp'),
  }).nullable().optional(),
  localUrl: z.string().trim().refine(value => !value || isHttpUrl(value), 'enter a valid HTTP or HTTPS address').nullable().optional(),
  tailscaleUrl: z.string().trim().refine(value => !value || isHttpUrl(value), 'enter a valid HTTP or HTTPS address').nullable().optional(),
  proxyDomain: z.string().trim().toLowerCase().refine(value => !value || isDomain(value), 'enter a domain without a scheme').nullable().optional(),
  subdomain: z.string().trim().toLowerCase().refine(value => !value || /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value), 'enter a valid subdomain').nullable().optional(),
}).strict();

export function getInfrastructureSettings(db: DB): InfrastructureSettings {
  return {
    localHost: getSetting(db, 'infra_local_host') ?? '',
    baseDomain: getSetting(db, 'infra_base_domain') ?? '',
    tailscaleIp: getSetting(db, 'infra_tailscale_ip') ?? '',
    proxyDomain: getSetting(db, 'infra_proxy_domain') ?? '',
  };
}

export function saveInfrastructureSettings(db: DB, settings: InfrastructureSettings) {
  db.exec('BEGIN');
  try {
    setSetting(db, 'infra_local_host', settings.localHost);
    setSetting(db, 'infra_base_domain', settings.baseDomain);
    setSetting(db, 'infra_tailscale_ip', settings.tailscaleIp);
    setSetting(db, 'infra_proxy_domain', settings.proxyDomain);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function slugifyServiceName(name: string): string {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bhome$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63).replace(/-+$/g, '');
  return normalized || 'service';
}

export function uniqueSubdomain(name: string, used: Iterable<string>): string {
  const taken = new Set([...used].map(value => value.toLowerCase()));
  const base = slugifyServiceName(name);
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 10000; suffix++) {
    const candidate = `${base.slice(0, 58)}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Could not create a unique subdomain for "${name}".`);
}

export function publishedPorts(ports: { PrivatePort: number; PublicPort?: number; IP?: string; Type: string }[] = []): PublishedPort[] {
  return ports.map(port => ({
    containerPort: port.PrivatePort,
    hostPort: port.PublicPort ?? null,
    hostIp: port.IP ?? null,
    protocol: port.Type,
  }));
}

function validPort(value: string | undefined): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function sameMapping(a: PublishedPort, b: PublishedPort): boolean {
  return a.containerPort === b.containerPort && a.hostPort === b.hostPort
    && a.protocol === b.protocol && a.hostIp === b.hostIp;
}

function hostUrl(host: string, port: number | null): string | null {
  return host && port ? `http://${host}:${port}` : null;
}

function mappingAllowsHost(mapping: PublishedPort | null, host: string): boolean {
  if (!mapping || !mapping.hostPort || !mapping.hostIp || mapping.hostIp === '0.0.0.0') return true;
  return mapping.hostIp === host;
}

export function buildServiceAddresses(input: {
  name: string;
  infrastructure: InfrastructureSettings;
  publishedPorts: PublishedPort[];
  overrides?: ServiceAddressOverrides;
  usedSubdomains?: Iterable<string>;
  legacyPort?: string;
  webPortLabel?: string;
}): ServiceAddresses {
  const overrides = input.overrides ?? {};
  const customized = {
    webPort: overrides.webPort !== undefined,
    publishedPort: overrides.publishedPort !== undefined,
    localUrl: overrides.localUrl !== undefined,
    tailscaleUrl: overrides.tailscaleUrl !== undefined,
    proxyDomain: overrides.proxyDomain !== undefined,
    subdomain: overrides.subdomain !== undefined,
  };
  const legacyPort = validPort(input.legacyPort);
  const labelPort = validPort(input.webPortLabel) ?? legacyPort;
  const inferredPort = WEB_PORT_PREFERENCE.find(port => input.publishedPorts.some(mapping =>
    mapping.protocol === 'tcp' && mapping.containerPort === port)) ?? null;
  const webPort = customized.webPort
    ? overrides.webPort ?? null
    : labelPort ?? inferredPort;
  const webPortSource = customized.webPort && webPort !== null ? 'override'
    : !customized.webPort && labelPort !== null ? 'label'
      : !customized.webPort && inferredPort !== null ? 'inferred' : null;
  const matching = webPort === null ? [] : input.publishedPorts.filter(port =>
    port.protocol === 'tcp' && port.containerPort === webPort && port.hostPort !== null);
  let selected = customized.publishedPort
    ? overrides.publishedPort ?? null
    : matching.length === 1 ? matching[0] : null;
  if (selected && !input.publishedPorts.some(port => sameMapping(port, selected!))) selected = null;
  if (selected && webPort !== selected.containerPort) selected = null;

  const subdomain = customized.subdomain
    ? overrides.subdomain || uniqueSubdomain(input.name, input.usedSubdomains ?? [])
    : uniqueSubdomain(input.name, input.usedSubdomains ?? []);
  const fallbackPort = legacyPort === webPort ? webPort : null;
  const localPort = selected ? (mappingAllowsHost(selected, input.infrastructure.localHost) ? selected.hostPort : null) : fallbackPort;
  const tailscalePort = selected ? (mappingAllowsHost(selected, input.infrastructure.tailscaleIp) ? selected.hostPort : null) : fallbackPort;
  const presets = {
    localUrl: hostUrl(input.infrastructure.localHost, localPort),
    tailscaleUrl: hostUrl(input.infrastructure.tailscaleIp, tailscalePort),
    proxyUrl: (() => {
      const suffix = input.infrastructure.proxyDomain || input.infrastructure.baseDomain;
      if (!suffix) return null;
      const domain = suffix.startsWith('*.') ? suffix.slice(2) : suffix;
      return `https://${subdomain}.${domain}`;
    })(),
  };
  const customProxy = overrides.proxyDomain;
  return {
    publishedPorts: input.publishedPorts,
    webPort,
    webPortSource,
    publishedPort: selected,
    localUrl: customized.localUrl ? overrides.localUrl || null : presets.localUrl,
    tailscaleUrl: customized.tailscaleUrl ? overrides.tailscaleUrl || null : presets.tailscaleUrl,
    proxyUrl: customized.proxyDomain ? (customProxy ? `https://${customProxy}` : null) : presets.proxyUrl,
    subdomain,
    presets,
    customized,
  };
}

const WEB_PORT_PREFERENCE = [80, 8080, 8000, 3000, 8096, 8123, 5000, 443];
