const CONFIG = {
  price: 120,
  capacity: 20,
  paymentUrl: "", // Put a Yoco/PayFast checkout URL here for live redirect.
  classes: [
    { id:"sunrise", time:"06:00", name:"Sunrise Ride", coach:"Coach TBC", booked:14 },
    { id:"power", time:"07:00", name:"Power Ride", coach:"Coach TBC", booked:18 },
    { id:"afterwork", time:"17:30", name:"After Work Burn", coach:"Coach TBC", booked:11 },
    { id:"night", time:"18:30", name:"Night Ride", coach:"Coach TBC", booked:20 }
  ]
};

const list = document.querySelector('#classList');
const dateInput = document.querySelector('#rideDate');
const selectedSession = document.querySelector('#selectedSession');
const priceEl = document.querySelector('#bookingPrice');
const form = document.querySelector('#bookingForm');
const dialog = document.querySelector('#checkoutDialog');
const checkoutContent = document.querySelector('#checkoutContent');
const dialogClose = document.querySelector('#dialogClose');
let selected = null;

const today = new Date();
dateInput.min = today.toISOString().slice(0,10);
dateInput.value = today.toISOString().slice(0,10);
priceEl.textContent = `R${CONFIG.price}`;

function localKey(id){ return `spinningkartel-demo-${dateInput.value}-${id}`; }
function bookedFor(c){ return Math.min(CONFIG.capacity, c.booked + Number(localStorage.getItem(localKey(c.id))||0)); }
function leftFor(c){ return Math.max(0, CONFIG.capacity - bookedFor(c)); }

function render(){
  list.innerHTML = '';
  CONFIG.classes.forEach(c => {
    const left = leftFor(c);
    const row = document.createElement('div');
    row.className = `class-row ${selected?.id===c.id?'selected':''}`;
    const availabilityClass = left===0?'full':left<=3?'low':'';
    row.innerHTML = `
      <div class="class-time">${c.time}</div>
      <div class="class-name"><strong>${c.name}</strong><small>${c.coach}</small></div>
      <div class="availability ${availabilityClass}"><b>${left===0?'FULL':left}</b><br>${left===0?'JOIN WAITLIST':'BIKES LEFT'}</div>
      <div class="class-price">R${CONFIG.price}</div>
      <button class="mini-book" ${left===0?'disabled':''}>${left===0?'Full':'Book'}</button>`;
    if(left>0){ row.addEventListener('click',()=>selectClass(c)); }
    else { row.addEventListener('dblclick',()=>openWaitlist(c)); }
    list.appendChild(row);
  });
}

function selectClass(c){
  selected = c;
  selectedSession.textContent = `${dateLabel()} · ${c.time} · ${c.name}`;
  render();
  if(innerWidth < 880) document.querySelector('#bookingCard').scrollIntoView({behavior:'smooth', block:'start'});
}

function dateLabel(){
  const d = new Date(`${dateInput.value}T12:00:00`);
  return d.toLocaleDateString('en-ZA',{weekday:'short',day:'numeric',month:'short'});
}

dateInput.addEventListener('change',()=>{ selected=null; selectedSession.textContent='Choose a class on the left'; render(); });

dialogClose.addEventListener('click',()=>dialog.close());

form.addEventListener('submit', e => {
  e.preventDefault();
  if(!selected){
    selectedSession.animate([{background:'#40152e'},{background:'#0b0e14'}],{duration:700});
    return;
  }
  if(leftFor(selected)<=0){ render(); return; }
  const name = document.querySelector('#firstName').value.trim();
  const phone = document.querySelector('#mobile').value.trim();
  const email = document.querySelector('#email').value.trim();
  checkoutContent.innerHTML = `
    <div class="checkout-inner">
      <div class="checkmark">↗</div>
      <div class="eyebrow"><span></span>CHECKOUT</div>
      <h3>Secure your bike.</h3>
      <p>You're booking one of 20 bikes. The booking is confirmed only after payment succeeds.</p>
      <div class="checkout-ticket">
        <div><span>Rider</span><strong>${escapeHtml(name)}</strong></div>
        <div><span>Session</span><strong>${escapeHtml(selected.name)} · ${selected.time}</strong></div>
        <div><span>Date</span><strong>${dateLabel()}</strong></div>
        <div><span>Total</span><strong>R${CONFIG.price}</strong></div>
      </div>
      <button id="payNow" class="button button-full">Pay R${CONFIG.price} & confirm <span>→</span></button>
      <p class="checkout-note">Prototype: this button simulates a successful payment unless a live payment URL is added in <code>app.js</code>. Contact: ${escapeHtml(phone)} · ${escapeHtml(email)}</p>
    </div>`;
  dialog.showModal();
  document.querySelector('#payNow').addEventListener('click',()=>completePayment(name));
});

function completePayment(name){
  if(CONFIG.paymentUrl){
    window.location.href = CONFIG.paymentUrl;
    return;
  }
  const current = Number(localStorage.getItem(localKey(selected.id))||0);
  localStorage.setItem(localKey(selected.id), String(current+1));
  checkoutContent.innerHTML = `
    <div class="checkout-inner">
      <div class="checkmark">✓</div>
      <div class="eyebrow"><span></span>BOOKED</div>
      <h3>Bike secured.</h3>
      <p>${escapeHtml(name)}, your demo booking is confirmed for <strong>${selected.time} ${escapeHtml(selected.name)}</strong> on ${dateLabel()}.</p>
      <div class="checkout-ticket"><div><span>Class capacity</span><strong>${bookedFor(selected)} / ${CONFIG.capacity}</strong></div><div><span>Bikes remaining</span><strong>${leftFor(selected)}</strong></div></div>
      <button id="done" class="button button-full">Done</button>
    </div>`;
  render();
  document.querySelector('#done').addEventListener('click',()=>dialog.close());
}

function openWaitlist(c){
  checkoutContent.innerHTML = `<div class="checkout-inner"><div class="eyebrow"><span></span>WAITLIST</div><h3>${c.time} is full.</h3><p>Add your details and we can contact you if a bike opens up.</p><div class="waitlist-form"><input placeholder="Your name"><input placeholder="Mobile number"><button class="button button-full" onclick="document.getElementById('checkoutDialog').close()">Join waitlist</button></div></div>`;
  dialog.showModal();
}

function escapeHtml(str){
  return String(str).replace(/[&<>'"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
}
render();
