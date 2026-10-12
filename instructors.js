const cfg=window.SPINNING_CONFIG||{};
const API=cfg.apiBaseUrl||"https://spinningkartel-api.onrender.com";
const $=s=>document.querySelector(s);

function todayZA(){
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Johannesburg",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function prettyDate(date){
  return new Date(date+"T12:00:00+02:00").toLocaleDateString("en-ZA",{weekday:"long",day:"numeric",month:"long"});
}
function rideName(time){
  if(time==="05:30")return"Early Ride";
  if(time==="08:00")return"Morning Ride";
  if(time==="18:00")return"Evening Ride";
  if(time==="19:00")return"Night Ride";
  if(time==="07:00")return"Saturday Ride";
  return"Spinning Class";
}
function state(c){
  const cap=Math.max(1,Number(c.capacity||12)), booked=Math.max(0,Number(c.booked||0));
  if(booked>=cap)return"full";
  if(booked/cap>=.75)return"almost";
  return"open";
}
function statusLabel(c){
  const cap=Math.max(1,Number(c.capacity||12)), booked=Math.max(0,Number(c.booked||0)), s=state(c);
  if(s==="full")return"FULL";
  if(s==="almost")return Math.max(0,cap-booked)+" LEFT";
  return Math.max(0,cap-booked)+" OPEN";
}
function card(c){
  const booked=Math.max(0,Number(c.booked||0)), cap=Math.max(1,Number(c.capacity||12)), s=state(c);
  const instructor=(c.instructor&&c.instructor!=="Instructor TBC")?c.instructor:"Instructor TBC";
  return '<article class="class-card '+s+'">'+
    '<div class="time">'+c.time+'</div>'+
    '<div class="details"><strong>'+rideName(c.time)+'</strong><span>'+instructor+'</span></div>'+
    '<div class="count"><strong>'+booked+' / '+cap+'</strong><span class="'+s+'">'+statusLabel(c)+'</span></div>'+
  '</article>';
}
function render(rows){
  const groups=new Map();
  rows.forEach(c=>{if(!groups.has(c.date))groups.set(c.date,[]);groups.get(c.date).push(c)});
  $("#schedule").innerHTML=[...groups.entries()].map(([date,items])=>
    '<section class="day">'+
      '<div class="day-head"><h2>'+prettyDate(date)+'</h2><span>'+items.length+' CLASS'+(items.length===1?'':'ES')+'</span></div>'+
      '<div class="classes">'+items.map(card).join("")+'</div>'+
    '</section>'
  ).join("")||'<div class="loading">No upcoming classes found.</div>';

  $("#classCount").textContent=rows.length;
  $("#seatCount").textContent=rows.reduce((n,c)=>n+Number(c.booked||0),0);
  $("#busyCount").textContent=rows.filter(c=>state(c)!=="open").length;
}
async function refresh(){
  try{
    const r=await fetch(API+"/api/public/classes?days=7&from="+encodeURIComponent(todayZA())+"&t="+Date.now(),{cache:"no-store"});
    if(!r.ok)throw new Error("Could not load schedule");
    const data=await r.json();
    render(data.classes||[]);
    $("#updatedAt").textContent=new Date().toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false,timeZone:"Africa/Johannesburg"});
    $("#liveLabel").textContent="LIVE";
  }catch(e){
    $("#liveLabel").textContent="RETRYING";
    $("#schedule").innerHTML='<div class="error">Could not refresh the schedule. Retrying automatically…</div>';
  }
}
refresh();
setInterval(()=>{if(!document.hidden)refresh()},10000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
window.addEventListener("focus",refresh);