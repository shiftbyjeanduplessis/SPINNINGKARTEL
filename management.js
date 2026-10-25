const cfg=window.SPINNING_CONFIG||{};
const API=cfg.apiBaseUrl||"https://spinningkartel-api.onrender.com";
function readAdminToken(){
  try { const token=localStorage.getItem("sk_admin_token"); if(token) return token; } catch(e) {}
  try { return sessionStorage.getItem("sk_admin_token"); } catch(e) { return null; }
}
function clearAdminToken(){
  try { localStorage.removeItem("sk_admin_token"); } catch(e) {}
  try { sessionStorage.removeItem("sk_admin_token"); } catch(e) {}
}
const TOKEN=readAdminToken();

const $=s=>document.querySelector(s);
const qsa=s=>[...document.querySelectorAll(s)];
let state={classes:[],rotaClasses:[],rotaWeekOffset:0,history:[],weeklyClasses:[],bookingWeeks:[],ownerInsights:null,monthlyAnalytics:null,analyticsMonth:today().slice(0,7),payClasses:[],payWeekStart:null,payHistory:[],instructors:[],memberships:[],attendance:[],pay:[],events:[],webhookConfigured:false,eventTypes:[],bookingSyncReliable:false};

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),1900);}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Johannesburg",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function addDays(date,n){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function weekStart(date){const d=new Date(date+"T12:00:00Z");const dow=d.getUTCDay();d.setUTCDate(d.getUTCDate()-((dow+6)%7));return d.toISOString().slice(0,10);}
function scheduleWeekStart(date){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10);}
function dateLabel(d){return new Date(d+"T12:00:00").toLocaleDateString("en-ZA",{weekday:"short",day:"numeric",month:"short"}).toUpperCase();}
function roleLabel(r){return r==="student"?"Student instructor":r==="guest"?"Guest instructor":"Main instructor";}
function money(v){return "R"+Number(v||0).toFixed(0);}

function commissionFor(riders){return Math.max(0,Number(riders||0)-5)*10;}

function shortWeekLabel(d){
  return new Date(d+"T12:00:00").toLocaleDateString("en-ZA",{day:"numeric",month:"short"});
}

function renderWeeklyBookings(){
  const allWeeks=state.bookingWeeks||[];
  const firstReal=allWeeks.findIndex(w=>Number(w.bookings||0)>0);
  const weeks=firstReal>=0?allWeeks.slice(firstReal):(allWeeks.length?allWeeks.slice(-1):[]);
  const chart=$("#weeklyBookingChart");
  const summary=$("#weeklyBookingSummary");
  const label=$("#weeklyBookingLabel");

  if(label) label.textContent="Sunday–Saturday booking week";

  const total=weeks.reduce((s,w)=>s+Number(w.bookings||0),0);
  const current=weeks[weeks.length-1]||null;
  const latest=Number(current?.bookings||0);
  // Studio's public classes run Mon–Sat; Sunday is the rollover day.
  const range=current?dateLabel(addDays(current.week_start,1))+' – '+dateLabel(addDays(current.week_start,6)):'';
  const daily=current?Array.from({length:6},(_,i)=>{
    const date=addDays(current.week_start,i+1);
    const count=(current.classes||[]).filter(c=>c.date===date).reduce((n,c)=>n+Number(c.booked||0),0);
    return ['Mon','Tue','Wed','Thu','Fri','Sat'][i]+' '+count;
  }).join(' · '):'';
  if(summary) summary.innerHTML=
    '<strong>'+latest+' booked seats · '+esc(range)+'</strong>'+
    '<span>'+esc(daily)+'</span>';

  if(!chart) return;
  if(!weeks.length){
    chart.innerHTML='<p class="muted">Bookings will appear here as the studio grows.</p>';
    return;
  }

  const max=Math.max(1,...weeks.map(w=>Number(w.bookings||0)));
  chart.innerHTML=weeks.map((w,idx)=>{
    const bookings=Number(w.bookings||0);
    const height=Math.max(3,Math.round(bookings/max*100));
    const active=idx===weeks.length-1?" current":"";
    return '<div class="week-bar-item'+active+'" title="'+bookings+' bookings">'+
      '<div class="week-bar-value">'+bookings+'</div>'+
      '<div class="week-bar-track"><div class="week-bar-fill" style="height:'+height+'%"></div></div>'+
      '<strong>'+shortWeekLabel(w.week_start)+'</strong>'+
      '<span>WEEK</span>'+
    '</div>';
  }).join("");
}

