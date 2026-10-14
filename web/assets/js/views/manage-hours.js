// Opening hours: quick presets and the visual week, saved together.
import { api } from '../api.js';
import { h, icon, savebar, stagger, toast } from '../dom.js';
import { hoursEditor } from '../hours-editor.js';
import { fmtTime, t } from '../i18n.js';
import { HOURS_PRESETS } from '../templates.js';
import { nowIn, openStatus } from '../time.js';

export function hoursPage(store, app) {
  const dirty = () => JSON.stringify(editor.value()) !== JSON.stringify(store.hours);
  const editor = hoursEditor(store.hours, { timezone: store.salon.timezone, onChange: () => bar.toggle(dirty()) });
  const bar = savebar({
    async onSave() {
      try {
        const res = await api('PUT', '/api/manage/hours', { hours: editor.value() });
        store.set({ hours: res.hours });
        editor.setWeek(res.hours);
        bar.toggle(false);
        refreshStatus();
        toast(t('hours.saved'));
      } catch (err) {
        editor.showError(err);
        throw err;
      }
    },
    onDiscard() {
      editor.setWeek(store.hours);
      bar.toggle(false);
    },
  });
  app.onUnmount(() => bar.remove());

  const status = h('span');
  const refreshStatus = () => {
    const s = openStatus(store.hours, nowIn(store.salon.timezone));
    status.className = `pill ${s.open ? 'ok' : ''}`;
    status.replaceChildren(h('span', { class: `dot ${s.open ? 'ok' : ''}` }), s.open ? `${t('home.open_now')} · ${t('home.until', { time: fmtTime(s.until) })}` : t('home.closed_now'));
  };
  refreshStatus();

  const presets = HOURS_PRESETS.map((p) => h('button', {
    class: 'chip-btn', type: 'button',
    onclick: () => {
      editor.setWeek(p.week());
      bar.toggle(dirty());
    },
  }, t(`preset.${p.id}`)));

  return h(
    'div',
    null,
    h('div', { class: 's-head' }, h('div', { class: 'grow' }, h('h1', { class: 's-title', text: t('hours.title') }), h('p', { class: 's-sub', text: t('hours.sub') }), h('div', { style: { marginTop: '12px' } }, status))),
    stagger([
      h('section', null, h('div', { class: 'section-head' }, h('h2', { class: 'row', style: { gap: '8px' } }, icon('wand'), t('hours.presets'))), h('div', { class: 'scroller fit' }, presets)),
      h('section', { class: 'section' }, h('div', { class: 'card flush' }, editor.el)),
    ]),
  );
}
