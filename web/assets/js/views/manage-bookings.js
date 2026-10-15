// Bookings: the owner's day. Deposits waiting for a check come first, then the day as
// a timeline: the visits in order, the free time between them and a line at the
// current time. On a wide screen the day sits beside a column with the deposits, a
// summary of the day and the booking the owner opened. From here the owner confirms
// CliQ transfers, marks visits, adds bookings taken by phone and sets how booking works.
import { api } from '../api.js';
import { avatar, busy, clear, field, h, icon, input, markInvalid, sheet, stagger, switchRow, toast, trackOverlay } from '../dom.js';
import { currencySymbol, errorText, fmtDuration, fmtHour, fmtPrice, fmtTime, getLang, iso, pick, t, westernDigits } from '../i18n.js';
import { addDays, dateOf, dayLabel, dayStrip, fmtDate, periodIcon } from '../slots.js';
import { reducedMotion } from '../theme.js';
import { nowIn, toMin } from '../time.js';

const HOLDING = new Set(['pending_payment', 'payment_sent', 'confirmed']);
const COUNTED = new Set([...HOLDING, 'completed', 'no_show']);
const AWAITING = new Set(['pending_payment', 'payment_sent']);
const PAST_DAYS = 7;
const AHEAD_DAYS = 30;
const WINDOWS = [15, 30, 60, 120];
const QUARTERS = [0, 15, 30, 45];
const WIDE = '(min-width: 1080px)';

// The day the owner was looking at, kept while they visit other tabs.
let viewDate = null;
// Our own changes echo back over the live stream; they need no announcement.
let quietUntil = 0;
const quiet = () => {
  quietUntil = Date.now() + 2500;
};

const wide = () => matchMedia(WIDE).matches;
/** The button the last decision came from (see keepFocus). */
let actedFrom = null;
/** Cancelled or expired: no longer on the timeline. */
const dropped = (b) => !COUNTED.has(b.status);
const startOf = (b) => toMin(b.start);
const endOf = (b) => toMin(b.start) + b.duration_min;
const round3 = (n) => Math.round(n * 1000) / 1000;
const sum = (list) => round3(list.reduce((a, b) => a + Number(b.price), 0));
const mmss = (seconds) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const statusPill = (status) => h('span', { class: `pill status-${status}`, text: t(`status.${status}`) });
/**
 * Minutes from now until the visit starts, on the salon's clock (0 or less once it has).
 * The server's own `upcoming` wins when it says the visit has already started.
 */
function untilStart(ctx, b) {
  if (!b.upcoming) return 0;
  const today = ctx?.today();
  if (!today) return Infinity;
  const days = Math.round((dateOf(b.date) - dateOf(today)) / 864e5);
  return days * 1440 + startOf(b) - nowIn(ctx.store.salon.timezone).minutes;
}
/** A visit's day in a list: today, tomorrow, a weekday within the week ahead, or else the
 * date itself, so a deposit from weeks ago never reads as this Thursday. */
const visitDay = (date, today) => {
  const ahead = today ? (dateOf(date) - dateOf(today)) / 864e5 : -1;
  return ahead >= 0 && ahead < 7 ? dayLabel(date, today) : fmtDate(date, { day: 'numeric', month: 'short' });
};

/**
 * Redraws part of the page (draw) and, when the focus was in it, puts it back on the same
 * control: same booking row, same label. A live refresh or a decision then never drops a
 * keyboard or screen reader user to the top of the page. Gone with its row: fallback().
 */
