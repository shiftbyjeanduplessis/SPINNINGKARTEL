const cfg=window.SPINNING_CONFIG||{};
const API=cfg.apiBaseUrl||"";
const BOOKLINK=cfg.booklinkPublicUrl||"https://bklnk.co.za/spinningkartel";
const $=s=>document.querySelector(s);

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function futureClass(c){return new Date(c.date+"T"+c.time+":00+02:00").getTime()>Date.now()-5*60*1000}
function dayLabel(date){
  const d=new Date(date+"T12:00:00");
  const today=new Date();
  const same=d.toDateString()===today.toDateString();
  return same?"TODAY":d.toLocaleDateString("en-ZA",{weekday:"short",day:"numeric",month:"short"}).toUpperCase();
}
function rideName(c){
  if(c.time==="05:30") return "Morning Ride";
  if(c.time==="08:00") return "Power Ride";
  if(c.time==="18:00") return "Ride & Rhythm";
  if(c.time==="19:00") return "Endurance Ride";
  if(c.time==="07:00") return "Weekend Kickstart";
  return "Spinning Class";
}
function statusMeta(status){
  if(status==="full") return {label:"FULL",cls:"full"};
  if(status==="almost_full") return {label:"ALMOST FULL",cls:"warning"};
  return {label:"OPEN",cls:""};
}
function railCard(c){
  const st=statusMeta(c.status);
  return '<article class="rail-card">'+
    '<small>'+dayLabel(c.date)+'</small>'+
    '<strong>'+esc(c.time)+'</strong>'+
    '<span>'+esc(rideName(c))+'</span>'+
    '<span class="rail-status '+st.cls+'">'+st.label+'</span>'+
    '<a href="'+BOOKLINK+'" aria-label="Book '+esc(c.date)+' '+esc(c.time)+'"></a>'+
  '</article>';
}
function fallback(){
  const rows=[],start=new Date();
  for(let i=0;i<8;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);
    const day=d.getDay();
    const date=d.toISOString().slice(0,10);
    const times=day===6?(cfg.saturdayTimes||["07:00","08:00"]):(day>=1&&day<=5?(cfg.weekdayTimes||["05:30","08:00","18:00","19:00"]):[]);
    times.forEach(time=>rows.push({date,time,status:"open"}));
  }
  return rows.filter(futureClass);
}
async function loadSchedule(){
  const el=$("#homeSchedule");if(!el)return;
  let rows=[];
  try{
    const r=await fetch(API+"/api/public/classes?days=10",{cache:"no-store"});
    if(!r.ok)throw new Error("api");
    rows=(await r.json()).classes||[];
  }catch(e){rows=fallback()}
  rows=rows.filter(futureClass).slice(0,4);
  el.innerHTML=rows.length?rows.map(railCard).join(""):'<article class="rail-card loading-card"><span>Open Booklink to see upcoming classes.</span></article>';
}
const packageHelpBtn=$("#packageHelpBtn");
if(packageHelpBtn){
  packageHelpBtn.addEventListener("click",()=>{
    const el=$("#packageHelp");if(el)el.hidden=!el.hidden;
  });
}
loadSchedule();