async function refreshWeeklyBookings(){
  const data=await api("/api/admin/booking-weeks?weeks=8");
  state.bookingWeeks=data.weeks||[];
  renderWeeklyBookings();
}

function pct(v){return Number(v||0).toFixed(0)+"%";}

function renderOwnerInsights(){
  const d=state.ownerInsights;
  const cards=$("#ownerInsightCards");
  const table=$("#instructorMonthTable");
  const title=$("#ownerInsightTitle");
  if(!cards||!table) return;
  if(!d){
    cards.innerHTML='<p class="muted">Loading insights…</p>';
    table.innerHTML="";
    return;
  }
  if(title) title.textContent=d.month_label||"This month";

  const busiest=d.busiest_class
    ? esc(d.busiest_class.day_label)+" "+esc(d.busiest_class.time)+" · "+Number(d.busiest_class.booked||0)+"/"+Number(d.busiest_class.capacity||12)
    : "No booking data yet";

  cards.innerHTML=
    '<article><span>AVG BOOKINGS / DAY</span><strong>'+Number(d.avg_bookings_per_day||0).toFixed(1)+'</strong><small>Days with bookings</small></article>'+
    '<article><span>AVG BOOKINGS / CLASS</span><strong>'+Number(d.avg_bookings_per_class||0).toFixed(1)+'</strong><small>Classes with bookings</small></article>'+
    '<article><span>OCCUPANCY</span><strong>'+pct(d.occupancy_pct)+'</strong><small>Across booked classes</small></article>'+
    '<article><span>BUSIEST CLASS</span><strong class="insight-text">'+busiest+'</strong><small>'+Number(d.total_bookings||0)+' booked seats this month</small></article>';

  const rows=Array.isArray(d.instructors)?d.instructors:[];
  table.innerHTML=rows.length
    ? '<div class="instructor-month-row header"><span>Instructor</span><span>Classes</span><span>Bookings</span><span>Avg / class</span><span>Occupancy</span><span>Riders</span><span>Pay to date</span></div>'+
      rows.map(r=>'<div class="instructor-month-row">'+
        '<strong>'+esc(r.name)+'</strong>'+
        '<span>'+Number(r.classes||0)+'</span>'+
        '<span>'+Number(r.bookings||0)+'</span>'+
        '<span>'+Number(r.avg_bookings_per_class||0).toFixed(1)+'</span>'+
        '<span>'+pct(r.occupancy_pct)+'</span>'+
        '<span>'+Number(r.riders||0)+'</span>'+
        '<strong>'+money(r.pay||0)+'</strong>'+
      '</div>').join("")
    : '<p class="muted">Instructor figures will appear once classes are assigned.</p>';
}

async function refreshOwnerInsights(){
  const d=await api("/api/admin/owner-insights");
  state.ownerInsights=d;
  renderOwnerInsights();
}