function keepFocus(box, draw, fallback = null) {
  let a = document.activeElement;
  // busy() disables the button a decision was taken from, which drops the focus to <body>.
  if ((!a || a === document.body) && actedFrom && box.contains(actedFrom)) a = actedFrom;
  if (a === actedFrom) actedFrom = null;
  const inside = !!a && a !== box && box.contains(a);
  const id = inside ? a.closest('[data-id]')?.dataset.id : null;
  const label = inside ? a.textContent.trim() : '';
  draw();
  if (!inside || a.isConnected) return;
  const scope = id ? box.querySelector(`[data-id="${CSS.escape(id)}"]`) : box;
  const same = scope ? [...scope.querySelectorAll(a.tagName)].find((n) => n.textContent.trim() === label) : null;
  const target = same ?? (scope && scope !== box ? scope.querySelector('button') : null) ?? fallback?.();
  target?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- clock and numbers

const LOCALE = () => (getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-u-nu-latn');
const clockOf = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function clockParts(min) {
  const parts = new Intl.DateTimeFormat(LOCALE(), { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
    .formatToParts(Date.UTC(2000, 0, 1, Math.floor(min / 60) % 24, min % 60));
  return {
    clock: parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim(),
    period: parts.find((p) => p.type === 'dayPeriod')?.value ?? '',
  };
}

/** "11:15 – 12:15 م", with both periods only when the range crosses noon or midnight. */
function fmtRange(from, to) {
  const a = clockParts(from);
  const b = clockParts(to);
  if (a.period !== b.period) return `${fmtTime(clockOf(from))} – ${fmtTime(clockOf(to))}`;
  return `${a.clock} – ${b.clock}${b.period ? ` ${b.period}` : ''}`;
}

/** 45 دقيقة, ساعتان, 1 س 30 د. */
function fmtSpan(min) {
  if (min < 60) return t('unit.min', { n: min });
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? t('sched.hm', { h: hours, m: rest }) : t('sched.hours', { n: hours });
}

/** +962 79 043 4982 for Jordanian mobiles; anything else as stored. */
function fmtPhone(phone) {
  const m = /^\+962(7\d)(\d{3})(\d{4})$/.exec(phone ?? '');
  return m ? `+962 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

/** Digits for a wa.me link: 079… becomes 96279…. */
function waNumber(phone) {
  let d = westernDigits(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `962${d.slice(1)}`;
  return d;
}

/** Counts a figure from the last value shown to the new one (instantly under reduced motion). */
function tween(el, from, to, format, duration = 700) {
  if (reducedMotion() || from === to) {
    el.textContent = format(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const v = from + (to - from) * (1 - (1 - p) ** 3);
    el.textContent = format(p < 1 ? Math.round(v) : to);
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = format(from);
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- opening hours and free time

/**
 * The salon's opening ranges on a date, in minutes from that midnight (a range past
 * midnight runs over 1440). own: the day's own ranges; carry: yesterday's late night
 * running into this date's small hours; all: both.
 */
function openRanges(hours, date) {
  if (!Array.isArray(hours) || hours.length !== 7) return null;
  const weekday = dateOf(date).getUTCDay();
  const span = (r) => {
    const open = toMin(r.open);
    let close = toMin(r.close);
    if (close <= open) close += 1440;
    return [open, close];
  };
  const own = (hours[weekday] ?? []).map(span).sort((a, b) => a[0] - b[0]);
  const carry = (hours[(weekday + 6) % 7] ?? []).map(span).filter(([, c]) => c > 1440).map(([, c]) => [0, c - 1440]);
  return { own, carry, all: [...carry, ...own].sort((a, b) => a[0] - b[0]) };
}

/** Stretches of 15 minutes or more inside the windows where nobody is booked. */
function freeGaps(busy, windows, from) {
  const merged = [];
  for (const [s, e] of [...busy].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const gaps = [];
  for (const [ws, we] of windows) {
    let cursor = Math.max(ws, from);
    for (const [s, e] of merged) {
      if (cursor >= we) break;
      if (e <= cursor) continue;
      if (s >= we) break;
      if (s > cursor) gaps.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < we) gaps.push([cursor, we]);
  }
  return gaps.filter(([a, z]) => z - a >= 15);
}

// ---------------------------------------------------------------- sharing the booking link

async function shareLink(store) {
  const url = location.origin;
  const text = t('home.share_text', { name: pick(store.salon, 'name') });
  if (navigator.share) {
    try {
      await navigator.share({ title: pick(store.salon, 'name'), text, url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  await navigator.clipboard?.writeText(url).catch(() => {});
  toast(t('copied'));
}

// ---------------------------------------------------------------- sheets

/** A line under the sheet's title once its content scrolls under it. */
function decorateSheet(panel) {
  panel.el.classList.add('sched-sheet');
  const body = panel.el.querySelector('.sheet-body');
  const head = panel.el.querySelector('.sheet-head');
  body?.addEventListener('scroll', () => head?.classList.toggle('scrolled', body.scrollTop > 4), { passive: true });
  return panel;
}

/**
 * Asks before something that cannot be undone, naming the booking. The way back
 * ("keep the booking") reads differently from the action, never "cancel" twice.
 */
function confirmSheet({ title, question, message, yesText, noText }) {
  return new Promise((resolve) => {
    let answered = false;
    const yes = h('button', { class: 'btn btn-danger', type: 'button', text: yesText });
    const no = h('button', { class: 'btn btn-secondary', type: 'button', text: noText });
    const body = h(
      'div',
      { class: 'confirm-body' },
      h('div', { class: 'confirm-tile', 'aria-hidden': 'true' }, icon('alert')),
      h('p', { class: 'confirm-q', text: question }),
      h('p', { class: 'muted', text: message }),
    );
    const panel = sheet({ title, body, actions: [no, yes], onClose: () => answered || resolve(false) });
    panel.el.classList.add('sched-confirm');
    yes.addEventListener('click', () => {
      answered = true;
      panel.close();
      resolve(true);
    });
    no.addEventListener('click', () => panel.close());
    no.focus({ preventScroll: true });
  });
}

// ---------------------------------------------------------------- one booking

async function setStatus(b, status) {
  quiet();
  return (await api('PATCH', `/api/manage/bookings/${b.id}`, { status })).booking;
}

function waLink(store, b) {
  const text = t('sched.wa_text', { name: b.customer.name, salon: pick(store.salon, 'name'), day: fmtDate(b.date), time: fmtTime(b.start) });
  return `https://wa.me/${waNumber(b.customer.phone)}?text=${encodeURIComponent(text)}`;
}

/**
 * What the owner can do next, as [label, status, style, asks first?]. A visit is marked
 * only once it is due, as the server allows: "no-show" after it starts (asked first: it
 * frees the chair), "arrived" from an hour before (an early arrival).
 */
function actionsFor(b, ctx) {
  switch (b.status) {
    case 'pending_payment':
    case 'payment_sent':
      return [['sched.reject', 'cancelled', 'btn-secondary', true], ['sched.received', 'confirmed', 'btn-primary']];
    case 'confirmed': {
      const until = untilStart(ctx, b);
      return [
        until <= 0 ? ['sched.no_show', 'no_show', 'btn-secondary', true] : null,
        until <= 60 ? ['sched.arrived', 'completed', 'btn-primary'] : null,
      ].filter(Boolean);
    }
    case 'completed':
    case 'no_show':
      return [['sched.undo', 'confirmed', 'btn-secondary']];
    default:
      return [];
  }
}

async function runAction(ctx, button, b, [, status, , asks], onDone) {
  if (asks) {
    // Turning down a transfer the customer says they sent, letting a hold go, or
    // recording that the customer never came (the chair is freed for someone else).
    const when = `${visitDay(b.date, ctx.today())} ${fmtTime(b.start)}`;
    const ok = await confirmSheet(status === 'no_show'
      ? {
          title: t('sched.no_show'),
          question: t('sched.no_show_q', { name: iso(b.customer.name), time: when }),
          message: t('sched.no_show_confirm'),
          yesText: t('sched.no_show'),
          noText: t('sched.back'),
        }
      : b.status === 'payment_sent'
      ? {
          title: t('sched.reject_full'),
          question: t('sched.reject_q', { name: iso(b.customer.name), amount: fmtPrice(b.deposit, ctx.cur()) }),
          message: t('sched.reject_confirm'),
          yesText: t('sched.reject_full'),
          noText: t('sched.keep'),
        }
      : {
          title: t('sched.cancel'),
          question: t('sched.cancel_q', { name: iso(b.customer.name), time: when }),
          message: t('sched.cancel_confirm'),
          yesText: t('sched.cancel'),
          noText: t('sched.keep'),
        });
    if (!ok) return false;
  }
  actedFrom = button;
  const updated = await busy(button, () => setStatus(b, status));
  if (!updated) {
    // Failed: the button is back, and so is the focus that its busy state dropped.
    if (button.isConnected && document.activeElement === document.body) button.focus({ preventScroll: true });
    return false;
  }
  const message = status === 'cancelled'
    ? (b.status === 'payment_sent' ? 'sched.rejected' : 'sched.cancelled')
    : AWAITING.has(b.status) && status === 'confirmed' ? 'sched.confirmed' : 'sched.updated';
  toast(t(message));
  onDone(updated);
  return true;
}

/**
 * Full-screen review of the customer's CliQ screenshot: the amount to look for and the
 * account it should reach above it, the decision under it. Tap the picture to zoom.
 * From the deposits list, deciding one opens the next transfer waiting (queue).
 */
function openProof(ctx, b, { onDecided, thumb, queue = [], returnFocus } = {}) {
  const previous = returnFocus ?? document.activeElement;
  const img = h('img', { src: b.proof_url, alt: t('sched.proof') });
  const stage = h('div', { class: 'pv-stage' }, img);
  // Zooming in keeps the tapped spot (the amount, the reference) in the middle.
  img.addEventListener('click', (e) => {
    const before = img.getBoundingClientRect();
    const fx = (e.clientX - before.left) / before.width;
    const fy = (e.clientY - before.top) / before.height;
    if (!stage.classList.toggle('zoomed')) return;
    const after = img.getBoundingClientRect();
    const view = stage.getBoundingClientRect();
    stage.scrollBy({ left: after.left + fx * after.width - (view.left + view.width / 2), top: after.top + fy * after.height - (view.top + view.height / 2) });
  });
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('close') }, icon('x'));
  const awaiting = AWAITING.has(b.status);
  const acts = awaiting ? actionsFor(b, ctx) : [];
  const buttons = acts.map((a) => h('button', { class: `btn ${a[2]}`, type: 'button', text: t(a[0]) }));
  const at = queue.findIndex((x) => x.id === b.id);
  const alias = ctx.store.salon.cliq_alias;
  // The CliQ note is often just the sender's name, already in the title.
  const note = (b.payment_note ?? '').trim();
  const noteShown = note && note !== b.customer.name.trim() ? note : '';
  const viewer = h(
    'div',
    { class: 'proof-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${t('sched.proof')} · ${b.customer.name}` },
    h(
      'div',
      { class: 'pv-top' },
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'name truncate', text: b.customer.name }),
        h('div', { class: 'small muted truncate num', text: `${visitDay(b.date, ctx.today())} ${fmtTime(b.start)} · ${pick(b.service, 'name')}` }),
      ),
      queue.length > 1 && at >= 0 ? h('span', { class: 'pv-count num', text: t('sched.of', { i: at + 1, n: queue.length }) }) : null,
      closeBtn,
    ),
    h(
      'div',
      { class: 'pv-expect' },
      h('div', { class: 'pv-amt' }, h('span', { text: t('sched.expected_label') }), h('b', { class: 'num', text: fmtPrice(b.deposit, ctx.cur()) })),
      h(
        'div',
        { class: 'pv-to grow' },
        alias ? h('span', { class: 'truncate' }, `${t('sched.to')} `, h('bdi', { class: 'pv-alias', text: alias })) : null,
        noteShown ? h('span', { class: 'truncate', text: t('sched.note_label', { note: noteShown }) }) : null,
      ),
    ),
    stage,
    h(
      'div',
      { class: 'pv-foot' },
      awaiting ? h('p', { class: 'pv-hint' }, icon('alert'), h('span', { text: t('sched.review_hint') })) : h('p', { class: 'pv-hint faint', text: t('sched.zoom') }),
      buttons.length ? h('div', { class: 'pv-actions' }, buttons) : null,
    ),
  );
  // A layer like the sheets (dom.js): Back, another screen or an expired session close
  // it, and the page and any sheet under it are inert while it is open.
  let closed = false;
  let untrack = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    untrack();
    removeEventListener('keydown', onKey, true);
    viewer.classList.add('closing');
    setTimeout(() => {
      viewer.remove();
      if (!document.querySelector('.sheet-backdrop, .proof-viewer')) document.body.style.overflow = '';
    }, reducedMotion() ? 0 : 220);
    // Opened from the queue, the control it came from may have left with its row: this
    // booking's own receipt then takes the focus, or else the first deposit waiting.
    const back = previous?.isConnected ? previous : document.querySelector(`.att-row[data-id="${b.id}"] .att-thumb`) ?? document.querySelector('.sched .att-open');
    back?.focus({ preventScroll: true });
  };
  // Escape closes only the topmost layer: this viewer, not the sheet under it, and
  // not this viewer while a confirmation sits on top of it.
  const onKey = (e) => {
    if (e.key !== 'Escape' || [...document.querySelectorAll('.sheet-backdrop:not(.closing), .proof-viewer:not(.closing)')].pop() !== viewer) return;
    e.stopPropagation();
    close();
  };
  closeBtn.addEventListener('click', close);
  addEventListener('keydown', onKey, true);
  const decided = (updated) => {
    close();
    onDecided?.(updated);
    ctx.onChange(updated);
    const next = at >= 0 ? queue.slice(at + 1).find((x) => x.status === 'payment_sent' && x.proof_url) : null;
    // Not over another screen the owner moved to in the meantime.
    if (next) setTimeout(() => ctx.alive() && openProof(ctx, next, { queue, returnFocus: previous }), reducedMotion() ? 0 : 300);
  };
  acts.forEach((a, i) => buttons[i].addEventListener('click', () => runAction(ctx, buttons[i], b, a, decided)));

  const mount = () => {
    document.body.style.overflow = 'hidden';
    document.body.append(viewer);
    untrack = trackOverlay(close, viewer);
    closeBtn.focus({ preventScroll: true });
  };
  // The thumbnail grows into the full receipt.
  if (thumb?.isConnected && document.startViewTransition && !reducedMotion()) {
    const root = document.documentElement;
    viewer.classList.add('morph');
    root.classList.add('vt-proof');
    thumb.style.viewTransitionName = 'proof';
    const vt = document.startViewTransition(async () => {
      thumb.style.viewTransitionName = '';
      img.style.viewTransitionName = 'proof';
      mount();
      await Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 350))]);
    });
    vt.finished.finally(() => {
      img.style.viewTransitionName = '';
      root.classList.remove('vt-proof');
      viewer.classList.remove('morph');
    });
  } else mount();
}

