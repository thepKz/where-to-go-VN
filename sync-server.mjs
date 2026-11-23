import { createServer } from 'node:http';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { emptyTables, applyChange, tableNames } from './src/store/shared.mjs';
import { normalizeWhere } from './src/core/rounds.mjs';

/** Các đường đồng bộ. Máy chủ nhà dùng danh sách này để biết yêu cầu nào là của đồng bộ, còn lại là tệp tĩnh. */
export const syncPaths = new Set(['/health', '/session', '/events', '/join', '/house', '/remove', '/change']);
const MAX_CHANGE_IDS = 5000;
/**
 * Lõi đồng bộ dùng chung cho máy chủ thử và máy chủ nhà. Không tự kiểm gốc yêu cầu, người gọi kiểm trước.
 * options.onChange: gọi sau mỗi thay đổi dữ liệu, để máy chủ nhà ghi xuống đĩa.
 * options.limitJoin: giới hạn số lần nhập sai mã mời theo địa chỉ máy gọi.
 * options.restore: dữ liệu đã ghi lần trước (kết quả của dump).
 */
export function createSyncCore(options = {}) {
  const tables = emptyTables();
  const sessions = new Map();
  const streams = new Set();
  const changes = new Set();
  const attempts = new Map();
  const onChange = options.onChange || (() => {});
  let sequence = 0;
  const history = [];
  const snapshot = householdId => {
    const rounds = tables.rounds.filter(row => row.household_id === householdId);
    const ids = new Set(rounds.map(row => row.id));
    return Object.fromEntries(tableNames.map(table => [table, tables[table].filter(row => table === 'households' ? row.id === householdId : table === 'votes' ? ids.has(row.round_id) : row.household_id === householdId)]));
  };
  const send = (client, entry) => { if (!client.response.writableEnded && !client.response.destroyed) client.response.write(`id: ${entry.sequence}\ndata: ${JSON.stringify({ tables: entry.tables })}\n\n`); };
  const publish = householdId => {
    const entry = { sequence: ++sequence, householdId, tables: structuredClone(snapshot(householdId)) };
    history.push(entry);
    if (history.length > 2000) history.shift();
    onChange();
    for (const client of streams) if (client.householdId === householdId) send(client, entry);
  };
  const household = () => {
    let code;
    do { code = String(randomBytes(4).readUInt32BE() % 1000000).padStart(6, '0'); } while (tables.households.some(row => row.invite_code === code));
    return { id: randomUUID(), invite_code: code, created_at: new Date().toISOString() };
  };
  const secretEqual = (left, right) => typeof left === 'string' && typeof right === 'string' && Buffer.byteLength(left) === Buffer.byteLength(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));
  const cleanName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80;
  const limited = request => {
    if (!options.limitJoin) return false;
    const entry = attempts.get(request.socket.remoteAddress);
    return Boolean(entry && entry.until > Date.now());
  };
  const failedJoin = request => {
    if (!options.limitJoin) return;
    const key = request.socket.remoteAddress, now = Date.now();
    const entry = attempts.get(key);
    const fresh = !entry || now - entry.first > 300000;
    const next = { first: fresh ? now : entry.first, count: (fresh ? 0 : entry.count) + 1, until: 0 };
    if (next.count >= 8) next.until = now + 300000;
    attempts.set(key, next);
    if (attempts.size > 500) for (const [address, value] of attempts) if (now - value.first > 300000) attempts.delete(address);
  };
  const run = async (request, response, url) => {
    response.setHeader('Cache-Control', 'no-store');
    const reply = (status, value = {}) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    try {
      if (url.pathname === '/health') { reply(200, { ok: true }); return; }
      let body = {};
      if (request.method === 'POST') {
        let raw = '';
        for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 262144) { reply(413); return; } }
        try { body = JSON.parse(raw); } catch { reply(400); return; }
      }
      if (url.pathname === '/session' && request.method === 'POST') {
        const { identity, member, household: proposed } = body;
        if (!identity || !/^[\w-]{20,80}$/.test(identity.memberId) || !/^[\w-]{20,120}$/.test(identity.token) || !cleanName(member?.name)) { reply(400); return; }
        const existing = sessions.get(identity.memberId);
        if (existing && !secretEqual(existing.token, identity.token)) { reply(403); return; }
        if (!existing && body.detached) { sessions.set(identity.memberId, { ...identity, householdId: '' }); onChange(); }
        else if (!existing) {
          const taken = tables.households.some(row => row.id === proposed?.id);
          const house = !taken && proposed && /^[\w-]{20,80}$/.test(proposed.id) && /^\d{6}$/.test(proposed.invite_code) && !tables.households.some(row => row.invite_code === proposed.invite_code) ? { id: proposed.id, invite_code: proposed.invite_code, created_at: new Date().toISOString() } : household();
          applyChange(tables, { table: 'households', row: house });
          sessions.set(identity.memberId, { ...identity, householdId: house.id });
          applyChange(tables, { table: 'members', row: { id: identity.memberId, household_id: house.id, name: member.name.trim(), joined_at: new Date().toISOString() } });
          publish(house.id);
        }
        const session = sessions.get(identity.memberId);
        reply(200, { identity: session, tables: snapshot(session.householdId) }); return;
      }
      const memberId = request.headers['x-member-id'] || url.searchParams.get('member');
      const token = request.headers.authorization?.replace(/^Bearer /, '') || url.searchParams.get('token');
      const session = sessions.get(memberId);
      if (!session || !secretEqual(session.token, token)) { reply(401); return; }
      if (url.pathname === '/events' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        response.write('retry: 1000\n\n');
        const client = { response, householdId: session.householdId, memberId };
        streams.add(client);
        const after = Number(request.headers['last-event-id'] || url.searchParams.get('after') || 0);
        for (const entry of history) if (after > 0 && entry.sequence > after && entry.householdId === session.householdId) send(client, entry);
        send(client, { sequence, tables: snapshot(session.householdId) });
        const heartbeat = setInterval(() => { if (!response.writableEnded && !response.destroyed) response.write(': alive\n\n'); }, 1500);
        response.on('close', () => { clearInterval(heartbeat); streams.delete(client); });
        return;
      }
      if ((url.pathname === '/join' || url.pathname === '/house') && request.method === 'POST') {
        if (!cleanName(body.name)) { reply(400); return; }
        if (url.pathname === '/join' && limited(request)) { reply(429); return; }
        const house = url.pathname === '/house' ? household() : tables.households.find(row => row.invite_code === body.code);
        if (!house) { if (url.pathname === '/join') failedJoin(request); reply(404); return; }
        if (url.pathname === '/join') attempts.delete(request.socket.remoteAddress);
        if (tables.members.filter(row => row.household_id === house.id && row.id !== memberId).length >= 4) { reply(409); return; }
        const previous = session.householdId;
        applyChange(tables, { table: 'households', row: house });
        session.householdId = house.id;
        applyChange(tables, { table: 'members', row: { id: memberId, household_id: house.id, name: body.name.trim(), joined_at: new Date().toISOString() } });
        for (const client of streams) if (client.memberId === memberId) { streams.delete(client); client.response.end(); }
        if (previous) publish(previous);
        publish(house.id);
        reply(200, { identity: session, tables: snapshot(house.id) }); return;
      }
      if (url.pathname === '/remove' && request.method === 'POST') {
        const target = typeof body.target === 'string' ? body.target : '';
        const found = tables.members.find(row => row.id === target && row.household_id === session.householdId);
        if (!session.householdId || target === memberId || !found) { reply(404); return; }
        tables.members = tables.members.filter(row => row !== found);
        const gone = sessions.get(target);
        if (gone) gone.householdId = '';
        for (const client of [...streams]) if (client.memberId === target) {
          streams.delete(client);
          if (!client.response.writableEnded && !client.response.destroyed) { client.response.write('event: removed\ndata: {}\n\n'); client.response.end(); }
        }
        publish(session.householdId);
        reply(200, { tables: snapshot(session.householdId) }); return;
      }
      if (url.pathname === '/change' && request.method === 'POST') {
        const { id, table, row } = body;
        if (!/^[\w-]{20,80}$/.test(id || '') || !tableNames.includes(table) || !row || typeof row !== 'object') { reply(400); return; }
        if (changes.has(id)) { reply(200, { tables: snapshot(session.householdId) }); return; }
        const owned = row.household_id === session.householdId;
        const round = tables.rounds.find(item => item.id === row.round_id && item.household_id === session.householdId);
        let valid = false;
        if (table === 'members') valid = owned && row.id === memberId && cleanName(row.name);
        if (table === 'marks') valid = owned && row.member_id === memberId && typeof row.place_id === 'string' && typeof row.want === 'boolean' && [null, 'great', 'ok', 'never'].includes(row.verdict) && typeof row.note === 'string' && row.note.length <= 4000;
        if (table === 'custom_places') valid = owned && row.added_by === memberId && typeof row.id === 'string' && typeof row.name === 'string' && row.name.length <= 200 && typeof row.address === 'string' && ['an', 'ca-phe', 'nhau', 'choi'].includes(row.group);
        if (table === 'rounds') valid = owned && typeof row.id === 'string' && ['an', 'ca-phe', 'nhau', 'choi'].includes(row.group) && Number.isFinite(row.seed) && Array.isArray(row.place_ids) && row.place_ids.length <= 3 && row.place_ids.every(value => typeof value === 'string') && JSON.stringify(normalizeWhere(row.where)) === JSON.stringify(row.where);
        if (table === 'votes') valid = Boolean(round) && row.member_id === memberId && round.place_ids.includes(row.place_id) && typeof row.like === 'boolean';
        if (table === 'picks') valid = owned && Boolean(round) && round.place_ids.includes(row.place_id) && typeof row.asked_verdict === 'boolean';
        if (!valid) { reply(403); return; }
        if (table !== 'rounds' || !tables.rounds.some(existing => existing.id === row.id)) applyChange(tables, { table, row });
        changes.add(id); publish(session.householdId); reply(200, { tables: snapshot(session.householdId) }); return;
      }
      reply(404);
    } catch { if (!response.headersSent) reply(400); else response.end(); }
  };
  /** Trả true nếu đây là một đường đồng bộ và đã trả lời, false nếu không phải. */
  const handle = async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (!syncPaths.has(url.pathname)) return false;
    await run(request, response, url);
    return true;
  };
  const dump = () => ({
    version: 1,
    tables: structuredClone(tables),
    sessions: [...sessions.values()].map(item => ({ memberId: item.memberId, token: item.token, householdId: item.householdId })),
    changes: [...changes].slice(-MAX_CHANGE_IDS),
  });
  const closeStreams = () => { for (const client of [...streams]) { streams.delete(client); if (!client.response.writableEnded) client.response.end(); } };
  const restore = data => {
    for (const name of tableNames) tables[name] = structuredClone(data.tables[name]);
    for (const item of data.sessions) sessions.set(item.memberId, { memberId: item.memberId, token: item.token, householdId: item.householdId });
    for (const id of data.changes) changes.add(id);
  };
  if (options.restore) restore(options.restore);
  return { handle, dump, closeStreams };
}
/** Dạng dữ liệu ghi xuống đĩa có đúng không. Dùng trước khi nạp để không nạp một tệp hỏng. */
export function validDump(data) {
  const text = value => typeof value === 'string';
  return Boolean(data && typeof data === 'object' && data.version === 1 && data.tables && typeof data.tables === 'object'
    && tableNames.every(name => Array.isArray(data.tables[name]) && data.tables[name].every(row => row && typeof row === 'object'))
    && Array.isArray(data.sessions) && data.sessions.every(item => item && text(item.memberId) && text(item.token) && text(item.householdId))
    && Array.isArray(data.changes) && data.changes.every(text));
}
export function createSyncServer() {
  const core = createSyncCore();
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    const allowed = !origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || (process.env.SYNC_ORIGIN && origin === process.env.SYNC_ORIGIN);
    if (!allowed) { response.writeHead(403).end(); return; }
    if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Member-Id');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    if (!(await core.handle(request, response))) { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{}'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = process.argv.indexOf('--port');
  const port = Number(argument < 0 ? 4504 : process.argv[argument + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [4310, 4311].includes(port)) throw new Error('Invalid port');
  createSyncServer().listen(port, 'localhost', () => console.log(`Đi Đâu sync ${port}`));
}
