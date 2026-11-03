'use strict';
/*
 * Encuesta de usuarios premium inactivos – Buda
 * Servidor sin dependencias externas: Node 22+ (http + SQLite nativo).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const Q = require('./public/questions.js');

const PORT = Number(process.env.PORT) || 3000;
const DASH_USER = process.env.DASHBOARD_USER || 'admin';
const DASH_PASS = process.env.DASHBOARD_PASSWORD || '';
const ON_RAILWAY = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || '';
const DATA_DIR = VOLUME || path.join(__dirname, 'data');
const PERSISTENT = !ON_RAILWAY || Boolean(VOLUME);

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'encuesta.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    ref TEXT UNIQUE,
    answers TEXT NOT NULL,
    codes TEXT NOT NULL DEFAULT '{}'
  );
`);

/* ---------- Validación ---------- */
const ids = list => new Set(list.map(o => (typeof o === 'string' ? o : o.id)));
const SETS = {
  p1: ids(Q.p1.options), p2: ids(Q.p2.options), p3: ids(Q.p3.options),
  factores: ids(Q.FACTORES), p8: ids(Q.p8.options), p9: ids(Q.p9.options),
  p7rows: ids(Q.p7.rows), p12rows: ids(Q.p12.rows)
};
const txt = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function validate(a) {
  const err = [];
  const out = {};
  if (!a || typeof a !== 'object') return { err: ['Cuerpo inválido'] };
  for (const k of ['p1', 'p2', 'p3']) {
    if (!SETS[k].has(a[k])) err.push(`${k} requerido`); else out[k] = a[k];
  }
  if (out.p2 === 'otro') out.p2_otro = txt(a.p2_otro, 200);
  out.p4 = txt(a.p4);
  if (out.p4.length < 2) err.push('p4 requerido');

  const p5 = Array.isArray(a.p5) ? [...new Set(a.p5.filter(x => SETS.factores.has(x)))] : [];
  if (!p5.length) err.push('p5 requerido');
  out.p5 = p5;
  if (p5.includes('otro')) out.p5_otro = txt(a.p5_otro, 200);
  if (!p5.includes(a.p6)) err.push('p6 debe ser uno de los factores marcados'); else out.p6 = a.p6;

  out.p7 = {};
  for (const r of SETS.p7rows) {
    const n = Number(a.p7 && a.p7[r]);
    if (!Number.isInteger(n) || n < 1 || n > 5) err.push(`p7.${r} requerido`); else out.p7[r] = n;
  }
  if (!SETS.p8.has(a.p8)) err.push('p8 requerido'); else out.p8 = a.p8;
  if (out.p8 && out.p8 !== 'no') {
    if (!SETS.p9.has(a.p9)) err.push('p9 requerido'); else out.p9 = a.p9;
    out.p10 = txt(a.p10);
  }
  out.p11 = txt(a.p11, 300);
  out.p12 = {};
  for (const r of SETS.p12rows) {
    const n = Number(a.p12 && a.p12[r]);
    if (!Number.isInteger(n) || n < 1 || n > 5) err.push(`p12.${r} requerido`); else out.p12[r] = n;
  }
  out.p13 = txt(a.p13);
  return { err, out };
}

/* ---------- Utilidades HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY'
};

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SEC_HEADERS, ...extra });
  res.end(data);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('json')); } });
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isAuthed(req) {
  if (!DASH_PASS) return false; // sin contraseña configurada, el dashboard queda cerrado
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [u, ...p] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
  return safeEqual(u, DASH_USER) & safeEqual(p.join(':'), DASH_PASS);
}

function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  if (!DASH_PASS) {
    send(res, 503, 'Dashboard deshabilitado: configura la variable DASHBOARD_PASSWORD en Railway.', 'text/plain; charset=utf-8');
  } else {
    send(res, 401, 'Autenticación requerida', 'text/plain; charset=utf-8', { 'WWW-Authenticate': 'Basic realm="Dashboard encuesta", charset="UTF-8"' });
  }
  return false;
}

function serveFile(res, file) {
  const full = path.join(__dirname, 'public', file);
  if (!full.startsWith(path.join(__dirname, 'public'))) return send(res, 404, { error: 'not found' });
  fs.readFile(full, (e, buf) => {
    if (e) return send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
    send(res, 200, buf, MIME[path.extname(full)] || 'application/octet-stream');
  });
}

/* Límite simple de envíos por IP (protección básica contra abuso) */
const hits = new Map();
function rateLimited(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  const ip = fwd.length ? fwd[fwd.length - 1] : req.socket.remoteAddress || '';
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 20;
}

const rowOut = r => ({ id: r.id, created_at: r.created_at, updated_at: r.updated_at, ref: r.ref, answers: JSON.parse(r.answers), codes: JSON.parse(r.codes) });

