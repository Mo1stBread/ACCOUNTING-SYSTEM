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
  renderTransactionsTab();
  populateJeTxnSelect();
  document.getElementById("jeLines").innerHTML=""; addJeLine(); addJeLine(); updateJeBalanceBar();
  renderJeTable();
  renderDashboard();
  document.getElementById("txnDate").value=new Date().toISOString().slice(0,10);
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
  renderAccounts(); renderAccountChips(); renderDashboard(); toast("Account added");
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

// ---------- Transactions ----------
function fmtDate(iso){return new Date(iso+"T00:00:00").toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});}
function shortId(id){ return id ? id.slice(0,8) : ""; }
document.getElementById("createTxnBtn").addEventListener("click", async ()=>{
  const dateEl=document.getElementById("txnDate"), descEl=document.getElementById("txnDesc");
  ["txnDate","txnDesc"].forEach(clearErr); let bad=false;
  if(!dateEl.value){ setErr("txnDate","Pick a date."); bad=true; }
  if(!descEl.value.trim()){ setErr("txnDesc","Describe this transaction."); bad=true; }
  if(bad) return;
  const row={owner_id:user.id, date:dateEl.value, description:descEl.value.trim(), is_adjustment:false};
  const {data,error}=await sb.from("transactions").insert(row).select().single();
  if(error){ toast("Couldn't create transaction: "+error.message); return; }
  transactions.push(data); descEl.value="";
  renderTransactionsTab(); renderDashboard(); populateJeTxnSelect();
  toast("Transaction created — now add its journal entries below");
  document.querySelectorAll("nav .tab").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelector('nav .tab[data-view="je"]').classList.add("active");
  document.getElementById("view-je").classList.add("active");
  document.getElementById("jeTxnSelect").value=data.id;
  onJeTxnChange();
});
function statusPill(status){ return `<span class="pill" style="color:${status==='Recorded'?'var(--good)':'var(--warn)'}">${status}</span>`; }
function renderTransactionsTab(){
  const tbody=document.querySelector("#txnTable tbody"); tbody.innerHTML="";
  const regular=transactions.filter(t=>!t.is_adjustment);
  document.getElementById("txnEmpty").style.display=regular.length?"none":"block";
  regular.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(t=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${fmtDate(t.date)}</td><td>${esc(t.description)}</td><td>${statusPill(txnStatus(t))}</td>
      <td><button class="iconbtn" data-view-id="${t.id}" title="View entries">👁</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-view-id]").forEach(b=>b.addEventListener("click",()=>showTxnDetail(b.dataset.viewId)));
  renderAccountChips();
}
function showTxnDetail(id){
  const t=transactions.find(x=>x.id===id); if(!t) return;
  const lines=journalEntries.filter(j=>j.transaction_id===id);
  const box=document.getElementById("txnDetail"); box.style.display="block";
  const rows=lines.map(l=>{ const a=accounts.find(x=>x.id===l.account_id);
    return `<tr><td>${a?esc(a.account_name):"—"}</td><td style="text-align:right">${Number(l.debit)>0?money(l.debit):"—"}</td><td style="text-align:right">${Number(l.credit)>0?money(l.credit):"—"}</td></tr>`;
  }).join("") || '<tr><td colspan="3" style="color:var(--muted)">No journal entries posted yet.</td></tr>';
  box.innerHTML=`<strong>Transaction ${shortId(t.id)}</strong> · ${fmtDate(t.date)} · ${esc(t.description)} · ${statusPill(txnStatus(t))}
    <table style="margin-top:10px"><thead><tr><th>Account</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function renderAccountChips(){
  const wrap=document.getElementById("accountChips"); wrap.innerHTML="";
  accounts.slice().sort((a,b)=>a.account_number.localeCompare(b.account_number,undefined,{numeric:true})).forEach(a=>{
    const b=document.createElement("button"); b.className="btn ghost"; b.style.fontSize="12px"; b.style.padding="6px 10px";
    b.textContent=a.account_number+" — "+a.account_name;
    b.addEventListener("click",()=>showAccountLedger(a.id));
    wrap.appendChild(b);
  });
}
function showAccountLedger(accountId){
  const a=accounts.find(x=>x.id===accountId); if(!a) return;
  const lines=journalEntries.filter(j=>j.account_id===accountId);
  const rows=lines.map(l=>{
    const t=transactions.find(x=>x.id===l.transaction_id);
    return `<tr><td>${shortId(l.id)}</td><td>${t?shortId(t.id):"—"}</td><td>${t?fmtDate(t.date):"—"}</td><td>${t?esc(t.description):"—"}</td>
      <td>${t?statusPill(txnStatus(t)):"—"}</td><td style="text-align:right">${Number(l.debit)>0?money(l.debit):"—"}</td><td style="text-align:right">${Number(l.credit)>0?money(l.credit):"—"}</td></tr>`;
  }).join("") || '<tr><td colspan="7" style="color:var(--muted)">No journal entries for this account yet.</td></tr>';
  document.getElementById("accountLedger").innerHTML=`<h2 style="font-size:14px">${esc(a.account_number)} — ${esc(a.account_name)}</h2>
    <div class="tablewrap"><table><thead><tr><th>Journal entry no.</th><th>Transaction ID</th><th>Date</th><th>Description</th><th>Status</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------- Journal Entries ----------
function populateJeTxnSelect(){
  const sel=document.getElementById("jeTxnSelect"); const cur=sel.value;
  sel.innerHTML='<option value="">Select a transaction…</option>'+transactions.filter(t=>!t.is_adjustment).slice().sort((a,b)=>b.date.localeCompare(a.date))
    .map(t=>`<option value="${t.id}">${fmtDate(t.date)} — ${esc(t.description)}</option>`).join("");
  if(cur) sel.value=cur;
}
document.getElementById("jeTxnSelect").addEventListener("change", onJeTxnChange);
function onJeTxnChange(){
  const id=document.getElementById("jeTxnSelect").value;
  const t=transactions.find(x=>x.id===id);
  document.getElementById("jeTxnStatus").textContent = t ? "Current status: "+txnStatus(t) : "";
}
function addJeLine(){
  const wrap=document.getElementById("jeLines");
  const row=document.createElement("div"); row.className="linegrid"; row.style.cssText="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:6px;";
  const sel=document.createElement("select"); sel.className="jeLineAcct";
  sel.innerHTML='<option value="">Select account…</option>'+accounts.slice().sort((a,b)=>a.account_number.localeCompare(b.account_number,undefined,{numeric:true}))
    .map(a=>`<option value="${a.id}">${esc(a.account_number)} — ${esc(a.account_name)}</option>`).join("");
  const d=document.createElement("input"); d.type="text"; d.inputMode="decimal"; d.placeholder="0.00"; d.className="jeLineDebit"; d.style.textAlign="right";
  const c=document.createElement("input"); c.type="text"; c.inputMode="decimal"; c.placeholder="0.00"; c.className="jeLineCredit"; c.style.textAlign="right";
  const rm=document.createElement("button"); rm.className="iconbtn"; rm.textContent="✕";
  rm.addEventListener("click",()=>{ if(wrap.children.length>2){row.remove();updateJeBalanceBar();} else toast("An entry needs at least two lines"); });
  [d,c].forEach(inp=>inp.addEventListener("input",()=>{ if(inp===d&&d.value)c.value=""; if(inp===c&&c.value)d.value=""; updateJeBalanceBar(); }));
  row.append(sel,d,c,rm); wrap.appendChild(row);
}
document.getElementById("addJeLineBtn").addEventListener("click", addJeLine);
function jeLineAmounts(){
  let debit=0,credit=0;
  document.querySelectorAll("#jeLines > div").forEach(r=>{ debit+=parseFloat(r.querySelector(".jeLineDebit").value)||0; credit+=parseFloat(r.querySelector(".jeLineCredit").value)||0; });
  return {debit,credit};
}
function updateJeBalanceBar(){
  const {debit,credit}=jeLineAmounts(); const bar=document.getElementById("jeBalanceBar"); const diff=Math.round((debit-credit)*100)/100;
  bar.textContent=`Debits ${money(debit)} · Credits ${money(credit)}`+(diff!==0?` · Out of balance by ${money(Math.abs(diff))}`:" · Balanced");
  bar.style.color = (diff===0&&debit>0) ? "var(--good)" : (diff!==0 ? "var(--bad)" : "var(--ink-2)");
}
document.getElementById("postJeBtn").addEventListener("click", async ()=>{
  clearErr("jeTxnSelect"); document.getElementById("err-jeLines").textContent="";
  const txnId=document.getElementById("jeTxnSelect").value; let bad=false;
  if(!txnId){ setErr("jeTxnSelect","Pick a transaction first."); bad=true; }
  const linesToInsert=[];
  document.querySelectorAll("#jeLines > div").forEach(r=>{
    const accId=r.querySelector(".jeLineAcct").value, dv=parseFloat(r.querySelector(".jeLineDebit").value)||0, cv=parseFloat(r.querySelector(".jeLineCredit").value)||0;
    if(accId&&(dv>0||cv>0)) linesToInsert.push({owner_id:user.id, transaction_id:txnId, account_id:accId, debit:dv, credit:cv});
  });
  if(linesToInsert.length<2){ document.getElementById("err-jeLines").textContent="Add at least two complete lines."; bad=true; }
  const {debit,credit}=jeLineAmounts();
  if(Math.round((debit-credit)*100)!==0){ document.getElementById("err-jeLines").textContent="Total debits must equal total credits."; bad=true; }
  if(debit===0){ document.getElementById("err-jeLines").textContent="Enter at least one amount greater than zero."; bad=true; }
  if(bad) return;
  const {data,error}=await sb.from("journal_entries").insert(linesToInsert).select();
  if(error){ toast("Couldn't post entry: "+error.message); return; }
  journalEntries.push(...data);
  document.getElementById("jeLines").innerHTML=""; addJeLine(); addJeLine(); updateJeBalanceBar(); onJeTxnChange();
  renderJeTable(); renderTransactionsTab(); renderDashboard(); toast("Journal entry posted");
});
function renderJeTable(){
  const tbody=document.querySelector("#jeTable tbody"); tbody.innerHTML="";
  document.getElementById("jeEmpty").style.display=journalEntries.length?"none":"block";
  journalEntries.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).forEach(l=>{
    const a=accounts.find(x=>x.id===l.account_id);
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${shortId(l.transaction_id)}</td><td>${a?esc(a.account_name):"—"}</td>
      <td style="text-align:right">${Number(l.debit)>0?money(l.debit):"—"}</td><td style="text-align:right">${Number(l.credit)>0?money(l.credit):"—"}</td>
      <td><button class="iconbtn" data-del="${l.id}">✕</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", async ()=>{
    if(!confirm("Delete this journal entry line?")) return;
    const {error}=await sb.from("journal_entries").delete().eq("id",b.dataset.del);
    if(error){ toast("Couldn't delete: "+error.message); return; }
    journalEntries=journalEntries.filter(x=>x.id!==b.dataset.del);
    renderJeTable(); renderTransactionsTab(); renderDashboard(); toast("Entry deleted");
  }));
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