/** A strip that opens the screenshot: thumbnail, label, arrow. */
function proofButton(ctx, b, opts) {
  const thumb = h('img', { src: b.proof_url, alt: '' });
  return h(
    'button',
    { class: 'proof-strip', type: 'button', onclick: () => openProof(ctx, b, { ...opts, thumb }) },
    thumb,
    h('div', { class: 'grow' }, h('b', { text: t('sched.proof') }), h('span', { text: t('sched.review') })),
    icon('chevron', 'flip-ltr faint'),
  );
}

/** Booked → deposit sent → confirmed → arrived, as far as this booking has come. */
function lifecycle(b) {
  if (dropped(b)) return null;
  const rank = { pending_payment: 1, payment_sent: 2, confirmed: 3, completed: 4, no_show: 4 }[b.status] ?? 0;
  const steps = [['sched.step_booked', 0]];
  if (Number(b.deposit) > 0) steps.push(['sched.step_sent', 2]);
  steps.push(['sched.step_confirmed', 3], [b.status === 'no_show' ? 'status.no_show' : 'sched.step_arrived', 4]);
  let currentShown = false;
  return h('ol', { class: 'bk-steps', 'aria-label': t('sched.progress') }, steps.map(([key, need]) => {
    const done = rank >= need;
    const bad = done && b.status === 'no_show' && need === 4;
    const current = !done && !currentShown;
    if (current) currentShown = true;
    return h(
      'li',
      { class: [done && 'done', current && 'now', bad && 'bad'].filter(Boolean).join(' '), 'aria-current': current ? 'step' : null },
      h('span', { class: 'node', 'aria-hidden': 'true' }, done ? icon(bad ? 'x' : 'check') : null),
      h('span', { class: 'lbl', text: t(key) }),
    );
  }));
}

/** The booking in full, for the sheet (phones) and the column beside the day (wide screens). */
function detailView(ctx, b, { done, onProofDecided }) {
  const cur = ctx.cur();
  const today = ctx.today() ?? b.date;
  const kv = (lead, ...content) => h('div', { class: 'kv' }, h('span', { class: 'kv-ic', 'aria-hidden': 'true' }, typeof lead === 'string' ? icon(lead) : lead), ...content);
  const price = Number(b.price);
  const deposit = Number(b.deposit);
  const note = (b.payment_note ?? '').trim();
  const cell = (label, value, cls = '') => h('div', { class: cls }, h('span', { text: label }), h('b', { class: 'num', text: value }));
  const body = h(
    'div',
    { class: 'bk-detail details' },
    h(
      'div',
      { class: 'bk-head' },
      h('div', { class: 'tile emoji-tile', 'aria-hidden': 'true', text: b.service.icon || '✂️' }),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'name', text: pick(b.service, 'name') }),
        h('div', { class: 'small muted num bk-when' }, h('span', { text: fmtRange(startOf(b), endOf(b)) }), ' · ', h('span', { text: fmtDuration(b.duration_min) })),
        h('div', { class: 'bk-tags' }, h('span', { class: 'pill src' }, icon(b.source === 'owner' ? 'store' : 'globe'), t(b.source === 'owner' ? 'sched.source_owner' : 'sched.source_online'))),
      ),
      statusPill(b.status),
    ),
    lifecycle(b),
    kv('calendar', h('span', { text: `${dayLabel(b.date, today)} · ${fmtDate(b.date, { day: 'numeric', month: 'long' })}` })),
    kv(avatar(b.staff.photo_url, pick(b.staff, 'name')), h('span', { text: `${t('bk.with')} ${pick(b.staff, 'name')}` })),
    h(
      'div',
      { class: 'customer-box' },
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'eyebrow', text: t('sched.customer') }),
        h('div', { class: 'name truncate', text: b.customer.name }),
        h('div', { class: 'cb-phone small muted' }, h('bdi', { class: 'num', dir: 'ltr', text: fmtPhone(b.customer.phone) })),
      ),
      h('a', { class: 'icon-btn', href: `tel:${b.customer.phone}`, 'aria-label': t('sched.call'), title: t('sched.call') }, icon('phone')),
      h('a', { class: 'icon-btn wa', href: waLink(ctx.store, b), target: '_blank', rel: 'noopener', 'aria-label': t('sched.whatsapp'), title: t('sched.whatsapp') }, icon('chat')),
    ),
    h(
      'div',
      { class: 'money' },
      cell(t('sched.price'), fmtPrice(price, cur)),
      deposit > 0 ? cell(t('sched.deposit_paid'), fmtPrice(deposit, cur)) : null,
      deposit > 0 ? cell(t('sched.remaining'), fmtPrice(round3(Math.max(0, price - deposit)), cur), 'due') : null,
    ),
    note && note !== b.customer.name.trim() ? kv('chat', h('span', null, h('span', { class: 'muted', text: `${t('sched.note')}: ` }), note)) : null,
    b.proof_url ? proofButton(ctx, b, { onDecided: onProofDecided }) : null,
    b.status === 'pending_payment' && b.expires_in_s
      ? kv('clock', h('span', { class: 'muted num' }, t('sched.not_sent', { time: '' }), h('span', { 'data-deadline': String(Date.now() + b.expires_in_s * 1000), text: mmss(b.expires_in_s) })))
      : null,
  );

  const acts = actionsFor(b, ctx);
  const buttons = acts.map((a) => h('button', { class: `btn ${a[2]}`, type: 'button', text: t(a[0]) }));
  acts.forEach((a, i) => buttons[i].addEventListener('click', () => runAction(ctx, buttons[i], b, a, done)));
  // Cancelling a confirmed visit is rarer, so it sits under the main actions.
  if (b.status === 'confirmed') {
    const cancel = h('button', { class: 'link-btn danger-link', type: 'button' }, icon('x'), t('sched.cancel'));
    cancel.addEventListener('click', () => runAction(ctx, cancel, b, ['sched.cancel', 'cancelled', '', true], done));
    body.append(h('div', { class: 'bk-cancel' }, cancel));
  }
  return { body, buttons };
}

function openDetail(ctx, b) {
  let panel = null;
  const done = (updated) => {
    panel?.close();
    ctx.onChange(updated);
  };
  // A decision taken in the full-screen review closes this sheet too.
  const view = detailView(ctx, b, { done, onProofDecided: () => panel?.close() });
  panel = decorateSheet(sheet({ title: t('sched.number', { id: b.id }), body: view.body, actions: view.buttons }));
}

/** The same booking, open in the column beside the day. */
function inlineDetail(ctx, b, { onClose, onDone }) {
  const view = detailView(ctx, b, { done: onDone });
  const title = h('h2', { tabindex: '-1', text: t('sched.number', { id: b.id }) });
  const closeBtn = h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': t('close'), title: t('close'), onclick: onClose }, icon('x'));
  return h(
    'section',
    { class: 'card sched-detail', 'aria-label': t('sched.number', { id: b.id }) },
    h('div', { class: 'sd-head' }, title, closeBtn),
    view.body,
    view.buttons.length ? h('div', { class: 'sd-actions' }, view.buttons) : null,
  );
}

// ---------------------------------------------------------------- deposits to check

function attentionRow(ctx, b, queue) {
  const sent = b.status === 'payment_sent';
  const acts = actionsFor(b, ctx).map((a) => {
    const btn = h('button', { class: `btn btn-sm ${a[2]}`, type: 'button', text: t(a[0]) });
    btn.addEventListener('click', () => runAction(ctx, btn, b, a, ctx.onChange));
    return btn;
  });
  const thumbImg = b.proof_url ? h('img', { src: b.proof_url, alt: '' }) : null;
  const thumb = thumbImg
    ? h('button', { class: 'att-thumb', type: 'button', 'aria-label': `${t('sched.proof')} · ${b.customer.name}`, title: t('sched.review') }, thumbImg, h('span', { class: 'zoom', 'aria-hidden': 'true' }, icon('search')))
    : null;
  thumb?.addEventListener('click', () => openProof(ctx, b, { thumb: thumbImg, queue }));
  const note = (b.payment_note ?? '').trim();
  const main = h(
    'div',
    { class: 'att-main' },
    avatar(null, b.customer.name),
    h(
      'button',
      { class: 'att-open', type: 'button' },
      h('span', { class: 'name truncate', text: b.customer.name }),
      // The visit's time first: it is what matches a transfer, so the service takes the cut.
      h(
        'span',
        { class: 'meta' },
        h('span', { class: 'num att-when', text: `${visitDay(b.date, ctx.today())} ${fmtTime(b.start)}` }),
        h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
        h('span', { class: 'truncate', text: pick(b.service, 'name') }),
      ),
    ),
    h('div', { class: 'amt' }, h('b', { class: 'num', text: fmtPrice(b.deposit, ctx.cur()) }), sent ? null : statusPill(b.status)),
    thumb,
  );
  main.addEventListener('click', (e) => {
    if (!e.target.closest('.att-thumb')) ctx.open(b);
  });
  return h(
    'div',
    { class: `att-row ${sent ? 'sent' : 'hold'}`, 'data-id': b.id },
    main,
    note && !b.proof_url && note !== b.customer.name.trim() ? h('div', { class: 'att-note' }, icon('chat'), h('span', { text: note })) : null,
    b.status === 'pending_payment'
      ? h('div', { class: 'att-note faint num' }, icon('clock'), h('span', null, t('sched.not_sent', { time: '' }), h('span', { 'data-deadline': String(Date.now() + (b.expires_in_s ?? 0) * 1000), text: mmss(b.expires_in_s ?? 0) })))
      : null,
    h('div', { class: 'att-acts' }, acts),
  );
}

