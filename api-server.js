const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_CODE = String(process.env.ADMIN_CODE || '');
const SESSION_SECRET = String(process.env.SESSION_SECRET || '');
const BOOKLINK_WEBHOOK_SECRET = String(process.env.BOOKLINK_WEBHOOK_SECRET || '');
const BOOKLINK_SERVICE_ID = String(process.env.BOOKLINK_SERVICE_ID || '');
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || 'https://spinningkartel.co.za,https://www.spinningkartel.co.za,https://spinningkartel.onrender.com')
    .split(',').map(x => x.trim()).filter(Boolean)
);

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!ADMIN_CODE) throw new Error('ADMIN_CODE is required');
if (!SESSION_SECRET) throw new Error('SESSION_SECRET is required');

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
const loginAttempts = new Map();

function json(res, status, body, origin) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function corsPreflight(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.writeHead(204, {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
      'access-control-max-age': '600',
      'vary': 'Origin'
    });
  } else {
    res.writeHead(204);
  }
  res.end();
}

async function readRaw(req, limit = 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new Error('body_too_large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const raw = await readRaw(req);
  if (!raw.length) return {};
  return JSON.parse(raw.toString('utf8'));
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function signToken(payload) {
  const enc = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(enc).digest('base64url');
  return enc + '.' + sig;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [enc, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(enc).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(enc, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireAdmin(req) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return verifyToken(token);
}

function localDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { date: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
}

function todayZA() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isoWeekday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  return d === 0 ? 7 : d;
}

function statusFor(booked, capacity) {
  if (booked >= capacity) return 'full';
  if (capacity > 0 && booked / capacity >= 0.75) return 'almost_full';
  return 'open';
}

async function classRows(days, startDate) {
  const from = startDate || todayZA();
  const dates = [];
  for (let i = 0; i < days; i++) dates.push(addDays(from, i));
  const to = dates[dates.length - 1];

  const [slotsQ, rotaQ, statsQ] = await Promise.all([
    pool.query("SELECT weekday,start_time::text,duration_minutes,capacity FROM sk_weekly_slots WHERE active=true ORDER BY weekday,start_time"),
    pool.query(`
      SELECT r.service_date::text, r.start_time::text, r.instructor_id, i.name AS instructor_name
      FROM sk_instructor_rota r
      LEFT JOIN sk_instructors i ON i.id=r.instructor_id
      WHERE r.service_date BETWEEN $1 AND $2
    `, [from, to]),
    pool.query(`
      SELECT service_date::text,start_time::text,booked_count,capacity
      FROM sk_session_stats
      WHERE service_date BETWEEN $1 AND $2
    `, [from, to])
  ]);

  const rota = new Map(rotaQ.rows.map(r => [r.service_date + '|' + r.start_time.slice(0,5), r]));
  const stats = new Map(statsQ.rows.map(r => [r.service_date + '|' + r.start_time.slice(0,5), r]));
  const slotsByDay = new Map();
  for (const s of slotsQ.rows) {
    const arr = slotsByDay.get(Number(s.weekday)) || [];
    arr.push(s);
    slotsByDay.set(Number(s.weekday), arr);
  }

  const rows = [];
  for (const date of dates) {
    const wd = isoWeekday(date);
    for (const s of (slotsByDay.get(wd) || [])) {
      const time = s.start_time.slice(0,5);
      const key = date + '|' + time;
      const rr = rota.get(key);
      const ss = stats.get(key);
      const capacity = Number(ss?.capacity ?? s.capacity ?? 12);
      const booked = Number(ss?.booked_count ?? 0);
      rows.push({
        id: date + '_' + time.replace(':',''),
        date,
        time,
        duration: Number(s.duration_minutes),
        rate: 70,
        capacity,
        booked,
        status: statusFor(booked, capacity),
        instructor_id: rr?.instructor_id || null,
        instructor: rr?.instructor_name || 'Instructor TBC'
      });
    }
  }
  return rows;
}

function seatCount(data) {
  const candidates = [
    data?.seats, data?.seat_count, data?.seatCount, data?.quantity,
    data?.spots, data?.spots_count, data?.attendee_count, data?.attendees
  ];
  for (const x of candidates) {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  if (Array.isArray(data?.items)) {
    for (const item of data.items) {
      for (const key of ['seats','seat_count','quantity','spots']) {
        const n = Number(item?.[key]);
        if (Number.isFinite(n) && n > 0) return Math.round(n);
      }
    }
  }
  return 1;
}

function isSpinningBooking(data) {
  const ids = [
    data?.service_id,
    data?.service?.id,
    data?.offering_id,
    data?.offering?.id,
    data?.session?.service_id,
    data?.session?.service?.id,
    data?.session?.offering_id
  ].filter(Boolean).map(String);
  if (BOOKLINK_SERVICE_ID && ids.includes(String(BOOKLINK_SERVICE_ID))) return true;

  const names = [
    data?.service_name,
    data?.service?.name,
    data?.offering_name,
    data?.offering?.name,
    data?.session?.service_name,
    data?.session?.service?.name,
    data?.session?.offering_name
  ];
  if (Array.isArray(data?.items)) names.push(...data.items.map(i => i?.service_name || i?.service?.name));
  return names.some(n => String(n || '').trim().toLowerCase() === 'spinning class');
}

function eventDateTime(data) {
  const candidates = [
    data?.start_time,
    data?.session_start_time,
    data?.starts_at,
    data?.session?.start_time,
    data?.session?.starts_at,
    data?.session?.start_at
  ];
  for (const value of candidates) {
    if (!value) continue;
    const parsed = localDateTime(value);
    if (parsed) return parsed;
  }
  const date = data?.date || data?.service_date || data?.session?.date || data?.session?.service_date;
  const time = data?.time || data?.start || data?.session?.time || data?.session?.start;
  if (date && time) return {date:String(date).slice(0,10), time:String(time).slice(0,5)};
  return null;
}

async function changeBooked(date, time, delta) {
  await pool.query(`
    INSERT INTO sk_session_stats(service_date,start_time,booked_count,capacity,updated_at)
    VALUES($1,$2,GREATEST(0,$3),12,now())
    ON CONFLICT(service_date,start_time) DO UPDATE
    SET booked_count=GREATEST(0,sk_session_stats.booked_count + $3),
        capacity=12,
        updated_at=now()
  `, [date, time, delta]);
}

function verifyBooklink(raw, header) {
  if (!BOOKLINK_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(String(header || '').split(',').map(p => p.split('=', 2)));
  const t = Number(parts.t);
  if (!t || !parts.v1) return false;
  const age = Math.abs(Math.floor(Date.now()/1000) - t);
  if (age > 300) return false;
  const expected = crypto.createHmac('sha256', BOOKLINK_WEBHOOK_SECRET)
    .update(String(t) + '.' + raw.toString('utf8')).digest('hex');
  return safeEqual(expected, parts.v1);
}

async function handleBooklink(req, res, origin) {
  const raw = await readRaw(req);
  if (!BOOKLINK_WEBHOOK_SECRET) return json(res, 503, {ok:false,error:'webhook_not_configured'}, origin);
  if (!verifyBooklink(raw, req.headers['x-booklink-signature'])) {
    return json(res, 401, {ok:false,error:'invalid_signature'}, origin);
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); }
  catch { return json(res, 400, {ok:false,error:'invalid_json'}, origin); }

  const eventId = String(body.id || crypto.createHash('sha256').update(raw).digest('hex'));
  const eventType = String(body.type || 'unknown');
  const ins = await pool.query(`
    INSERT INTO sk_webhook_events(event_id,event_type,payload)
    VALUES($1,$2,$3::jsonb)
    ON CONFLICT(event_id) DO NOTHING
    RETURNING id
  `, [eventId, eventType, JSON.stringify(body)]);
  if (!ins.rowCount) return json(res, 200, {ok:true,duplicate:true}, origin);

  let note = 'logged';
  try {
    if (eventType === 'ping') {
      note = 'ping';
    } else if (body.data && isSpinningBooking(body.data)) {
      const bookingEvents = new Set([
        'booking.created',
        'booking.confirmed',
        'booking.cancelled',
        'booking.rescheduled',
        'booking.completed'
      ]);
      if (bookingEvents.has(eventType)) {
        await rebuildBooklinkSessionCounts();
        note = 'reconciled ' + eventType;
      } else {
        note = 'ignored event';
      }
    } else {
      note = 'non-spinning event';
    }
    await pool.query("UPDATE sk_webhook_events SET processed=true,process_note=$2 WHERE event_id=$1", [eventId, note]);
  } catch (e) {
    await pool.query("UPDATE sk_webhook_events SET process_note=$2 WHERE event_id=$1", [eventId, 'error: ' + e.message]);
    console.error('webhook processing', e);
  }
  return json(res, 200, {ok:true}, origin);
}

function parsePathId(path, prefix) {
  if (!path.startsWith(prefix)) return null;
  const id = path.slice(prefix.length);
  return id && !id.includes('/') ? id : null;
}

async function handler(req, res) {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') return corsPreflight(req, res);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, {error:'origin_not_allowed'});

  const u = new URL(req.url, 'http://localhost');
  const path = u.pathname;

  try {
    if (req.method === 'GET' && path === '/health') {
      const q = await pool.query('SELECT now() AS now');
      return json(res, 200, {ok:true,db:true,now:q.rows[0].now}, origin);
    }


    if (req.method === 'GET' && path === '/api/public/classes') {
      const days = Math.min(35, Math.max(1, Number(u.searchParams.get('days') || 14)));
      return json(res, 200, {classes: await classRows(days, u.searchParams.get('from') || undefined)}, origin);
    }

    if (req.method === 'POST' && path === '/webhooks/booklink') {
      return await handleBooklink(req, res, origin);
    }

    if (req.method === 'POST' && path === '/api/admin/login') {
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const rec = loginAttempts.get(ip) || {count:0,until:0};
      if (rec.until > Date.now()) return json(res, 429, {error:'too_many_attempts'}, origin);
      const body = await readJson(req);
      if (!safeEqual(String(body.code || ''), ADMIN_CODE)) {
        rec.count += 1;
        if (rec.count >= 5) { rec.until = Date.now() + 15*60*1000; rec.count = 0; }
        loginAttempts.set(ip, rec);
        return json(res, 401, {error:'invalid_code'}, origin);
      }
      loginAttempts.delete(ip);
      const payload = {role:'admin',email:String(body.email || 'staff'),exp:Date.now()+12*60*60*1000};
      return json(res, 200, {token:signToken(payload),expires_at:payload.exp}, origin);
    }

    const admin = requireAdmin(req);
    if (!admin) return json(res, 401, {error:'unauthorized'}, origin);

    if (req.method === 'GET' && path === '/api/admin/instructors') {
      const q = await pool.query("SELECT * FROM sk_instructors ORDER BY active DESC,name");
      return json(res, 200, {instructors:q.rows}, origin);
    }

    if (req.method === 'POST' && path === '/api/admin/instructors') {
      const b = await readJson(req);
      const q = await pool.query(`
        INSERT INTO sk_instructors(name,role,base_pay,commission_rate)
        VALUES($1,$2,$3,$4) RETURNING *
      `, [String(b.name || '').trim(), b.role || 'main', Number(b.base_pay ?? 200), Number(b.commission_rate ?? 10)]);
      return json(res, 201, {instructor:q.rows[0]}, origin);
    }

    const instructorId = parsePathId(path, '/api/admin/instructors/');
    if (req.method === 'PATCH' && instructorId) {
      const b = await readJson(req);
      const q = await pool.query(`
        UPDATE sk_instructors
        SET name=COALESCE($2,name), role=COALESCE($3,role),
            base_pay=COALESCE($4,base_pay), commission_rate=COALESCE($5,commission_rate),
            active=COALESCE($6,active), updated_at=now()
        WHERE id=$1 RETURNING *
      `, [instructorId, b.name ?? null, b.role ?? null, b.base_pay ?? null, b.commission_rate ?? null, b.active ?? null]);
      return json(res, 200, {instructor:q.rows[0] || null}, origin);
    }

    if (req.method === 'GET' && path === '/api/admin/classes') {
      const days = Math.min(35, Math.max(1, Number(u.searchParams.get('days') || 14)));
      return json(res, 200, {classes:await classRows(days, u.searchParams.get('from') || undefined)}, origin);
    }

    if (req.method === 'POST' && path === '/api/admin/rota') {
      const b = await readJson(req);
      const assignments = Array.isArray(b.assignments) ? b.assignments : [];
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const a of assignments) {
          if (!a.date || !a.time) continue;
          await client.query(`
            INSERT INTO sk_instructor_rota(service_date,start_time,instructor_id,note,updated_at)
            VALUES($1,$2,$3,$4,now())
            ON CONFLICT(service_date,start_time) DO UPDATE
            SET instructor_id=EXCLUDED.instructor_id,note=EXCLUDED.note,updated_at=now()
          `, [a.date, a.time, a.instructor_id || null, a.note || null]);
        }
        await client.query('COMMIT');
      } catch(e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      return json(res, 200, {ok:true,count:assignments.length}, origin);
    }

    if (req.method === 'POST' && path === '/api/admin/attendance') {
      const b = await readJson(req);
      const st = await pool.query("SELECT booked_count FROM sk_session_stats WHERE service_date=$1 AND start_time=$2", [b.date,b.time]);
      const booked = Number(st.rows[0]?.booked_count ?? b.booked_count ?? 0);
      const rota = await pool.query("SELECT instructor_id FROM sk_instructor_rota WHERE service_date=$1 AND start_time=$2", [b.date,b.time]);
      const instructorId = b.instructor_id || rota.rows[0]?.instructor_id || null;
      const attended = Math.max(0, Number(b.attended_count || 0));
      const noShow = Math.max(0, booked - attended);
      const walkin = Math.max(0, Number(b.walkin_count || 0));
      await pool.query(`
        INSERT INTO sk_attendance(service_date,start_time,instructor_id,booked_count,attended_count,no_show_count,walkin_count,closed_by,closed_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
        ON CONFLICT(service_date,start_time) DO UPDATE SET
          instructor_id=EXCLUDED.instructor_id,booked_count=EXCLUDED.booked_count,
          attended_count=EXCLUDED.attended_count,no_show_count=EXCLUDED.no_show_count,
          walkin_count=EXCLUDED.walkin_count,closed_by=EXCLUDED.closed_by,closed_at=now(),updated_at=now()
      `, [b.date,b.time,instructorId,booked,attended,noShow,walkin,admin.email || 'staff']);
      return json(res, 200, {ok:true,booked,attended,no_show:noShow}, origin);
    }

    if (req.method === 'GET' && path === '/api/admin/pay') {
      const from = u.searchParams.get('from') || addDays(todayZA(), -30);
      const to = u.searchParams.get('to') || todayZA();
      const q = await pool.query(`
        SELECT i.id,i.name,i.role,i.base_pay,i.commission_rate,
               COUNT(a.*)::int AS classes,
               COALESCE(SUM(a.attended_count),0)::int AS riders,
               COALESCE(SUM(GREATEST(a.attended_count-5,0) * i.commission_rate),0)::numeric AS commission,
               COALESCE(SUM(i.base_pay + GREATEST(a.attended_count-5,0) * i.commission_rate),0)::numeric AS total
        FROM sk_instructors i
        LEFT JOIN sk_attendance a ON a.instructor_id=i.id AND a.closed_at IS NOT NULL AND a.service_date BETWEEN $1 AND $2
        GROUP BY i.id
        ORDER BY i.name
      `,[from,to]);
      return json(res, 200, {from,to,pay:q.rows}, origin);
    }

    if (req.method === 'GET' && path === '/api/admin/attendance') {
      const from = u.searchParams.get('from') || addDays(todayZA(), -14);
      const to = u.searchParams.get('to') || addDays(todayZA(), 14);
      const q = await pool.query(`
        SELECT a.*,i.name AS instructor_name
        FROM sk_attendance a LEFT JOIN sk_instructors i ON i.id=a.instructor_id
        WHERE a.service_date BETWEEN $1 AND $2
        ORDER BY a.service_date,a.start_time
      `,[from,to]);
      return json(res, 200, {attendance:q.rows}, origin);
    }

    if (req.method === 'GET' && path === '/api/admin/memberships') {
      const q = await pool.query("SELECT * FROM sk_memberships WHERE active=true ORDER BY client_name");
      return json(res, 200, {memberships:q.rows}, origin);
    }

    if (req.method === 'POST' && path === '/api/admin/memberships') {
      const b=await readJson(req);
      const q=await pool.query(`
        INSERT INTO sk_memberships(client_name,client_email,client_mobile,payfast_reference,payment_status,payment_period_start,payment_period_end,booklink_package_status,package_expires_on,notes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
      `,[b.client_name,b.client_email||null,b.client_mobile||null,b.payfast_reference||null,b.payment_status||'pending',b.payment_period_start||null,b.payment_period_end||null,b.booklink_package_status||'not_issued',b.package_expires_on||null,b.notes||null]);
      return json(res,201,{membership:q.rows[0]},origin);
    }

    const membershipId=parsePathId(path,'/api/admin/memberships/');
    if(req.method==='PATCH' && membershipId){
      const b=await readJson(req);
      const q=await pool.query(`
        UPDATE sk_memberships SET
          client_name=COALESCE($2,client_name),
          client_email=COALESCE($3,client_email),
          client_mobile=COALESCE($4,client_mobile),
          payfast_reference=COALESCE($5,payfast_reference),
          payment_status=COALESCE($6,payment_status),
          payment_period_start=COALESCE($7,payment_period_start),
          payment_period_end=COALESCE($8,payment_period_end),
          booklink_package_status=COALESCE($9,booklink_package_status),
          package_expires_on=COALESCE($10,package_expires_on),
          notes=COALESCE($11,notes),
          active=COALESCE($12,active),
          updated_at=now()
        WHERE id=$1 RETURNING *
      `,[membershipId,b.client_name??null,b.client_email??null,b.client_mobile??null,b.payfast_reference??null,b.payment_status??null,b.payment_period_start??null,b.payment_period_end??null,b.booklink_package_status??null,b.package_expires_on??null,b.notes??null,b.active??null]);
      return json(res,200,{membership:q.rows[0]||null},origin);
    }

    if (req.method === 'GET' && path === '/api/admin/webhooks') {
      const q=await pool.query("SELECT id,event_id,event_type,received_at,processed,process_note FROM sk_webhook_events ORDER BY id DESC LIMIT 50");
      return json(res,200,{events:q.rows,configured:Boolean(BOOKLINK_WEBHOOK_SECRET)},origin);
    }

    return json(res, 404, {error:'not_found'}, origin);
  } catch (e) {
    console.error(e);
    return json(res, e.message === 'body_too_large' ? 413 : 500, {error:'server_error'}, origin);
  }
}

async function rebuildBooklinkSessionCounts() {
  if (!BOOKLINK_SERVICE_ID) {
    console.warn('BOOKLINK_SERVICE_ID missing; skipping booking count rebuild');
    return;
  }

  const q = await pool.query(`
    SELECT id,event_type,received_at,payload
    FROM sk_webhook_events
    WHERE event_type IN ('booking.created','booking.confirmed','booking.cancelled','booking.rescheduled','booking.completed')
      AND payload->'data'->>'service_id'=$1
    ORDER BY received_at ASC,id ASC
  `, [BOOKLINK_SERVICE_ID]);

  const latestByBooking = new Map();
  for (const row of q.rows) {
    const data = row.payload?.data || {};
    const bookingId = String(data.id || '');
    if (!bookingId) continue;
    latestByBooking.set(bookingId, {eventType:row.event_type,data});
  }

  const counts = new Map();
  for (const evt of latestByBooking.values()) {
    if (evt.eventType === 'booking.cancelled') continue;
    const dt = eventDateTime(evt.data);
    if (!dt) continue;
    const key = dt.date + '|' + dt.time;
    counts.set(key, (counts.get(key) || 0) + seatCount(evt.data));
  }

  await pool.query(`
    UPDATE sk_session_stats
    SET booked_count=0,capacity=12,updated_at=now()
    WHERE service_date >= '2026-10-01'
  `);

  for (const [key,booked] of counts.entries()) {
    const [date,time] = key.split('|');
    await pool.query(`
      INSERT INTO sk_session_stats(service_date,start_time,booked_count,capacity,updated_at)
      VALUES($1,$2,$3,12,now())
      ON CONFLICT(service_date,start_time) DO UPDATE
      SET booked_count=EXCLUDED.booked_count,
          capacity=12,
          updated_at=now()
    `, [date,time,booked]);
  }

  console.log('BOOKLINK_COUNTS_REBUILT ' + JSON.stringify({
    bookings:latestByBooking.size,
    sessions:[...counts.entries()].map(([key,booked])=>({key,booked}))
  }));
}

const server = http.createServer(handler);
rebuildBooklinkSessionCounts()
  .catch(e => console.error('BOOKLINK_COUNT_REBUILD_ERROR', e))
  .finally(() => server.listen(PORT, '0.0.0.0', () => console.log('Spinning Kartel API listening on ' + PORT)));
