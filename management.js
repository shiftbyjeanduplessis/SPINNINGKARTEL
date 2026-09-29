if(sessionStorage.getItem("sk_staff_auth")!=="1") location.replace("login.html");

const cfg=window.SPINNING_CONFIG||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const DEFAULT_CLASSES=[
{id:"c2",date:"2026-09-29",day:"TUE",time:"17:30",name:"Kartel Ride",instructor:"Tammy",rate:90,capacity:20,booked:14},
{id:"c3",date:"2026-09-29",day:"TUE",time:"19:00",name:"Evening Ride",instructor:"Student Instructor",rate:90,capacity:20,booked:18},
{id:"c4",date:"2026-09-30",day:"WED",time:"06:00",name:"Morning Ride",instructor:"Tammy",rate:90,capacity:20,booked:8}
];
let settings=JSON.parse(localStorage.getItem("sk_settings")||"null")||{
 capacity:cfg.capacity||20,urgencyThreshold:cfg.urgencyThreshold||.70,onlineCutoffMinutes:cfg.onlineCutoffMinutes||20,
 monthlyUnlimitedPrice:cfg.monthlyUnlimitedPrice||600,monthlyUnlimitedCredits:cfg.monthlyUnlimitedCredits||100,
 defaultInstructorBase:cfg.defaultInstructorBase||200,defaultInstructorCommission:cfg.defaultInstructorCommission||10
};
let classes=JSON.parse(localStorage.getItem("sk_classes_v1")||"null")||DEFAULT_CLASSES;
let walkins=JSON.parse(localStorage.getItem("sk_walkins_v1")||"[]");
let members=JSON.parse(localStorage.getItem("sk_members_v1")||"[]");
let instructors=JSON.parse(localStorage.getItem("sk_instructors_v1")||"null")||[
{id:"i1",name:"Tammy",role:"main",basePay:200,commissionRate:10},
{id:"i2",name:"Student Instructor",role:"student",basePay:150,commissionRate:10}
];
let attendance=JSON.parse(localStorage.getItem("sk_attendance_v1")||"{}");

function save(){
 localStorage.setItem("sk_settings",JSON.stringify(settings));
 localStorage.setItem("sk_classes_v1",JSON.stringify(classes));
 localStorage.setItem("sk_walkins_v1",JSON.stringify(walkins));
 localStorage.setItem("sk_members_v1",JSON.stringify(members));
 localStorage.setItem("sk_instructors_v1",JSON.stringify(instructors));
 localStorage.setItem("sk_attendance_v1",JSON.stringify(attendance));
}
function dt(c){return new Date(`${c.date}T${c.time}:00`)}
function stateFor(c){
 const left=Math.max(0,Number(c.capacity||settings.capacity)-Number(c.booked||0));
 const occ=Number(c.booked||0)/Math.max(1,Number(c.capacity||settings.capacity));
 const mins=(dt(c)-Date.now())/60000;
 if(mins<=0)return{left,label:"STARTED",cls:"closed",bookable:false};
 if(mins<=Number(settings.onlineCutoffMinutes))return{left,label:"ONLINE CLOSED",cls:"closed",bookable:false};
 if(left<=0)return{left,label:"FULL",cls:"full",bookable:false};
 if(occ>=Number(settings.urgencyThreshold))return{left,label:`ONLY ${left} LEFT!`,cls:"warning",bookable:true};
 return{left,label:"AVAILABLE",cls:"available",bookable:true};
}
function money(v){return v==null||v===""?"Rate TBC":`R${Number(v).toFixed(0)}`}
function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),1800)}
function todayKey(){return new Date().toISOString().slice(0,10)}
function todayClasses(){const k=todayKey();const found=classes.filter(c=>c.date===k);return found.length?found:classes.slice(0,2)}