function shiftMonth(month,delta){
  const d=new Date(month+"-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth()+delta);
  return d.toISOString().slice(0,7);
}

function chartValueLabel(v,opts){
  const n=Number(v||0);
  if(opts.percent) return n.toFixed(0)+"%";
  if(opts.decimals===1) return n.toFixed(1);
  return Math.round(n).toString();
}

function renderMonthBarChart(id,rows,key,opts={}){
  const el=$(id);
  if(!el) return;
  const data=(rows||[]).filter(r=>r!=null);
  if(!data.length){
    el.innerHTML='<p class="muted chart-empty">No data for this month yet.</p>';
    return;
  }
  const values=data.map(r=>Number(r[key]||0));
  const max=opts.max!=null?Number(opts.max):Math.max(1,...values);
  el.innerHTML='<div class="month-bars">'+data.map(r=>{
    const value=Number(r[key]||0);
    const height=max>0?Math.max(value>0?4:1,Math.min(100,value/max*100)):1;
    const label=opts.labelKey?r[opts.labelKey]:(r.date?String(Number(r.date.slice(-2))):"");
    const detail=(opts.tooltipPrefix||"")+chartValueLabel(value,opts)+(opts.tooltipSuffix||"");
    return '<div class="month-bar-item" title="'+esc((r.label||label)+" · "+detail)+'">'+
      '<div class="month-bar-value">'+chartValueLabel(value,opts)+'</div>'+
      '<div class="month-bar-track"><div class="month-bar-fill" style="height:'+height.toFixed(1)+'%"></div></div>'+
      '<strong>'+esc(label)+'</strong>'+
    '</div>';
  }).join("")+'</div>';
}

function renderMonthlyAnalytics(){
  const d=state.monthlyAnalytics;
  if(!d) return;

  const monthInput=$("#analyticsMonth");
  if(monthInput){
    monthInput.value=state.analyticsMonth;
    monthInput.max=today().slice(0,7);
  }
  const next=$("#analyticsNextMonth");
  if(next) next.disabled=state.analyticsMonth>=today().slice(0,7);

  $("#analyticsTotalBookings").textContent=Number(d.total_bookings||0);
  $("#analyticsOccupancy").textContent=pct(d.occupancy_pct);
  $("#analyticsAvgDay").textContent=Number(d.avg_bookings_per_day||0).toFixed(1);
  $("#analyticsAvgClass").textContent=Number(d.avg_bookings_per_class||0).toFixed(1);
  $("#analyticsRiders").textContent=Number(d.riders||0);
  $("#analyticsNoShows").textContent=Number(d.no_shows||0);
  $("#analyticsRangeLabel").textContent=(d.month_label||state.analyticsMonth)+" · "+Number(d.scheduled_classes||0)+" scheduled classes";
  $("#analyticsAttendanceNote").textContent=Number(d.closed_classes||0)+" closed classes · "+pct(d.attendance_rate_pct)+" attendance";

  renderMonthBarChart("#chartBookingsDay",d.daily,"bookings",{});
  renderMonthBarChart("#chartOccupancyDay",d.daily,"occupancy_pct",{percent:true,max:100});
  renderMonthBarChart("#chartAvgClassDay",d.daily,"avg_bookings_per_class",{decimals:1,max:12});
  renderMonthBarChart("#chartRidersDay",d.daily,"riders",{});
  renderMonthBarChart("#chartNoShowsDay",d.daily,"no_shows",{});
  renderMonthBarChart("#chartBookingsTime",d.by_time,"bookings",{labelKey:"time"});
}

async function refreshMonthlyAnalytics(){
  const d=await api("/api/admin/monthly-analytics?month="+encodeURIComponent(state.analyticsMonth));
  state.monthlyAnalytics=d;
  renderMonthlyAnalytics();
}

async function api(path,options={}){
  const headers={...(options.headers||{}),"authorization":"Bearer "+TOKEN};
  if(options.body && !headers["content-type"]) headers["content-type"]="application/json";
  const r=await fetch(API+path,{...options,headers,cache:"no-store"});
  if(r.status===401 || r.status===403){
    clearAdminToken();
    const next="management.html"+(requestedView()!=="today"?"?view="+encodeURIComponent(requestedView()):"");
    location.replace("login.html?next="+encodeURIComponent(next));
    throw new Error("Session expired");
  }
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
}

const ADMIN_VIEWS=new Set(["today","analytics","rota","attendance","memberships","instructors","integration"]);
function requestedView(){
  const v=new URLSearchParams(location.search).get("view");
  return ADMIN_VIEWS.has(v)?v:"today";
}
function showView(name){
  if(!ADMIN_VIEWS.has(name)) name="today";
  qsa(".view").forEach(v=>v.classList.toggle("active",v.dataset.page===name));
  qsa(".nav").forEach(v=>v.classList.toggle("active",v.dataset.view===name));
  const url=new URL(location.href);
  if(name==="today") url.searchParams.delete("view");
  else url.searchParams.set("view",name);
  history.replaceState(null,"",url.pathname+(url.searchParams.toString()?"?"+url.searchParams.toString():""));
}
qsa(".nav").forEach(n=>n.onclick=async()=>{
  showView(n.dataset.view);
  if(n.dataset.view==="analytics" && !state.monthlyAnalytics){
    try{await refreshMonthlyAnalytics();}catch(e){toast(e.message);}
  }
});
$("#logoutBtn").onclick=()=>{clearAdminToken();location.href="login.html";};
qsa("[data-open]").forEach(b=>b.onclick=()=>$("#"+b.dataset.open).showModal());
qsa("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());

function classStatus(c){
  if(c.status==="full") return '<span class="badge full">FULL</span>';
  if(c.status==="almost_full") return '<span class="badge warning">ALMOST FULL</span>';
  return '<span class="badge available">OPEN</span>';
}

function renderToday(){
  const list=$("#todayClasses");
  const actions=state.memberships.filter(m=>m.payment_status==="failed"||m.payment_status==="cancelled"||(m.payment_status==="paid"&&m.booklink_package_status!=="active")).length;
  $("#metricMembershipActions").textContent=actions;

  if(!state.bookingSyncReliable){
    $("#metricClasses").textContent="—";
    $("#metricBookings").textContent="—";
    $("#metricUnassigned").textContent="—";
    if(list) list.innerHTML="";
    return;
  }

  const rows=state.classes.filter(c=>c.date===today());
  $("#metricClasses").textContent=rows.length;
  $("#metricBookings").textContent=rows.reduce((s,c)=>s+Number(c.booked||0),0);
  $("#metricUnassigned").textContent=rows.filter(c=>!c.instructor_id).length;
  if(list) list.innerHTML="";
}

function instructorOptions(selected){
  return '<option value="">Instructor TBC</option>'+state.instructors.filter(i=>i.active!==false).map(i=>'<option value="'+i.id+'" '+(i.id===selected?'selected':'')+'>'+esc(i.name)+'</option>').join("");
}

let rotaLoadSequence=0;
async function refreshRota(){
  const sequence=++rotaLoadSequence;
  const start=addDays(scheduleWeekStart(today()),state.rotaWeekOffset*7);
  const data=await api("/api/admin/classes?from="+encodeURIComponent(start)+"&days=7");
  if(sequence!==rotaLoadSequence) return;
  state.rotaClasses=data.classes||[];
  renderRota();
}

function renderRota(){
  const start=addDays(scheduleWeekStart(today()),state.rotaWeekOffset*7);
  const end=addDays(start,6);
  $("#rotaWeekLabel").textContent=dateLabel(start)+" — "+dateLabel(end);
  $("#rotaThisWeek").classList.toggle("active",state.rotaWeekOffset===0);
  $("#rotaNextWeek").classList.toggle("active",state.rotaWeekOffset===1);
  const groups=new Map();
  state.rotaClasses.forEach(c=>{
    if(!groups.has(c.date))groups.set(c.date,[]);
    groups.get(c.date).push(c);
  });

  $("#rotaList").innerHTML=[...groups.entries()].map(([date,items])=>
    '<section class="rota-day-card">'+
      '<div class="rota-day-head"><strong>'+dateLabel(date)+'</strong><span>'+items.length+' CLASS'+(items.length===1?'':'ES')+'</span></div>'+
      '<div class="rota-day-sessions">'+items.map(c=>
        '<article class="rota-session">'+
          '<div class="rota-session-top">'+
            '<strong class="rota-time">'+c.time+'</strong>'+
            '<span class="booklink-count">'+c.booked+' / '+c.capacity+' BOOKED</span>'+
          '</div>'+
          '<div class="rota-session-meta">'+classStatus(c)+'<span>MASTER SCHEDULE</span></div>'+
          '<label class="rota-picker"><span>Instructor</span><select class="rota-select" data-date="'+c.date+'" data-time="'+c.time+'" data-saved="'+esc(c.instructor_id||'')+'">'+instructorOptions(c.instructor_id)+'</select></label>'+
          '<span class="rota-save-status" role="status">'+(c.instructor_id?'SAVED IN MASTER':'INSTRUCTOR TBC')+'</span>'+
        '</article>'
      ).join("")+'</div>'+
    '</section>'
  ).join("")||'<p class="muted">No classes scheduled this week.</p>';

  // Save each selection independently. Never redraw the entire list while another
  // instructor dropdown is being edited, as that could silently discard changes.
  qsa(".rota-select").forEach(select=>{
    select.onchange=async()=>{
      const date=select.dataset.date;
      const time=select.dataset.time;
      const chosen=select.value||"";
      const previous=select.dataset.saved||"";
      const status=select.closest(".rota-session").querySelector(".rota-save-status");
      select.disabled=true;
      status.textContent="SAVING…";
      try{
        await api("/api/admin/rota",{
          method:"POST",
          body:JSON.stringify({assignments:[{date,time,instructor_id:chosen||null}]})
        });
        // Confirm the actual persisted master record before claiming it is live.
        const result=await api("/api/admin/classes?from="+encodeURIComponent(date)+"&days=1");
        const saved=(result.classes||[]).find(c=>c.date===date&&c.time===time);
        if(!saved||String(saved.instructor_id||"")!==chosen){
          throw new Error("Save could not be verified. Please try again.");
        }
        select.dataset.saved=chosen;
        status.textContent=chosen?"SAVED · LIVE":"TBC · LIVE";
        const key=c=>c.date===date&&c.time===time;
        const idx=state.rotaClasses.findIndex(key);
        if(idx>=0) state.rotaClasses[idx]=saved;
        const idxToday=state.classes.findIndex(key);
        if(idxToday>=0) state.classes[idxToday]=saved;
        toast(chosen?"Instructor saved to master schedule.":"Instructor set to TBC on live schedule.");
      }catch(e){
        select.value=previous;
        status.textContent="NOT SAVED";
        toast(e.message);
      }finally{
        select.disabled=false;
      }
    };
  });
}
$("#rotaThisWeek").onclick=async()=>{
  state.rotaWeekOffset=0;
  try{await refreshRota();}catch(e){toast(e.message);}
};
$("#rotaNextWeek").onclick=async()=>{
  state.rotaWeekOffset=1;
  try{await refreshRota();}catch(e){toast(e.message);}
};

function attendanceMap(){return new Map(state.attendance.map(a=>[String(a.service_date).slice(0,10)+"|"+String(a.start_time).slice(0,5),a]));}

function renderAttendance(){
  const closed=attendanceMap();
  const t=today();
  const rows=state.payClasses.filter(c=>c.date<=t).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  $("#attendanceList").innerHTML=rows.length?rows.map(c=>{
    const key=c.date+"|"+c.time, a=closed.get(key);
    if(a){
      return '<div class="attendance-row closed">'+
        '<div><strong>'+dateLabel(c.date)+' · '+c.time+'</strong><span>'+esc(a.instructor_name||c.instructor)+'</span></div>'+
        '<div><strong>'+a.booked_count+'</strong><span>Booked</span></div>'+
        '<div><strong>'+a.attended_count+'</strong><span>Attended</span></div>'+
        '<div><strong>'+money(commissionFor(a.attended_count))+'</strong><span>Commission</span></div>'+
        '<span class="status-pill active">CLOSED</span>'+
      '</div>';
    }
    return '<div class="attendance-row">'+
      '<div><strong>'+dateLabel(c.date)+' · '+c.time+'</strong><span>'+esc(c.instructor)+'</span></div>'+
      '<div><strong>'+c.booked+'</strong><span>Booked</span></div>'+
      '<label>Actual riders<input class="attendance-input" data-key="'+key+'" type="number" min="0" max="12" value="'+c.booked+'"><span class="commission-preview" data-preview="'+key+'">Commission if closed: '+money(commissionFor(c.booked))+'</span></label>'+
      '<button class="mini primary close-class" data-date="'+c.date+'" data-time="'+c.time+'" data-instructor-id="'+esc(c.instructor_id||'')+'" '+(!c.instructor_id?'disabled title="Assign an instructor first"':'')+'>CLOSE CLASS</button>'+
    '</div>';
  }).join(""):'<p class="muted">No classes to close yet.</p>';

  qsa(".attendance-input").forEach(inp=>inp.oninput=()=>{
    const preview=document.querySelector('[data-preview="'+inp.dataset.key+'"]');
    if(preview) preview.textContent="Commission if closed: "+money(commissionFor(inp.value));
  });

  qsa(".close-class").forEach(b=>b.onclick=async()=>{
    const key=b.dataset.date+"|"+b.dataset.time;
    const inp=document.querySelector('.attendance-input[data-key="'+key+'"]');
    try{
      await api("/api/admin/attendance",{method:"POST",body:JSON.stringify({date:b.dataset.date,time:b.dataset.time,instructor_id:b.dataset.instructorId||null,attended_count:Number(inp.value||0)})});
      toast("Attendance closed.");
      await refreshAttendancePay();
    }catch(e){toast(e.message);}
  });
}

function renderPay(){
  const classes=state.pay.reduce((s,p)=>s+Number(p.classes||0),0);
  const booked=state.pay.reduce((s,p)=>s+Number(p.booked||0),0);
  const commission=state.pay.reduce((s,p)=>s+Number(p.commission||0),0);
  const total=state.pay.reduce((s,p)=>s+Number(p.total||0),0);
  const pending=state.pay.reduce((s,p)=>s+Number(p.pending_classes||0),0);
  const provisional=pending>0;

  $("#payTotals").innerHTML=
    '<article><span>CLASSES DONE</span><strong>'+classes+'</strong></article>'+
    '<article><span>PEOPLE BOOKED</span><strong>'+booked+'</strong></article>'+
    '<article><span>'+(provisional?'EST. COMMISSION':'COMMISSION')+'</span><strong>'+money(commission)+'</strong></article>'+
    '<article><span>'+(provisional?'EST. TOTAL PAYROLL':'TOTAL PAYROLL')+'</span><strong>'+money(total)+'</strong></article>';

  $("#paySummary").innerHTML=state.pay.length?state.pay.map(p=>'<article class="instructor-card pay-card">'+
    '<div class="pay-card-head"><div><strong>'+esc(p.name)+'</strong><span>'+roleLabel(p.role)+'</span></div><strong class="pay-card-total">'+money(p.total)+'</strong></div>'+
    '<div class="pay-week-metrics">'+
      '<div><span>Classes done</span><strong>'+Number(p.classes||0)+'</strong></div>'+
      '<div><span>People booked</span><strong>'+Number(p.booked||0)+'</strong></div>'+
    '</div>'+
    '<div class="pay-breakdown">'+
      '<div><span>Class pay</span><strong>'+money(p.class_pay)+'</strong></div>'+
      '<div><span>Commission earned</span><strong>'+money(p.commission)+'</strong></div>'+
      '<div class="pay-total-row"><span>Total earned</span><strong>'+money(p.total)+'</strong></div>'+
    '</div>'+
    '<span class="pay-rate-note">'+money(p.base_pay)+' / class · '+money(p.commission_rate)+' / rider above 5'+
      (Number(p.pending_classes||0)>0?' · '+Number(p.pending_classes||0)+' class'+(Number(p.pending_classes||0)===1?'':'es')+' awaiting attendance — commission estimated from bookings':' · attendance closed')+
    '</span>'+
  '</article>').join(""):'<p class="muted">No completed instructor classes for this week.</p>';
}

function renderPayHistory(){
  const current=weekStart(today());
  const rows=state.payHistory.filter(w=>w.week_start<current);
  $("#payHistory").innerHTML=rows.length?rows.map(w=>{
    const end=addDays(w.week_start,6);
    return '<button class="pay-history-row" type="button" data-week="'+w.week_start+'">'+
      '<div><strong>'+dateLabel(w.week_start)+' — '+dateLabel(end)+'</strong><span>'+w.classes+' classes · '+Number(w.booked||0)+' booked</span></div>'+
      '<div><span>Class pay</span><strong>'+money(w.class_pay)+'</strong></div>'+
      '<div><span>Commission</span><strong>'+money(w.commission)+'</strong></div>'+
      '<div><span>Total</span><strong>'+money(w.total)+'</strong></div>'+
    '</button>';
  }).join(""):'<p class="muted">No previous weekly payroll has been closed yet.</p>';

  qsa(".pay-history-row").forEach(b=>b.onclick=async()=>{
    state.payWeekStart=b.dataset.week;
    await refreshAttendancePay();
  });
}

function packageLabel(s){
  return s==="active"?"ACTIVE":s==="cancel_required"?"CANCEL REQUIRED":s==="cancelled"?"CANCELLED":s==="expired"?"EXPIRED":"NOT ISSUED";
}

function renderMemberships(){
  $("#membershipList").innerHTML=state.memberships.length?state.memberships.map(m=>'<article class="member-row live-member">'+
    '<div><strong>'+esc(m.client_name)+'</strong><span class="sub">'+esc(m.client_email||m.client_mobile||"No contact")+'</span></div>'+
    '<label>Payment<select class="member-payment" data-id="'+m.id+'">'+
      ['pending','paid','failed','cancelled'].map(x=>'<option '+(m.payment_status===x?'selected':'')+'>'+x+'</option>').join("")+
    '</select></label>'+
    '<label>Booklink package<select class="member-package" data-id="'+m.id+'">'+
      ['not_issued','active','cancel_required','cancelled','expired'].map(x=>'<option value="'+x+'" '+(m.booklink_package_status===x?'selected':'')+'>'+packageLabel(x)+'</option>').join("")+
    '</select></label>'+
    '<label>Package expiry<input class="member-expiry" data-id="'+m.id+'" type="date" value="'+(m.package_expires_on||"")+'"></label>'+
    '<button class="mini primary member-save" data-id="'+m.id+'">SAVE</button>'+
  '</article>').join(""):'<p class="muted">No Monthly Unlimited members yet.</p>';

  qsa(".member-save").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.id;
    const payment=document.querySelector('.member-payment[data-id="'+id+'"]').value;
    const pack=document.querySelector('.member-package[data-id="'+id+'"]').value;
    const expiry=document.querySelector('.member-expiry[data-id="'+id+'"]').value||null;
    try{
      await api("/api/admin/memberships/"+id,{method:"PATCH",body:JSON.stringify({payment_status:payment,booklink_package_status:pack,package_expires_on:expiry})});
      toast("Membership updated.");
      await refreshMemberships();
    }catch(e){toast(e.message);}
  });
}

