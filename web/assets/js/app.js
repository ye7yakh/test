// Boot and hash routing. The server tells us which host we are on (a salon or the
// platform) and who is logged in; everything else follows from that.
import { api } from './api.js';
import { h, clear } from './dom.js';
import { applyLang, setLang, getLang, t } from './i18n.js';
import { loginView } from './views/login.js';
import { salonPage } from './views/salon-page.js';
import { manageView } from './views/manage.js';
import { adminView } from './views/admin.js';

const root = document.getElementById('app');

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
    app.ctx.user = null;
    app.go(app.ctx.kind === 'salon' ? '#/' : '#/login');
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

function render() {
  const { name, rest } = route();
  const ctx = app.ctx;
  let view;
  if (ctx.kind === 'platform') {
    view = ctx.user ? adminView(app) : loginView(app);
  } else if (name === 'login') {
    view = loginView(app);
  } else if (name === 'manage') {
    if (!app.canManage) return app.go('#/login');
    view = manageView(app, rest[0] || 'salon');
  } else {
    view = salonPage(app);
  }
  clear(root, view);
  window.scrollTo(0, 0);
}

async function boot() {
  applyLang();
  try {
    app.ctx = await api('GET', '/api/context');
  } catch {
    clear(
      root,
      h('div', { class: 'boot' }, h('div', { class: 'stack', style: { textAlign: 'center' } },
        h('p', { text: t('err.network') }),
        h('button', { class: 'btn btn-primary', type: 'button', text: t('retry'), onclick: () => location.reload() }),
      )),
    );
    return;
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('session-expired', () => {
    app.ctx.user = null;
    app.go('#/login');
  });
  render();
  if ('serviceWorker' in navigator && app.ctx.kind === 'salon') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