/** seen: ids already on screen. Only newcomers animate in, so live refreshes do not flicker. */
function attentionSection(ctx, list, { seen, expanded, onExpand }) {
  if (!list.length) return null;
  const sent = list.filter((b) => b.status === 'payment_sent').length;
  const queue = list.filter((b) => b.status === 'payment_sent' && b.proof_url);
  const rows = list.map((b) => attentionRow(ctx, b, queue));
  stagger(rows.filter((_, i) => !seen.has(list[i].id)));
  for (const b of list) seen.add(b.id);
  const collapsed = list.length > 1 && !expanded;
  const rest = list.slice(1);
  const section = h(
    'section',
    { class: `section attention ${collapsed ? 'collapsed' : ''}`, 'aria-labelledby': 'att-title' },
    h(
      'div',
      { class: 'section-head' },
      h('div', null, h('h2', { id: 'att-title' }, t('sched.attention'), sent ? h('span', { class: 'count hot num', text: String(sent) }) : null), h('p', { text: t('sched.attention_sub') })),
    ),
    h('div', { class: 'card flush' }, rows, list.length > 1 ? h(
      'button',
      {
        // Gone once used: the focus moves on to the first row it revealed.
        class: 'att-more', type: 'button',
        onclick: () => {
          onExpand();
          section.classList.remove('collapsed');
          stagger(rows.slice(1));
          rows[1]?.querySelector('.att-open')?.focus({ preventScroll: true });
        },
      },
      h('span', { class: 'avatar-stack', 'aria-hidden': 'true' }, rest.slice(0, 3).map((b) => avatar(null, b.customer.name))),
      h('span', { class: 'grow num', text: t('sched.more_waiting', { n: rest.length }) }),
      icon('down'),
    ) : null),
  );
  return section;
}

// ---------------------------------------------------------------- the day

const nowLine = () => h('div', { class: 'now-line', 'aria-hidden': 'true' }, h('span', { class: 't num', text: t('sched.now') }), h('span', { class: 'l' }));

function apptRow(ctx, b, { now, isToday, isPast, fresh, i }) {
  const s = startOf(b);
  const e = endOf(b);
  const live = isToday && !dropped(b) && b.status !== 'no_show' && now >= s && now < e;
  const started = isPast || (isToday && now >= s);
  // Marking a visit makes sense once it has started.
  const quick = b.status === 'confirmed' && started ? actionsFor(b, ctx) : [];
  const quickBtns = quick.map((a) => {
    const btn = h('button', { class: `btn btn-sm ${a[2]}`, type: 'button', text: t(a[0]) });
    btn.addEventListener('click', () => runAction(ctx, btn, b, a, ctx.onChange));
    return btn;
  });
  const status = [
    live ? h('span', { class: 'live-tag' }, h('i', { 'aria-hidden': 'true' }), t('sched.live')) : null,
    b.status !== 'confirmed' ? h('span', { class: `st st-${b.status}` }, h('i', { 'aria-hidden': 'true' }), t(`status.${b.status}`)) : null,
  ].filter(Boolean);
  const row = h(
    'div',
    {
      class: `appt s-${b.status}${live ? ' live' : ''}${fresh ? ' enter' : ''}`,
      'data-id': b.id,
      style: { '--i': String(Math.min(i, 10)), '--dur': String(b.duration_min), ...(live ? { '--live-p': String(((now - s) / (e - s)).toFixed(3)) } : {}) },
    },
    h('div', { class: 'when num', 'aria-hidden': 'true' }, h('b', { text: fmtTime(b.start) }), h('span', { text: fmtTime(clockOf(e)) })),
    h(
      'div',
      { class: 'body' },
      h('div', { class: 'tile emoji-tile', 'aria-hidden': 'true', text: b.service.icon || '✂️' }),
      h(
        'button',
        { class: 'appt-open', type: 'button' },
        h('span', { class: 'sr-only', text: `${fmtRange(s, e)} · ` }),
        h('span', { class: 'nm truncate', text: b.customer.name }),
        h(
          'span',
          { class: 'meta' },
          h('span', { class: 'appt-svc truncate', text: pick(b.service, 'name') }),
          h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
          h('span', { class: 'who' }, avatar(b.staff.photo_url, pick(b.staff, 'name')), h('span', { class: 'truncate', text: pick(b.staff, 'name') })),
        ),
        status.length ? h('span', { class: 'st-line' }, status) : null,
      ),
      h('span', { class: 'price num', text: fmtPrice(b.price, ctx.cur()) }),
      quickBtns.length ? h('div', { class: 'appt-quick' }, quickBtns) : null,
      icon('chevron', 'flip-ltr faint chev'),
    ),
  );
  // The whole card opens the booking; the button inside is there for the keyboard.
  row.addEventListener('click', (ev) => {
    if (!ev.target.closest('.appt-quick')) ctx.open(b);
  });
  return row;
}

function gapRow(ctx, date, [from, to]) {
  const at = Math.ceil(from / 15) * 15;
  return h(
    'button',
    { class: 'gap-row', type: 'button', 'aria-label': `${t('sched.free', { span: fmtSpan(to - from) })} · ${fmtRange(from, to)}. ${t('sched.free_add', { time: fmtTime(clockOf(at)) })}`, onclick: () => ctx.newBooking({ date, time: at }) },
    h('span', { class: 'gap-rail', 'aria-hidden': 'true' }),
    h(
      'span',
      { class: 'gap-box' },
      // The two labels wrap as a pair, so a narrow phone moves the range under the label instead of clipping it.
      h(
        'span',
        { class: 'gap-text' },
        h('span', { class: 'gap-what', text: t('sched.free', { span: fmtSpan(to - from) }) }),
        h('span', { class: 'gap-when num', text: fmtRange(from, to) }),
      ),
      icon('plus'),
    ),
  );
}

function cancelledGroup(ctx, list, { open, onToggle, now, isToday, isPast }) {
  const group = h(
    'details',
    { class: 'cancelled-group', open },
    h('summary', null, h('span', { class: 'num', text: t('sched.cancelled_group', { n: list.length }) }), icon('down')),
    h('div', { class: 'agenda' }, list.map((b, i) => apptRow(ctx, b, { now, isToday, isPast, fresh: false, i }))),
  );
  group.addEventListener('toggle', () => onToggle(group.open));
  return group;
}

/** The day as a timeline: visits, the free time between them, and now. */
function agenda(ctx, list, { date, isToday, isPast, now, gaps, seen, switched }) {
  const items = [
    ...list.map((b) => ({ at: startOf(b), b })),
    ...gaps.map((g) => ({ at: g[0], gap: g })),
  ].sort((x, y) => x.at - y.at || (x.gap ? 1 : 0) - (y.gap ? 1 : 0));
  const rows = [];
  let nowPlaced = !isToday;
  let n = 0;
  for (const item of items) {
    if (!nowPlaced && item.at >= now) {
      rows.push(nowLine());
      nowPlaced = true;
    }
    if (item.gap) rows.push(gapRow(ctx, date, item.gap));
    else rows.push(apptRow(ctx, item.b, { now, isToday, isPast, fresh: !switched && !seen.has(item.b.id), i: n++ }));
  }
  if (!nowPlaced && items.length) rows.push(nowLine());
  for (const b of list) seen.add(b.id);
  return h('div', { class: 'agenda' }, rows);
}