function renderInstructors(){
  $("#instructorList").innerHTML=state.instructors.length?state.instructors.map(i=>'<article class="instructor-card">'+
    '<strong>'+esc(i.name)+'</strong><span>'+roleLabel(i.role)+'</span>'+
    '<span>'+money(i.base_pay)+' base</span><span>'+money(i.commission_rate)+' / rider above 5</span>'+
  '</article>').join(""):'<p class="muted">No instructors added yet.</p>';
}

function renderWebhooks(){
  $("#webhookUrl").textContent=API+"/webhooks/booklink";
  if(!state.webhookConfigured){
    $("#webhookStatus").innerHTML='<strong class="warn-text">Signing secret is not configured.</strong>';
  }else if(!state.bookingSyncReliable){
    $("#webhookStatus").innerHTML='<strong class="warn-text">Class sync incomplete.</strong> No confirmed Booklink booking events have been received yet.';
  }else{
    $("#webhookStatus").innerHTML='<strong class="ok-text">Class enrollment sync active.</strong>';
  }
  $("#webhookEvents").innerHTML=state.events.length?state.events.map(e=>'<div class="event-row"><strong>'+esc(e.event_type)+'</strong><span>'+new Date(e.received_at).toLocaleString("en-ZA")+'</span><span>'+esc(e.process_note||"logged")+'</span></div>').join(""):'<p class="muted">No webhook deliveries received yet.</p>';
  $("#syncLabel").textContent=!state.webhookConfigured?"Booklink: setup pending":state.bookingSyncReliable?"Booklink: live sync active":"Booklink: live sync incomplete";
  renderToday();
}

