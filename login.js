
const emailForm=document.querySelector("#emailForm");
const codeForm=document.querySelector("#codeForm");
const msg=document.querySelector("#loginMessage");
emailForm.addEventListener("submit",e=>{
  e.preventDefault();
  const email=document.querySelector("#staffEmail").value.trim();
  sessionStorage.setItem("sk_pending_email",email);
  emailForm.hidden=true; codeForm.hidden=false;
  msg.textContent=`Demo code sent to ${email}.`;
});
codeForm.addEventListener("submit",e=>{
  e.preventDefault();
  if(document.querySelector("#staffCode").value!=="246810"){msg.textContent="Incorrect demo code.";return;}
  sessionStorage.setItem("sk_staff_auth","1");
  sessionStorage.setItem("sk_staff_email",sessionStorage.getItem("sk_pending_email")||"staff");
  location.href="management.html";
});
