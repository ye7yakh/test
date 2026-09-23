// Clock maths in the salon's own time zone.

export const toMin = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + mm;
};

export function nowIn(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Open right now? Also looks at yesterday's ranges that run past midnight. */
export function openStatus(hours, now) {
  for (const r of hours[now.weekday] ?? []) {
    const open = toMin(r.open);
    let close = toMin(r.close);
    if (close <= open) close += 1440;
    if (now.minutes >= open && now.minutes < close) return { open: true, until: r.close };
  }
  for (const r of hours[(now.weekday + 6) % 7] ?? []) {
    const open = toMin(r.open);
    const close = toMin(r.close);
    if (close <= open && now.minutes < close) return { open: true, until: r.close };
  }
  return { open: false };
}