async function refreshClasses(){
  const [future,past]=await Promise.all([
    api("/api/admin/classes?days=14"),
    api("/api/admin/classes?from="+addDays(today(),-7)+"&days=8")
  ]);
  state.classes=future.classes||[];
  state.history=past.classes||[];
  renderToday();renderAttendance();
  await refreshRota();
}

async function refreshMemberships(){
  state.memberships=(await api("/api/admin/memberships")).memberships||[];
  renderMemberships();renderToday();
}

async function refreshAttendancePay(){
  const from=state.payWeekStart||weekStart(today());
  const to=addDays(from,6);
  state.payWeekStart=from;
  const [classes,a,p,h]=await Promise.all([
    api("/api/admin/classes?from="+from+"&days=7"),
    api("/api/admin/attendance?from="+from+"&to="+to),
    api("/api/admin/pay?from="+from+"&to="+to),
    api("/api/admin/pay-history?weeks=10")
  ]);
  state.payClasses=classes.classes||[];
  state.attendance=a.attendance||[];
  state.pay=p.pay||[];
  state.payHistory=h.weeks||[];
  $("#payWeekLabel").textContent=dateLabel(from)+" — "+dateLabel(to);
  renderAttendance();renderPay();renderPayHistory();
}

async function refreshWebhooks(){
  const w=await api("/api/admin/webhooks");
  state.events=w.events||[];state.webhookConfigured=Boolean(w.configured);state.eventTypes=w.event_types||[];state.bookingSyncReliable=Boolean(w.booking_sync_reliable);renderWebhooks();
}

