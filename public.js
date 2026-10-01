const cfg = window.SPINNING_CONFIG || {};
const API = cfg.apiBaseUrl || "";
const BOOKLINK = cfg.booklinkPublicUrl || "https://bklnk.co.za/spinningkartel";
const $ = s => document.querySelector(s);

function money(v){ return v==null||v==="" ? "RATE TBC" : "R"+Number(v).toFixed(0); }

function futureClass(c){
  const d = new Date(c.date+"T"+c.time+":00+02:00");
  return d.getTime() > Date.now() - 5*60*1000;
}

function dayLabel(date){
  return new Date(date+"T12:00:00").toLocaleDateString("en-ZA",{weekday:"short",day:"numeric",month:"short"}).toUpperCase();
}

function statusMeta(status){
  if(status==="full") return {label:"FULL", cls:"full", disabled:true};
  if(status==="almost_full") return {label:"ALMOST FULL", cls:"warning", disabled:false};
  return {label:"BOOK ONLINE", cls:"available", disabled:false};
}

function classCard(c){
  const st=statusMeta(c.status);
  const book=st.disabled
    ? '<span class="mini-book disabled">FULL</span>'
    : '<a class="mini-book" href="'+BOOKLINK+'" aria-label="Book '+c.date+' '+c.time+' Spinning Kartel class">BOOK</a>';
  return '<article class="home-class">'+
    '<div class="time"><strong>'+c.time+'</strong><small>'+dayLabel(c.date)+'</small></div>'+
    '<div class="meta"><h3>Spinning Class</h3><p>'+c.duration+' min · '+money(c.rate)+'</p><p class="class-instructor">with <strong>'+escapeHtml(c.instructor||"Instructor TBC")+'</strong></p></div>'+
    '<div class="state"><span class="status '+st.cls+'">'+st.label+'</span>'+book+'</div>'+
  '</article>';
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function fallbackClasses(){
  const rows=[];
  const start=new Date();
  for(let i=0;i<8;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const day=d.getDay();
    const date=d.toISOString().slice(0,10);
    const times=day===6?(cfg.saturdayTimes||["07:00","08:00"]):(day>=1&&day<=5?(cfg.weekdayTimes||["05:30","08:00","18:00","19:00"]):[]);
    times.forEach(time=>rows.push({date,time,duration:45,rate:70,instructor:"Instructor TBC",status:"open"}));
  }
  return rows.filter(futureClass);
}

async function loadSchedule(){
  const el=$("#homeSchedule"); if(!el) return;
  let rows=[];
  try{
    const r=await fetch(API+"/api/public/classes?days=10",{cache:"no-store"});
    if(!r.ok) throw new Error("api");
    rows=(await r.json()).classes||[];
  }catch(e){
    rows=fallbackClasses();
  }
  rows=rows.filter(futureClass).slice(0,10);
  el.innerHTML=rows.length?rows.map(classCard).join(""):'<p class="muted">Upcoming classes are being loaded. You can still book directly through Booklink.</p>';
}

const packageHelpBtn=$("#packageHelpBtn");
if(packageHelpBtn){
  packageHelpBtn.addEventListener("click",()=>{
    const el=$("#packageHelp"); if(el) el.hidden=!el.hidden;
  });
}
loadSchedule();
