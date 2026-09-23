// Live updates for the owner's studio over Server-Sent Events. The api runs as one
// process, so an in-memory list of open streams per salon is enough.
import type { ServerResponse } from 'node:http';

const streams = new Map<number, Set<ServerResponse>>();

export function subscribe(salonId: number, res: ServerResponse): () => void {
  let set = streams.get(salonId);
  if (!set) streams.set(salonId, (set = new Set()));
  set.add(res);
  return () => {
    set!.delete(res);
    if (!set!.size) streams.delete(salonId);
  };
}

export function publish(salonId: number, event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streams.get(salonId) ?? []) res.write(payload);
}
