const cfg=window.SPINNING_CONFIG||{};
const API=cfg.apiBaseUrl||"https://spinningkartel-api.onrender.com";
// After the final Saturday session has finished, open the published
// upcoming instructor rota by default. Staff can still switch weeks.
function defaultWeekOffset(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Africa/Johannesburg",weekday:"short",hour:"2-digit",
    minute:"2-digit",hour12:false
  }).formatToParts(now);
  const part=name=>parts.find(p=>p.type===name)?.value||"";
  const day=part("weekday");
  const minutes=Number(part("hour"))*60+Number(part("minute"));
  return day==="Sat"&&minutes>=9*60 ? 1 : 0;
}
let selectedWeekOffset=defaultWeekOffset();
let latestRefresh=0;
const $=s=>document.querySelector(s);
function todayZA(){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Johannesburg",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function addDays(date,n){
  const d=new Date(date+"T12:00:00Z");
  d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}
function weekStart(date){
  const d=new Date(date+"T12:00:00Z");
  return addDays(date,-d.getUTCDay());
}
function prettyDate(date){
  return new Date(date+"T12:00:00+02:00").toLocaleDateString("en-ZA",{weekday:"long",day:"numeric",month:"long"});
}
function shortDate(date){
  return new Date(date+"T12:00:00+02:00").toLocaleDateString("en-ZA",{day:"numeric",month:"short"});
}
function rideName(time){
  if(time==="05:30")return"Early Ride";
  if(time==="07:00")return"Saturday Ride";
  if(time==="08:00")return"Morning Ride";
  if(time==="17:00")return"Afternoon Ride";
  if(time==="18:00")return"Evening Ride";
  if(time==="19:00")return"Night Ride";
  return"Spinning Class";
}
function classState(c){
  const cap=Math.max(1,Number(c.capacity||16));
  const booked=Math.max(0,Number(c.booked||0));
  if(booked>=cap)return"full";
  if(booked/cap>=.75)return"almost";
  return"open";
}
function statusLabel(c){
  const cap=Math.max(1,Number(c.capacity||16));
  const booked=Math.max(0,Number(c.booked||0));
  const s=classState(c);
  if(s==="full")return"FULL";
  if(s==="almost")return Math.max(0,cap-booked)+" LEFT";
  return Math.max(0,cap-booked)+" OPEN";
}
function esc(s){
  return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}
function card(c){
  const booked=Math.max(0,Number(c.booked||0));
  const cap=Math.max(1,Number(c.capacity||16));
  const s=classState(c);
  const instructor=(c.instructor&&c.instructor!=="Instructor TBC")?c.instructor:"Instructor TBC";
  return '<article class="class-card '+s+'">'+
    '<div class="time">'+esc(c.time)+'</div>'+
    '<div class="details"><strong>'+esc(c.class_label||rideName(c.time))+'</strong><span>'+esc(instructor)+(c.instructor_note?' · '+esc(c.instructor_note):'')+'</span></div>'+
    '<div class="count"><strong>'+booked+' / '+cap+'</strong><span class="'+s+'">'+statusLabel(c)+'</span></div>'+
  '</article>';
}
function render(rows,start){
  const groups=new Map();
  rows.forEach(c=>{
    if(!groups.has(c.date))groups.set(c.date,[]);
    groups.get(c.date).push(c);
  });
  $("#schedule").innerHTML=[...groups.entries()].map(([date,items])=>
    '<section class="day">'+
      '<div class="day-head"><h2>'+prettyDate(date)+'</h2><span>'+items.length+' CLASS'+(items.length===1?'':'ES')+'</span></div>'+
      '<div class="classes">'+items.map(card).join("")+'</div>'+
    '</section>'
  ).join("")||'<div class="loading">No classes scheduled this week.</div>';

  $("#classCount").textContent=rows.length;
  $("#seatCount").textContent=rows.reduce((n,c)=>n+Number(c.booked||0),0);
  $("#busyCount").textContent=rows.filter(c=>classState(c)!=="open").length;
  $("#weekRange").textContent=shortDate(start)+" — "+shortDate(addDays(start,6));
}
async function refresh(){
  const requestId=++latestRefresh;
  const weekOffset=selectedWeekOffset;
  const start=addDays(weekStart(todayZA()),weekOffset*7);
  try{
    const r=await fetch(API+"/api/public/classes?days=7&from="+encodeURIComponent(start)+"&t="+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error("Could not load schedule");
    const data=await r.json();
    // Ignore an older in-flight request if the user switched weeks.
    if(requestId!==latestRefresh || weekOffset!==selectedWeekOffset)return;
    render(data.classes||[],start);
    $("#weekEyebrow").textContent=weekOffset===0?"THIS WEEK":"NEXT WEEK";
    $("#thisWeekBtn").classList.toggle("active",weekOffset===0);
    $("#nextWeekBtn").classList.toggle("active",weekOffset===1);
    $("#updatedAt").textContent=new Date().toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false,timeZone:"Africa/Johannesburg"});
    $("#liveLabel").textContent="LIVE";
  }catch(e){
    if(requestId!==latestRefresh || weekOffset!==selectedWeekOffset)return;
    $("#liveLabel").textContent="RETRYING";
    $("#schedule").innerHTML='<div class="error">Could not refresh schedule. Retrying automatically…</div>';
  }
}
$("#thisWeekBtn").onclick=()=>{selectedWeekOffset=0;refresh();};
$("#nextWeekBtn").onclick=()=>{selectedWeekOffset=1;refresh();};
// Read-only display: the schedule comes exclusively from the public classes API.
// This page never requests an admin session, carries an admin token, or writes data.
function boot(){
  refresh();
  setInterval(()=>{if(!document.hidden)refresh()},10000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
  window.addEventListener("focus",refresh);
}
boot();
