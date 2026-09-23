// Boot and hash routing. The server tells us which host we are on (a salon or the
// platform) and who is logged in; everything else follows from that.
import { api } from './api.js';
import { h, clear } from './dom.js';
import { applyLang, setLang, getLang, t } from './i18n.js';
import { reducedMotion, setTheme } from './theme.js';
import { loginView } from './views/login.js';
import { salonPage } from './views/salon-page.js';
import { bookingPage } from './views/booking.js';
import { clearManageCache, manageView } from './views/manage.js';
import { adminView } from './views/admin.js';

const root = document.getElementById('app');
let unmount = [];

const app = {
  ctx: null,
  async reload() {
    app.ctx = await api('GET', '/api/context');
    render();
  },
  go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  toggleLang() {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
    render();
  },
  async logout() {
    await api('POST', '/api/auth/logout').catch(() => {});
    clearManageCache();
    app.ctx.user = null;
    app.go(app.ctx.kind === 'salon' ? '#/' : '#/login');
  },
  /** Views register cleanup (floating bars, listeners) for when they are replaced. */
  onUnmount(fn) {
    unmount.push(fn);
  },
  get canManage() {
    const role = app.ctx?.user?.role;
    return role === 'owner' || role === 'admin';
  },
};

function route() {
  const [name = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name, rest };
}

function build() {
  const { name, rest } = route();
  const ctx = app.ctx;
  if (ctx.kind === 'platform') return { theme: 'studio', view: () => (ctx.user ? adminView(app) : loginView(app)) };
  if (name === 'login') return { theme: 'studio', view: () => loginView(app) };
  if (name === 'b' && rest[0]) return { theme: 'public', view: () => bookingPage(app, rest[0]) };
  if (name === 'manage') {
    if (!app.canManage) return { redirect: '#/login' };
    return { theme: 'studio', view: () => manageView(app, rest[0] || 'home') };
  }
  return { theme: 'public', view: () => salonPage(app) };
}

function render() {
  const next = build();
  if (next.redirect) return app.go(next.redirect);
  const swap = () => {
    for (const fn of unmount) fn();
    unmount = [];
    setTheme(next.theme);
    clear(root, next.view());
    window.scrollTo(0, 0);
  };
  // A soft cross-fade between screens where the browser supports it.
  if (document.startViewTransition && !reducedMotion() && root.firstElementChild && !root.querySelector('.boot')) {
    document.startViewTransition(swap);
  } else {
    swap();
  }
}

async function boot() {
  applyLang();
  try {
    app.ctx = await api('GET', '/api/context');
  } catch {
    clear(
      root,
      h('div', { class: 'boot' }, h('div', { class: 'stack center' },
        h('p', { text: t('err.network') }),
        h('button', { class: 'btn btn-primary', type: 'button', text: t('retry'), onclick: () => location.reload() }),
      )),
    );
    return;
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('session-expired', () => {
    app.ctx.user = null;
    clearManageCache();
    app.go('#/login');
  });
  render();
  if ('serviceWorker' in navigator && app.ctx.kind === 'salon') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