/** A day with nothing booked: its hours, a faint timeline, and how to fill it. */
function emptyDay(ctx, { date, isPast, own }) {
  if (isPast) return h('p', { class: 'empty-day past' }, icon('calendar'), h('span', { text: t('sched.past_empty') }));
  if (own && !own.length) {
    return h(
      'div',
      { class: 'card empty-day closed' },
      h('div', { class: 'tile' }, icon('clock')),
      h('h3', { text: t('sched.closed_day') }),
      h('p', { class: 'small muted', text: t('sched.closed_hint') }),
      h('a', { class: 'btn btn-secondary btn-sm', href: '/admin/hours' }, icon('clock'), t('sched.edit_hours')),
    );
  }
  const sep = getLang() === 'ar' ? '، ' : ', ';
  const first = own?.[0]?.[0];
  return h(
    'div',
    { class: 'card empty-day' },
    h(
      'div',
      { class: 'ed-head' },
      h('div', { class: 'tile' }, icon('calendar')),
      h(
        'div',
        { class: 'grow' },
        h('h3', { text: t('sched.empty_title') }),
        own ? h('p', { class: 'small muted num' }, t('sched.open_hours', { range: own.map(([a, z]) => fmtRange(a, z)).join(sep) })) : null,
      ),
    ),
    h('div', { class: 'ghost-tl', 'aria-hidden': 'true' }, [0, 1, 2].map((i) => h(
      'div',
      { class: 'ghost-slot', style: { '--i': String(i) } },
      h('span', { class: 'num', text: first != null ? fmtTime(clockOf(first + i * 60)) : '' }),
      h('i'),
    ))),
    h('p', { class: 'small muted ed-hint', text: t('sched.empty_hint') }),
    h(
      'div',
      { class: 'ed-actions' },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => ctx.newBooking({ date }) }, icon('plus'), t('sched.add')),
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => shareLink(ctx.store) }, icon('share'), t('sched.share')),
    ),
  );
}

/** Wide screens: the day in figures, each chair's day as a bar, and who is next. */
function statsCard(ctx, { shown, members, isToday, isPast, now, windows, gaps }) {
  const cur = ctx.cur();
  const live = shown.filter((b) => COUNTED.has(b.status));
  const active = shown.filter((b) => !dropped(b));
  if (!active.length) return null;
  const revenue = sum(live.filter((b) => b.status !== 'no_show'));
  const free = gaps.reduce((a, [x, z]) => a + z - x, 0);
  const kpi = (label, value) => h('div', { class: 'kpi-s' }, h('span', { text: label }), h('b', { class: 'num', text: value }));
  const edges = [...(windows ?? []), ...active.map((b) => [startOf(b), endOf(b)])];
  const lo = Math.min(...edges.map((e) => e[0]));
  const hi = Math.max(...edges.map((e) => e[1]));
  const pos = (m) => String(((m - lo) / (hi - lo)).toFixed(4));
  const width = (a, z) => String(((z - a) / (hi - lo)).toFixed(4));
  const lanes = hi > lo
    ? h(
        'div',
        { class: 'lanes', 'aria-hidden': 'true' },
        members.map((m) => h(
          'div',
          { class: 'lane' },
          avatar(m.photo_url, pick(m, 'name')),
          h(
            'div',
            { class: 'ltrack' },
            (windows ?? []).map(([a, z]) => h('span', { class: 'lopen', style: { '--a': pos(Math.max(a, lo)), '--w': width(Math.max(a, lo), Math.min(z, hi)) } })),
            active.filter((b) => b.staff.id === m.id).map((b) => h('i', { class: `lseg s-${b.status}`, style: { '--a': pos(startOf(b)), '--w': width(startOf(b), endOf(b)) } })),
            isToday && now > lo && now < hi ? h('b', { class: 'now-tick', style: { '--a': pos(now) } }) : null,
          ),
        )),
        h('div', { class: 'scale num' }, h('span'), h('div', null, [lo, Math.round((lo + hi) / 120) * 60, hi].map((m) => h('span', { text: fmtHour(Math.floor(m / 60)) })))),
      )
    : null;
  const next = isPast ? null : active.find((b) => HOLDING.has(b.status) && (!isToday || startOf(b) >= now));
  return h(
    'section',
    { class: 'card sched-stats', 'aria-labelledby': 'stats-title' },
    h('h2', { id: 'stats-title', class: 'eyebrow', text: t('sched.day_summary') }),
    h(
      'div',
      { class: 'kpis-s' },
      kpi(t('sched.k_visits'), String(live.length)),
      kpi(t('sched.k_revenue'), fmtPrice(revenue, cur)),
      isPast ? kpi(t('sched.k_done'), String(live.filter((b) => b.status === 'completed').length)) : kpi(t('sched.k_free'), free ? fmtSpan(free) : '—'),
    ),
    lanes,
    next ? h(
      'button',
      { class: 'next-up', type: 'button', onclick: () => ctx.open(next) },
      h('span', { class: 'eyebrow', text: t(isToday ? 'sched.next' : 'sched.first') }),
      h('span', { class: 'grow truncate' }, h('b', { text: next.customer.name }), ` · ${pick(next.service, 'name')}`),
      h('span', { class: 'num when', text: fmtTime(next.start) }),
    ) : null,
  );
}

/** Past days fade, and the month is named once, where it starts. Tonight's chip is apart. */
function decorateStrip(stripEl, today) {
  let month = '';
  stripEl.querySelectorAll('.day-chip:not(.late)').forEach((chip, i) => {
    const date = chip.dataset.date ?? '';
    chip.classList.toggle('past', !!today && date < today);
    chip.querySelector('.dm')?.classList.toggle('same', i > 0 && date.slice(0, 7) === month);
    month = date.slice(0, 7);
  });
}

/**
 * What is left of last night's opening while it is still going (hours that run past
 * midnight): the API books those times under the day the opening began, yesterday.
 * date: that day; ranges: the late hours in today's minutes. Null when there are none.
 */
function tonightOf(ctx) {
  const today = ctx.today();
  const ranges = today ? openRanges(ctx.store.hours, today)?.carry ?? [] : [];
  const now = nowIn(ctx.store.salon.timezone).minutes;
  return ranges.some(([, z]) => z - now >= 15) ? { date: addDays(today, -1), ranges } : null;
}

/** Last night's chip reads "Tonight" with stars, not as yesterday's date (as on /book). */
function markTonight(stripEl, date) {
  const chip = stripEl.querySelector(`.day-chip[data-date="${date}"]`);
  if (!chip) return;
  chip.classList.add('late');
  chip.setAttribute('aria-label', `${t('book.tonight')} · ${t('book.after_midnight')}`);
  chip.querySelector('.dw').textContent = t('book.tonight');
  clear(chip.querySelector('.dn'), periodIcon('stars'));
  chip.querySelector('.dm')?.remove();
}

function setBadge(stripEl, date, n) {
  const chip = stripEl.querySelector(`.day-chip[data-date="${date}"]`);
  if (!chip) return;
  let badge = chip.querySelector('.badge');
  if (!n) {
    badge?.remove();
    return;
  }
  if (!badge) chip.append((badge = h('span', { class: 'badge num' })));
  badge.textContent = String(n);
}

// ---------------------------------------------------------------- a booking taken by the salon

/** Times as one row per hour: the hour, then :00 :15 :30 :45. */
function hourGrid({ slots, onPick, isOn }) {
  if (!slots.length) return h('p', { class: 'empty small', text: t('book.no_slots') });
  const groups = [
    ['book.morning', (s) => s.min < 720],
    ['book.afternoon', (s) => s.min >= 720 && s.min < 1020],
    ['book.evening', (s) => s.min >= 1020 && s.min < 1440],
    ['book.after_midnight', (s) => s.min >= 1440],
  ];
  const buttons = [];
  const el = h('div', { class: 'slot-hours' });
  for (const [label, test] of groups) {
    const list = slots.filter(test);
    if (!list.length) continue;
    const hours = new Map();
    for (const s of list) {
      const hr = Math.floor(s.min / 60);
      if (!hours.has(hr)) hours.set(hr, []);
      hours.get(hr).push(s);
    }
    const id = `sh-${label.split('.')[1]}-${Math.random().toString(36).slice(2, 7)}`;
    el.append(h(
      'div',
      { class: 'slot-hgroup', role: 'group', 'aria-labelledby': id },
      h('div', { class: 'slot-ghead', id }, h('span', { text: t(label) }), h('span', { class: 'slot-count num', text: String(list.length) })),
      [...hours].map(([hr, inHour]) => {
        const chip = (s) => {
          const b = h(
            'button',
            { class: `slot-q num ${isOn(s) ? 'on' : ''}`, type: 'button', 'aria-pressed': String(isOn(s)), 'aria-label': fmtTime(s.time), onclick: () => {
              buttons.forEach((x) => {
                x.classList.toggle('on', x === b);
                x.setAttribute('aria-pressed', String(x === b));
              });
              onPick(s, b);
            } },
            h('span', { class: 'ltr', text: `:${String(s.min % 60).padStart(2, '0')}` }),
          );
          b.dataset.min = String(s.min);
          buttons.push(b);
          return b;
        };
        const cells = inHour.every((s) => QUARTERS.includes(s.min % 60))
          ? QUARTERS.map((q) => {
              const s = inHour.find((x) => x.min % 60 === q);
              return s ? chip(s) : h('span', { class: 'slot-none', 'aria-hidden': 'true' });
            })
          : inHour.map(chip);
        return h('div', { class: 'slot-hour' }, h('span', { class: 'hr num', 'aria-hidden': 'true', text: fmtHour(hr) }), cells);
      }),
    ));
  }
  return el;
}