$("#instructorForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    await api("/api/admin/instructors",{method:"POST",body:JSON.stringify({
      name:$("#instructorName").value.trim(),
      role:$("#instructorRole").value,
    })});
    e.target.reset();$("#instructorDialog").close();
    toast("Instructor added.");
    state.instructors=(await api("/api/admin/instructors")).instructors||[];
    renderInstructors();renderRota();renderToday();
  }catch(err){toast(err.message);}
};

$("#memberForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    await api("/api/admin/memberships",{method:"POST",body:JSON.stringify({
      client_name:$("#memberName").value.trim(),
      client_email:$("#memberEmail").value.trim()||null,
      client_mobile:$("#memberMobile").value.trim()||null,
      payfast_reference:$("#memberPayfastRef").value.trim()||null
    })});
    e.target.reset();$("#memberDialog").close();toast("Member added.");await refreshMemberships();
  }catch(err){toast(err.message);}
};

$("#analyticsPrevMonth").onclick=async()=>{
  state.analyticsMonth=shiftMonth(state.analyticsMonth,-1);
  try{await refreshMonthlyAnalytics();}catch(e){toast(e.message);}
};
$("#analyticsNextMonth").onclick=async()=>{
  const next=shiftMonth(state.analyticsMonth,1);
  if(next>today().slice(0,7)) return;
  state.analyticsMonth=next;
  try{await refreshMonthlyAnalytics();}catch(e){toast(e.message);}
};
$("#analyticsMonth").onchange=async e=>{
  if(!e.target.value) return;
  const current=today().slice(0,7);
  state.analyticsMonth=e.target.value>current?current:e.target.value;
  try{await refreshMonthlyAnalytics();}catch(err){toast(err.message);}
};

