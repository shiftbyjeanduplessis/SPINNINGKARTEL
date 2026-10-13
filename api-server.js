const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || process.env.ADMIN_CODE || '');
const SESSION_SECRET = String(process.env.SESSION_SECRET || '');
const BOOKLINK_WEBHOOK_SECRET = String(process.env.BOOKLINK_WEBHOOK_SECRET || '');
const BOOKLINK_SERVICE_ID = String(process.env.BOOKLINK_SERVICE_ID || '');
const ALLOWED_ORIGINS = new Set(
  String(process.env.ALLOWED_ORIGINS || 'https://spinningkartel.co.za,https://www.spinningkartel.co.za,https://spinningkartel.onrender.com')
    .split(',').map(x => x.trim()).filter(Boolean)
);

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is required');
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

function defaultInstructorFor(weekday, time) {
  const map = {
    '1|05:30':['Tammy',''], '1|08:00':['Tammy',''], '1|17:00':['Conraad',''], '1|18:00':['Tammy',''], '1|19:00':['Tammy','If booked'],
    '2|05:30':['Tammy',''], '2|08:00':['Tammy',''], '2|17:00':['Conraad',''], '2|18:00':['Tammy',''], '2|19:00':['Demi',''],
    '3|05:30':['Tammy','Team Build'], '3|08:00':['Tammy',''], '3|17:00':['Elzet',''], '3|18:00':['Conraad',''], '3|19:00':['Robbie',''],
    '4|05:30':['Demi',''], '4|08:00':['Tammy',''], '4|17:00':['Tammy','Team Build'], '4|18:00':['Tammy','Team Build'], '4|19:00':['Tammy','Team Build'],
    '5|05:30':['Robbie',''], '5|08:00':['Tammy',''], '5|17:00':['Elzet',''], '5|18:00':['Tammy',''],
    '6|07:00':['Tammy',''], '6|08:00':['Instructor TBC','Based on bookings']
  };
  const v = map[String(weekday)+'|'+String(time)] || ['Instructor TBC',''];
  return {name:v[0], note:v[1]};
}

