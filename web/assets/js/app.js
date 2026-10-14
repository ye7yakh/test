// Boot and routing. The server tells us which host we are on (a salon, the platform's
// landing page or its dashboard) and who is logged in; the path picks the screen.
import { api } from './api.js';
import { appReady, clear, closeOverlays, h, icon, toast } from './dom.js';
import { applyLang, setLang, getLang, t } from './i18n.js';
import { applyLooks, reducedMotion, setTheme } from './theme.js';
import { loginView } from './views/login.js';
import { salonPage } from './views/salon-page.js';
import { bookingPage } from './views/booking.js';
import { clearManageCache, manageView, PAGES } from './views/manage.js';
import { adminView } from './views/admin.js';

const root = document.getElementById('app');
let unmount = [];
// /admin is the salon owner's installable app; the rest of a salon's link is the
// customers' app. Each is its own install, so moving between them loads the page.
const isOwnerPath = (path) => path === '/admin' || path.startsWith('/admin/');
const ownerApp = isOwnerPath(location.pathname);
// The screens of both apps: /, /book, /b/<token>; /admin and /admin/<tab>.
const APP_PATH = /^\/(?:book|b\/[\w-]+|admin(?:\/[a-z]+)?)?\/?$/;

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
  /** Shows the screen at a path; replace keeps the current entry out of the back stack. */
  go(path, { replace = false } = {}) {
    if (path !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null, '', path);
    render();
  },
  toggleLang() {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
    render();
  },
  async logout() {
    await api('POST', '/api/auth/logout').catch(() => {});
    clearManageCache();
    app.ctx.user = null;
    app.go(ownerApp ? '/admin/login' : '/');
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

/** A full-screen message with a button that loads the page again. */
function failScreen(message) {
  return h('div', { class: 'boot' }, h('div', { class: 'stack center fail', role: 'alert' },
    h('span', { class: 'fail-mark', 'aria-hidden': 'true' }, icon('alert')),
    h('p', { text: message }),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, icon('undo'), t('retry')),
  ));
}

/** A view whose code loads on demand: the boot spinner until it arrives. */
function lazyView(load) {
  const holder = h('div', { class: 'boot' }, h('div', { class: 'spinner' }));
  load()
    .then((view) => holder.replaceWith(view))
    .catch((err) => {
      console.error(err);
      holder.replaceWith(failScreen(t('err.network')));
      appReady();
    });
  return holder;
}

function route() {
  const [name = '', ...rest] = location.pathname.replace(/^\/+|\/+$/g, '').split('/');
  return { name, rest };
}

function build() {
  const { name, rest } = route();
  const ctx = app.ctx;
  // The landing page is only ever on the bare domain: its code loads only there.
  if (ctx.kind === 'landing') return { theme: 'studio', view: () => lazyView(() => import('./views/landing.js').then((m) => m.landingView(app))) };
  if (ctx.kind === 'platform') return { theme: 'studio', view: () => (ctx.user ? adminView(app) : loginView(app)) };
  if (ownerApp) {
    const tab = rest[0] || 'home';
    if (tab === 'login') return app.canManage ? { redirect: '/admin' } : { theme: 'studio', view: () => loginView(app) };
    if (!app.canManage) return { redirect: '/admin/login' };
    if (!PAGES.some((p) => p.id === tab)) return { redirect: '/admin' };
    return { theme: 'studio', view: () => manageView(app, tab) };
  }
  if (name === 'b' && rest[0]) return { theme: 'public', view: () => bookingPage(app, rest[0]) };
  return { theme: 'public', view: () => salonPage(app, { book: name === 'book' }) };
}

// Which studio tab was shown last, so a tab change can slide the right way.
const TAB_ORDER = PAGES.map((p) => p.id);
let lastTab = null;
function navDirection() {
  const { rest } = route();
  const tab = ownerApp && app.ctx.kind === 'salon' ? rest[0] || 'home' : null;
  const from = TAB_ORDER.indexOf(lastTab);
  const to = TAB_ORDER.indexOf(tab);
  lastTab = tab;
  return from >= 0 && to >= 0 && from !== to ? (to > from ? 'forward' : 'back') : '';
}

// The address the current screen was drawn for (a change of #hash alone keeps it).
let shown = null;

function render() {
  const next = build();
  if (next.redirect) return app.go(next.redirect, { replace: true });
  shown = location.pathname + location.search;
  // Sheets and viewers belong to the screen that opened them. Closing one may point the
  // address elsewhere (the /book sheet goes back to /); the screen being shown keeps it.
  const here = location.href;
  // A sheet its own code closed just before (a language switch, a booking sent) is still
  // sliding away on the page: it counts too, or the cross-fade would freeze a copy of it.
  const hadOverlays = closeOverlays() > 0 || !!document.querySelector('.sheet-backdrop, .proof-viewer');
  if (location.href !== here) history.replaceState(history.state, '', here);
  document.documentElement.dataset.nav = navDirection();
  const swap = () => {
    for (const fn of unmount) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
    unmount = [];
    setTheme(next.theme);
    let view;
    try {
      view = next.view();
    } catch (err) {
      // A screen that fails to draw says so, with a way out, instead of leaving the last one half torn down.
      console.error(err);
      view = failScreen(t('err.server_error'));
      appReady();
    }
    clear(root, view);
    window.scrollTo(0, 0);
  };
  // A soft cross-fade between screens where the browser supports it (not while a sheet
  // slides away: the fade would hold a still copy of it).
  if (document.startViewTransition && !reducedMotion() && !hadOverlays && root.firstElementChild && !root.querySelector('.boot')) {
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
  const releaseSplash = holdSplash();
  try {
    app.ctx = await api('GET', '/api/context');
  } catch {
    releaseSplash();
    clear(root, failScreen(t('err.network')));
    // An installed app has no reload button: try again by itself once the phone is back online.
    addEventListener('online', () => location.reload(), { once: true });
    return;
  }
  if (app.ctx.salon) applyLooks(app.ctx.salon);
  // Back and Forward draw the screen for the new address; a #hash change alone is left to the browser.
  window.addEventListener('popstate', () => {
    if (location.pathname + location.search !== shown) render();
  });
  // Links within the app change screens without a page load. Links to the other app,
  // other sites, new tabs and downloads are left to the browser.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !APP_PATH.test(url.pathname) || isOwnerPath(url.pathname) !== ownerApp) return;
    // A jump within this screen (#section) is the browser's to scroll to.
    if (a.getAttribute('href').startsWith('#') || (url.hash && url.pathname === location.pathname && url.search === location.search)) return;
    e.preventDefault();
    app.go(url.pathname + url.search);
  });
  // Signed out elsewhere (or the session ran out): back to the login, once, even when
  // several requests fail together, and say why.
  window.addEventListener('session-expired', () => {
    if (!app.ctx.user) return;
    app.ctx.user = null;
    clearManageCache();
    app.go(ownerApp ? '/admin/login' : '/', { replace: true });
    toast(t('err.login_required'), 'error');
  });
  render();
  if ('serviceWorker' in navigator && app.ctx.kind === 'salon') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