function openNewBooking(ctx, { date, time = null, staffId = null, onDone }) {
  const today = ctx.today();
  if (!today) return;
  const { store, app } = ctx;
  const services = store.services.filter((s) => s.active);
  const staff = store.staff.filter((m) => m.active);
  if (!services.length) {
    toast(t('sched.no_services'), 'error');
    return;
  }
  const offeredBy = staffId ? services.find((s) => s.staff_ids.includes(staffId)) : null;
  // A free stretch in tonight's small hours (from the timeline), or last night's own date,
  // goes to what is left of last night's opening, at its minutes past that midnight.
  const tonight = tonightOf(ctx);
  const small = !!tonight && date === today && time != null && tonight.ranges.some(([a, z]) => time >= a && time < z);
  const late = small || (!!tonight && date === tonight.date);
  const state = {
    serviceId: (offeredBy ?? services[0]).id,
    staffId: offeredBy ? staffId : null,
    date: late ? tonight.date : !date || date < today ? today : date,
    slot: null,
    prefer: small ? time + 1440 : time,
  };
  const dayText = (d) => (d < today ? t('book.tonight') : dayLabel(d, today));

  const serviceRow = h('div', { class: 'scroller', role: 'group', 'aria-label': t('sched.pick_service') });
  const staffRow = h('div', { class: 'scroller', role: 'group', 'aria-label': t('sched.pick_staff') });
  const slotsBox = h('div', { class: 'slots-box' });
  const name = input({ name: 'name', maxlength: 60, autocomplete: 'off' });
  const phone = input({ name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'off' });
  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('sched.pick_slot'), disabled: true });

  const strip = dayStrip({
    days: [...(tonight ? [{ date: tonight.date }] : []), ...Array.from({ length: AHEAD_DAYS + 1 }, (_, i) => ({ date: addDays(today, i) }))],
    today,
    selected: state.date,
    onPick: (d) => {
      state.date = d;
      loadSlots();
    },
  });
  if (tonight) markTonight(strip.el, tonight.date);
  decorateStrip(strip.el, today);

  const service = () => services.find((s) => s.id === state.serviceId);
  function renderServices() {
    clear(serviceRow, services.map((s) => h(
      'button',
      { class: `chip-btn ${s.id === state.serviceId ? 'on' : ''}`, type: 'button', 'aria-pressed': String(s.id === state.serviceId), onclick: () => { state.serviceId = s.id; renderServices(); renderStaff(); loadSlots(); } },
      h('span', { class: 'emoji', 'aria-hidden': 'true', text: s.icon || '✂️' }),
      pick(s, 'name'),
    )));
  }
  function renderStaff() {
    const offering = staff.filter((m) => service()?.staff_ids.includes(m.id));
    if (state.staffId && !offering.some((m) => m.id === state.staffId)) state.staffId = null;
    const chip = (id, label, img) => h(
      'button',
      { class: `chip-btn ${state.staffId === id ? 'on' : ''}`, type: 'button', 'aria-pressed': String(state.staffId === id), onclick: () => { state.staffId = id; renderStaff(); loadSlots(); } },
      img === undefined ? icon('sparkles') : avatar(img, label),
      label,
    );
    clear(staffRow, chip(null, t('book.anyone')), offering.map((m) => chip(m.id, pick(m, 'name'), m.photo_url)));
  }

  const choose = (s) => {
    state.slot = s;
    save.disabled = !s;
    save.textContent = s ? t('sched.save_at', { day: dayText(state.date), time: fmtTime(s.time) }) : t('sched.pick_slot');
  };

  let seq = 0;
  async function loadSlots() {
    const mine = ++seq;
    choose(null);
    clear(slotsBox, h('div', { class: 'slot-hours' }, Array.from({ length: 4 }, () => h('div', { class: 'skel slot-skel' }))));
    try {
      const q = `service_id=${state.serviceId}${state.staffId ? `&staff_id=${state.staffId}` : ''}&date=${state.date}`;
      const res = await api('GET', `/api/manage/availability?${q}`);
      if (mine !== seq) return;
      // From a free stretch on the timeline: its first time that fits, until the owner picks.
      const wanted = state.prefer != null ? res.slots.find((s) => s.min >= state.prefer) : null;
      if (wanted) choose(wanted);
      const grid = hourGrid({
        slots: res.slots,
        isOn: (s) => s === wanted,
        onPick: (s) => {
          state.prefer = null;
          choose(s);
        },
      });
      clear(slotsBox, grid);
      if (wanted) requestAnimationFrame(() => grid.querySelector('.slot-q.on')?.scrollIntoView({ block: 'center', behavior: 'auto' }));
    } catch (err) {
      if (mine === seq) clear(slotsBox, h('p', { class: 'empty small', text: errorText(err) }));
    }
  }

  const form = h(
    'form',
    { class: 'new-booking', novalidate: true, onsubmit: (e) => e.preventDefault() },
    h('span', { class: 'field-label', text: t('sched.pick_service') }), serviceRow,
    h('span', { class: 'field-label', text: t('sched.pick_staff') }), staffRow,
    h('span', { class: 'field-label', text: t('sched.pick_time') }), strip.el, slotsBox,
    h('span', { class: 'field-label', text: t('sched.customer') }),
    field(t('sched.customer_name'), name),
    h('div', { class: 'phone-input' }, h('div', { class: 'cc', text: `+${app.ctx.tenant.calling_code}` }), field(t('sched.customer_phone'), phone)),
  );
  renderServices();
  renderStaff();
  loadSlots();

  const panel = decorateSheet(sheet({ title: t('sched.add'), body: form, actions: [save], tall: true }));
  save.addEventListener('click', async () => {
    if (!state.slot) return;
    await busy(save, async () => {
      try {
        quiet();
        const res = await api('POST', '/api/manage/bookings', {
          service_id: state.serviceId, staff_id: state.staffId, date: state.date, time: state.slot.min, name: name.value, phone: phone.value,
        });
        panel.close();
        toast(t('sched.booked'));
        onDone(res.booking);
      } catch (err) {
        if (err.code === 'slot_taken') {
          // The times reload without that one, and nothing is picked for the owner: the
          // button stays off until they choose a time again.
          state.prefer = null;
          loadSlots();
        }
        markInvalid(form, err);
        throw err;
      }
    });
    // busy() re-enables the button; it stays off until a time is chosen again.
    save.disabled = !state.slot;
  });
}

// ---------------------------------------------------------------- how booking works

function amountInput(value) {
  const el = h('input', { name: 'deposit_amount', inputmode: 'decimal', autocomplete: 'off', value, dir: 'ltr', placeholder: '0', 'aria-label': t('bs.amount') });
  el.addEventListener('input', () => {
    el.value = westernDigits(el.value).replace(/[^\d.]/g, '');
  });
  return el;
}

/** A row of radio pills, like the deposit kind and the time to send. */
function radioRow(name, label, options, current, onChange) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label }, options.map(([value, text]) => {
    const radio = h('input', { type: 'radio', name, value: String(value), checked: value === current });
    radio.addEventListener('change', () => onChange(value));
    return h('label', null, radio, h('span', { class: 'num', text }));
  }));
}

