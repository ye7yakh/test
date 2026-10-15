// The Host header decides everything: which brand (tenant) and which salon a
// request belongs to. salonname.brand.com is a salon; brand.com is the platform's
// front door (its landing page), admin.brand.com is where the super admin works, and
// www. sends people to the bare domain.
import { query, one } from './db.js';

export interface Tenant {
  id: number;
  domain: string;
  /** The brand in Latin letters (Salonak) and in Arabic (صالونك). */
  name: string;
  name_ar: string;
  /** Where salon owners reach the platform from its landing page (WhatsApp). */
  contact_phone: string;
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
  booking_enabled: boolean;
  cliq_required: boolean;
  cliq_alias: string;
  cliq_name: string;
  deposit_kind: 'fixed' | 'full';
  deposit_amount: string;
  payment_window_min: number;
  cover_media_id: string | null;
  icon_media_id: string | null;
  icon_bg: IconBg;
  page_theme: 'night' | 'day';
  studio_theme: 'studio' | 'brand';
  /** Whether customers see the AI mirror (src/tryon.ts). */
  tryon: 'off' | 'on';
}

export type IconBg = 'auto' | 'white' | 'primary' | 'night';

export type PhotoStyle = 'natural' | 'warm' | 'mono' | 'brand';

/** Which site a host is: a salon's, or one of the platform's own. */
export type Site = 'salon' | 'landing' | 'admin' | 'www';

export interface HostContext {
  tenant: Tenant;
  salon: Salon | null;
  site: Site;
  /** Port from the Host header, kept so links to other subdomains work in dev. */
  port: string;
}

export const RESERVED_SUBDOMAINS = new Set([
  'www', 'admin', 'api', 'app', 'mail', 'static', 'cdn', 'assets', 'help', 'support', 'status', 'dashboard', 'login', 'platform',
]);

let tenantCache: { at: number; tenants: Tenant[] } | null = null;

async function tenants(): Promise<Tenant[]> {
  if (!tenantCache || Date.now() - tenantCache.at > 60_000) {
    const rows = await query<Tenant>(
      'select id, domain, name, name_ar, contact_phone, default_calling_code, default_timezone, default_currency from tenants',
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
  timezone, currency, color_primary, color_accent, photo_style, logo_media_id, active, updated_at,
  booking_enabled, cliq_required, cliq_alias, cliq_name, deposit_kind, trim_scale(deposit_amount)::text as deposit_amount,
  payment_window_min, cover_media_id, icon_media_id, icon_bg, page_theme, studio_theme, tryon`;

interface ParsedHost {
  tenant: Tenant;
  /** The salon's subdomain; null on the platform's own hosts. */
  sub: string | null;
  site: Site;
  port: string;
}

async function parseHost(hostHeader: string | undefined): Promise<ParsedHost | null> {
  if (!hostHeader) return null;
  const m = /^([a-z0-9.-]+?)\.?(?::(\d{1,5}))?$/i.exec(hostHeader.trim());
  if (!m) return null;
  const hostname = m[1]!.toLowerCase();
  const port = m[2] ?? '';

  for (const tenant of await tenants()) {
    if (hostname === tenant.domain) return { tenant, sub: null, site: 'landing', port };
    if (!hostname.endsWith(`.${tenant.domain}`)) continue;
    const sub = hostname.slice(0, -(tenant.domain.length + 1));
    if (sub === 'admin' || sub === 'www') return { tenant, sub: null, site: sub, port };
    if (sub.includes('.')) return null;
    return { tenant, sub, site: 'salon', port };
  }
  return null;
}

export async function resolveHost(hostHeader: string | undefined): Promise<HostContext | null> {
  const parsed = await parseHost(hostHeader);
  if (!parsed) return null;
  const { tenant, sub, site, port } = parsed;
  if (sub === null) return { tenant, salon: null, site, port };
  const salon = await one<Salon>(
    `select ${SALON_COLUMNS} from salons where tenant_id = $1 and subdomain = $2 and active`,
    [tenant.id, sub],
  );
  return salon ? { tenant, salon, site, port } : null;
}

export type OfflineHost =
  | { kind: 'moved'; tenant: Tenant; subdomain: string; port: string }
  | { kind: 'suspended'; tenant: Tenant; name_ar: string; name_en: string; port: string }
  /** A well-formed salon link on this platform that no salon has (a typo, a deleted salon). */
  | { kind: 'unknown'; tenant: Tenant; port: string };

/** A salon host that did not resolve: a renamed salon's earlier link, a suspended salon, or nobody's. */
export async function offlineHost(hostHeader: string | undefined): Promise<OfflineHost | null> {
  const parsed = await parseHost(hostHeader);
  if (!parsed || parsed.sub === null) return null;
  const { tenant, sub, port } = parsed;
  const suspended = await one<{ name_ar: string; name_en: string }>(
    'select name_ar, name_en from salons where tenant_id = $1 and subdomain = $2 and not active',
    [tenant.id, sub],
  );
  if (suspended) return { kind: 'suspended', tenant, ...suspended, port };
  const moved = await one<{ subdomain: string }>(
    `select s.subdomain from salon_aliases a join salons s on s.id = a.salon_id
      where a.tenant_id = $1 and a.subdomain = $2`,
    [tenant.id, sub],
  );
  return moved ? { kind: 'moved', tenant, subdomain: moved.subdomain, port } : { kind: 'unknown', tenant, port };
}

/**
 * The salon a typed link points at, by its current subdomain: `demo`, `demo.brand.com`
 * or `https://demo.brand.com/admin` all give `demo`, and a renamed salon's earlier
 * link gives its current one. Null when no salon has it.
 */
export async function findSalonLink(tenant: Tenant, typed: string): Promise<string | null> {
  let s = typed.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#:\s]/)[0]!.replace(/\.$/, '');
  if (s.endsWith(`.${tenant.domain}`)) s = s.slice(0, -(tenant.domain.length + 1));
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(s)) return null;
  const row = await one<{ subdomain: string }>(
    `select subdomain from salons where tenant_id = $1 and subdomain = $2
     union all
     select s.subdomain from salon_aliases a join salons s on s.id = a.salon_id where a.tenant_id = $1 and a.subdomain = $2
     limit 1`,
    [tenant.id, s],
  );
  return row?.subdomain ?? null;
}

export function salonUrl(proto: string, host: HostContext, subdomain: string): string {
  return `${proto}://${subdomain}.${host.tenant.domain}${host.port ? `:${host.port}` : ''}`;
}