$("#payPrevWeek").onclick=async()=>{state.payWeekStart=addDays(state.payWeekStart||weekStart(today()),-7);await refreshAttendancePay();};
$("#payThisWeek").onclick=async()=>{state.payWeekStart=weekStart(today());await refreshAttendancePay();};

function showStartupError(verified){
  const message=verified
    ?"Your login is still valid, but some management data could not load."
    :"Could not verify your saved session. Check the connection and try again.";
  if(!verified){
    // No management controls are displayed until the API confirms the session.
    document.body.innerHTML="";
  }
  document.body.classList.remove("admin-auth-locked");
  const panel=document.createElement("div");
  panel.setAttribute("role","alert");
  panel.style.cssText="position:fixed;z-index:9999;top:12px;left:12px;right:12px;margin:0 auto;max-width:440px;padding:20px;border-radius:12px;background:#111;color:#fff;border:1px solid #777;box-shadow:0 8px 30px #0008;font:16px system-ui,sans-serif";
  const heading=document.createElement("strong");
  heading.textContent="Connection problem";
  const detail=document.createElement("p");
  detail.textContent=message;
  const retry=document.createElement("button");
  retry.textContent="TRY AGAIN";
  retry.type="button";
  retry.style.cssText="padding:10px 20px;cursor:pointer";
  retry.onclick=()=>location.reload();
  panel.append(heading,detail,retry);
  document.body.appendChild(panel);
}

