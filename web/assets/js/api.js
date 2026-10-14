export class ApiError extends Error {
  constructor(status, code, field) {
    super(code);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

// A read that hangs (a dead mobile connection, a captive portal) gives up after this
// long as a network error, so the screen can offer to try again instead of spinning.
// Writes wait for the browser: giving up on one the server may have done invites a repeat.
const READ_TIMEOUT_MS = 30000;

/** JSON in, JSON out. Pass a Blob as the body to upload it raw. */
export async function api(method, path, body) {
  const init = { method, headers: {}, credentials: 'same-origin' };
  if (method === 'GET' && typeof AbortSignal.timeout === 'function') init.signal = AbortSignal.timeout(READ_TIMEOUT_MS);
  if (body instanceof Blob) {
    init.body = body;
    init.headers['Content-Type'] = body.type || 'application/octet-stream';
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['Content-Type'] = 'application/json';
  }
  let res;
  let text;
  try {
    res = await fetch(path, init);
    // Read in full here: a connection that drops mid-answer is a network error, not an empty success.
    text = await res.text();
  } catch {
    throw new ApiError(0, 'network');
  }
  let data = {};
  try {
    if (text) data = JSON.parse(text) ?? {};
  } catch {
    // Not JSON (a proxy's error page): the status alone decides.
  }
  if (!res.ok) {
    if (res.status === 401 && data.error === 'login_required') window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(res.status, data.error || 'server_error', data.field);
  }
  return data;
}

/**
 * Phones shoot 4000px photos; shrink big ones before upload to save mobile data.
 * The server re-validates and re-encodes whatever arrives.
 */
export async function prepareImage(file, maxSide = 2000) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Opens the file picker and resolves with the chosen image (or null). */
export function pickImage() {
  return new Promise((resolve) => {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = 'image/jpeg,image/png,image/webp';
    el.addEventListener('change', () => resolve(el.files?.[0] ?? null), { once: true });
    el.addEventListener('cancel', () => resolve(null), { once: true });
    el.click();
  });
}