/* ---------- CSV ---------- */
function toCsv(rows) {
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['id', 'fecha', 'ref', 'p1_antiguedad', 'p2_uso', 'p2_otro_texto', 'p3_frecuencia', 'p4_razon_espontanea', 'p4_codigos',
    ...Q.FACTORES.map(f => `p5_${f.id}`), 'p5_otro_texto', 'p6_mas_determinante',
    ...Q.p7.rows.map(r => `p7_${r}`), 'p8_necesita_terceros', 'p9_pagos_mes', 'p10_como_resolvia', 'p11_plataforma_actual',
    ...Q.p12.rows.map(r => `p12_${r.id}`), 'p13_algo_mas'];
  const lines = [head.join(',')];
  for (const r of rows) {
    const a = r.answers;
    lines.push([r.id, r.created_at, r.ref, a.p1, a.p2, a.p2_otro, a.p3, a.p4, (r.codes.p4 || []).join('|'),
      ...Q.FACTORES.map(f => (a.p5 || []).includes(f.id) ? 1 : 0), a.p5_otro, a.p6,
      ...Q.p7.rows.map(k => a.p7 && a.p7[k]), a.p8, a.p9, a.p10, a.p11,
      ...Q.p12.rows.map(k => a.p12 && a.p12[k.id]), a.p13].map(esc).join(','));
  }
  return '﻿' + lines.join('\n');
}

/* ---------- Rutas ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true });

    if (req.method === 'POST' && p === '/api/responses') {
      if (rateLimited(req)) return send(res, 429, { error: 'Demasiados envíos. Intenta más tarde.' });
      let body;
      try { body = await readBody(req); } catch { return send(res, 400, { error: 'Solicitud inválida' }); }
      if (body.website) return send(res, 200, { ok: true }); // trampa anti-bots
      const { err, out } = validate(body.answers);
      if (err.length) return send(res, 422, { error: 'Faltan respuestas', detalle: err });
      const ref = txt(body.ref, 80) || null;
      const now = new Date().toISOString();
      if (ref) {
        const existing = db.prepare('SELECT id FROM responses WHERE ref = ?').get(ref);
        if (existing) {
          db.prepare('UPDATE responses SET answers = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(out), now, existing.id);
          return send(res, 200, { ok: true, updated: true });
        }
      }
      db.prepare('INSERT INTO responses (created_at, updated_at, ref, answers) VALUES (?, ?, ?, ?)').run(now, now, ref, JSON.stringify(out));
      return send(res, 201, { ok: true });
    }

    if (p === '/dashboard' || p === '/dashboard.html' || p === '/dashboard.js' || p.startsWith('/api/admin/')) {
      if (!requireAuth(req, res)) return;

      if (p === '/dashboard' || p === '/dashboard.html') return serveFile(res, 'dashboard.html');
      if (p === '/dashboard.js') return serveFile(res, 'dashboard.js');

      if (req.method === 'GET' && p === '/api/admin/responses') {
        const rows = db.prepare('SELECT * FROM responses ORDER BY id DESC').all().map(rowOut);
        const version = db.prepare("SELECT COUNT(*) n, COALESCE(MAX(updated_at),'') u FROM responses").get();
        return send(res, 200, { rows, meta: { persistent: PERSISTENT, onRailway: ON_RAILWAY, version: `${version.n}-${version.u}` } });
      }

      if (req.method === 'GET' && p === '/api/admin/version') {
        const v = db.prepare("SELECT COUNT(*) n, COALESCE(MAX(updated_at),'') u FROM responses").get();
        return send(res, 200, { version: `${v.n}-${v.u}` });
      }

      const m = p.match(/^\/api\/admin\/responses\/(\d+)(\/codes)?$/);
      if (m && req.method === 'POST' && m[2]) {
        let body;
        try { body = await readBody(req); } catch { return send(res, 400, { error: 'Solicitud inválida' }); }
        const codes = Array.isArray(body.p4) ? [...new Set(body.p4.filter(x => SETS.factores.has(x)))] : [];
        const row = db.prepare('SELECT codes FROM responses WHERE id = ?').get(Number(m[1]));
        if (!row) return send(res, 404, { error: 'No existe' });
        const current = JSON.parse(row.codes);
        current.p4 = codes;
        current.p4_reviewed = true;
        db.prepare('UPDATE responses SET codes = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(current), new Date().toISOString(), Number(m[1]));
        return send(res, 200, { ok: true, codes: current });
      }
      if (m && req.method === 'DELETE' && !m[2]) {
        db.prepare('DELETE FROM responses WHERE id = ?').run(Number(m[1]));
        return send(res, 200, { ok: true });
      }

      if (req.method === 'GET' && p === '/api/admin/export.csv') {
        const rows = db.prepare('SELECT * FROM responses ORDER BY id').all().map(rowOut);
        return send(res, 200, toCsv(rows), 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="encuesta-premium-${new Date().toISOString().slice(0, 10)}.csv"` });
      }
      return send(res, 404, { error: 'not found' });
    }

    if (req.method === 'GET') {
      if (p === '/' || p === '/index.html') return serveFile(res, 'index.html');
      if (['/questions.js', '/form.js', '/styles.css', '/favicon.svg'].includes(p)) return serveFile(res, p.slice(1));
    }
    send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Error interno' });
  }
});

server.listen(PORT, () => {
  console.log(`Encuesta escuchando en :${PORT} · datos en ${DATA_DIR}${PERSISTENT ? '' : ' (¡NO persistente! agrega un volumen en Railway)'}`);
  if (!DASH_PASS) console.log('Aviso: DASHBOARD_PASSWORD no está configurada; el dashboard está deshabilitado.');
});
