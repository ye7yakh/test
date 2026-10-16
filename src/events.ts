// Live updates for the owner's studio over Server-Sent Events. The api runs as one
// process, so an in-memory list of open streams per salon is enough.
import type { ServerResponse } from 'node:http';

// A barber's stream (staffId set) carries only changes to his own chair.
const streams = new Map<number, Set<{ res: ServerResponse; staffId: number | null }>>();

export function subscribe(salonId: number, res: ServerResponse, staffId: number | null = null): () => void {
  let set = streams.get(salonId);
  if (!set) streams.set(salonId, (set = new Set()));
  const stream = { res, staffId };
  set.add(stream);
  return () => {
    set!.delete(stream);
    if (!set!.size) streams.delete(salonId);
  };
}

/** staffId: whose chair the change is in, so a barber hears only about his own. */
export function publish(salonId: number, event: string, data: unknown, staffId: number | null = null): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const { res, staffId: only } of streams.get(salonId) ?? []) {
    if (only == null || only === staffId) res.write(payload);
  }
}
