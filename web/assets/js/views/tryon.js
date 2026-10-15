// The AI mirror: a customer takes a selfie (or picks a photo), the AI reads his hair
// (length, texture, thickness, hairline, face shape) and offers only the men's cuts that
// hair can give, best suited first. He picks one and, if he likes, a colour, and sees it
// on himself: drawn by an AI image model, compared before/after with a slider, then
// booked in one tap. Nothing is kept: the photo goes to the server only to be read and
// redrawn, and the results live in this tab.
import { ApiError, api, prepareImage } from '../api.js';
import { clear, h, icon, legalLink, sheet, sparkles, toast, toastError } from '../dom.js';
import { errorText, pick, t } from '../i18n.js';
import { reducedMotion } from '../theme.js';
import { styleArt } from '../tryon-art.js';

// Agreed once per visit; the looks tried stay until the page is closed.
let consented = false;
const tried = [];

const MESSAGES = ['tryon.msg1', 'tryon.msg2', 'tryon.msg3', 'tryon.msg4'];
const READING = ['tryon.read1', 'tryon.read2', 'tryon.read3'];

/**
 * Radio buttons with one Tab stop: the arrow keys move through them (mirrored in Arabic)
 * and choose as they go. `isOn(button)` says which is chosen; the returned function
 * brings the buttons in line after a choice.
 */
function roving(buttons, isOn) {
  const sync = () => {
    const on = buttons.find(isOn) ?? null;
    buttons.forEach((b) => {
      b.classList.toggle('on', b === on);
      b.setAttribute('aria-checked', String(b === on));
      b.tabIndex = b === (on ?? buttons[0]) ? 0 : -1;
    });
  };
  for (const b of buttons) {
    b.addEventListener('keydown', (e) => {
      const rtl = getComputedStyle(b).direction === 'rtl';
      const step = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const to = buttons[(buttons.indexOf(b) + step + buttons.length) % buttons.length];
      to.focus();
      to.click();
    });
  }
  return sync;
}

