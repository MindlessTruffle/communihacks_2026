// Production server: serves dist/ + /api. `pnpm build && pnpm serve` (PORT env, default 8080).
// Gzip/brotli for text + glb, ETag, Range (iOS Safari needs it for audio), immutable caching for hashed assets.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { handleApi, loadEnv } from "./api.mjs";

loadEnv();
const dist = path.resolve(import.meta.dirname, "..", "dist");
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".woff": "font/woff",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
};
const compressible = new Set([".html", ".js", ".css", ".json", ".svg", ".glb", ".webmanifest"]);
const zcache = new Map(); // file|mtime|enc -> Buffer

http.createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(dist, p);
  if (!file.startsWith(dist)) { res.statusCode = 403; return res.end(); }
  let st = fs.existsSync(file) ? fs.statSync(file) : null;
  if (!st || st.isDirectory()) {
    if (path.extname(p)) { res.statusCode = 404; return res.end("Not found"); } // missing asset: real 404, not index.html
    file = path.join(dist, "index.html"); st = fs.statSync(file);
  }
  const ext = path.extname(file);
  res.setHeader("Content-Type", types[ext] || "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const hashed = p.startsWith("/assets/");
  if (hashed) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  else if (ext === ".html" || file.endsWith("sw.js") || ext === ".webmanifest" || ext === ".json") res.setHeader("Cache-Control", "no-cache");
  else res.setHeader("Cache-Control", "public, max-age=604800");
  const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`;
  res.setHeader("ETag", etag);
  if (req.headers["if-none-match"] === etag) { res.statusCode = 304; return res.end(); }

  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range) {
    const start = range[1] ? +range[1] : Math.max(0, st.size - +range[2]);
    const end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) { res.statusCode = 416; res.setHeader("Content-Range", `bytes */${st.size}`); return res.end(); }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${st.size}`);
    res.setHeader("Content-Length", end - start + 1);
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  const ae = String(req.headers["accept-encoding"] || "");
  const enc = compressible.has(ext) && st.size > 1024 ? (/\bbr\b/.test(ae) ? "br" : /\bgzip\b/.test(ae) ? "gzip" : "") : "";
  if (enc) {
    res.setHeader("Content-Encoding", enc);
    res.setHeader("Vary", "Accept-Encoding");
    const key = `${file}|${st.mtimeMs}|${enc}`;
    let buf = zcache.get(key);
    if (!buf) {
      const raw = fs.readFileSync(file);
      buf = enc === "br" ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) : zlib.gzipSync(raw, { level: 8 });
      zcache.set(key, buf);
    }
    res.setHeader("Content-Length", buf.length);
    return res.end(buf);
  }
  res.setHeader("Content-Length", st.size);
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 8080, () => console.log("Royal Concerns on :" + (process.env.PORT || 8080)));
