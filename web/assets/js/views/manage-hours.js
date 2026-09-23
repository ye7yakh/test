import { api } from '../api.js';
import { busy, h, toast } from '../dom.js';
import { hoursEditor } from '../hours-editor.js';
import { t } from '../i18n.js';

export function hoursTab(store) {
  const editor = hoursEditor(store.hours);
  const save = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: t('save') });
  save.addEventListener('click', () => busy(save, async () => {
    try {
      const res = await api('PUT', '/api/manage/hours', { hours: editor.value() });
      editor.showError(null);
      store.set({ hours: res.hours });
      toast(t('saved'));
    } catch (err) {
      editor.showError(err);
      throw err;
    }
  }));
  return h(
    'div',
    { class: 'card' },
    h('h2', { text: t('hours.title') }),
    h('p', { class: 'card-help', text: t('hours.help') }),
    editor.el,
    h('div', { style: { marginTop: '16px' } }, save),
  );
}