async function checkAdminSession(token){
  const controller=new AbortController();
  // A stalled mobile/API connection must never leave the management screen blank forever.
  const deadline=setTimeout(()=>controller.abort(),45000);
  try{
    return await fetch(API+"/api/admin/session",{
      headers:{"authorization":"Bearer "+token},
      cache:"no-store",
      signal:controller.signal
    });
  } finally {
    clearTimeout(deadline);
  }
}

async function boot(){
  const next="management.html"+(requestedView()!=="today"?"?view="+encodeURIComponent(requestedView()):"");
  if(!TOKEN){
    location.replace("login.html?next="+encodeURIComponent(next));
    return;
  }

  let verified=false;
  try{
    const auth=await checkAdminSession(TOKEN);
    if(auth.status===401 || auth.status===403){
      clearAdminToken();
      location.replace("login.html?next="+encodeURIComponent(next));
      return;
    }
    if(!auth.ok) throw new Error("Session service unavailable");
    verified=true;
    // Authentication is complete; transient data requests must not log out the user.
    showView(requestedView());
    document.body.classList.remove("admin-auth-locked");

    const health=await fetch(API+"/health",{cache:"no-store"});
    if(!health.ok) throw new Error("API offline");

    const [i,m]=await Promise.all([api("/api/admin/instructors"),api("/api/admin/memberships")]);
    state.instructors=i.instructors||[];state.memberships=m.memberships||[];
    renderInstructors();renderMemberships();
    await Promise.all([refreshClasses(),refreshWeeklyBookings(),refreshOwnerInsights(),refreshMonthlyAnalytics(),refreshAttendancePay(),refreshWebhooks()]);
  }catch(e){
    if(e.message==="Session expired") return;
    showStartupError(verified);
  }
}
boot();
