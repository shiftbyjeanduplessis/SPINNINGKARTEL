const cfg=window.SPINNING_CONFIG||{};
const API=cfg.apiBaseUrl||"";
const TOKEN=sessionStorage.getItem("sk_admin_token");
if(!TOKEN) location.replace("login.html");

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let state={classes:[],history:[],instructors:[],memberships:[],attendance:[],pay:[],events:[],webhookConfigured:false};

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),1900);}
function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Johannesburg",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
function addDays(date,n){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function dateLabel(d){return new Date(d+"T12:00:00").toLocaleDateString("en-ZA",{weekday:"short",day:"numeric",month:"short"}).toUpperCase();}
function roleLabel(r){return r==="student"?"Student instructor":r==="guest"?"Guest instructor":"Main instructor";}
function money(v){return "R"+Number(v||0).toFixed(0);}

async function api(path,options={}){
  const headers={...(options.headers||{}),"authorization":"Bearer "+TOKEN};
  if(options.body && !headers["content-type"]) headers["content-type"]="application/json";
  const r=await fetch(API+path,{...options,headers,cache:"no-store"});
  if(r.status===401){sessionStorage.clear();location.replace("login.html");throw new Error("Session expired");}
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
}

function showView(name){
  $$(".view").forEach(v=>v.classList.toggle("active",v.dataset.page===name));
  $$(".nav").forEach(v=>v.classList.toggle("active",v.dataset.view===name));
}
$$(".nav").forEach(n=>n.onclick=()=>showView(n.dataset.view));
$("#logoutBtn").onclick=()=>{sessionStorage.clear();location.href="login.html";};
$$("[data-open]").forEach(b=>b.onclick=()=>$("#"+b.dataset.open).showModal());
$$("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());

function classStatus(c){
  if(c.status==="full") return '<span class="badge full">FULL</span>';
  if(c.status==="almost_full") return '<span class="badge warning">ALMOST FULL</span>';
  return '<span class="badge available">OPEN</span>';
}

function renderToday(){
  const rows=state.classes.filter(c=>c.date===today());
  $("#metricClasses").textContent=rows.length;
  $("#metricBookings").textContent=rows.reduce((s,c)=>s+Number(c.booked||0),0);
  $("#metricUnassigned").textContent=rows.filter(c=>!c.instructor_id).length;
  $("#metricMembershipActions").textContent=state.memberships.filter(m=>m.payment_status==="failed"||m.payment_status==="cancelled"||(m.payment_status==="paid"&&m.booklink_package_status!=="active")).length;
  $("#todayClasses").innerHTML=rows.length?rows.map(c=>'<article class="ops-row">'+
    '<div class="ops-time"><strong>'+c.time+'</strong><span>'+dateLabel(c.date)+'</span></div>'+
    '<div><strong>Spinning Class</strong><span>'+esc(c.instructor)+'</span></div>'+
    '<div><strong>'+c.booked+' / '+c.capacity+'</strong><span>Booked seats</span></div>'+
    '<div>'+classStatus(c)+'</div>'+
    '<a class="mini primary" href="https://app.booklink.co.za" target="_blank" rel="noreferrer">ROSTER ↗</a>'+
  '</article>').join(""):'<p class="muted">No classes scheduled today.</p>';
}

function instructorOptions(selected){
  return '<option value="">Instructor TBC</option>'+state.instructors.filter(i=>i.active!==false).map(i=>'<option value="'+i.id+'" '+(i.id===selected?'selected':'')+'>'+esc(i.name)+'</option>').join("");
}

function renderRota(){
  let lastDate="";
  $("#rotaList").innerHTML=state.classes.map(c=>{
    const head=c.date!==lastDate?'<div class="rota-day">'+dateLabel(c.date)+'</div>':"";
    lastDate=c.date;
    return head+'<div class="rota-row">'+
      '<div><strong>'+c.time+'</strong><span>45 min · '+c.booked+'/'+c.capacity+' booked</span></div>'+
      '<select class="rota-select" data-date="'+c.date+'" data-time="'+c.time+'">'+instructorOptions(c.instructor_id)+'</select>'+
      '<span class="rota-public">'+(c.instructor_id?'PUBLIC: '+esc(c.instructor):'PUBLIC: TBC')+'</span>'+
    '</div>';
  }).join("");
}

$("#saveRota").onclick=async()=>{
  const assignments=$$(".rota-select").map(s=>({date:s.dataset.date,time:s.dataset.time,instructor_id:s.value||null}));
  try{
    await api("/api/admin/rota",{method:"POST",body:JSON.stringify({assignments})});
    toast("Instructor rota saved.");
    await refreshClasses();
  }catch(e){toast(e.message);}
};

function attendanceMap(){return new Map(state.attendance.map(a=>[String(a.service_date).slice(0,10)+"|"+String(a.start_time).slice(0,5),a]));}

function renderAttendance(){
  const closed=attendanceMap();
  const t=today();
  const rows=state.history.filter(c=>c.date<=t).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  $("#attendanceList").innerHTML=rows.length?rows.map(c=>{
    const key=c.date+"|"+c.time, a=closed.get(key);
    if(a){
      return '<div class="attendance-row closed">'+
        '<div><strong>'+dateLabel(c.date)+' · '+c.time+'</strong><span>'+esc(a.instructor_name||c.instructor)+'</span></div>'+
        '<div><strong>'+a.booked_count+'</strong><span>Booked</span></div>'+
        '<div><strong>'+a.attended_count+'</strong><span>Attended</span></div>'+
        '<div><strong>'+a.no_show_count+'</strong><span>No-shows</span></div>'+
        '<span class="status-pill active">CLOSED</span>'+
      '</div>';
    }
    return '<div class="attendance-row">'+
      '<div><strong>'+dateLabel(c.date)+' · '+c.time+'</strong><span>'+esc(c.instructor)+'</span></div>'+
      '<div><strong>'+c.booked+'</strong><span>Booked</span></div>'+
      '<label>Actual riders<input class="attendance-input" data-key="'+key+'" type="number" min="0" max="12" value="'+c.booked+'"></label>'+
      '<button class="mini primary close-class" data-date="'+c.date+'" data-time="'+c.time+'" '+(!c.instructor_id?'disabled title="Assign an instructor first"':'')+'>CLOSE CLASS</button>'+
    '</div>';
  }).join(""):'<p class="muted">No classes to close yet.</p>';

  $$(".close-class").forEach(b=>b.onclick=async()=>{
    const key=b.dataset.date+"|"+b.dataset.time;
    const inp=document.querySelector('.attendance-input[data-key="'+key+'"]');
    try{
      await api("/api/admin/attendance",{method:"POST",body:JSON.stringify({date:b.dataset.date,time:b.dataset.time,attended_count:Number(inp.value||0)})});
      toast("Attendance closed.");
      await refreshAttendancePay();
    }catch(e){toast(e.message);}
  });
}

function renderPay(){
  $("#paySummary").innerHTML=state.pay.length?state.pay.map(p=>'<article class="instructor-card">'+
    '<strong>'+esc(p.name)+'</strong><span>'+roleLabel(p.role)+'</span>'+
    '<span>'+p.classes+' closed classes · '+p.riders+' riders</span>'+
    '<span>'+money(p.base_pay)+' base + '+money(p.commission_rate)+' / rider above 5</span>'+
    '<span>Commission '+money(p.commission)+'</span><span class="total">'+money(p.total)+'</span>'+
  '</article>').join(""):'<p class="muted">Add instructors to start tracking pay.</p>';
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

  $$(".member-save").forEach(b=>b.onclick=async()=>{
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
  $("#webhookStatus").innerHTML=state.webhookConfigured
    ? '<strong class="ok-text">Signing secret configured.</strong> Send a Booklink test ping.'
    : '<strong class="warn-text">Signing secret still needs to be added to the API service.</strong>';
  $("#webhookEvents").innerHTML=state.events.length?state.events.map(e=>'<div class="event-row"><strong>'+esc(e.event_type)+'</strong><span>'+new Date(e.received_at).toLocaleString("en-ZA")+'</span><span>'+esc(e.process_note||"logged")+'</span></div>').join(""):'<p class="muted">No webhook deliveries received yet.</p>';
  $("#syncLabel").textContent=state.webhookConfigured?"Booklink: webhook ready":"Booklink: webhook setup pending";
}

async function refreshClasses(){
  const [future,past]=await Promise.all([
    api("/api/admin/classes?days=14"),
    api("/api/admin/classes?from="+addDays(today(),-7)+"&days=8")
  ]);
  state.classes=future.classes||[];
  state.history=past.classes||[];
  renderToday();renderRota();renderAttendance();
}

async function refreshMemberships(){
  state.memberships=(await api("/api/admin/memberships")).memberships||[];
  renderMemberships();renderToday();
}

async function refreshAttendancePay(){
  const from=addDays(today(),-7), to=today();
  const [a,p]=await Promise.all([
    api("/api/admin/attendance?from="+from+"&to="+to),
    api("/api/admin/pay?from="+addDays(today(),-30)+"&to="+to)
  ]);
  state.attendance=a.attendance||[]; state.pay=p.pay||[];
  renderAttendance();renderPay();
}

async function refreshWebhooks(){
  const w=await api("/api/admin/webhooks");
  state.events=w.events||[];state.webhookConfigured=Boolean(w.configured);renderWebhooks();
}

$("#instructorForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    await api("/api/admin/instructors",{method:"POST",body:JSON.stringify({
      name:$("#instructorName").value.trim(),
      role:$("#instructorRole").value,
      base_pay:Number($("#instructorBase").value),
      commission_rate:Number($("#instructorCommission").value)
    })});
    e.target.reset();$("#instructorBase").value=200;$("#instructorCommission").value=10;$("#instructorDialog").close();
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

async function boot(){
  try{
    const health=await fetch(API+"/health",{cache:"no-store"});
    if(!health.ok) throw new Error("API offline");
    const [i,m]=await Promise.all([api("/api/admin/instructors"),api("/api/admin/memberships")]);
    state.instructors=i.instructors||[];state.memberships=m.memberships||[];
    renderInstructors();renderMemberships();
    await Promise.all([refreshClasses(),refreshAttendancePay(),refreshWebhooks()]);
  }catch(e){
    $("#syncLabel").textContent="Studio API offline";
    toast("Studio API is not ready yet.");
  }
}
boot();