function classRow(c){
 const st=stateFor(c),pct=Math.min(100,Math.round((c.booked/c.capacity)*100));
 return `<article class="class-row">
 <div class="time"><strong>${c.time}</strong><small>${c.day}</small></div>
 <div class="name"><strong>${c.name}</strong><span class="secondary-text">${money(c.rate)}</span></div>
 <div class="instructor secondary-text">${c.instructor}</div>
 <div class="cap"><strong>${c.booked} / ${c.capacity}</strong><div class="bar"><i style="width:${pct}%"></i></div><span class="badge ${st.cls}">${st.label}</span></div>
 <div class="row-actions"><button class="mini primary walkin-shortcut" data-id="${c.id}" ${st.left<=0?"disabled":""}>+ Walk-in</button><button class="mini attendance-shortcut" data-id="${c.id}">Attendance</button></div>
 </article>`;
}
function renderClasses(){
 $("#todayClasses").innerHTML=todayClasses().map(classRow).join("");
 $("#allClasses").innerHTML=classes.slice().sort((a,b)=>dt(a)-dt(b)).map(classRow).join("");
 $$(".walkin-shortcut").forEach(b=>b.onclick=()=>openWalkin(b.dataset.id));
 $$(".attendance-shortcut").forEach(b=>b.onclick=()=>{showView("instructors");const inp=document.querySelector(`.attendance[data-id="${b.dataset.id}"]`);if(inp){inp.focus();inp.scrollIntoView({behavior:"smooth",block:"center"})}});
 renderMetrics();fillWalkinOptions();renderPay();
}
function renderMetrics(){
 const list=todayClasses();$("#metricBookings").textContent=list.reduce((s,c)=>s+c.booked,0);$("#metricWalkins").textContent=walkins.filter(w=>w.date===todayKey()).length;$("#metricClasses").textContent=list.length;
 const next=classes.filter(c=>dt(c)>Date.now()).sort((a,b)=>dt(a)-dt(b))[0];$("#metricAvailable").textContent=next?stateFor(next).left:0;
}
function renderWalkins(){
 const el=$("#walkinList");const rows=walkins.slice().reverse().slice(0,8);
 el.innerHTML=rows.length?rows.map(w=>`<div class="walkin-row"><div><strong>${w.name}</strong><span>${w.mobile||"No mobile"}</span></div><div><strong>${w.className}</strong><span>${w.time}</span></div><div><strong>${w.payment}</strong><span>${money(w.amount)}</span></div><div><strong>Confirmed</strong><span>Booklink pending in demo</span></div></div>`).join(""):`<p class="muted">No walk-ins yet.</p>`;
}
function fillWalkinOptions(){
 const open=classes.filter(c=>stateFor(c).left>0&&dt(c)>Date.now()-3600000).sort((a,b)=>dt(a)-dt(b));
 $("#walkinClass").innerHTML=open.map(c=>`<option value="${c.id}">${c.day} ${c.time} · ${c.name} · ${stateFor(c).left} left</option>`).join("");
 updateWalkinNotice();
}
function updateWalkinNotice(){
 const c=classes.find(x=>x.id===$("#walkinClass").value),n=$("#walkinAvailability");
 if(!c){n.className="notice full";n.textContent="No class with available bikes.";return}
 const st=stateFor(c);n.className=`notice ${st.cls==="warning"?"warning":st.cls==="full"?"full":""}`;n.textContent=`${st.left} bike${st.left===1?"":"s"} available. Walk-ins remain allowed after online booking closes, subject to space.`;$("#walkinAmount").placeholder=c.rate?`Class rate R${c.rate}`:"Amount";
}
function openWalkin(id){
 fillWalkinOptions();if(id&&classes.some(c=>c.id===id))$("#walkinClass").value=id;updateWalkinNotice();$("#walkinDialog").showModal();
}

