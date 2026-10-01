const cfg = window.SPINNING_CONFIG || {};

const CLASS_SLOTS = [
  {id:"slot-0530",time:"05:30",name:"Early Ride",rate:70,duration:45},
  {id:"slot-0800",time:"08:00",name:"Morning Ride",rate:70,duration:45},
  {id:"slot-1800",time:"18:00",name:"Evening Ride",rate:70,duration:45},
  {id:"slot-1900",time:"19:00",name:"Night Ride",rate:70,duration:45}
];

function getSettings(){
  const saved = JSON.parse(localStorage.getItem("sk_settings") || "null");
  return {...cfg,...(saved||{})};
}

function money(v){
  return v==null||v==="" ? "RATE TBC" : `R${Number(v).toFixed(0)}`;
}

function bookHref(){
  return getSettings().booklinkPublicUrl || "https://bklnk.co.za/spinningkartel";
}

function slotCard(c){
  return `<article class="home-class">
    <div class="time"><strong>${c.time}</strong><small>CLASS TIME</small></div>
    <div class="meta">
      <h3>${c.name}</h3>
      <p>${c.duration} min · ${money(c.rate)}</p>
    </div>
    <div class="state">
      <span class="status available">BOOK ONLINE</span>
      <a class="mini-book" href="${bookHref()}" aria-label="Book the ${c.time} Spinning Kartel class">BOOK</a>
    </div>
  </article>`;
}

const homeSchedule = document.querySelector("#homeSchedule");
if(homeSchedule) homeSchedule.innerHTML = CLASS_SLOTS.map(slotCard).join("");

const packageHelpBtn = document.querySelector("#packageHelpBtn");
if(packageHelpBtn){
  packageHelpBtn.addEventListener("click",()=>{
    const el=document.querySelector("#packageHelp");
    if(el) el.hidden=!el.hidden;
  });
}
