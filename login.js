const cfg=window.SPINNING_CONFIG||{};
const API=cfg.apiBaseUrl||"";
const form=document.querySelector("#loginForm");
const msg=document.querySelector("#loginMessage");
const passwordInput=document.querySelector("#adminPassword");
const params=new URLSearchParams(location.search);
const requestedNext=params.get("next")||"management.html";
function safeNext(value){
  if(value==="management.html") return value;
  if(/^management\.html\?view=(today|analytics|rota|attendance|memberships|instructors|integration)$/.test(value)) return value;
  if(value==="instructors.html") return "management.html?view=instructors";
  return "management.html";
}
const NEXT=safeNext(requestedNext);

function readAdminToken(){
  try { const token=localStorage.getItem("sk_admin_token"); if(token) return token; } catch(e) {}
  try { return sessionStorage.getItem("sk_admin_token"); } catch(e) { return null; }
}
function clearAdminToken(){
  try { localStorage.removeItem("sk_admin_token"); } catch(e) {}
  try { sessionStorage.removeItem("sk_admin_token"); } catch(e) {}
}
function rememberAdminToken(token){
  if(!token) throw new Error("The server did not return a login session.");
  try {
    localStorage.setItem("sk_admin_token",token);
    if(localStorage.getItem("sk_admin_token")===token) return;
  } catch(e) {}
  // Some mobile/private browsers block persistent storage but allow tab storage.
  try {
    sessionStorage.setItem("sk_admin_token",token);
    if(sessionStorage.getItem("sk_admin_token")===token) return;
  } catch(e) {}
  throw new Error("Browser storage is blocked. Open this site in Safari or Chrome and allow site data.");
}
async function validateSavedSession(){
  const token=readAdminToken();
  if(!token) return false;
  try{
    const r=await fetch(API+"/api/admin/session",{
      headers:{"authorization":"Bearer "+token},
      cache:"no-store"
    });
    if(r.status===401 || r.status===403){
      clearAdminToken();
      return false;
    }
    if(!r.ok) throw new Error("Session service unavailable");
    location.replace(NEXT);
    return true;
  }catch(e){
    // Connection failures must not erase a valid remembered login.
    msg.textContent="Could not verify your saved session. Please retry if needed.";
    return false;
  }
}

form.addEventListener("submit",async e=>{
  e.preventDefault();
  msg.textContent="Signing in…";
  const password=passwordInput.value;
  try{
    const r=await fetch(API+"/api/admin/login",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({password}),
      cache:"no-store"
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(
      data.error==="too_many_attempts"
        ?"Too many attempts. Try again in 15 minutes."
        :r.status===401 ? "Incorrect password." : "Login service unavailable. Try again."
    );
    rememberAdminToken(data.token);
    passwordInput.value="";
    location.replace(NEXT);
  }catch(err){
    msg.textContent=err.message||"Could not sign in.";
    passwordInput.select();
  }
});

validateSavedSession();
