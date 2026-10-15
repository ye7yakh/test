// The AI mirror: a customer takes a selfie (or picks a photo), chooses a haircut and,
// if they like, a colour, and sees it on themselves: drawn by an AI image model,
// compared before/after with a slider, then booked in one tap. Nothing is kept: the
// photo goes to the server only to be redrawn, and the results live in this tab.
import { ApiError, api, prepareImage } from '../api.js';
import { clear, h, icon, legalLink, sheet, sparkles, toast, toastError } from '../dom.js';
import { pick, t } from '../i18n.js';
import { reducedMotion } from '../theme.js';
import { styleArt } from '../tryon-art.js';

// Agreed once per visit; the looks tried stay until the page is closed.
let consented = false;
const tried = [];

const MESSAGES = ['tryon.msg1', 'tryon.msg2', 'tryon.msg3', 'tryon.msg4'];

/** Opens the mirror. `onBook(look)` books the cut tried: { id, name, url }. */
export function openTryon(app, data, { onBook } = {}) {
  const canBook = data.salon.booking_enabled && data.services.length > 0;
  const state = { step: 'photo', photo: null, photoUrl: null, catalogue: null, group: null, style: null, shade: null, stream: null, request: null, shown: null };
  const body = h('div', { class: 'mirror' });
  const back = h('button', { class: 'btn btn-secondary', type: 'button' });
  const next = h('button', { class: 'btn btn-primary sheen', type: 'button' });
  const timers = new Set();

  const panel = sheet({ title: t('tryon.title'), body, actions: [back, next], tall: true, onClose: cleanup });
  panel.el.classList.add('mirror-sheet');
  const foot = panel.el.querySelector('.sheet-foot');
  const catalogue = api('GET', '/api/public/tryon/styles')
    .then((c) => {
      state.catalogue = c;
      state.group = c.audience === 'women' ? 'women' : 'men';
      return c;
    })
    .catch((err) => {
      toastError(err);
      panel.close();
      return null;
    });

  function cleanup() {
    stopCamera();
    state.request?.abort();
    for (const id of timers) clearInterval(id);
  }

  function go(step) {
    stopCamera();
    for (const id of timers) clearInterval(id);
    timers.clear();
    state.step = step;
    clear(body, { photo: photoStep, camera: cameraStep, style: styleStep, working: workingStep, result: resultStep }[step]());
    panel.el.querySelector('.sheet-body').scrollTop = 0;
  }

  const showFoot = (show) => {
    foot.hidden = !show;
  };

  // ---------------------------------------------------------------- 1. the photo

  function photoStep() {
    showFoot(false);
    const agree = h('input', { type: 'checkbox', class: 'mr-check-input', checked: consented });
    const take = h('button', { class: 'btn btn-primary btn-block sheen', type: 'button', disabled: !consented, onclick: openCamera }, icon('camera'), t('tryon.camera'));
    const upload = h('button', { class: 'btn btn-secondary btn-block', type: 'button', disabled: !consented, onclick: () => pickFile(false) }, icon('image'), t('tryon.upload'));
    agree.addEventListener('change', () => {
      consented = agree.checked;
      take.disabled = upload.disabled = !consented;
    });
    return h(
      'div',
      { class: 'mr-step mr-intro' },
      h('div', { class: 'mr-orb', 'aria-hidden': 'true' }, h('div', { class: 'mr-bulbs' }, Array.from({ length: 16 }, (_, i) => h('i', { style: { '--i': String(i) } }))), h('div', { class: 'mr-orb-core' }, icon('wand'))),
      h('h3', { text: t('tryon.intro_title') }),
      h('p', { class: 'muted', text: t('tryon.intro_sub') }),
      h('ul', { class: 'mr-tips' }, [['user', 'tryon.tip_face'], ['scissors', 'tryon.tip_hair'], ['sparkles', 'tryon.tip_light']].map(([ic, key]) => h('li', null, h('span', { class: 'ic' }, icon(ic)), h('span', { text: t(key) })))),
      h('label', { class: 'mr-check' }, agree, h('span', null, t('tryon.consent'), ' ', legalLink('privacy', { newTab: true }))),
      h('div', { class: 'mr-actions' }, take, upload),
    );
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) return pickFile(true);
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
    } catch {
      // No camera, or permission refused: the phone's own camera through the file picker.
      return pickFile(true);
    }
    go('camera');
  }

  function stopCamera() {
    state.stream?.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }

  function pickFile(selfie) {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
    if (selfie) input.setAttribute('capture', 'user');
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (file) setPhoto(await asPhoto(file));
    }, { once: true });
    input.addEventListener('cancel', () => input.remove(), { once: true });
    document.body.append(input);
    input.click();
  }

  function setPhoto(blob) {
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    state.photo = blob;
    state.photoUrl = URL.createObjectURL(blob);
    catalogue.then((c) => c && go('style'));
  }

  // ---------------------------------------------------------------- 1b. the camera

  function cameraStep() {
    showFoot(false);
    const video = h('video', { class: 'mr-video', autoplay: true, muted: true, playsinline: true });
    video.srcObject = state.stream;
    const shutter = h('button', { class: 'mr-shutter', type: 'button', 'aria-label': t('tryon.capture') }, h('span'));
    shutter.addEventListener('click', () => {
      const w = video.videoWidth;
      const hgt = video.videoHeight;
      if (!w || !hgt) return;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1280 / Math.max(w, hgt));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(hgt * scale);
      const ctx = canvas.getContext('2d');
      // Saved the way the customer saw themselves: mirrored.
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      body.querySelector('.mr-cam')?.classList.add('flash');
      canvas.toBlob((blob) => blob && setPhoto(blob), 'image/jpeg', 0.92);
    });
    return h(
      'div',
      { class: 'mr-step' },
      h(
        'div',
        { class: 'mr-cam' },
        video,
        // An oval to put the face and the hair in.
        h('div', { class: 'mr-guide', 'aria-hidden': 'true' }, h('i')),
        h('p', { class: 'mr-cam-hint', text: t('tryon.cam_hint') }),
      ),
      h('div', { class: 'mr-cam-bar' }, h('button', { class: 'link-btn', type: 'button', onclick: () => go('photo'), text: t('tryon.cancel') }), shutter, h('span', { class: 'mr-cam-spacer' })),
    );
  }

  // ---------------------------------------------------------------- 2. the cut and the colour

  function styleStep() {
    const c = state.catalogue;
    showFoot(true);
    back.textContent = t('tryon.change_photo');
    back.onclick = () => go('photo');
    next.hidden = false;
    next.replaceChildren(icon('wand'), t('tryon.show'));
    next.disabled = !state.style;
    next.onclick = () => go('working');

    const grid = h('div', { class: 'mr-styles', role: 'radiogroup', 'aria-label': t('tryon.pick_style') });
    const shades = h('div', { class: 'mr-shades', role: 'radiogroup', 'aria-label': t('tryon.shade') });
    const hair = () => c.shades.find((s) => s.id === state.shade)?.hex;
    const drawStyles = () => {
      const list = c.styles.filter((s) => c.audience !== 'all' || s.audience === state.group);
      clear(grid, list.map((s, i) => h(
        'button',
        {
          class: `mr-style ${state.style?.id === s.id ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(state.style?.id === s.id), style: { '--i': String(i) },
          onclick: () => {
            state.style = s;
            // A colour men's cuts do not offer is dropped when switching to one.
            if (s.audience === 'men' && !c.shades.find((x) => x.id === state.shade)?.men) state.shade = null;
            next.disabled = false;
            drawStyles();
            drawShades();
          },
        },
        h('span', { class: 'art' }, styleArt(s.id, { hair: hair() })),
        h('span', { class: 'n', text: pick(s, 'name') }),
      )));
    };
    const drawShades = () => {
      const men = (state.style?.audience ?? state.group) === 'men';
      const swatch = (id, label, hex) => h(
        'button',
        { class: `mr-shade ${state.shade === id ? 'on' : ''} ${id ? '' : 'natural'}`, type: 'button', role: 'radio', 'aria-checked': String(state.shade === id), title: label,
          onclick: () => {
            state.shade = id;
            drawShades();
            drawStyles();
          } },
        h('i', { style: hex ? { '--sw': hex } : {} }),
        h('span', { text: label }),
      );
      clear(shades, swatch(null, t('tryon.natural'), null), c.shades.filter((s) => !men || s.men).map((s) => swatch(s.id, pick(s, 'name'), s.hex)));
    };
    drawStyles();
    drawShades();

    const groups = c.audience === 'all'
      ? h('div', { class: 'segmented mr-groups', role: 'radiogroup', 'aria-label': t('tryon.pick_style') }, ['men', 'women'].map((g) => {
          const input = h('input', { type: 'radio', name: 'mr-group', value: g, checked: state.group === g });
          input.addEventListener('change', () => {
            state.group = g;
            if (state.style?.audience !== g) {
              state.style = null;
              next.disabled = true;
            }
            drawStyles();
            drawShades();
          });
          return h('label', null, input, h('span', { text: t(`tryon.${g}`) }));
        }))
      : null;

    return h(
      'div',
      { class: 'mr-step' },
      h('div', { class: 'mr-me' }, h('img', { src: state.photoUrl, alt: t('tryon.your_photo') }), h('div', { class: 'grow' }, h('b', { text: t('tryon.your_photo') }), h('span', { class: 'muted', text: t('tryon.pick_hint') }))),
      groups,
      h('h3', { class: 'mr-h', text: t('tryon.pick_style') }),
      grid,
      h('h3', { class: 'mr-h', text: t('tryon.shade') }),
      shades,
    );
  }

  // ---------------------------------------------------------------- 3. the AI at work

  function workingStep() {
    showFoot(true);
    back.textContent = t('tryon.cancel');
    next.hidden = true;
    const line = h('p', { class: 'mr-msg', 'aria-live': 'polite', text: t(MESSAGES[0]) });
    let n = 0;
    back.onclick = () => {
      // Stopped: the picture on its way is no longer wanted.
      state.request?.abort();
      state.request = null;
      go('style');
    };
    timers.add(setInterval(() => {
      n = (n + 1) % MESSAGES.length;
      line.classList.remove('in');
      void line.offsetWidth;
      line.textContent = t(MESSAGES[n]);
      line.classList.add('in');
    }, 2400));
    run();
    return h(
      'div',
      { class: 'mr-step mr-working' },
      h('div', { class: 'mr-frame' }, h('img', { src: state.photoUrl, alt: '' }), h('div', { class: 'mr-scan', 'aria-hidden': 'true' }), h('div', { class: 'mr-glints', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))),
      h('h3', { text: t('tryon.working') }),
      line,
      h('div', { class: 'mr-chip' }, h('span', { class: 'art' }, styleArt(state.style.id, { hair: state.catalogue.shades.find((s) => s.id === state.shade)?.hex })), h('span', { text: lookName(state.style, shadeOf(state.shade)) })),
    );
  }

  const shadeOf = (id) => state.catalogue.shades.find((s) => s.id === id) ?? null;
  const lookName = (style, shade) => (shade ? `${pick(style, 'name')} · ${pick(shade, 'name')}` : pick(style, 'name'));

  async function run() {
    const controller = new AbortController();
    state.request = controller;
    const style = state.style;
    const shade = shadeOf(state.shade);
    const query = `style=${encodeURIComponent(style.id)}${shade ? `&shade=${encodeURIComponent(shade.id)}` : ''}`;
    try {
      const res = await fetch(`/api/public/tryon?${query}`, {
        method: 'POST',
        body: state.photo,
        headers: { 'Content-Type': state.photo.type || 'image/jpeg' },
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(res.status, data.error || 'tryon_failed', data.field);
      }
      const blob = await res.blob();
      if (state.request !== controller) return;
      const look = { id: shade ? `${style.id}:${shade.id}` : style.id, name: lookName(style, shade), style, shade, blob, url: URL.createObjectURL(blob) };
      tried.unshift(look);
      state.shown = look;
      go('result');
    } catch (err) {
      if (controller.signal.aborted) return;
      toastError(err instanceof ApiError ? err : new ApiError(0, 'network'));
      if (state.step === 'working') go(err?.code === 'tryon_refused' || err?.code === 'image_too_small' || err?.code === 'unsupported_image' ? 'photo' : 'style');
    } finally {
      if (state.request === controller) state.request = null;
    }
  }

  // ---------------------------------------------------------------- 4. the result

  function resultStep() {
    const look = state.shown;
    showFoot(true);
    next.hidden = !canBook;
    back.textContent = t('tryon.another');
    back.onclick = () => go('style');
    next.replaceChildren(icon('calendar'), t('tryon.book'));
    next.disabled = false;
    next.onclick = () => {
      panel.close();
      onBook?.({ id: look.id, name: look.name, url: look.url });
    };

    // Before on one side, after on the other, the slider between: always left to right.
    const range = h('input', { type: 'range', min: 0, max: 100, value: 100, class: 'mr-range', 'aria-label': t('tryon.compare') });
    const compare = h(
      'div',
      { class: 'mr-compare', dir: 'ltr' },
      h('img', { class: 'mr-before', src: state.photoUrl, alt: t('tryon.before') }),
      h('div', { class: 'mr-after' }, h('img', { src: look.url, alt: t('tryon.after_alt', { name: look.name }) })),
      h('div', { class: 'mr-handle', 'aria-hidden': 'true' }, h('span', null, icon('sort'))),
      h('span', { class: 'mr-tag is-before', text: t('tryon.before') }),
      h('span', { class: 'mr-tag is-after', text: t('tryon.after') }),
      range,
    );
    const set = (v) => compare.style.setProperty('--x', `${v}%`);
    range.addEventListener('input', () => set(range.value));
    set(100);
    // The reveal: the new look wipes in from the side, then rests at the middle.
    const img = compare.querySelector('.mr-after img');
    const reveal = () => {
      if (reducedMotion()) {
        range.value = '50';
        set(50);
        return;
      }
      const start = performance.now();
      const frame = (now) => {
        const p = Math.min(1, (now - start) / 1100);
        const v = 100 - 50 * (1 - (1 - p) ** 3);
        range.value = String(v);
        set(v);
        if (p < 1 && compare.isConnected) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      sparkles(compare, 22);
    };
    if (img.complete) requestAnimationFrame(reveal);
    else img.addEventListener('load', reveal, { once: true });

    const save = async () => {
      const file = new File([look.blob], 'look.jpg', { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: look.name });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }
      const a = h('a', { href: look.url, download: `${look.style.id}.jpg`, hidden: true });
      document.body.append(a);
      a.click();
      a.remove();
      toast(t('tryon.saved'));
    };

    return h(
      'div',
      { class: 'mr-step mr-result' },
      compare,
      h(
        'div',
        { class: 'mr-look' },
        h('span', { class: 'art' }, styleArt(look.style.id, { hair: look.shade?.hex })),
        h('div', { class: 'grow' }, h('b', { text: look.name }), h('span', { class: 'muted', text: t('tryon.from_mirror') })),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('tryon.save'), title: t('tryon.save'), onclick: save }, icon('download')),
      ),
      tried.length > 1
        ? h(
            'div',
            { class: 'mr-history' },
            h('h3', { class: 'mr-h', text: t('tryon.history') }),
            h('div', { class: 'scroller mr-tried' }, tried.map((x) => h(
              'button',
              { class: `mr-thumb ${x === look ? 'on' : ''}`, type: 'button', 'aria-label': x.name, 'aria-pressed': String(x === look), onclick: () => {
                state.shown = x;
                go('result');
              } },
              h('img', { src: x.url, alt: '' }),
              h('span', { text: x.name }),
            ))),
          )
        : null,
      h('p', { class: 'mr-note' }, icon('sparkles'), h('span', { text: t('tryon.note') })),
    );
  }

  go('photo');
  return panel;
}

/**
 * The chosen photo as something the server reads (JPEG, PNG or WebP), at most 1280
 * pixels: an iPhone's HEIC is redrawn as a JPEG where the browser can open it.
 */
async function asPhoto(file) {
  const ready = await prepareImage(file, 1280);
  if (/^image\/(jpeg|png|webp)$/.test(ready.type)) return ready;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return (await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.9))) ?? ready;
  } catch {
    return ready; // the server says it cannot read it, and the customer picks another
  }
}
