// An in-memory stand-in for @vercel/blob, for tests that drive real route
// handlers. Nothing here touches the network, so a test using it can never
// read or write a real school's store, whatever tokens the shell has set.
//
// Only what lib/ and app/api/ call: put, get, list, del, head, plus the error
// classes. Conditional writes behave like the real store: ifMatch against a
// moved etag and allowOverwrite:false on an existing file both throw.

const store = new Map(); // pathname -> { bytes, etag, contentType, uploadedAt }
let etagSeq = 0;
const BASE = "https://fake-blob.test/";

class BlobError extends Error {}
class BlobNotFoundError extends BlobError {}
class BlobPreconditionFailedError extends BlobError {}

async function toBytes(body) {
  if (body == null) return Buffer.alloc(0);
  if (typeof body === "string") return Buffer.from(body);
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (typeof body.arrayBuffer === "function") return Buffer.from(await body.arrayBuffer());
  if (typeof body.getReader === "function") return Buffer.from(await new Response(body).arrayBuffer());
  throw new Error("fake blob: unsupported body");
}

function pathOf(urlOrPath) {
  return String(urlOrPath).startsWith(BASE) ? String(urlOrPath).slice(BASE.length) : String(urlOrPath);
}

function meta(pathname, f) {
  return { pathname, url: BASE + pathname, downloadUrl: BASE + pathname, etag: f.etag, size: f.bytes.length, contentType: f.contentType, uploadedAt: f.uploadedAt };
}

async function put(pathname, body, opts = {}) {
  const existing = store.get(pathname);
  if (opts.ifMatch && (!existing || existing.etag !== opts.ifMatch)) {
    throw new BlobPreconditionFailedError("fake blob: precondition failed");
  }
  if (existing && opts.allowOverwrite === false && !opts.ifMatch) {
    throw new BlobError("fake blob: this blob already exists");
  }
  let name = pathname;
  if (opts.addRandomSuffix) name = pathname.replace(/(\.[^./]+)?$/, (ext) => `-${Math.random().toString(36).slice(2, 8)}${ext || ""}`);
  const f = { bytes: await toBytes(body), etag: `"e${++etagSeq}"`, contentType: opts.contentType || "application/octet-stream", uploadedAt: new Date() };
  store.set(name, f);
  return meta(name, f);
}

async function get(urlOrPath) {
  const p = pathOf(urlOrPath);
  const f = store.get(p);
  if (!f) return null;
  return { statusCode: 200, stream: new Response(f.bytes).body, headers: new Headers({ etag: f.etag }), blob: meta(p, f) };
}

async function head(urlOrPath) {
  const p = pathOf(urlOrPath);
  const f = store.get(p);
  if (!f) throw new BlobNotFoundError("fake blob: not found");
  return meta(p, f);
}

async function list(opts = {}) {
  const prefix = opts.prefix || "";
  const all = [...store.keys()].filter((k) => k.startsWith(prefix)).sort();
  const start = opts.cursor ? Number(opts.cursor) : 0;
  const limit = opts.limit || 1000;
  const page = all.slice(start, start + limit);
  const hasMore = start + limit < all.length;
  return { blobs: page.map((k) => meta(k, store.get(k))), hasMore, cursor: hasMore ? String(start + limit) : undefined, folders: [] };
}

async function del(urls) {
  for (const u of Array.isArray(urls) ? urls : [urls]) store.delete(pathOf(u));
}

/** Test helper, not part of the real SDK. */
function __fakeStore() {
  return store;
}

module.exports = { BlobError, BlobNotFoundError, BlobPreconditionFailedError, put, get, head, list, del, __fakeStore };
