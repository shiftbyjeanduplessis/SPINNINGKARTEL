const cfg=window.SPINNING_CONFIG||{};
const API=cfg.apiBaseUrl||"";
const BOOKING_URL=cfg.booklinkPublicUrl||"https://bklnk.co.za/spinningkartel";
const OPEN_FROM="2026-10-05T18:00:00+02:00";
const $=s=>document.querySelector(s);
let BOOKING_SYNC_RELIABLE=false;

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function futureClass(c){
  const classTime=new Date(c.date+"T"+c.time+":00+02:00").getTime();
  const openFrom=new Date(OPEN_FROM).getTime();
  return classTime>=openFrom && classTime>Date.now()-5*60*1000;
}
function scheduleStartDate(){
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:"Africa/Johannesburg",
    year:"numeric",month:"2-digit",day:"2-digit"
  }).format(new Date());
}
function prettyDate(date){
  return new Date(date+"T12:00:00").toLocaleDateString("en-ZA",{weekday:"short",day:"numeric",month:"short"}).toUpperCase();
}
function rideName(time){
  if(time==="05:30")return"Early Ride";
  if(time==="08:00")return"Morning Ride";
  if(time==="17:00")return"Afternoon Ride";
  if(time==="18:00")return"Evening Ride";
  if(time==="19:00")return"Night Ride";
  if(time==="07:00")return"Saturday Ride";
  return"Spinning Class";
}
function instructorLine(c){
  const name=esc(c.instructor||"Instructor TBC");
  const note=c.instructor_note?' <span class="instructor-note">· '+esc(c.instructor_note)+'</span>':'';
  return '<span class="instructor-name">WITH '+name.toUpperCase()+'</span>'+note;
}
function liveState(c){
  const capacity=Math.max(1,Number(c.capacity||12));
  const booked=Math.max(0,Number(c.booked||0));
  if(booked>=capacity)return"full";
  if(booked/capacity>=0.75)return"almost_full";
  return"open";
}
function status(c){
  if(!BOOKING_SYNC_RELIABLE)return{label:"BOOK",cls:""};
  const state=liveState(c);
  if(state==="full")return{label:"FULL",cls:"full"};
  if(state==="almost_full"){
    const left=Math.max(0,Number(c.capacity||12)-Number(c.booked||0));
    return{label:"ALMOST FULL · "+left+" LEFT",cls:"warning"};
  }
  return{label:"OPEN",cls:"open"};
}
function quickCard(c){
  const s=status(c);
  return '<article class="quick-card '+s.cls+'">'+
    '<span class="quick-status '+s.cls+'">'+s.label+'</span>'+
    '<small>'+prettyDate(c.date)+'</small>'+
    '<strong>'+esc(c.time)+'</strong>'+
    '<p class="class-meta">'+esc(rideName(c.time))+' · 45 min · R70</p>'+
    '<p class="class-instructor">'+instructorLine(c)+'</p>'+
    (BOOKING_SYNC_RELIABLE&&liveState(c)==="full"?'':'<a href="'+BOOKING_URL+'" aria-label="Book '+esc(c.date)+' '+esc(c.time)+'"></a>')+
  '</article>';
}
function fullCard(c){
  const s=status(c);
  const statusText=s.label==="OPEN"?"BOOK":s.label;
  return '<article class="full-class '+s.cls+'">'+
    '<div class="time">'+esc(c.time)+'</div>'+
    '<div class="desc"><strong>'+esc(c.instructor||"Instructor TBC")+'</strong><span>'+esc(rideName(c.time))+' · 45 min · R70'+(c.instructor_note?' · '+esc(c.instructor_note):'')+'</span></div>'+
    '<div class="book">'+statusText+'</div>'+
    (BOOKING_SYNC_RELIABLE&&liveState(c)==="full"?'':'<a href="'+BOOKING_URL+'" aria-label="Book '+esc(c.date)+' '+esc(c.time)+'"></a>')+
  '</article>';
}
function fallback(){
  const rows=[],start=new Date(scheduleStartDate()+"T12:00:00+02:00");
  for(let i=0;i<15;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const dow=d.getDay();
    const date=d.toISOString().slice(0,10);
    let times=[];
    if(dow===6)times=cfg.saturdayTimes||["07:00","08:00"];
    else if(dow>=1&&dow<=4)times=cfg.weekdayTimes||["05:30","08:00","17:00","18:00","19:00"];
    else if(dow===5)times=cfg.fridayTimes||["05:30","08:00","17:00","18:00"];
    times.forEach(time=>rows.push({date,time,status:"open",instructor:"Instructor TBC"}));
  }
  return rows.filter(futureClass);
}
function renderFull(rows){
  const el=$("#fullSchedule");if(!el)return;
  const groups=new Map();
  rows.forEach(c=>{
    if(!groups.has(c.date))groups.set(c.date,[]);
    groups.get(c.date).push(c);
  });
  el.innerHTML=[...groups.entries()].map(([date,items])=>
    '<section class="schedule-day">'+
      '<div class="schedule-day-head"><strong>'+prettyDate(date)+'</strong><span>'+items.length+' CLASS'+(items.length===1?'':'ES')+'</span></div>'+
      '<div class="schedule-day-grid">'+items.map(fullCard).join("")+'</div>'+
    '</section>'
  ).join("");
}
async function bootSchedule(){
  let rows=[];
  try{
    const r=await fetch(API+"/api/public/classes?days=14&from="+encodeURIComponent(scheduleStartDate()),{cache:"no-store"});
    if(!r.ok)throw new Error("api");
    const data=await r.json();
    BOOKING_SYNC_RELIABLE=Boolean(data.sync_reliable);
    rows=data.classes||[];
  }catch(e){rows=fallback()}
  rows=rows.filter(futureClass);
  const quick=$("#quickSchedule");
  if(quick)quick.innerHTML=rows.slice(0,4).map(quickCard).join("")||'<div class="schedule-loading">No upcoming classes found.</div>';
  renderFull(rows);
}
const toggle=$("#toggleFullSchedule");
if(toggle){
  toggle.addEventListener("click",()=>{
    const el=$("#fullSchedule");
    const open=el.hasAttribute("hidden");
    if(open){
      el.removeAttribute("hidden");
      toggle.textContent="HIDE FULL SCHEDULE";
      el.scrollIntoView({behavior:"smooth",block:"start"});
    }else{
      el.setAttribute("hidden","");
      toggle.textContent="VIEW FULL SCHEDULE";
    }
  });
}
bootSchedule();
setInterval(()=>{ if(!document.hidden) bootSchedule(); },30000);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) bootSchedule(); });
window.addEventListener("focus",()=>bootSchedule());