export function openBookingSettings(store, onSaved) {
  const s = store.salon;
  const online = switchRow(t('bs.online'), t('bs.online_sub'), s.booking_enabled);
  const cliq = switchRow(t('bs.cliq'), t('bs.cliq_sub'), s.cliq_required);
  const alias = input({ name: 'cliq_alias', value: s.cliq_alias ?? '', maxlength: 60, dir: 'ltr', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const holder = input({ name: 'cliq_name', value: s.cliq_name ?? '', maxlength: 80 });
  const amount = amountInput(s.deposit_amount ? String(Number(s.deposit_amount)) : '');
  let kind = s.deposit_kind;
  let windowMin = s.payment_window_min;

  const kindSwitch = radioRow('deposit_kind', t('bs.deposit'), ['fixed', 'full'].map((k) => [k, t(`bs.${k}`)]), kind, (k) => {
    kind = k;
    sync();
  });
  const windows = [...new Set([...WINDOWS, windowMin])].filter(Boolean).sort((a, b) => a - b);
  const windowSwitch = radioRow('payment_window_min', t('bs.window'), windows.map((m) => [m, t('unit.min_short', { n: m })]), windowMin, (m) => {
    windowMin = m;
    sync();
  });
  const amountField = h('label', { class: 'price-field' }, amount, h('span', { class: 'cur', text: currencySymbol(s.currency) }));

  const example = h('div', { class: 'notice' });
  const instant = h('div', { class: 'notice calm' }, icon('checkCircle'), h('span', { text: t('bs.instant') }));
  const label = (key) => h('span', { class: 'field-label', text: t(key) });
  const cliqGroup = h(
    'div',
    { class: 'fold' },
    h(
      'div',
      { class: 'fold-inner bs-group' },
      field(t('bs.alias'), alias, { hint: t('bs.alias_hint') }),
      field(t('bs.name'), holder, { hint: t('bs.name_hint'), optional: true }),
      label('bs.deposit'),
      kindSwitch,
      amountField,
      label('bs.window'),
      windowSwitch,
      label('bs.example'),
      example,
    ),
  );

  function sync() {
    const on = cliq.input.checked;
    cliqGroup.classList.toggle('open', on);
    cliqGroup.inert = !on;
    instant.hidden = on || !online.input.checked;
    amountField.hidden = kind !== 'fixed';
    const shown = kind === 'full' ? t('bs.full_note') : t('book.deposit_note', { amount: fmtPrice(amount.value || '0', s.currency), window: fmtDuration(windowMin) });
    clear(example, icon('lock'), h('span', { text: shown }));
  }
  cliq.input.addEventListener('change', sync);
  online.input.addEventListener('change', sync);
  amount.addEventListener('input', sync);
  sync();

  const form = h('form', { class: 'bs-form', novalidate: true, onsubmit: (e) => e.preventDefault() }, h('div', { class: 'card flush bs-switches' }, online.el, cliq.el), cliqGroup, instant);
  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
  const panel = decorateSheet(sheet({ title: t('bs.title'), body: form, actions: [save], tall: true }));
  save.addEventListener('click', () => busy(save, async () => {
    const body = {
      booking_enabled: online.input.checked,
      cliq_required: cliq.input.checked,
      cliq_alias: alias.value.trim(),
      cliq_name: holder.value.trim(),
      deposit_kind: kind,
      payment_window_min: windowMin,
    };
    if (kind === 'fixed' || amount.value) body.deposit_amount = amount.value;
    try {
      const res = await api('PATCH', '/api/manage/salon', body);
      store.set({ salon: res.salon });
      panel.close();
      toast(t('bs.saved'));
      onSaved?.();
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }));
}

// ---------------------------------------------------------------- page

export function bookingsPage(store, app) {
  const state = { today: null, date: viewDate, staffId: null, day: [], counts: {}, attention: [], loaded: false };
  const known = new Set();
  // What is already on screen, per list: only new rows animate in.
  const seenDay = new Set();
  const seenAttention = new Set();
  let expanded = false; // the deposits list, opened past its first row (phones)
  let cancelledOpen = false;
  let selected = null; // the booking open beside the day (wide screens)
  let detailSig = '';
  let returnFocus = null;
  let strip = null;
  let stripKey = '';
  let lastFigures = { count: 0, revenue: 0 };
  let mounted = true;

  const ctx = {
    store,
    app,
    // False once the owner has left this screen: nothing more opens over the next one.
    alive: () => mounted,
    today: () => state.today,
    cur: () => store.salon.currency,
    // Every decision lands here (the side card, a deposit row, the full-screen review, a
    // quick button). The booking open beside the day follows it at once, wherever it was
    // decided, so its buttons never act on a state that is gone.
    onChange: (updated) => {
      if (updated?.id && selected?.id === updated.id) {
        selected = updated;
        renderDetail(updated);
      }
      load();
      store.refreshBadges();
    },
    open: (b) => openBooking(b),
    newBooking: (opts = {}) => openNewBooking(ctx, { date: state.date, staffId: state.staffId, ...opts, onDone: onCreated }),
  };

  const settingsBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('sched.settings'), title: t('sched.settings'), onclick: () => openBookingSettings(store, render) }, icon('sliders'));
  // Live once the day has loaded: a new booking needs to know which day is today.
  const addBtn = h('button', { class: 'btn btn-primary btn-sm add-btn', type: 'button', disabled: true, title: t('sched.add'), onclick: () => state.today && ctx.newBooking() }, icon('plus'), h('span', { class: 'lbl', text: t('sched.add') }));
  const head = h('div', { class: 's-head sched-head' }, h('div', { class: 'grow' }, h('h1', { class: 's-title', text: t('sched.title') }), h('p', { class: 's-sub', text: t('sched.sub') })), settingsBtn, addBtn);

  const skel = (height, extra = {}) => h('div', { class: 'skel', style: { height, borderRadius: '18px', ...extra } });
  const daySkeleton = () => [skel('22px', { width: '45%', marginTop: '20px', borderRadius: '8px' }), skel('72px', { marginTop: '16px' }), skel('72px', { marginTop: '10px' }), skel('72px', { marginTop: '10px' })];
  const stripBox = h('div', { class: 'sched-strip' }, skel('78px'));
  const dayBox = h('div', { class: 'sched-day' }, daySkeleton());
  const detailBox = h('div', { class: 'sched-detail-box' });
  const attentionBox = h('div', { class: 'sched-attention' });
  const statsBox = h('div', { class: 'sched-stats-box' });
  const offBox = h('div');
  const main = h('div', { class: 'sched-main' }, stripBox, dayBox);
  const side = h('div', { class: 'sched-side' }, detailBox, statsBox);
  const el = h('div', { class: 'sched' }, head, offBox, h('div', { class: 'sched-cols' }, main, side));
  // The deposits sit above the day on phones and in the column beside it on wide screens.
  // They move in the DOM (not with CSS order), so reading and Tab order follow the screen.
  const placeAttention = () => {
    if (wide()) {
      if (attentionBox.nextElementSibling !== statsBox) statsBox.before(attentionBox);
    } else if (main.firstElementChild !== attentionBox) main.prepend(attentionBox);
  };
  placeAttention();

  function onCreated(b) {
    state.date = b.date;
    viewDate = b.date;
    load();
    store.refreshBadges();
  }

  // ---- the booking open beside the day
  function openBooking(b) {
    if (!wide()) {
      openDetail(ctx, b);
      return;
    }
    if (!selected) returnFocus = document.activeElement;
    selected = b;
    detailSig = '';
    renderDetail();
    markSelected();
    side.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    detailBox.querySelector('h2')?.focus({ preventScroll: true });
  }
  function closeDetail() {
    selected = null;
    detailSig = '';
    renderDetail();
    markSelected();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }
  /** latest: the booking as a decision just left it, ahead of the reload. */
  function renderDetail(latest = null) {
    if (!selected) {
      clear(detailBox);
      return;
    }
    selected = latest ?? state.day.find((x) => x.id === selected.id) ?? state.attention.find((x) => x.id === selected.id) ?? selected;
    // Redraw only when the booking changed, so a live refresh keeps the owner's place.
    const sig = JSON.stringify(selected);
    if (sig === detailSig) return;
    const first = !detailSig;
    detailSig = sig;
    const card = inlineDetail(ctx, selected, { onClose: closeDetail, onDone: ctx.onChange });
    if (first) card.classList.add('rise');
    keepFocus(detailBox, () => clear(detailBox, card), () => card.querySelector('h2'));
  }
  function markSelected() {
    el.querySelectorAll('.appt[data-id], .att-row[data-id]').forEach((n) => n.classList.toggle('selected', !!selected && Number(n.dataset.id) === selected.id));
  }

  // ---- loading
  async function load() {
    const asked = state.date;
    try {
      const [overview, day] = await Promise.all([
        api('GET', `/api/manage/bookings/overview?days=${PAST_DAYS + AHEAD_DAYS + 1}`),
        api('GET', `/api/manage/bookings${asked ? `?date=${asked}` : ''}`),
      ]);
      state.today = overview.today;
      state.counts = overview.counts;
      state.attention = overview.attention;
      for (const b of overview.attention) known.add(b.id);
      // The owner may have picked another day while this was on its way: that day's own
      // request will draw it, this one only refreshes the deposits and the strip.
      const fresh = state.date === asked;
      if (fresh) {
        state.date = day.date;
        state.day = day.bookings;
        for (const b of day.bookings) known.add(b.id);
      }
      state.loaded = true;
      addBtn.disabled = false;
      render(fresh);
    } catch (err) {
      if (state.loaded) return; // a background refresh: keep the screen as it is
      const retry = h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { clear(dayBox, daySkeleton()); load(); } }, icon('undo'), t('retry'));
      clear(stripBox);
      clear(dayBox, h('div', { class: 'card empty load-error rise', role: 'alert' }, h('div', { class: 'tile' }, icon('alert')), h('p', { text: errorText(err) }), retry));
    }
  }

  async function loadDay(date) {
    const previous = state.date;
    state.date = date;
    viewDate = date;
    dayBox.classList.add('loading');
    // A slow network gets a skeleton rather than the old day under the new date.
    const slow = setTimeout(() => {
      if (state.date !== date) return;
      dayBox.classList.remove('loading');
      clear(dayBox, daySkeleton());
    }, 200);
    try {
      const day = await api('GET', `/api/manage/bookings?date=${date}`);
      if (state.date !== date) return;
      state.day = day.bookings;
      for (const b of day.bookings) known.add(b.id);
      dayBox.dataset.dir = date > previous ? 'next' : 'prev';
      renderDay({ switched: true });
    } catch (err) {
      if (state.date === date) clear(dayBox, h('p', { class: 'empty', text: errorText(err) }));
    } finally {
      clearTimeout(slow);
      if (state.date === date) dayBox.classList.remove('loading');
    }
  }

  // ---- drawing
  function renderStrip() {
    const from = addDays(state.today, -PAST_DAYS);
    const days = Array.from({ length: PAST_DAYS + AHEAD_DAYS + 1 }, (_, i) => {
      const date = addDays(from, i);
      return { date, badge: state.counts[date] || 0 };
    });
    // Keep a date picked far outside the strip reachable.
    if (!days.some((d) => d.date === state.date)) days.push({ date: state.date, badge: state.counts[state.date] || 0 });
    const key = days.map((d) => d.date).join();
    // The same days: update the counts in place, so the owner's scroll position stays.
    if (strip && key === stripKey && stripBox.contains(strip.el)) {
      for (const d of days) setBadge(strip.el, d.date, d.badge);
      strip.select(state.date);
      return;
    }
    strip = dayStrip({ days, today: state.today, selected: state.date, onPick: loadDay });
    stripKey = key;
    decorateStrip(strip.el, state.today);
    const nav = (dir) => h(
      'button',
      {
        class: 'icon-btn strip-nav', type: 'button', 'aria-label': t(dir > 0 ? 'sched.next_week' : 'sched.prev_week'), title: t(dir > 0 ? 'sched.next_week' : 'sched.prev_week'),
        onclick: () => {
          const rtl = getComputedStyle(strip.el).direction === 'rtl';
          strip.el.scrollBy({ left: (rtl ? -1 : 1) * dir * strip.el.clientWidth * 0.9, behavior: reducedMotion() ? 'auto' : 'smooth' });
        },
      },
      icon('chevron', dir > 0 ? 'flip-ltr' : 'flip-rtl'),
    );
    clear(stripBox, nav(-1), strip.el, nav(1));
  }

  function renderDay({ switched = false } = {}) {
    const cur = store.salon.currency;
    const all = state.day;
    const staffOnDay = new Map();
    for (const b of all) staffOnDay.set(b.staff.id, b.staff);
    const team = store.staff.filter((m) => m.active || staffOnDay.has(m.id));
    if (state.staffId && !team.some((m) => m.id === state.staffId)) state.staffId = null;
    const shown = all.filter((b) => !state.staffId || b.staff.id === state.staffId);
    const active = shown.filter((b) => !dropped(b));
    const gone = shown.filter(dropped);
    const live = shown.filter((b) => COUNTED.has(b.status));
    const revenue = sum(live.filter((b) => b.status !== 'no_show'));
    const isToday = state.date === state.today;
    const isPast = state.date < state.today;
    const now = nowIn(store.salon.timezone).minutes;
    const hours = openRanges(store.hours, state.date);
    const windows = hours ? hours.all : active.length ? [[Math.min(...active.map(startOf)), Math.max(...active.map(endOf))]] : [];
    const gaps = isPast ? [] : freeGaps(active.map((b) => [startOf(b), endOf(b)]), windows, isToday ? Math.ceil(now / 5) * 5 : 0);
    const dayHasVisits = all.some((b) => !dropped(b));
    if (switched) {
      for (const b of all) seenDay.add(b.id);
      if (selected && !all.some((b) => b.id === selected.id) && !state.attention.some((b) => b.id === selected.id)) {
        selected = null;
        detailSig = '';
      }
    }

    const title = h('h2', { class: 'day-title', text: `${dayLabel(state.date, state.today)} · ${fmtDate(state.date, { day: 'numeric', month: 'long' })}` });
    let figures = null;
    if (dayHasVisits) {
      const count = h('span');
      const money = h('span');
      figures = h('div', { class: 'small muted num sub' }, count, ' · ', money);
      const from = switched || !state.drawn ? { count: 0, revenue: 0 } : lastFigures;
      tween(count, from.count, live.length, (n) => t('sched.count', { n }));
      tween(money, from.revenue, revenue, (v) => t('sched.revenue', { amount: fmtPrice(v, cur) }));
      lastFigures = { count: live.length, revenue };
    }
    const summary = h('div', { class: 'sched-summary' }, h('div', null, title, figures));

    const filter = dayHasVisits && team.length > 1
      ? h('div', { class: 'scroller staff-filter', role: 'group', 'aria-label': t('sched.pick_staff') }, [
          h('button', { class: `chip-btn ${state.staffId ? '' : 'on'}`, type: 'button', 'aria-pressed': String(!state.staffId), text: t('sched.all'), onclick: () => { state.staffId = null; renderDay(); } }),
          ...team.map((m) => h(
            'button',
            { class: `chip-btn ${state.staffId === m.id ? 'on' : ''}`, type: 'button', 'aria-pressed': String(state.staffId === m.id), onclick: () => { state.staffId = m.id; renderDay(); } },
            avatar(m.photo_url, pick(m, 'name')),
            pick(m, 'name'),
          )),
        ])
      : null;

    const timing = { now, isToday, isPast };
    const list = dayHasVisits
      ? agenda(ctx, active, { date: state.date, ...timing, gaps, seen: seenDay, switched })
      : emptyDay(ctx, { date: state.date, isPast, own: hours?.own ?? null });
    if (!dayHasVisits && !switched && !seenDay.has(`empty-${state.date}`)) list.classList.add('rise');
    seenDay.add(`empty-${state.date}`);
    const cancelled = gone.length ? cancelledGroup(ctx, gone, { open: cancelledOpen, onToggle: (o) => { cancelledOpen = o; }, ...timing }) : null;
    const content = h('div', { class: switched ? 'day-in' : '' }, summary, filter, list, cancelled);
    keepFocus(dayBox, () => clear(dayBox, content));
    state.drawn = true;

    const members = state.staffId ? team.filter((m) => m.id === state.staffId) : team;
    clear(statsBox, statsCard(ctx, { shown, members, ...timing, windows: hours ? hours.all : null, gaps }));
    renderDetail();
    markSelected();
  }

  function render(withDay = true) {
    if (!state.loaded) return;
    clear(offBox, store.salon.booking_enabled ? null : h(
      'div',
      { class: 'notice off-note' },
      icon('eyeOff'),
      h('span', { class: 'grow', text: t('sched.off') }),
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: t('sched.turn_on'), onclick: () => openBookingSettings(store, render) }),
    ));
    // Transfers to check first, then the holds still waiting for one.
    const list = [...state.attention].sort((a, b) => (a.status === 'payment_sent' ? 0 : 1) - (b.status === 'payment_sent' ? 0 : 1) || `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
    if (list.length < 2) expanded = false;
    // A decided deposit leaves the list: the focus goes on to the next one waiting.
    keepFocus(
      attentionBox,
      () => clear(attentionBox, attentionSection(ctx, list, { seen: seenAttention, expanded, onExpand: () => { expanded = true; } })),
      () => attentionBox.querySelector('.att-open'),
    );
    renderStrip();
    if (withDay) renderDay();
    else {
      renderDetail();
      markSelected();
    }
  }

  // Live: a new booking or a deposit sent shows up without a refresh.
  let reloadTimer = null;
  store.onBooking((e) => {
    if (Date.now() > quietUntil) {
      if (e.proof === 'replaced') toast(t('sched.proof_replaced'));
      else if (e.status === 'payment_sent') toast(t('sched.payment_arrived'));
      else if (e.id && !known.has(e.id) && HOLDING.has(e.status)) toast(t('sched.new_plain'));
    }
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, 250);
  });
  // The now line and the free time move, holds run out; a failed first load retries.
  const tick = setInterval(load, 60_000);
  // Deposit countdowns tick every second; one that runs out brings a refresh.
  const seconds = setInterval(() => {
    let ended = false;
    el.querySelectorAll('[data-deadline]').forEach((n) => {
      const left = (Number(n.dataset.deadline) - Date.now()) / 1000;
      n.textContent = mmss(left);
      if (left <= 0) {
        ended = true;
        n.removeAttribute('data-deadline');
      }
    });
    document.querySelectorAll('.sched-sheet [data-deadline]').forEach((n) => {
      n.textContent = mmss((Number(n.dataset.deadline) - Date.now()) / 1000);
    });
    if (ended) load();
  }, 1000);
  const onKey = (e) => {
    if (e.key === 'Escape' && selected && !document.querySelector('.sheet-backdrop, .proof-viewer')) closeDetail();
  };
  document.addEventListener('keydown', onKey);
  const mq = matchMedia(WIDE);
  const onWidth = () => {
    placeAttention();
    if (!mq.matches && selected) {
      selected = null;
      detailSig = '';
      renderDetail();
      markSelected();
    }
  };
  mq.addEventListener('change', onWidth);
  app.onUnmount(() => {
    mounted = false;
    clearInterval(tick);
    clearInterval(seconds);
    clearTimeout(reloadTimer);
    document.removeEventListener('keydown', onKey);
    mq.removeEventListener('change', onWidth);
  });

  load();
  return el;
}
