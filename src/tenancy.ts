// The Host header decides everything: which brand (tenant) and which salon a
// request belongs to. salonname.brand.com is a salon; brand.com, www. and admin.
// are the platform host where the super admin works.
import { query, one } from './db.js';

export interface Tenant {
  id: number;
  domain: string;
  name: string;
  default_calling_code: string;
  default_timezone: string;
  default_currency: string;
}

export interface Salon {
  id: number;
  tenant_id: number;
  subdomain: string;
  name_ar: string;
  name_en: string;
  about_ar: string;
  about_en: string;
  phone: string;
  address: string;
  timezone: string;
  currency: string;
  color_primary: string;
  color_accent: string;
  photo_style: PhotoStyle;
  logo_media_id: string | null;
  active: boolean;
  updated_at: Date;
}

export type PhotoStyle = 'natural' | 'warm' | 'mono' | 'brand';

export interface HostContext {
  tenant: Tenant;
  salon: Salon | null;
  /** Port from the Host header, kept so links to other subdomains work in dev. */
  port: string;
}

const PLATFORM_PREFIXES = new Set(['www', 'admin']);
export const RESERVED_SUBDOMAINS = new Set([
  ...PLATFORM_PREFIXES,
  'api', 'app', 'mail', 'static', 'cdn', 'assets', 'help', 'support', 'status', 'dashboard', 'login', 'platform',
]);

let tenantCache: { at: number; tenants: Tenant[] } | null = null;

async function tenants(): Promise<Tenant[]> {
  if (!tenantCache || Date.now() - tenantCache.at > 60_000) {
    const rows = await query<Tenant>(
      'select id, domain, name, default_calling_code, default_timezone, default_currency from tenants',
    );
    // Longest domain first so a.brand.com wins over brand.com if both are tenants.
    rows.sort((a, b) => b.domain.length - a.domain.length);
    tenantCache = { at: Date.now(), tenants: rows };
  }
  return tenantCache.tenants;
}

export function clearTenantCache(): void {
  tenantCache = null;
}

export const SALON_COLUMNS = `id, tenant_id, subdomain, name_ar, name_en, about_ar, about_en, phone, address,
  timezone, currency, color_primary, color_accent, photo_style, logo_media_id, active, updated_at`;

export async function resolveHost(hostHeader: string | undefined): Promise<HostContext | null> {
  if (!hostHeader) return null;
  const m = /^([a-z0-9.-]+?)\.?(?::(\d{1,5}))?$/i.exec(hostHeader.trim());
  if (!m) return null;
  const hostname = m[1]!.toLowerCase();
  const port = m[2] ?? '';

  for (const tenant of await tenants()) {
    if (hostname === tenant.domain) return { tenant, salon: null, port };
    if (!hostname.endsWith(`.${tenant.domain}`)) continue;
    const sub = hostname.slice(0, -(tenant.domain.length + 1));
    if (PLATFORM_PREFIXES.has(sub)) return { tenant, salon: null, port };
    if (sub.includes('.')) return null;
    const salon = await one<Salon>(
      `select ${SALON_COLUMNS} from salons where tenant_id = $1 and subdomain = $2 and active`,
      [tenant.id, sub],
    );
    return salon ? { tenant, salon, port } : null;
  }
  return null;
}

export function salonUrl(proto: string, host: HostContext, subdomain: string): string {
  return `${proto}://${subdomain}.${host.tenant.domain}${host.port ? `:${host.port}` : ''}`;
}
