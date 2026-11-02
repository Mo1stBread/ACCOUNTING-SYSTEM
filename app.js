const SUPABASE_URL = "https://bztxlsjzpbcjyymqhdpf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dHhsc2p6cGJjanl5bXFoZHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzU5MzEsImV4cCI6MjEwODA1MTkzMX0.9oiDBBlbxxNepsgCApRckePOLs9lWbG5v8XxxmV72xQ";


(function(){
"use strict";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let user=null;
let accounts=[], transactions=[], journalEntries=[];

function normalSide(t){return (t==="Asset"||t==="Expense")?"Debit":"Credit";}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(n){return "₱"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200);}
function clearErr(id){document.getElementById("err-"+id).textContent="";document.getElementById(id).classList.remove("err");}
function setErr(id,m){document.getElementById("err-"+id).textContent=m;document.getElementById(id).classList.add("err");}

// ---------- Auth ----------
document.getElementById("authSignIn").addEventListener("click", async ()=>{
  const email=document.getElementById("authEmail").value.trim(), pass=document.getElementById("authPass").value;
  const {error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error) document.getElementById("authErr").textContent=error.message;
});
document.getElementById("authSignUp").addEventListener("click", async ()=>{
  const email=document.getElementById("authEmail").value.trim(), pass=document.getElementById("authPass").value;
  if(pass.length<6){ document.getElementById("authErr").textContent="Password must be at least 6 characters."; return; }
  const {error}=await sb.auth.signUp({email,password:pass});
  document.getElementById("authErr").textContent = error ? error.message : "Account created. Check your email if confirmation is required, then sign in.";
});
document.getElementById("signOutBtn").addEventListener("click", async ()=>{ await sb.auth.signOut(); });

sb.auth.onAuthStateChange((event, session)=>{
  user = session ? session.user : null;
  if(user){ document.getElementById("authScreen").style.display="none"; document.getElementById("appScreen").style.display="block"; boot(); }
  else{ document.getElementById("authScreen").style.display="block"; document.getElementById("appScreen").style.display="none"; }
});

// ---------- Data layer ----------
async function boot(){
  await loadAll();
  renderAccounts();
  renderDashboard();
}
async function loadAll(){
  const [a,t,j]=await Promise.all([
    sb.from("accounts").select("*").eq("owner_id",user.id),
    sb.from("transactions").select("*").eq("owner_id",user.id),
    sb.from("journal_entries").select("*").eq("owner_id",user.id)
  ]);
  if(a.error) toast("Couldn't load accounts: "+a.error.message);
  if(t.error) toast("Couldn't load transactions: "+t.error.message);
  if(j.error) toast("Couldn't load journal entries: "+j.error.message);
  accounts=a.data||[]; transactions=t.data||[]; journalEntries=j.data||[];
}

// ---------- Tabs ----------
document.querySelectorAll("nav .tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("nav .tab").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  btn.classList.add("active"); document.getElementById("view-"+btn.dataset.view).classList.add("active");
  if(btn.dataset.view==="dash") renderDashboard();
}));