async function classRows(days, startDate) {
  const from = startDate || todayZA();
  const dates = [];
  for (let i = 0; i < days; i++) dates.push(addDays(from, i));
  const to = dates[dates.length - 1];

  const [slotsQ, rotaQ, statsQ] = await Promise.all([
    pool.query("SELECT weekday,start_time::text,duration_minutes,capacity FROM sk_weekly_slots WHERE active=true ORDER BY weekday,start_time"),
    pool.query(`
      SELECT r.service_date::text, r.start_time::text, r.instructor_id, r.note, i.name AS instructor_name
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
      const def = defaultInstructorFor(wd, time);
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
        instructor: rr?.instructor_name || def.name || 'Instructor TBC',
        instructor_note: rr?.note || def.note || null
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
        'booking.completed',
        'enrollment.created',
        'enrollment.cancelled'
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
      const rows = await classRows(days, u.searchParams.get('from') || undefined);
      const classes = rows.map(c => ({
        id:c.id,
        date:c.date,
        time:c.time,
        duration:c.duration,
        capacity:c.capacity,
        booked:c.booked,
        status:c.status,
        instructor:c.instructor
      }));
      return json(res, 200, {classes}, origin);
    }

    if (req.method === 'POST' && path === '/webhooks/booklink') {
      return await handleBooklink(req, res, origin);
    }

    if (req.method === 'POST' && path === '/api/admin/login') {
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const rec = loginAttempts.get(ip) || {count:0,until:0};
      if (rec.until > Date.now()) return json(res, 429, {error:'too_many_attempts'}, origin);
      const body = await readJson(req);
      if (!safeEqual(String(body.password || ''), ADMIN_PASSWORD)) {
        rec.count += 1;
        if (rec.count >= 5) { rec.until = Date.now() + 15*60*1000; rec.count = 0; }
        loginAttempts.set(ip, rec);
        return json(res, 401, {error:'invalid_password'}, origin);
      }
      loginAttempts.delete(ip);
      const payload = {role:'admin',email:'admin',exp:Date.now()+365*24*60*60*1000};
      return json(res, 200, {token:signToken(payload),expires_at:payload.exp}, origin);
    }

    if (req.method === 'GET' && path === '/api/admin/session') {
      const admin = requireAdmin(req);
      if (!admin) return json(res, 401, {ok:false,error:'unauthorized'}, origin);
      return json(res, 200, {ok:true,role:admin.role,expires_at:admin.exp}, origin);
    }

    const admin = requireAdmin(req);
    if (!admin) return json(res, 401, {error:'unauthorized'}, origin);

    if (req.method === 'GET' && path === '/api/admin/instructors') {
      const q = await pool.query(`
        SELECT i.*,
               CASE WHEN lower(trim(i.name))='tammy' THEN 200 ELSE 150 END::numeric AS base_pay,
               10::numeric AS commission_rate
        FROM sk_instructors i
        ORDER BY active DESC,name
      `);
      return json(res, 200, {instructors:q.rows}, origin);
    }

    if (req.method === 'POST' && path === '/api/admin/instructors') {
      const b = await readJson(req);
      const name = String(b.name || '').trim();
      const basePay = name.toLowerCase()==='tammy' ? 200 : 150;
      const q = await pool.query(`
        INSERT INTO sk_instructors(name,role,base_pay,commission_rate)
        VALUES($1,$2,$3,10) RETURNING *
      `, [name, b.role || 'main', basePay]);
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

    if (req.method === 'GET' && path === '/api/admin/owner-insights') {
      const now=todayZA();
      const monthStart=now.slice(0,7)+'-01';
      const nextMonthDate=new Date(monthStart+'T12:00:00Z');
      nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth()+1);
      const nextMonth=nextMonthDate.toISOString().slice(0,10);
      const monthEnd=addDays(nextMonth,-1);
      const days=Math.round((new Date(monthEnd+'T12:00:00Z')-new Date(monthStart+'T12:00:00Z'))/86400000)+1;
      const classes=await classRows(days,monthStart);

      const bookedClasses=classes.filter(c=>Number(c.booked||0)>0);
      const totalBookings=bookedClasses.reduce((s,c)=>s+Number(c.booked||0),0);
      const capacity=bookedClasses.reduce((s,c)=>s+Number(c.capacity||12),0);
      const daysWithBookings=new Set(bookedClasses.map(c=>c.date)).size;
      const busiest=bookedClasses.slice().sort((x,y)=>Number(y.booked||0)-Number(x.booked||0))[0]||null;

      const attendanceQ=await pool.query(`
        SELECT i.name,
               COALESCE(SUM(a.attended_count),0)::int AS riders,
               COALESCE(SUM(CASE WHEN lower(trim(i.name))='tammy' THEN 200 ELSE 150 END),0)::numeric
                 + COALESCE(SUM(GREATEST(a.attended_count-5,0)*10),0)::numeric AS pay
        FROM sk_attendance a
        JOIN sk_instructors i ON i.id=a.instructor_id
        WHERE a.closed_at IS NOT NULL
          AND a.service_date >= $1
          AND a.service_date < $2
        GROUP BY i.name
      `,[monthStart,nextMonth]);
      const attendedByName=new Map(attendanceQ.rows.map(r=>[String(r.name).trim().toLowerCase(),r]));

      const grouped=new Map();
      for(const c of classes){
        const name=String(c.instructor||'Instructor TBC').trim();
        if(!name || name==='Instructor TBC') continue;
        const g=grouped.get(name)||{name,classes:0,bookings:0,capacity:0};
        g.classes+=1;
        g.bookings+=Number(c.booked||0);
        g.capacity+=Number(c.capacity||12);
        grouped.set(name,g);
      }
      const instructors=[...grouped.values()].map(g=>{
        const a=attendedByName.get(g.name.toLowerCase())||{};
        return {
          name:g.name,
          classes:g.classes,
          bookings:g.bookings,
          avg_bookings_per_class:g.classes?g.bookings/g.classes:0,
          occupancy_pct:g.capacity?(g.bookings/g.capacity)*100:0,
          riders:Number(a.riders||0),
          pay:Number(a.pay||0)
        };
      }).sort((x,y)=>y.bookings-x.bookings||x.name.localeCompare(y.name));

      return json(res,200,{
        month:monthStart.slice(0,7),
        month_label:new Date(monthStart+'T12:00:00').toLocaleDateString('en-ZA',{month:'long',year:'numeric'}),
        total_bookings:totalBookings,
        avg_bookings_per_day:daysWithBookings?totalBookings/daysWithBookings:0,
        avg_bookings_per_class:bookedClasses.length?totalBookings/bookedClasses.length:0,
        occupancy_pct:capacity?(totalBookings/capacity)*100:0,
        busiest_class:busiest?{
          date:busiest.date,
          day_label:new Date(busiest.date+'T12:00:00').toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'short'}),
          time:busiest.time,
          booked:Number(busiest.booked||0),
          capacity:Number(busiest.capacity||12)
        }:null,
        instructors
      },origin);
    }

    if (req.method === 'GET' && path === '/api/admin/monthly-analytics') {
      const requested=String(u.searchParams.get('month') || todayZA().slice(0,7));
      if(!/^\d{4}-\d{2}$/.test(requested)) return json(res,400,{error:'invalid_month'},origin);

      const today=todayZA();
      const currentMonth=today.slice(0,7);
      const monthStart=requested+'-01';
      const nextMonthDate=new Date(monthStart+'T12:00:00Z');
      nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth()+1);
      const nextMonth=nextMonthDate.toISOString().slice(0,10);
      const monthEnd=addDays(nextMonth,-1);
      const studioOpen='2026-10-05';

      let rangeStart=monthStart;
      let rangeEnd=monthEnd;
      if(requested===currentMonth && today<rangeEnd) rangeEnd=today;
      if(requested>currentMonth) rangeEnd=addDays(monthStart,-1);
      if(rangeStart<studioOpen) rangeStart=studioOpen;

      if(rangeEnd<rangeStart){
        return json(res,200,{
          month:requested,
          month_label:new Date(monthStart+'T12:00:00').toLocaleDateString('en-ZA',{month:'long',year:'numeric'}),
          from:rangeStart,to:rangeEnd,
          total_bookings:0,scheduled_classes:0,total_capacity:0,occupancy_pct:0,
          avg_bookings_per_day:0,avg_bookings_per_class:0,
          riders:0,no_shows:0,attendance_rate_pct:0,closed_classes:0,
          daily:[],by_time:[]
        },origin);
      }

      const dayCount=Math.round((new Date(rangeEnd+'T12:00:00Z')-new Date(rangeStart+'T12:00:00Z'))/86400000)+1;
      const classes=await classRows(dayCount,rangeStart);

      const attendanceQ=await pool.query(`
        SELECT service_date::text AS service_date,
               COUNT(*)::int AS closed_classes,
               COALESCE(SUM(booked_count),0)::int AS booked,
               COALESCE(SUM(attended_count),0)::int AS riders,
               COALESCE(SUM(no_show_count),0)::int AS no_shows,
               COALESCE(SUM(walkin_count),0)::int AS walkins
        FROM sk_attendance
        WHERE closed_at IS NOT NULL
          AND service_date BETWEEN $1 AND $2
        GROUP BY service_date
        ORDER BY service_date
      `,[rangeStart,rangeEnd]);
      const attendanceByDate=new Map(attendanceQ.rows.map(r=>[String(r.service_date).slice(0,10),r]));

      const dailyMap=new Map();
      for(let i=0;i<dayCount;i++){
        const date=addDays(rangeStart,i);
        dailyMap.set(date,{
          date,
          label:new Date(date+'T12:00:00').toLocaleDateString('en-ZA',{day:'numeric',month:'short'}),
          day:new Date(date+'T12:00:00').toLocaleDateString('en-ZA',{weekday:'short'}),
          bookings:0,capacity:0,classes:0,occupancy_pct:0,avg_bookings_per_class:0,
          riders:0,no_shows:0,walkins:0,closed_classes:0
        });
      }

      const timeMap=new Map();
      for(const c of classes){
        const d=dailyMap.get(c.date);
        if(d){
          d.bookings+=Number(c.booked||0);
          d.capacity+=Number(c.capacity||12);
          d.classes+=1;
        }
        const t=timeMap.get(c.time)||{time:c.time,bookings:0,capacity:0,classes:0,occupancy_pct:0};
        t.bookings+=Number(c.booked||0);
        t.capacity+=Number(c.capacity||12);
        t.classes+=1;
        timeMap.set(c.time,t);
      }

      for(const [date,d] of dailyMap.entries()){
        d.occupancy_pct=d.capacity?(d.bookings/d.capacity)*100:0;
        d.avg_bookings_per_class=d.classes?d.bookings/d.classes:0;
        const att=attendanceByDate.get(date);
        if(att){
          d.riders=Number(att.riders||0);
          d.no_shows=Number(att.no_shows||0);
          d.walkins=Number(att.walkins||0);
          d.closed_classes=Number(att.closed_classes||0);
        }
      }

      const daily=[...dailyMap.values()];
      const byTime=[...timeMap.values()].map(t=>({
        ...t,
        occupancy_pct:t.capacity?(t.bookings/t.capacity)*100:0
      })).sort((x,y)=>x.time.localeCompare(y.time));

      const totalBookings=classes.reduce((s,c)=>s+Number(c.booked||0),0);
      const totalCapacity=classes.reduce((s,c)=>s+Number(c.capacity||12),0);
      const activeDays=daily.filter(d=>d.classes>0).length;
      const riders=daily.reduce((s,d)=>s+d.riders,0);
      const noShows=daily.reduce((s,d)=>s+d.no_shows,0);
      const closedBooked=attendanceQ.rows.reduce((s,r)=>s+Number(r.booked||0),0);
      const closedClasses=attendanceQ.rows.reduce((s,r)=>s+Number(r.closed_classes||0),0);

      return json(res,200,{
        month:requested,
        month_label:new Date(monthStart+'T12:00:00').toLocaleDateString('en-ZA',{month:'long',year:'numeric'}),
        from:rangeStart,
        to:rangeEnd,
        total_bookings:totalBookings,
        scheduled_classes:classes.length,
        total_capacity:totalCapacity,
        occupancy_pct:totalCapacity?(totalBookings/totalCapacity)*100:0,
        avg_bookings_per_day:activeDays?totalBookings/activeDays:0,
        avg_bookings_per_class:classes.length?totalBookings/classes.length:0,
        riders,
        no_shows:noShows,
        attendance_rate_pct:closedBooked?(riders/closedBooked)*100:0,
        closed_classes:closedClasses,
        daily,
        by_time:byTime
      },origin);
    }

    if (req.method === 'GET' && path === '/api/admin/booking-weeks') {
      const weeks = Math.min(16, Math.max(1, Number(u.searchParams.get('weeks') || 8)));
      const currentStart = (() => {
        const t=todayZA();
        const d=new Date(t+'T12:00:00Z');
        const dow=d.getUTCDay();
        d.setUTCDate(d.getUTCDate()-((dow+6)%7));
        return d.toISOString().slice(0,10);
      })();
      const firstStart = addDays(currentStart, -(weeks-1)*7);
      const endDate = addDays(currentStart, 6);

      const q = await pool.query(`
        SELECT service_date::text,
               start_time::text,
               booked_count::int,
               capacity::int
        FROM sk_session_stats
        WHERE service_date BETWEEN $1 AND $2
        ORDER BY service_date,start_time
      `, [firstStart,endDate]);

      const byWeek = new Map();
      for(let i=0;i<weeks;i++){
        const ws=addDays(firstStart,i*7);
        byWeek.set(ws,{week_start:ws,bookings:0,classes:[]});
      }
      for(const row of q.rows){
        const d=new Date(String(row.service_date).slice(0,10)+'T12:00:00Z');
        const dow=d.getUTCDay();
        d.setUTCDate(d.getUTCDate()-((dow+6)%7));
        const ws=d.toISOString().slice(0,10);
        if(!byWeek.has(ws)) continue;
        const w=byWeek.get(ws);
        const item={
          date:String(row.service_date).slice(0,10),
          time:String(row.start_time).slice(0,5),
          booked:Number(row.booked_count||0),
          capacity:Number(row.capacity||12)
        };
        w.bookings+=item.booked;
        w.classes.push(item);
      }
      return json(res,200,{weeks:[...byWeek.values()]},origin);
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
      const from = u.searchParams.get('from') || addDays(todayZA(), -6);
      const to = u.searchParams.get('to') || todayZA();
      const q = await pool.query(`
        SELECT i.id,i.name,i.role,
               CASE WHEN lower(trim(i.name))='tammy' THEN 200 ELSE 150 END::numeric AS base_pay,
               10::numeric AS commission_rate,
               COUNT(a.*)::int AS classes,
               COALESCE(SUM(a.booked_count),0)::int AS booked,
               COALESCE(SUM(a.attended_count),0)::int AS riders,
               (COUNT(a.*) * CASE WHEN lower(trim(i.name))='tammy' THEN 200 ELSE 150 END)::numeric AS class_pay,
               COALESCE(SUM(GREATEST(a.attended_count-5,0) * 10),0)::numeric AS commission,
               ((COUNT(a.*) * CASE WHEN lower(trim(i.name))='tammy' THEN 200 ELSE 150 END)
                 + COALESCE(SUM(GREATEST(a.attended_count-5,0) * 10),0))::numeric AS total
        FROM sk_instructors i
        LEFT JOIN sk_attendance a
          ON a.instructor_id=i.id
         AND a.closed_at IS NOT NULL
         AND a.service_date BETWEEN $1 AND $2
        GROUP BY i.id
        ORDER BY i.name
      `,[from,to]);
      return json(res, 200, {from,to,pay:q.rows}, origin);
    }

    if (req.method === 'GET' && path === '/api/admin/pay-history') {
      const weeks = Math.min(16, Math.max(1, Number(u.searchParams.get('weeks') || 8)));
      const q = await pool.query(`
        SELECT to_char(date_trunc('week',a.service_date::timestamp),'YYYY-MM-DD') AS week_start,
               COUNT(*)::int AS classes,
               COALESCE(SUM(a.booked_count),0)::int AS booked,
               COALESCE(SUM(a.attended_count),0)::int AS riders,
               COALESCE(SUM(CASE WHEN lower(trim(i.name))='tammy' THEN 200 ELSE 150 END),0)::numeric AS class_pay,
               COALESCE(SUM(GREATEST(a.attended_count-5,0) * 10),0)::numeric AS commission,
               (COALESCE(SUM(CASE WHEN lower(trim(i.name))='tammy' THEN 200 ELSE 150 END),0)
                + COALESCE(SUM(GREATEST(a.attended_count-5,0) * 10),0))::numeric AS total
        FROM sk_attendance a
        JOIN sk_instructors i ON i.id=a.instructor_id
        WHERE a.closed_at IS NOT NULL
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT $1
      `,[weeks]);
      return json(res, 200, {weeks:q.rows}, origin);
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
      const [q,t] = await Promise.all([
        pool.query("SELECT id,event_id,event_type,received_at,processed,process_note FROM sk_webhook_events ORDER BY id DESC LIMIT 50"),
        pool.query("SELECT event_type,COUNT(*)::int AS count,MAX(received_at) AS latest FROM sk_webhook_events GROUP BY event_type ORDER BY event_type")
      ]);
      const eventTypes=t.rows.map(r=>r.event_type);
      return json(res,200,{
        events:q.rows,
        configured:Boolean(BOOKLINK_WEBHOOK_SECRET),
        event_types:eventTypes,
        booking_sync_reliable:eventTypes.includes('booking.confirmed')
      },origin);
    }

    return json(res, 404, {error:'not_found'}, origin);
  } catch (e) {
    console.error(e);
    return json(res, e.message === 'body_too_large' ? 413 : 500, {error:'server_error'}, origin);
  }
}

async function rebuildBooklinkSessionCounts() {
  const q = await pool.query(`
    SELECT id,event_type,received_at,payload,
           COALESCE(NULLIF(payload->>'created','')::timestamptz,received_at) AS event_created
    FROM sk_webhook_events
    WHERE event_type IN (
      'booking.created','booking.confirmed','booking.cancelled','booking.rescheduled','booking.completed',
      'enrollment.created','enrollment.cancelled'
    )
    ORDER BY COALESCE(NULLIF(payload->>'created','')::timestamptz,received_at) ASC,id ASC
  `);

  const latestBookings = new Map();
  const latestEnrollments = new Map();

  function bookingId(data) {
    return String(data?.booking_id || data?.booking?.id || data?.id || '');
  }
  function linkedBookingId(data) {
    return String(data?.booking_id || data?.booking?.id || data?.bookingId || '');
  }
  function enrollmentId(data) {
    const direct=String(data?.enrollment_id || data?.id || '');
    if(direct) return direct;
    const sid=String(data?.session_id || data?.session?.id || '');
    const cid=String(data?.client_id || data?.client?.id || data?.customer_id || '');
    const bid=linkedBookingId(data);
    return [sid,cid,bid].filter(Boolean).join('|');
  }

  for (const row of q.rows) {
    const data = row.payload?.data;
    if (!data || typeof data !== 'object' || !isSpinningBooking(data)) continue;

    if (row.event_type.startsWith('booking.')) {
      const id=bookingId(data);
      if(id) latestBookings.set(id,{eventType:row.event_type,data});
    } else if (row.event_type.startsWith('enrollment.')) {
      const id=enrollmentId(data);
      if(id) latestEnrollments.set(id,{eventType:row.event_type,data});
    }
  }

  const cancelledByEnrollment=new Set();
  for(const evt of latestEnrollments.values()){
    if(evt.eventType!=='enrollment.cancelled') continue;
    const bid=linkedBookingId(evt.data);
    if(bid) cancelledByEnrollment.add(bid);
  }

  const counts = new Map();
  const activeBookingIds=new Set();

  for (const [id,evt] of latestBookings.entries()) {
    if (evt.eventType === 'booking.cancelled' || cancelledByEnrollment.has(id)) continue;
    const dt = eventDateTime(evt.data);
    if (!dt) continue;
    const key = dt.date + '|' + dt.time;
    counts.set(key, (counts.get(key) || 0) + seatCount(evt.data));
    activeBookingIds.add(id);
  }

  for (const evt of latestEnrollments.values()) {
    if (evt.eventType !== 'enrollment.created') continue;
    const linked=linkedBookingId(evt.data);
    if(linked && activeBookingIds.has(linked)) continue;
    const dt=eventDateTime(evt.data);
    if(!dt) continue;
    const key=dt.date+'|'+dt.time;
    counts.set(key,(counts.get(key)||0)+seatCount(evt.data));
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
    bookings:latestBookings.size,
    enrollments:latestEnrollments.size,
    sessions:[...counts.entries()].map(([key,booked])=>({key,booked}))
  }));
}

const server = http.createServer(handler);
rebuildBooklinkSessionCounts()
  .catch(e => console.error('BOOKLINK_COUNT_REBUILD_ERROR', e))
  .finally(() => server.listen(PORT, '0.0.0.0', () => console.log('Spinning Kartel API listening on ' + PORT)));
