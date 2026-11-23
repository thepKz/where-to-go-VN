// Máy chủ chế độ nhà: một cổng phục vụ trang đã dựng và các đường đồng bộ, nghe trên mọi địa chỉ, giữ dữ liệu của nhà trên đĩa.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, resolve, sep } from 'node:path';
import { createSyncCore, validDump } from './sync-server.mjs';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
};
const secure = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
};

/** Địa chỉ IPv4 riêng tư của máy này, để máy khác trong cùng mạng mở được. */
export function privateAddresses(interfaces = networkInterfaces()) {
  const found = [];
  for (const list of Object.values(interfaces)) for (const item of list || []) {
    const family = typeof item.family === 'string' ? item.family : `IPv${item.family}`;
    if (family !== 'IPv4' || item.internal) continue;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address)) found.push(item.address);
  }
  // Mạng gia đình thường là 192.168 hoặc 10, đưa lên trước. 172.16 đến 172.31 hay là cầu nối ảo của máy.
  const rank = address => address.startsWith('172.') ? 1 : 0;
  return found.sort((left, right) => rank(left) - rank(right));
}
/** Tên máy trong Host chỉ được là máy này, địa chỉ mạng riêng, hoặc tên một nhãn (tên máy trong nhà). Địa chỉ công khai bị từ chối. */
export function hostAllowed(host) {
  const name = String(host || '').replace(/:\d+$/, '').toLowerCase();
  if (!name) return false;
  if (name === 'localhost' || name === '[::1]') return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(name);
  if (name.startsWith('[')) return false;
  return !name.includes('.') || name.endsWith('.local');
}
/** Gốc yêu cầu chỉ được là chính trang đang phục vụ: cùng host và cổng. Không có gốc thì là yêu cầu cùng gốc hoặc không phải trình duyệt. */
export function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  return origin === `http://${request.headers.host}`;
}

/** Đọc tệp dữ liệu. Tệp hỏng thì đổi tên sang tệp .hong và trả về null kèm một dòng báo. */
export function loadSaved(file, log = () => {}) {
  if (!existsSync(file)) return null;
  let data = null;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  if (validDump(data)) return data;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const aside = file.replace(/\.json$/, `.hong-${stamp}.json`);
  try { renameSync(file, aside); log(`Tệp dữ liệu nhà bị hỏng, đã đổi tên thành ${aside}, chạy với dữ liệu trống`); }
  catch { log('Tệp dữ liệu nhà bị hỏng và không đổi tên được, chạy với dữ liệu trống'); }
  return null;
}

/**
 * options.dist: thư mục trang đã dựng. options.file: tệp dữ liệu của nhà. options.log: nơi in thông báo.
 * Trả về máy chủ http, thêm hàm flush (ghi ngay) và stop (ghi lần cuối rồi đóng).
 */
export function createHomeServer({ dist, file, log = console.log, delay = 300 }) {
  const root = resolve(dist);
  let timer = null, dirty = false;
  const write = () => {
    clearTimeout(timer); timer = null
    if (!dirty) return;
    dirty = false;
    const temp = `${file}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(core.dump()));
      renameSync(temp, file);
    } catch (failure) { dirty = true; log(`Chưa ghi được dữ liệu nhà: ${failure.code || 'lỗi'}`); }
  };
  mkdirSync(resolve(file, '..'), { recursive: true });
  const core = createSyncCore({
    limitJoin: true,
    restore: loadSaved(file, log) || undefined,
    onChange: () => { dirty = true; if (!timer) timer = setTimeout(write, delay); },
  });
  const send = (request, response, status, headers, body) => { response.writeHead(status, { ...secure, ...headers }); response.end(request.method === 'HEAD' ? undefined : body); };
  const server = createServer(async (request, response) => {
    if (!hostAllowed(request.headers.host) || !sameOrigin(request)) { response.writeHead(403, secure).end(); return; }
    try {
      for (const [name, value] of Object.entries(secure)) response.setHeader(name, value);
      if (await core.handle(request, response)) return;
      if (request.method !== 'GET' && request.method !== 'HEAD') { send(request, response, 405, { Allow: 'GET, HEAD' }); return; }
      let path;
      try { path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { send(request, response, 400, {}); return; }
      if (path.includes('\0')) { send(request, response, 400, {}); return; }
      const target = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
      if (target !== root && !target.startsWith(root + sep)) { send(request, response, 404, {}); return; }
      let info;
      try { info = statSync(target); } catch { send(request, response, 404, {}); return; }
      if (!info.isFile()) { send(request, response, 404, {}); return; }
      const url = '/' + target.slice(root.length + 1).split(sep).join('/');
      const cache = url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : url === '/service-worker.js' ? 'no-cache, no-store, must-revalidate' : 'no-cache';
      response.writeHead(200, { ...secure, 'Content-Type': types[extname(target).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': cache });
      if (request.method === 'HEAD') { response.end(); return; }
      createReadStream(target).on('error', () => response.destroy()).pipe(response);
    } catch { if (!response.headersSent) response.writeHead(500, secure); response.end(); }
  });
  server.flush = write;
  server.stop = () => new Promise(done => {
    write();
    core.closeStreams();
    server.close(() => done());
    server.closeAllConnections();
  });
  return server;
}

/** Bật máy chủ nhà trên một cổng, in địa chỉ, ghi lần cuối khi nhận tín hiệu tắt. */
export function startHome({ dist, file, port, host = '0.0.0.0', log = console.log }) {
  const server = createHomeServer({ dist, file, log });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => {
      const actual = server.address().port;
      log(`Đi Đâu cho cả nhà đang chạy`);
      log(`Trên máy này: http://localhost:${actual}`);
      for (const address of privateAddresses()) log(`Trên điện thoại cùng Wi-Fi: http://${address}:${actual}`);
      log(`Dữ liệu của nhà nằm ở ${file}`);
      done(server);
    });
  });
}