// ---------- Chart of Accounts ----------
document.getElementById("addAccountBtn").addEventListener("click", async ()=>{
  const numEl=document.getElementById("coaNumber"), nameEl=document.getElementById("coaName"),
        typeEl=document.getElementById("coaType"), descEl=document.getElementById("coaDesc");
  ["coaNumber","coaName"].forEach(clearErr);
  const account_number=numEl.value.trim(), account_name=nameEl.value.trim(), account_type=typeEl.value;
  let bad=false;
  if(!account_number){ setErr("coaNumber","Account number is required."); bad=true; }
  else if(accounts.some(a=>a.account_number===account_number)){ setErr("coaNumber","That number is already used."); bad=true; }
  if(!account_name){ setErr("coaName","Account name is required."); bad=true; }
  if(bad) return;
  const row={owner_id:user.id, account_number, account_name, description:descEl.value.trim()||null, account_type, normal_balance:normalSide(account_type)};
  const {data,error}=await sb.from("accounts").insert(row).select().single();
  if(error){ toast("Couldn't add account: "+error.message); return; }
  accounts.push(data); numEl.value=""; nameEl.value=""; descEl.value="";
  renderAccounts(); renderDashboard(); toast("Account added");
});
function accountHasEntries(id){ return journalEntries.some(j=>j.account_id===id); }
function renderAccounts(){
  const tbody=document.querySelector("#coaTable tbody"); tbody.innerHTML="";
  document.getElementById("coaEmpty").style.display = accounts.length?"none":"block";
  accounts.slice().sort((a,b)=>a.account_number.localeCompare(b.account_number,undefined,{numeric:true})).forEach(a=>{
    const used=accountHasEntries(a.id); const tr=document.createElement("tr");
    tr.innerHTML=`<td>${esc(a.account_number)}</td><td>${esc(a.account_name)}</td><td style="color:var(--muted)">${esc(a.description||"—")}</td>
      <td><span class="pill">${a.account_type}</span></td><td><span class="pill">${a.normal_balance}</span></td>
      <td><button class="iconbtn" data-del="${a.id}" ${used?'disabled':''} title="${used?'Used in journal entries':'Delete'}">✕</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", async ()=>{
    if(!confirm("Delete this account?")) return;
    const {error}=await sb.from("accounts").delete().eq("id",b.dataset.del);
    if(error){ toast("Couldn't delete: "+error.message); return; }
    accounts=accounts.filter(a=>a.id!==b.dataset.del); renderAccounts(); renderDashboard(); toast("Account deleted");
  }));
}

// ---------- Dashboard ----------
function txnStatus(t){
  const lines=journalEntries.filter(j=>j.transaction_id===t.id);
  if(!lines.length) return "Pending";
  const d=lines.reduce((s,l)=>s+Number(l.debit),0), c=lines.reduce((s,l)=>s+Number(l.credit),0);
  return (d>0 && Math.round((d-c)*100)===0) ? "Recorded" : "Pending";
}
function renderDashboard(){
  const total=transactions.length;
  const recorded=transactions.filter(t=>txnStatus(t)==="Recorded").length;
  const pending=total-recorded;
  const original=transactions.filter(t=>!t.is_adjustment).length;
  const adjusting=transactions.filter(t=>!!t.is_adjustment).length;

  document.getElementById("statTotal").textContent=total;
  document.getElementById("statRecorded").textContent=recorded;
  document.getElementById("statPending").textContent=pending;
  document.getElementById("statOriginal").textContent=original;
  document.getElementById("statAdjusting").textContent=adjusting;

  // Trial balance status: net all recorded journal entries by account's normal balance, check totals match
  let totD=0, totC=0;
  accounts.forEach(a=>{
    const lines=journalEntries.filter(j=>j.account_id===a.id);
    const d=lines.reduce((s,l)=>s+Number(l.debit),0), c=lines.reduce((s,l)=>s+Number(l.credit),0);
    const net=d-c;
    if(a.normal_balance==="Debit"){ if(net>=0) totD+=net; else totC+=-net; } else { if(-net>=0) totC+=-net; else totD+=net; }
  });
  const balanced = Math.round((totD-totC)*100)===0;
  const tbEl=document.getElementById("statTbStatus");
  tbEl.textContent = journalEntries.length ? (balanced?"Balanced ✓":"Out of balance") : "No entries yet";
  tbEl.className = "statval "+(journalEntries.length ? (balanced?"good":"warn") : "");

  // Net income: Revenue (credit-normal) minus Expense (debit-normal)
  let revenue=0, expense=0;
  accounts.forEach(a=>{
    const lines=journalEntries.filter(j=>j.account_id===a.id);
    const d=lines.reduce((s,l)=>s+Number(l.debit),0), c=lines.reduce((s,l)=>s+Number(l.credit),0);
    if(a.account_type==="Revenue") revenue += (c-d);
    if(a.account_type==="Expense") expense += (d-c);
  });
  document.getElementById("statNetIncome").textContent = money(revenue-expense);

  // Donut: recorded vs pending share
  const donut=document.getElementById("donutChart"), legend=document.getElementById("donutLegend");
  if(total===0){
    donut.style.background="conic-gradient(var(--border) 0deg 360deg)";
    donut.setAttribute("data-center","No data yet");
    legend.innerHTML='<span style="color:var(--muted)">Add transactions to see this chart.</span>';
  } else {
    const pct=Math.round((recorded/total)*100);
    const deg=(recorded/total)*360;
    donut.style.background=`conic-gradient(var(--good) 0deg ${deg}deg, var(--warn) ${deg}deg 360deg)`;
    donut.setAttribute("data-center", pct+"% recorded");
    legend.innerHTML=`<div><span class="sw" style="background:var(--good)"></span>Recorded — ${recorded} (${pct}%)</div>
      <div><span class="sw" style="background:var(--warn)"></span>Pending — ${pending} (${100-pct}%)</div>`;
  }
}

// ---------- Export to Excel ----------
document.getElementById("exportBtn").addEventListener("click", ()=>{
  const wb=XLSX.utils.book_new();
  const coaRows=accounts.map(a=>({"Account Number":a.account_number,"Account Name":a.account_name,"Description":a.description||"","Type":a.account_type,"Normal Balance":a.normal_balance}));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coaRows), "Chart of Accounts");
  const txnRows=transactions.map(t=>({"Date":t.date,"Description":t.description,"Status":txnStatus(t),"Type":t.is_adjustment?"Adjusting":"Regular","Comment":t.comment||""}));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnRows), "Transactions");
  const jeRows=journalEntries.map(j=>{
    const a=accounts.find(x=>x.id===j.account_id);
    return {"Transaction ID":j.transaction_id,"Account Number":a?a.account_number:"","Account Name":a?a.account_name:"","Debit":j.debit,"Credit":j.credit};
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jeRows), "Journal Entries");
  XLSX.writeFile(wb, "ledgerline-export.xlsx");
  toast("Exported to Excel");
});
})();
