// Boot and hash routing. The server tells us which host we are on (a salon or the
// platform) and who is logged in; everything else follows from that.
import { api } from './api.js';
import { h, clear } from './dom.js';
import { applyLang, setLang, getLang, t } from './i18n.js';
import { applyLooks, reducedMotion, setTheme } from './theme.js';
import { loginView } from './views/login.js';
import { salonPage } from './views/salon-page.js';
import { bookingPage } from './views/booking.js';
import { clearManageCache, manageView, PAGES } from './views/manage.js';
import { adminView } from './views/admin.js';

const root = document.getElementById('app');
let unmount = [];
// /manage is the owner's installable app; everything else is the customers' app.
const ownerApp = location.pathname === '/manage';

// Android and desktop Chrome offer to install; the offer is kept for our own buttons.
let installOffer = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installOffer = e;
  dispatchEvent(new Event('install-ready'));
});
addEventListener('appinstalled', () => {
  installOffer = null;
});

const app = {
  ctx: null,
  ownerApp,
  isIOS: /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  installed: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  canInstall: () => !!installOffer,
  /** Shows the browser's install prompt; true if the person installed. */
  async install() {
    const offer = installOffer;
    if (!offer) return false;
    installOffer = null;
    offer.prompt();
    return (await offer.userChoice).outcome === 'accepted';
  },
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
    app.go(app.ctx.kind === 'salon' && !ownerApp ? '#/' : '#/login');
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
  // The owner's app only shows the studio (and its login).
  if (ownerApp && name !== 'manage') return { redirect: '#/manage' };
  if (name === 'b' && rest[0]) return { theme: 'public', view: () => bookingPage(app, rest[0]) };
  if (name === 'manage') {
    if (!app.canManage) return { redirect: '#/login' };
    return { theme: 'studio', view: () => manageView(app, rest[0] || 'home') };
  }
  return { theme: 'public', view: () => salonPage(app) };
}

// Which studio tab was shown last, so a tab change can slide the right way.
const TAB_ORDER = PAGES.map((p) => p.id);
let lastTab = null;
function navDirection() {
  const { name, rest } = route();
  const tab = name === 'manage' && app.ctx.kind === 'salon' ? rest[0] || 'home' : null;
  const from = TAB_ORDER.indexOf(lastTab);
  const to = TAB_ORDER.indexOf(tab);
  lastTab = tab;
  return from >= 0 && to >= 0 && from !== to ? (to > from ? 'forward' : 'back') : '';
}

function render() {
  const next = build();
  if (next.redirect) return app.go(next.redirect);
  document.documentElement.dataset.nav = navDirection();
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

/**
 * The server paints the salon's splash (icon and name) inside #app. It moves to an
 * overlay above the app and fades once the first screen has its content, a moment
 * longer when the app was opened from the home screen, so it reads as a launch.
 */
function holdSplash() {
  const splash = root.querySelector('.splash');
  if (!splash) return () => {};
  document.body.append(splash);
  splash.classList.add('overlay');
  const started = performance.now();
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    const wait = Math.max(0, (installed ? 900 : 250) - (performance.now() - started));
    setTimeout(() => {
      splash.classList.add('out');
      setTimeout(() => splash.remove(), 600);
    }, wait);
  };
  addEventListener('app-ready', release, { once: true });
  setTimeout(release, 3000);
  return release;
}

async function boot() {
  applyLang();
  if (ownerApp && !/^#\/(manage|login)/.test(location.hash)) history.replaceState(null, '', '/manage#/manage');
  const releaseSplash = holdSplash();
  try {
    app.ctx = await api('GET', '/api/context');
  } catch {
    releaseSplash();
    clear(
      root,
      h('div', { class: 'boot' }, h('div', { class: 'stack center' },
        h('p', { text: t('err.network') }),
        h('button', { class: 'btn btn-primary', type: 'button', text: t('retry'), onclick: () => location.reload() }),
      )),
    );
    return;
  }
  if (app.ctx.salon) applyLooks(app.ctx.salon);
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
