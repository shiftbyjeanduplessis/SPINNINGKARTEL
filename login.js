const cfg=window.SPINNING_CONFIG||{};
const API=cfg.apiBaseUrl||"";
const form=document.querySelector("#loginForm");
const msg=document.querySelector("#loginMessage");
const passwordInput=document.querySelector("#adminPassword");
const NEXT="management.html";

async function validateSavedSession(){
  const token=localStorage.getItem("sk_admin_token");
  if(!token) return false;
  try{
    const r=await fetch(API+"/api/admin/session",{
      headers:{"authorization":"Bearer "+token},
      cache:"no-store"
    });
    if(!r.ok) throw new Error("invalid");
    location.replace(NEXT);
    return true;
  }catch(e){
    localStorage.removeItem("sk_admin_token");
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
        :"Incorrect password."
    );
    localStorage.setItem("sk_admin_token",data.token);
    passwordInput.value="";
    location.replace(NEXT);
  }catch(err){
    msg.textContent=err.message||"Could not sign in.";
    passwordInput.select();
  }
});

validateSavedSession();
