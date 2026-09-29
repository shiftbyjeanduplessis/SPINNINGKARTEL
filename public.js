const cfg = window.SPINNING_CONFIG || {};
const DEMO_CLASSES = [
  {id:"c1",date:"2026-09-30",day:"WED",time:"06:00",name:"Morning Ride",instructor:"Instructor TBC",rate:70,capacity:20,booked:8},
  {id:"c2",date:"2026-09-30",day:"WED",time:"09:00",name:"Morning Ride",instructor:"Instructor TBC",rate:70,capacity:20,booked:5},
  {id:"c3",date:"2026-09-30",day:"WED",time:"18:00",name:"Evening Ride",instructor:"Instructor TBC",rate:70,capacity:20,booked:14},
  {id:"c4",date:"2026-10-01",day:"THU",time:"06:00",name:"Morning Ride",instructor:"Instructor TBC",rate:70,capacity:20,booked:4},
  {id:"c5",date:"2026-10-01",day:"THU",time:"09:00",name:"Morning Ride",instructor:"Instructor TBC",rate:70,capacity:20,booked:6},
  {id:"c6",date:"2026-10-01",day:"THU",time:"18:00",name:"Evening Ride",instructor:"Instructor TBC",rate:70,capacity:20,booked:12}
];

function getSettings(){
  const saved = JSON.parse(localStorage.getItem("sk_settings") || "null");
  return {...cfg,...(saved||{})};
}
function getClasses(){
  const managed = JSON.parse(localStorage.getItem("sk_classes_v1") || "null");
  return (Array.isArray(managed) && managed.length ? managed : DEMO_CLASSES).map(c=>({...c,title:c.name||c.title||"Ride"}));
}
function dt(c){return new Date(`${c.date}T${c.time}:00`)}
function stateFor(c){
  const s=getSettings();
  const left=Math.max(0,Number(c.capacity||s.capacity||20)-Number(c.booked||0));
  const occ=Number(c.booked||0)/Math.max(1,Number(c.capacity||20));
  const mins=(dt(c).getTime()-Date.now())/60000;
  if(mins<=0) return {label:"STARTED",cls:"closed",bookable:false};
  if(mins<=Number(s.onlineCutoffMinutes||20)) return {label:"BOOKING CLOSED",cls:"closed",bookable:false};
  if(left<=0) return {label:"FULL",cls:"full",bookable:false};
  if(occ>=Number(s.urgencyThreshold||.7)) return {label:"ALMOST FULL",cls:"warning",bookable:true};
  return {label:"OPEN",cls:"available",bookable:true};
}
function money(v){return v==null||v===""?"RATE TBC":`R${Number(v).toFixed(0)}`}
function bookHref(c){return `${getSettings().booklinkPublicUrl || "#"}#${encodeURIComponent(c.id)}`}

function homeCard(c){
  const st=stateFor(c);
  return `<article class="home-class ${st.cls}">
    <div class="time"><strong>${c.time}</strong><small>${c.day}</small></div>
    <div class="meta"><h3>${c.name}</h3><p>${c.instructor} · ${money(c.rate)}</p></div>
    <div class="state"><span class="status ${st.cls}">${st.label}</span>
      <a class="mini-book ${st.bookable?"":"disabled"}" href="${st.bookable?bookHref(c):"#"}">${st.bookable?"BOOK":"CLOSED"}</a>
    </div>
  </article>`;
}
function scheduleCard(c){
  const st=stateFor(c);
  const date=new Date(c.date+"T00:00:00").toLocaleDateString("en-ZA",{weekday:"short",day:"numeric",month:"short"}).toUpperCase();
  return `<article class="schedule-card ${st.cls}">
    <div class="schedule-date">${date} · ${c.time}</div>
    <div class="schedule-main"><div><h3>${c.name}</h3><span>${c.instructor}</span></div><strong class="price">${money(c.rate)}</strong></div>
    <div class="schedule-bottom"><span class="status ${st.cls}">${st.label}</span>
      <a class="mini-book ${st.bookable?"":"disabled"}" href="${st.bookable?bookHref(c):"#"}">${st.bookable?"BOOK":"CLOSED"}</a>
    </div>
  </article>`;
}

const classes=getClasses().filter(c=>dt(c).getTime()>Date.now()-3600000).sort((a,b)=>dt(a)-dt(b));
document.querySelector("#homeSchedule").innerHTML=classes.slice(0,3).map(homeCard).join("") || "<p>No upcoming classes.</p>";
document.querySelector("#scheduleGrid").innerHTML=classes.map(scheduleCard).join("") || "<p>No upcoming classes.</p>";
document.querySelector("#packageHelpBtn").addEventListener("click",()=>{
  const el=document.querySelector("#packageHelp"); el.hidden=!el.hidden;
});