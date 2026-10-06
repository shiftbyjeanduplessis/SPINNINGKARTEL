const cfg=window.SPINNING_CONFIG||{};
const API=cfg.apiBaseUrl||"";
const form=document.querySelector("#loginForm");
const msg=document.querySelector("#loginMessage");

if(localStorage.getItem("sk_admin_token")) location.replace("management.html");

form.addEventListener("submit",async e=>{
  e.preventDefault();
  msg.textContent="Signing in…";
  const password=document.querySelector("#adminPassword").value;
  try{
    const r=await fetch(API+"/api/admin/login",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({password})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error==="too_many_attempts"?"Too many attempts. Try again in 15 minutes.":"Incorrect password.");
    localStorage.setItem("sk_admin_token",data.token);
    location.href="management.html";
  }catch(err){
    msg.textContent=err.message||"Could not sign in.";
  }
});