function monthKey(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`}
function monthLabel(){return new Date().toLocaleDateString("en-ZA",{month:"long",year:"numeric"}).toUpperCase()}
function monthRec(m){m.months=m.months||{};return m.months[monthKey()]||(m.months[monthKey()]={paid:false,issued:false})}
function renderMembers(){
 $("#memberMonth").textContent=monthLabel();
 const el=$("#membershipList");if(!members.length){el.innerHTML=`<p class="muted">No monthly members yet.</p>`;return}
 el.innerHTML=members.map(m=>{const r=monthRec(m),active=r.paid&&r.issued;return`<article class="member-row">
 <div><strong>${m.name}</strong><span class="sub">${m.mobile||m.email||"No contact"} · R${m.amount}/month</span></div>
 <label class="check"><input type="checkbox" class="paid-check" data-id="${m.id}" ${r.paid?"checked":""}> PayFast paid</label>
 <label class="check"><input type="checkbox" class="issued-check" data-id="${m.id}" ${r.issued?"checked":""} ${!r.paid?"disabled":""}> Booklink issued</label>
 <div><span class="status-pill ${active?"active":"pending"}">${active?"ACTIVE THIS MONTH":r.paid?"ISSUE PACKAGE":"CHECK PAYMENT"}</span><span class="sub">${m.payfastRef?`PayFast ${m.payfastRef}`:"No PayFast ref"}</span></div>
 <div class="row-actions"><button class="mini remove-member" data-id="${m.id}">Remove</button></div>
 </article>`}).join("");
 $$(".paid-check").forEach(x=>x.onchange=()=>{const m=members.find(v=>v.id===x.dataset.id),r=monthRec(m);r.paid=x.checked;if(!r.paid)r.issued=false;save();renderMembers()});
 $$(".issued-check").forEach(x=>x.onchange=()=>{const m=members.find(v=>v.id===x.dataset.id),r=monthRec(m);if(!r.paid)return;r.issued=x.checked;save();renderMembers()});
 $$(".remove-member").forEach(x=>x.onclick=()=>{const m=members.find(v=>v.id===x.dataset.id);if(confirm(`Remove ${m.name} from the active membership tracker?`)){members=members.filter(v=>v.id!==m.id);save();renderMembers()}});
}

function instructorFor(name){return instructors.find(i=>i.name.toLowerCase()===String(name).toLowerCase())||{id:"x"+name,name,role:"guest",basePay:settings.defaultInstructorBase,commissionRate:settings.defaultInstructorCommission}}
function payCalc(c){const i=instructorFor(c.instructor),a=attendance[c.id]==null?null:Number(attendance[c.id]);if(a==null)return{i,a:null,commRiders:0,comm:0,total:null};const cr=Math.max(a-5,0),comm=cr*Number(i.commissionRate);return{i,a,commRiders:cr,comm,total:Number(i.basePay)+comm}}
function renderPay(){
 const totals={};instructors.forEach(i=>totals[i.id]={i,classes:0,riders:0,comm:0,total:0});
 $("#payRows").innerHTML=classes.map(c=>{const p=payCalc(c);totals[p.i.id]=totals[p.i.id]||{i:p.i,classes:0,riders:0,comm:0,total:0};if(p.a!=null){totals[p.i.id].classes++;totals[p.i.id].riders+=p.a;totals[p.i.id].comm+=p.comm;totals[p.i.id].total+=p.total}
 return`<tr><td><strong>${c.day} ${c.time}</strong><br>${c.name}</td><td>${p.i.name}</td><td>${c.booked}</td><td><input class="attendance" data-id="${c.id}" type="number" min="0" max="${c.capacity}" value="${p.a==null?"":p.a}" placeholder="-"></td><td>R${p.i.basePay}</td><td>${p.a==null?"—":p.commRiders}</td><td>${p.a==null?"—":`R${p.comm}`}</td><td><strong>${p.total==null?"—":`R${p.total}`}</strong></td></tr>`}).join("");
 $$(".attendance").forEach(x=>x.onchange=()=>{attendance[x.dataset.id]=x.value===""?null:Math.max(0,Number(x.value));save();renderPay()});
 $("#instructorSummary").innerHTML=Object.values(totals).map(t=>`<article class="instructor-card"><strong>${t.i.name}</strong><span>${t.i.role}</span><span>R${t.i.basePay} base + R${t.i.commissionRate}/rider above 5</span><span>${t.classes} completed classes · ${t.riders} attended</span><span>Commission R${t.comm}</span><span class="total">R${t.total}</span></article>`).join("");
}
function renderCustomers(){
 const map=new Map();
 walkins.forEach(w=>map.set((w.email||w.mobile||w.name).toLowerCase(),{name:w.name,email:w.email||"",mobile:w.mobile||"",type:"Walk-in"}));
 members.forEach(m=>map.set((m.email||m.mobile||m.name).toLowerCase(),{name:m.name,email:m.email||"",mobile:m.mobile||"",type:"Monthly member"}));
 const rows=[...map.values()];$("#customerList").innerHTML=rows.length?rows.map(c=>`<div class="customer-row"><div><strong>${c.name}</strong><span>${c.type}</span></div><div><strong>${c.email||"—"}</strong><span>Email</span></div><div><strong>${c.mobile||"—"}</strong><span>Mobile</span></div><div><strong>Booklink source</strong><span>Production export</span></div></div>`).join(""):`<p class="muted">Production client database will come from Booklink. Demo records appear here after walk-ins or members are added.</p>`;
}

function renderSettings(){
 $("#setCapacity").value=settings.capacity;$("#setUrgency").value=Math.round(settings.urgencyThreshold*100);$("#setCutoff").value=settings.onlineCutoffMinutes;$("#setMembershipPrice").value=settings.monthlyUnlimitedPrice;$("#setMembershipCredits").value=settings.monthlyUnlimitedCredits;$("#setBasePay").value=settings.defaultInstructorBase;$("#setCommission").value=settings.defaultInstructorCommission;
}
function fillInstructorSelect(){$("#classInstructor").innerHTML=instructors.map(i=>`<option>${i.name}</option>`).join("")}
function showView(name){$$(".view").forEach(v=>v.classList.toggle("active",v.dataset.page===name));$$(".nav").forEach(v=>v.classList.toggle("active",v.dataset.view===name));if(name==="customers")renderCustomers();if(name==="settings")renderSettings()}
$$(".nav").forEach(n=>n.onclick=()=>showView(n.dataset.view));
$("#logoutBtn").onclick=()=>{sessionStorage.clear();location.href="login.html"};
$$("[data-open]").forEach(b=>b.onclick=()=>$("#"+b.dataset.open).showModal());
$$("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
$("#walkinClass").onchange=updateWalkinNotice;

$("#walkinForm").onsubmit=e=>{
 e.preventDefault();const c=classes.find(x=>x.id===$("#walkinClass").value);if(!c||stateFor(c).left<=0)return toast("Class is full.");
 c.booked++;walkins.push({id:"w"+Date.now(),date:todayKey(),classId:c.id,className:c.name,time:c.time,name:$("#walkinName").value.trim(),mobile:$("#walkinMobile").value.trim(),email:$("#walkinEmail").value.trim(),payment:$("#walkinPayment").value,amount:$("#walkinAmount").value===""?c.rate:Number($("#walkinAmount").value)});
 save();e.target.reset();$("#walkinDialog").close();renderClasses();renderWalkins();renderCustomers();toast("Walk-in added to demo roster.");
};
$("#classForm").onsubmit=e=>{
 e.preventDefault();const date=$("#classDate").value;classes.push({id:"c"+Date.now(),date,day:new Date(date+"T00:00:00").toLocaleDateString("en-ZA",{weekday:"short"}).toUpperCase(),time:$("#classTime").value,name:$("#className").value.trim(),instructor:$("#classInstructor").value,rate:Number($("#classRate").value),capacity:Number($("#classCapacity").value),booked:0});save();e.target.reset();$("#classCapacity").value=settings.capacity;$("#classDialog").close();renderClasses();toast("Demo class created.");
};
$("#memberForm").onsubmit=e=>{
 e.preventDefault();members.push({id:"m"+Date.now(),name:$("#memberName").value.trim(),mobile:$("#memberMobile").value.trim(),email:$("#memberEmail").value.trim(),amount:Number($("#memberAmount").value),payfastRef:$("#memberPayfastRef").value.trim(),months:{}});save();e.target.reset();$("#memberAmount").value=settings.monthlyUnlimitedPrice;$("#memberDialog").close();renderMembers();renderCustomers();toast("Member added.");
};
$("#instructorForm").onsubmit=e=>{
 e.preventDefault();instructors.push({id:"i"+Date.now(),name:$("#instructorName").value.trim(),role:$("#instructorRole").value,basePay:Number($("#instructorBase").value),commissionRate:Number($("#instructorCommission").value)});save();e.target.reset();$("#instructorBase").value=settings.defaultInstructorBase;$("#instructorCommission").value=settings.defaultInstructorCommission;$("#instructorDialog").close();fillInstructorSelect();renderPay();toast("Instructor added.");
};
$("#saveSettings").onclick=()=>{
 settings={capacity:Number($("#setCapacity").value),urgencyThreshold:Number($("#setUrgency").value)/100,onlineCutoffMinutes:Number($("#setCutoff").value),monthlyUnlimitedPrice:Number($("#setMembershipPrice").value),monthlyUnlimitedCredits:Number($("#setMembershipCredits").value),defaultInstructorBase:Number($("#setBasePay").value),defaultInstructorCommission:Number($("#setCommission").value)};save();renderClasses();toast("Settings saved.");
};

$("#classDate").value=todayKey();$("#classCapacity").value=settings.capacity;$("#memberAmount").value=settings.monthlyUnlimitedPrice;$("#instructorBase").value=settings.defaultInstructorBase;$("#instructorCommission").value=settings.defaultInstructorCommission;
fillInstructorSelect();renderClasses();renderWalkins();renderMembers();renderPay();renderCustomers();renderSettings();