/** Opens the mirror. `onBook(look)` books the cut tried ({ id, name, url }), or a visit (null). */
export function openTryon(app, data, { onBook } = {}) {
  const canBook = data.salon.booking_enabled && data.services.length > 0;
  const state = { step: 'photo', photo: null, photoUrl: null, catalogue: null, read: null, style: null, shade: null, stream: null, request: null, shown: null };
  const body = h('div', { class: 'mirror' });
  const back = h('button', { class: 'btn btn-secondary', type: 'button' });
  const next = h('button', { class: 'btn btn-primary sheen', type: 'button' });
  const timers = new Set();
  // Once the mirror is closed, nothing more is sent (a late shutter, a file chosen after).
  let closed = false;

  const panel = sheet({ title: t('tryon.title'), body, actions: [back, next], tall: true, onClose: cleanup });
  panel.el.classList.add('mirror-sheet');
  const foot = panel.el.querySelector('.sheet-foot');
  const catalogue = api('GET', '/api/public/tryon/styles')
    .then((c) => {
      state.catalogue = c;
      return c;
    })
    .catch((err) => {
      toastError(err);
      panel.close();
      return null;
    });

  function cleanup() {
    closed = true;
    stopCamera();
    state.request?.abort();
    for (const id of timers) clearInterval(id);
  }

  function go(step) {
    // The camera step shows the stream openCamera has just started; any other step ends it.
    if (step !== 'camera') stopCamera();
    for (const id of timers) clearInterval(id);
    timers.clear();
    state.step = step;
    clear(body, { photo: photoStep, camera: cameraStep, reading: readingStep, style: styleStep, working: workingStep, result: resultStep }[step]());
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
    if (closed) return;
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    // Looks drawn on the last photo go with it: each was chosen for that hair.
    for (const look of tried) URL.revokeObjectURL(look.url);
    tried.length = 0;
    state.photo = blob;
    state.photoUrl = URL.createObjectURL(blob);
    // A new photo is read afresh: the cuts on offer depend on the hair in it.
    state.read = null;
    state.style = null;
    catalogue.then((c) => c && go('reading'));
  }

  /** The photo sent as it is (JPEG, PNG or WebP); the answer is JSON, or an error code. */
  async function send(path, controller) {
    const res = await fetch(path, {
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
    return res;
  }

  /** A frame around the photo while the AI looks at it: a scan line, glints, a line of words. */
  function busyFrame(keys) {
    const line = h('p', { class: 'mr-msg', 'aria-live': 'polite', text: t(keys[0]) });
    let n = 0;
    timers.add(setInterval(() => {
      n = (n + 1) % keys.length;
      line.classList.remove('in');
      void line.offsetWidth;
      line.textContent = t(keys[n]);
      line.classList.add('in');
    }, 2400));
    const frame = h('div', { class: 'mr-frame' }, h('img', { src: state.photoUrl, alt: '' }), h('div', { class: 'mr-scan', 'aria-hidden': 'true' }), h('div', { class: 'mr-glints', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
    return { frame, line };
  }

  // ---------------------------------------------------------------- 1c. reading the hair

  function readingStep() {
    showFoot(true);
    back.textContent = t('tryon.cancel');
    next.hidden = true;
    back.onclick = () => {
      state.request?.abort();
      state.request = null;
      go('photo');
    };
    const { frame, line } = busyFrame(READING);
    readHair();
    return h('div', { class: 'mr-step mr-working' }, frame, h('h3', { text: t('tryon.reading') }), line);
  }

  async function readHair() {
    state.request?.abort();
    const controller = new AbortController();
    state.request = controller;
    try {
      const res = await send('/api/public/tryon/read', controller);
      const read = await res.json();
      if (state.request !== controller) return;
      state.read = read;
      go('style');
    } catch (err) {
      if (controller.signal.aborted || state.step !== 'reading') return;
      const e = err instanceof ApiError ? err : new ApiError(0, 'network');
      toastError(e);
      // A photo the AI cannot use needs another photo; anything else can be tried again.
      if (['hair_unclear', 'unsupported_image', 'image_too_small'].includes(e.code)) {
        go('photo');
        return;
      }
      for (const id of timers) clearInterval(id);
      timers.clear();
      body.querySelector('.mr-working h3').textContent = t('tryon.read_stopped');
      body.querySelector('.mr-msg').textContent = errorText(e);
      body.querySelector('.mr-working')?.classList.add('failed');
      back.textContent = t('tryon.change_photo');
      back.onclick = () => go('photo');
      next.hidden = false;
      next.disabled = false;
      next.replaceChildren(icon('undo'), t('tryon.retry'));
      next.onclick = () => go('reading');
    } finally {
      if (state.request === controller) state.request = null;
    }
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
      if (!w || !hgt || shutter.disabled) return;
      shutter.disabled = true;
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
    const read = state.read;
    const byId = new Map(c.styles.map((x) => [x.id, x]));
    const fits = read.styles.map((id) => byId.get(id)).filter(Boolean);
    const picks = new Set(read.picks);
    showFoot(true);
    back.textContent = t('tryon.change_photo');
    back.onclick = () => go('photo');
    next.hidden = false;
    next.replaceChildren(icon('wand'), t('tryon.show'));
    next.disabled = !state.style;
    next.onclick = () => go('working');

    // What the AI saw: his hair's length and texture, and his face shape.
    const profile = h(
      'div',
      { class: 'mr-me' },
      h('img', { src: state.photoUrl, alt: t('tryon.your_photo') }),
      h(
        'div',
        { class: 'grow' },
        h('b', { text: t('tryon.your_hair') }),
        h('div', { class: 'mr-traits' }, [`len_${read.hair.length}`, `tex_${read.hair.texture}`, `face_${read.hair.face}`].map((k) => h('span', { text: t(`tryon.${k}`) }))),
      ),
    );
    if (!fits.length) {
      // Nothing to try on this hair: the visit itself is still a tap away.
      next.hidden = !canBook;
      next.replaceChildren(icon('calendar'), t('book.cta'));
      next.onclick = () => {
        panel.close();
        onBook?.(null);
      };
      return h('div', { class: 'mr-step' }, profile, h('div', { class: 'mr-none' }, h('span', { class: 'ic' }, icon('scissors')), h('h3', { text: t('tryon.none_title') }), h('p', { class: 'muted', text: t('tryon.none_sub') })));
    }

    const hair = () => c.shades.find((x) => x.id === state.shade)?.hex;
    // The cards are built once; choosing a cut or a colour updates them in place, so focus
    // stays where it is and nothing replays.
    const cards = fits.map((x, i) => h(
      'button',
      { class: 'mr-style', type: 'button', role: 'radio', 'data-id': x.id, style: { '--i': String(i) }, onclick: () => chooseStyle(x) },
      picks.has(x.id) ? h('span', { class: 'mr-best' }, icon('sparkles'), t('tryon.best')) : null,
      h('span', { class: 'art' }, styleArt(x.id, { hair: hair() })),
      h('span', { class: 'n', text: pick(x, 'name') }),
    ));
    const syncStyles = roving(cards, (b) => b.dataset.id === state.style?.id);
    const chooseStyle = (x) => {
      state.style = x;
      next.disabled = false;
      syncStyles();
    };
    const swatches = [[null, t('tryon.natural'), null], ...c.shades.map((x) => [x.id, pick(x, 'name'), x.hex])].map(([id, label, hex]) => h(
      'button',
      { class: `mr-shade ${id ? '' : 'natural'}`, type: 'button', role: 'radio', title: label, 'data-id': id ?? '', onclick: () => chooseShade(id) },
      h('i', { style: hex ? { '--sw': hex } : {} }),
      h('span', { text: label }),
    ));
    const syncShades = roving(swatches, (b) => (b.dataset.id || null) === state.shade);
    const chooseShade = (id) => {
      state.shade = id;
      syncShades();
      cards.forEach((card) => card.querySelector('.art').replaceChildren(styleArt(card.dataset.id, { hair: hair() })));
    };
    syncStyles();
    syncShades();

    const best = cards.filter((b) => picks.has(b.dataset.id));
    const more = cards.filter((b) => !picks.has(b.dataset.id));
    return h(
      'div',
      { class: 'mr-step' },
      profile,
      // One choice, so one radio group: the best suited first, then the others.
      h(
        'div',
        { role: 'radiogroup', 'aria-label': t('tryon.pick_cut') },
        h('h3', { class: 'mr-h' }, icon('sparkles'), t('tryon.for_you')),
        h('div', { class: 'mr-styles' }, best),
        more.length ? h('h3', { class: 'mr-h', text: t('tryon.also') }) : null,
        more.length ? h('div', { class: 'mr-styles' }, more) : null,
      ),
      read.hidden ? h('p', { class: 'mr-hidden' }, icon('clock'), h('span', { text: t('tryon.hidden', { n: read.hidden }) })) : null,
      h('h3', { class: 'mr-h', text: t('tryon.shade') }),
      h('div', { class: 'mr-shades', role: 'radiogroup', 'aria-label': t('tryon.shade') }, swatches),
    );
  }

  // ---------------------------------------------------------------- 3. the AI at work

  function workingStep() {
    showFoot(true);
    back.textContent = t('tryon.cancel');
    next.hidden = true;
    back.onclick = () => {
      // Stopped: the picture on its way is no longer wanted.
      state.request?.abort();
      state.request = null;
      go('style');
    };
    const { frame, line } = busyFrame(MESSAGES);
    run();
    return h(
      'div',
      { class: 'mr-step mr-working' },
      frame,
      h('h3', { text: t('tryon.working') }),
      line,
      h('div', { class: 'mr-chip' }, h('span', { class: 'art' }, styleArt(state.style.id, { hair: state.catalogue.shades.find((x) => x.id === state.shade)?.hex })), h('span', { text: lookName(state.style, shadeOf(state.shade)) })),
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
      const res = await send(`/api/public/tryon?${query}`, controller);
      const blob = await res.blob();
      if (state.request !== controller) return;
      const look = { id: shade ? `${style.id}:${shade.id}` : style.id, name: lookName(style, shade), style, shade, blob, url: URL.createObjectURL(blob) };
      tried.unshift(look);
      state.shown = look;
      go('result');
    } catch (err) {
      if (controller.signal.aborted) return;
      toastError(err instanceof ApiError ? err : new ApiError(0, 'network'));
      if (state.step === 'working') go(['tryon_refused', 'hair_unclear', 'image_too_small', 'unsupported_image'].includes(err?.code) ? 'photo' : 'style');
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
