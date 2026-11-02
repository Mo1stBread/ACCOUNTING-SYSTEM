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
  document.getElementById("jeLines").innerHTML=""; addLineRow("jeLines","jeBalanceBar"); addLineRow("jeLines","jeBalanceBar"); updateLineBalanceBar("jeLines","jeBalanceBar");
  renderJeTable();
  renderTrialBalance();
  resetAdjForm();
  renderAdjTable();
  renderAdjustedTrialBalance();
  renderDashboard();
  document.getElementById("txnDate").value=new Date().toISOString().slice(0,10);
  const today=new Date(), firstOfMonth=new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10), todayStr=today.toISOString().slice(0,10);
  document.getElementById("isStart").value=firstOfMonth; document.getElementById("isEnd").value=todayStr;
  document.getElementById("soeStart").value=firstOfMonth; document.getElementById("soeEnd").value=todayStr;
  renderIncomeStatement(); renderSOE();
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
async function deleteTxn(id){
  const lineCount=journalEntries.filter(j=>j.transaction_id===id).length;
  if(!confirm(lineCount ? `Delete this transaction and its ${lineCount} journal entry line(s)?` : "Delete this transaction?")) return;
  const {error}=await sb.from("transactions").delete().eq("id",id); // journal_entries cascade on delete
  if(error){ toast("Couldn't delete: "+error.message); return; }
  transactions=transactions.filter(t=>t.id!==id); journalEntries=journalEntries.filter(j=>j.transaction_id!==id);
  document.getElementById("txnDetail").style.display="none";
  renderTransactionsTab(); populateJeTxnSelect(); renderJeTable(); renderTrialBalance(); renderAdjustedTrialBalance(); renderDashboard();
  toast("Transaction deleted");
}
function statusPill(status){ return `<span class="pill" style="color:${status==='Recorded'?'var(--good)':'var(--warn)'}">${status}</span>`; }
function renderTransactionsTab(){
  const tbody=document.querySelector("#txnTable tbody"); tbody.innerHTML="";
  const regular=transactions.filter(t=>!t.is_adjustment);
  document.getElementById("txnEmpty").style.display=regular.length?"none":"block";
  regular.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(t=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${fmtDate(t.date)}</td><td>${esc(t.description)}</td><td>${statusPill(txnStatus(t))}</td>
      <td><button class="iconbtn" data-view-id="${t.id}" title="View entries">👁</button> <button class="iconbtn" data-del-txn="${t.id}" title="Delete">✕</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-view-id]").forEach(b=>b.addEventListener("click",()=>showTxnDetail(b.dataset.viewId)));
  tbody.querySelectorAll("[data-del-txn]").forEach(b=>b.addEventListener("click",()=>deleteTxn(b.dataset.delTxn)));
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
function addLineRow(wrapId,barId){
  const wrap=document.getElementById(wrapId);
  const row=document.createElement("div"); row.className="linegrid"; row.style.cssText="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:6px;";
  const sel=document.createElement("select"); sel.className="lineAcctSel";
  sel.innerHTML='<option value="">Select account…</option>'+accounts.slice().sort((a,b)=>a.account_number.localeCompare(b.account_number,undefined,{numeric:true}))
    .map(a=>`<option value="${a.id}">${esc(a.account_number)} — ${esc(a.account_name)}</option>`).join("");
  const d=document.createElement("input"); d.type="text"; d.inputMode="decimal"; d.placeholder="0.00"; d.className="lineDebitInp"; d.style.textAlign="right";
  const c=document.createElement("input"); c.type="text"; c.inputMode="decimal"; c.placeholder="0.00"; c.className="lineCreditInp"; c.style.textAlign="right";
  const rm=document.createElement("button"); rm.className="iconbtn"; rm.textContent="✕";
  rm.addEventListener("click",()=>{ if(wrap.children.length>2){row.remove();updateLineBalanceBar(wrapId,barId);} else toast("An entry needs at least two lines"); });
  [d,c].forEach(inp=>inp.addEventListener("input",()=>{ if(inp===d&&d.value)c.value=""; if(inp===c&&c.value)d.value=""; updateLineBalanceBar(wrapId,barId); }));
  row.append(sel,d,c,rm); wrap.appendChild(row);
}
document.getElementById("addJeLineBtn").addEventListener("click", ()=>addLineRow("jeLines","jeBalanceBar"));
function lineRowAmounts(wrapId){
  let debit=0,credit=0;
  document.querySelectorAll("#"+wrapId+" > div").forEach(r=>{ debit+=parseFloat(r.querySelector(".lineDebitInp").value)||0; credit+=parseFloat(r.querySelector(".lineCreditInp").value)||0; });
  return {debit,credit};
}
function updateLineBalanceBar(wrapId,barId){
  const {debit,credit}=lineRowAmounts(wrapId); const bar=document.getElementById(barId); const diff=Math.round((debit-credit)*100)/100;
  bar.textContent=`Debits ${money(debit)} · Credits ${money(credit)}`+(diff!==0?` · Out of balance by ${money(Math.abs(diff))}`:" · Balanced");
  bar.style.color = (diff===0&&debit>0) ? "var(--good)" : (diff!==0 ? "var(--bad)" : "var(--ink-2)");
}
document.getElementById("postJeBtn").addEventListener("click", async ()=>{
  clearErr("jeTxnSelect"); document.getElementById("err-jeLines").textContent="";
  const txnId=document.getElementById("jeTxnSelect").value; let bad=false;
  if(!txnId){ setErr("jeTxnSelect","Pick a transaction first."); bad=true; }
  const linesToInsert=[];
  document.querySelectorAll("#jeLines > div").forEach(r=>{
    const accId=r.querySelector(".lineAcctSel").value, dv=parseFloat(r.querySelector(".lineDebitInp").value)||0, cv=parseFloat(r.querySelector(".lineCreditInp").value)||0;
    if(accId&&(dv>0||cv>0)) linesToInsert.push({owner_id:user.id, transaction_id:txnId, account_id:accId, debit:dv, credit:cv});
  });
  if(linesToInsert.length<2){ document.getElementById("err-jeLines").textContent="Add at least two complete lines."; bad=true; }
  const {debit,credit}=lineRowAmounts("jeLines");
  if(Math.round((debit-credit)*100)!==0){ document.getElementById("err-jeLines").textContent="Total debits must equal total credits."; bad=true; }
  if(debit===0){ document.getElementById("err-jeLines").textContent="Enter at least one amount greater than zero."; bad=true; }
  if(bad) return;
  const {data,error}=await sb.from("journal_entries").insert(linesToInsert).select();
  if(error){ toast("Couldn't post entry: "+error.message); return; }
  journalEntries.push(...data);
  document.getElementById("jeLines").innerHTML=""; addLineRow("jeLines","jeBalanceBar"); addLineRow("jeLines","jeBalanceBar"); updateLineBalanceBar("jeLines","jeBalanceBar"); onJeTxnChange();
  renderJeTable(); renderTransactionsTab(); renderTrialBalance(); renderAdjustedTrialBalance(); renderDashboard(); toast("Journal entry posted");
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
    renderJeTable(); renderTransactionsTab(); renderTrialBalance(); renderAdjustedTrialBalance(); renderDashboard(); toast("Entry deleted");
  }));
}

// ---------- Trial Balance (unadjusted only) ----------
function netToCols(d,c,normalBalance){
  const net=d-c; let debitCol=0,creditCol=0;
  if(normalBalance==="Debit"){ if(net>=0)debitCol=net; else creditCol=-net; } else { if(-net>=0)creditCol=-net; else debitCol=net; }
  return {debitCol,creditCol};
}
function linesForAccount(accountId, adjOnly){
  const txnIds=new Set(transactions.filter(t=>!!t.is_adjustment===adjOnly).map(t=>t.id));
  return journalEntries.filter(j=>j.account_id===accountId && txnIds.has(j.transaction_id));
}
function renderTrialBalance(){
  const tbody=document.querySelector("#tbTable tbody"); tbody.innerHTML=""; let totD=0,totC=0;
  accounts.slice().sort((a,b)=>a.account_number.localeCompare(b.account_number,undefined,{numeric:true})).forEach(a=>{
    const lines=linesForAccount(a.id,false);
    const d=lines.reduce((s,l)=>s+Number(l.debit),0), c=lines.reduce((s,l)=>s+Number(l.credit),0);
    if(d===0&&c===0) return;
    const {debitCol,creditCol}=netToCols(d,c,a.normal_balance); totD+=debitCol; totC+=creditCol;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${esc(a.account_number)}</td><td>${esc(a.account_name)}</td><td><span class="pill">${a.account_type}</span></td>
      <td style="text-align:right">${debitCol!==0?money(debitCol):"—"}</td><td style="text-align:right">${creditCol!==0?money(creditCol):"—"}</td>`;
    tbody.appendChild(tr);
  });
  if(!tbody.children.length) tbody.innerHTML='<tr><td colspan="5" class="empty">Post a journal entry to see your trial balance.</td></tr>';
  const bar=document.getElementById("tbBalanceBar"); const diff=Math.round((totD-totC)*100)/100;
  bar.textContent=`Total debits ${money(totD)} · Total credits ${money(totC)}`+(diff===0?" · Balanced ✓":` · Out of balance by ${money(Math.abs(diff))}`);
  bar.style.color = diff===0 ? "var(--good)" : "var(--bad)";
}

// ---------- Adjusting Entries ----------
let editingAdjTxnId=null;
document.getElementById("addAdjLineBtn").addEventListener("click", ()=>addLineRow("adjLines","adjBalanceBar"));
document.getElementById("cancelAdjEditBtn").addEventListener("click", resetAdjForm);
function resetAdjForm(){
  editingAdjTxnId=null;
  document.getElementById("adjFormTitle").textContent="New adjusting entry";
  document.getElementById("postAdjBtn").textContent="Post adjusting entry";
  document.getElementById("cancelAdjEditBtn").style.display="none";
  document.getElementById("adjDate").value=new Date().toISOString().slice(0,10);
  document.getElementById("adjDesc").value=""; document.getElementById("adjComment").value="";
  document.getElementById("adjLines").innerHTML=""; addLineRow("adjLines","adjBalanceBar"); addLineRow("adjLines","adjBalanceBar"); updateLineBalanceBar("adjLines","adjBalanceBar");
}
function editAdjEntry(txnId){
  const t=transactions.find(x=>x.id===txnId); if(!t) return;
  editingAdjTxnId=txnId;
  document.getElementById("adjFormTitle").textContent="Editing adjusting entry";
  document.getElementById("postAdjBtn").textContent="Save changes";
  document.getElementById("cancelAdjEditBtn").style.display="inline-block";
  document.getElementById("adjDate").value=t.date; document.getElementById("adjDesc").value=t.description; document.getElementById("adjComment").value=t.comment||"";
  const wrap=document.getElementById("adjLines"); wrap.innerHTML="";
  const lines=journalEntries.filter(j=>j.transaction_id===txnId);
  (lines.length?lines:[{},{}]).forEach(()=>addLineRow("adjLines","adjBalanceBar"));
  const rows=wrap.querySelectorAll(":scope > div");
  lines.forEach((l,i)=>{ if(!rows[i]) return; rows[i].querySelector(".lineAcctSel").value=l.account_id;
    if(Number(l.debit)>0) rows[i].querySelector(".lineDebitInp").value=l.debit; if(Number(l.credit)>0) rows[i].querySelector(".lineCreditInp").value=l.credit; });
  updateLineBalanceBar("adjLines","adjBalanceBar");
  document.querySelector('#view-adj .card').scrollIntoView({behavior:"smooth"});
}
document.getElementById("postAdjBtn").addEventListener("click", async ()=>{
  ["adjDate","adjDesc"].forEach(clearErr); document.getElementById("err-adjLines").textContent="";
  const dateEl=document.getElementById("adjDate"), descEl=document.getElementById("adjDesc"), commentEl=document.getElementById("adjComment");
  let bad=false;
  if(!dateEl.value){ setErr("adjDate","Pick a date."); bad=true; }
  if(!descEl.value.trim()){ setErr("adjDesc","Describe this adjustment."); bad=true; }
  if(!commentEl.value.trim()){ document.getElementById("err-adjLines").textContent="An explanation is required for adjusting entries."; bad=true; }
  const lines=[];
  document.querySelectorAll("#adjLines > div").forEach(r=>{
    const accId=r.querySelector(".lineAcctSel").value, dv=parseFloat(r.querySelector(".lineDebitInp").value)||0, cv=parseFloat(r.querySelector(".lineCreditInp").value)||0;
    if(accId&&(dv>0||cv>0)) lines.push({account_id:accId, debit:dv, credit:cv});
  });
  if(lines.length<2){ document.getElementById("err-adjLines").textContent="Add at least two complete lines."; bad=true; }
  const {debit,credit}=lineRowAmounts("adjLines");
  if(Math.round((debit-credit)*100)!==0){ document.getElementById("err-adjLines").textContent="Total debits must equal total credits."; bad=true; }
  if(debit===0){ document.getElementById("err-adjLines").textContent="Enter at least one amount greater than zero."; bad=true; }
  if(bad) return;

  if(editingAdjTxnId){
    const {data:updated,error:upErr}=await sb.from("transactions").update({date:dateEl.value,description:descEl.value.trim(),comment:commentEl.value.trim()}).eq("id",editingAdjTxnId).select().single();
    if(upErr){ toast("Couldn't save: "+upErr.message); return; }
    const {error:delErr}=await sb.from("journal_entries").delete().eq("transaction_id",editingAdjTxnId);
    if(delErr){ toast("Couldn't update lines: "+delErr.message); return; }
    const {data:newLines,error:insErr}=await sb.from("journal_entries").insert(lines.map(l=>({...l,owner_id:user.id,transaction_id:editingAdjTxnId}))).select();
    if(insErr){ toast("Couldn't save lines: "+insErr.message); return; }
    transactions=transactions.map(t=>t.id===editingAdjTxnId?updated:t);
    journalEntries=journalEntries.filter(j=>j.transaction_id!==editingAdjTxnId).concat(newLines);
    toast("Adjusting entry updated");
  } else {
    const {data:newTxn,error:txErr}=await sb.from("transactions").insert({owner_id:user.id,date:dateEl.value,description:descEl.value.trim(),comment:commentEl.value.trim(),is_adjustment:true}).select().single();
    if(txErr){ toast("Couldn't create entry: "+txErr.message); return; }
    const {data:newLines,error:insErr}=await sb.from("journal_entries").insert(lines.map(l=>({...l,owner_id:user.id,transaction_id:newTxn.id}))).select();
    if(insErr){ toast("Couldn't save lines: "+insErr.message); return; }
    transactions.push(newTxn); journalEntries.push(...newLines);
    toast("Adjusting entry posted");
  }
  resetAdjForm();
  renderAdjTable(); renderDashboard(); renderTrialBalance(); renderAdjustedTrialBalance();
});
async function deleteAdjEntry(txnId){
  if(!confirm("Delete this adjusting entry and its lines?")) return;
  const {error}=await sb.from("transactions").delete().eq("id",txnId); // journal_entries cascade on delete
  if(error){ toast("Couldn't delete: "+error.message); return; }
  transactions=transactions.filter(t=>t.id!==txnId); journalEntries=journalEntries.filter(j=>j.transaction_id!==txnId);
  renderAdjTable(); renderDashboard(); renderTrialBalance(); renderAdjustedTrialBalance(); toast("Adjusting entry deleted");
}
function renderAdjTable(){
  const tbody=document.querySelector("#adjTable tbody"); tbody.innerHTML="";
  const adjs=transactions.filter(t=>!!t.is_adjustment);
  document.getElementById("adjEmpty").style.display=adjs.length?"none":"block";
  adjs.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(t=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${fmtDate(t.date)}</td><td>${esc(t.description)}</td><td style="color:var(--ink-2)">${esc(t.comment||"—")}</td><td>${statusPill(txnStatus(t))}</td>
      <td><button class="iconbtn" data-edit="${t.id}" title="Edit">✎</button> <button class="iconbtn" data-del="${t.id}" title="Delete">✕</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>editAdjEntry(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>deleteAdjEntry(b.dataset.del)));
}

// ---------- Adjusted Trial Balance ----------
function renderAdjustedTrialBalance(){
  const tbody=document.querySelector("#atbTable tbody"); tbody.innerHTML="";
  let totU_d=0,totU_c=0,totA_d=0,totA_c=0,totF_d=0,totF_c=0;
  accounts.slice().sort((a,b)=>a.account_number.localeCompare(b.account_number,undefined,{numeric:true})).forEach(a=>{
    const uLines=linesForAccount(a.id,false), aLines=linesForAccount(a.id,true);
    const ud=uLines.reduce((s,l)=>s+Number(l.debit),0), uc=uLines.reduce((s,l)=>s+Number(l.credit),0);
    const ad=aLines.reduce((s,l)=>s+Number(l.debit),0), ac=aLines.reduce((s,l)=>s+Number(l.credit),0);
    if(ud===0&&uc===0&&ad===0&&ac===0) return;
    const U=netToCols(ud,uc,a.normal_balance), A=netToCols(ad,ac,a.normal_balance), F=netToCols(ud+ad,uc+ac,a.normal_balance);
    totU_d+=U.debitCol; totU_c+=U.creditCol; totA_d+=A.debitCol; totA_c+=A.creditCol; totF_d+=F.debitCol; totF_c+=F.creditCol;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${esc(a.account_number)}</td><td>${esc(a.account_name)}</td><td><span class="pill">${a.account_type}</span></td>
      <td style="text-align:right">${U.debitCol!==0?money(U.debitCol):"—"}</td><td style="text-align:right">${U.creditCol!==0?money(U.creditCol):"—"}</td>
      <td style="text-align:right">${A.debitCol!==0?money(A.debitCol):"—"}</td><td style="text-align:right">${A.creditCol!==0?money(A.creditCol):"—"}</td>
      <td style="text-align:right">${F.debitCol!==0?money(F.debitCol):"—"}</td><td style="text-align:right">${F.creditCol!==0?money(F.creditCol):"—"}</td>`;
    tbody.appendChild(tr);
  });
  if(!tbody.children.length) tbody.innerHTML='<tr><td colspan="9" class="empty">Post a transaction to see your adjusted trial balance.</td></tr>';
  const bar=document.getElementById("atbBalanceBar"); const diff=Math.round((totF_d-totF_c)*100)/100;
  bar.textContent=`Unadjusted ${money(totU_d)} / ${money(totU_c)} · Adjustments ${money(totA_d)} / ${money(totA_c)} · Adjusted ${money(totF_d)} / ${money(totF_c)}`+(diff===0?" · Balanced ✓":` · Out of balance by ${money(Math.abs(diff))}`);
  bar.style.color = diff===0 ? "var(--good)" : "var(--bad)";

  // Pinpoint exactly which transactions are unbalanced (e.g. a line was deleted after posting)
  const byTxn={};
  journalEntries.forEach(l=>{ byTxn[l.transaction_id]=byTxn[l.transaction_id]||{d:0,c:0}; byTxn[l.transaction_id].d+=Number(l.debit); byTxn[l.transaction_id].c+=Number(l.credit); });
  const offenders=Object.entries(byTxn).filter(([id,s])=>Math.round((s.d-s.c)*100)!==0).map(([id,s])=>{
    const t=transactions.find(x=>x.id===id);
    return {t,diff:s.d-s.c};
  }).filter(o=>o.t);
  const missEl=document.getElementById("atbMissing");
  if(offenders.length){
    missEl.style.display="block";
    missEl.innerHTML="⚠ These transactions don't balance on their own, which is throwing off the totals above:<br>"+
      offenders.map(o=>`• ${fmtDate(o.t.date)} — ${esc(o.t.description)} (short by ${money(Math.abs(o.diff))} on the ${o.diff>0?"credit":"debit"} side)`).join("<br>");
  } else { missEl.style.display="none"; }
}

// ---------- Shared period helpers ----------
function entriesForAccountInRange(accountId, start, end){
  const txnIds=new Set(transactions.filter(t=>t.date>=start && t.date<=end).map(t=>t.id));
  return journalEntries.filter(j=>j.account_id===accountId && txnIds.has(j.transaction_id));
}
function entriesForAccountBefore(accountId, beforeDate){
  const txnIds=new Set(transactions.filter(t=>t.date<beforeDate).map(t=>t.id));
  return journalEntries.filter(j=>j.account_id===accountId && txnIds.has(j.transaction_id));
}
function netAmount(lines, normalBalance){
  const d=lines.reduce((s,l)=>s+Number(l.debit),0), c=lines.reduce((s,l)=>s+Number(l.credit),0);
  return normalBalance==="Debit" ? d-c : c-d;
}
function computeNetIncome(start,end){
  let revenue=0, expense=0;
  accounts.forEach(a=>{
    const lines=entriesForAccountInRange(a.id,start,end);
    if(a.account_type==="Revenue") revenue+=netAmount(lines,"Credit");
    if(a.account_type==="Expense") expense+=netAmount(lines,"Debit");
  });
  return {revenue,expense,netIncome:revenue-expense};
}

// ---------- Income Statement ----------
function renderIncomeStatement(){
  const start=document.getElementById("isStart").value, end=document.getElementById("isEnd").value;
  const out=document.getElementById("isOutput");
  if(!start||!end){ out.innerHTML='<p class="empty">Pick a start and end date.</p>'; return; }
  const revRows=accounts.filter(a=>a.account_type==="Revenue").map(a=>({a,amt:netAmount(entriesForAccountInRange(a.id,start,end),"Credit")})).filter(r=>r.amt!==0);
  const expRows=accounts.filter(a=>a.account_type==="Expense").map(a=>({a,amt:netAmount(entriesForAccountInRange(a.id,start,end),"Debit")})).filter(r=>r.amt!==0);
  const totalRev=revRows.reduce((s,r)=>s+r.amt,0), totalExp=expRows.reduce((s,r)=>s+r.amt,0);
  const row=r=>`<tr><td>${esc(r.a.account_name)}</td><td style="text-align:right">${money(r.amt)}</td></tr>`;
  out.innerHTML=`<p class="sub">For the period ${fmtDate(start)} – ${fmtDate(end)}</p>
    <table><thead><tr><th>Revenue</th><th style="text-align:right"></th></tr></thead><tbody>
      ${revRows.map(row).join("")||'<tr><td colspan="2" class="empty">None</td></tr>'}
      <tr><td><strong>Total revenue</strong></td><td style="text-align:right"><strong>${money(totalRev)}</strong></td></tr>
    </tbody></table>
    <table style="margin-top:14px"><thead><tr><th>Expenses</th><th style="text-align:right"></th></tr></thead><tbody>
      ${expRows.map(row).join("")||'<tr><td colspan="2" class="empty">None</td></tr>'}
      <tr><td><strong>Total expenses</strong></td><td style="text-align:right"><strong>${money(totalExp)}</strong></td></tr>
    </tbody></table>
    <div class="balancebar" style="margin-top:14px;padding:12px;border-radius:8px;background:var(--surface-2);font-weight:700;color:${totalRev-totalExp>=0?'var(--good)':'var(--bad)'}">
      Net ${totalRev-totalExp>=0?"income":"loss"}: ${money(Math.abs(totalRev-totalExp))}
    </div>`;
}
document.getElementById("isStart").addEventListener("change", renderIncomeStatement);
document.getElementById("isEnd").addEventListener("change", renderIncomeStatement);

// ---------- Statement of Owner's Equity ----------
function isDrawing(a){ return a.account_type==="Equity" && /draw/i.test(a.account_name); }
function renderSOE(){
  const start=document.getElementById("soeStart").value, end=document.getElementById("soeEnd").value;
  const out=document.getElementById("soeOutput");
  if(!start||!end){ out.innerHTML='<p class="empty">Pick a start and end date.</p>'; return; }
  let beginning=0, investments=0, drawings=0;
  accounts.filter(a=>a.account_type==="Equity").forEach(a=>{
    beginning += netAmount(entriesForAccountBefore(a.id,start),"Credit");
    const periodLines=entriesForAccountInRange(a.id,start,end);
    if(isDrawing(a)) drawings += netAmount(periodLines,"Debit");
    else investments += netAmount(periodLines,"Credit");
  });
  const {netIncome}=computeNetIncome(start,end);
  const ending=beginning+investments+netIncome-drawings;
  out.innerHTML=`<p class="sub">For the period ${fmtDate(start)} – ${fmtDate(end)}</p>
    <table><tbody>
      <tr><td>Beginning capital</td><td style="text-align:right">${money(beginning)}</td></tr>
      <tr><td>Add: Owner investments</td><td style="text-align:right">${money(investments)}</td></tr>
      <tr><td>Add: Net income (or less: net loss)</td><td style="text-align:right">${money(netIncome)}</td></tr>
      <tr><td>Less: Owner drawings</td><td style="text-align:right">(${money(drawings)})</td></tr>
      <tr><td><strong>Ending capital</strong></td><td style="text-align:right"><strong>${money(ending)}</strong></td></tr>
    </tbody></table>`;
}
document.getElementById("soeStart").addEventListener("change", renderSOE);
document.getElementById("soeEnd").addEventListener("change", renderSOE);

// ---------- Export to Excel ----------
document.getElementById("exportBtn").addEventListener("click", ()=>{
  const wb=XLSX.utils.book_new();
  const coaRows=accounts.map(a=>({"Account Number":a.account_number,"Account Name":a.account_name,"Description":a.description||"","Type":a.account_type,"Normal Balance":a.normal_balance}));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coaRows), "Chart of Accounts");

  const txnRows=transactions.map(t=>({"Date":t.date,"Description":t.description,"Status":txnStatus(t),"Type":t.is_adjustment?"Adjusting":"Regular","Comment":t.comment||""}));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnRows), "Transactions");

  const jeRows=journalEntries.map(j=>{
    const a=accounts.find(x=>x.id===j.account_id), t=transactions.find(x=>x.id===j.transaction_id);
    return {"Transaction ID":j.transaction_id,"Date":t?t.date:"","Account Number":a?a.account_number:"","Account Name":a?a.account_name:"","Debit":Number(j.debit),"Credit":Number(j.credit)};
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jeRows), "Journal Entries");

  const tbRows=[]; accounts.forEach(a=>{ const lines=linesForAccount(a.id,false); const d=lines.reduce((s,l)=>s+Number(l.debit),0), c=lines.reduce((s,l)=>s+Number(l.credit),0);
    if(d===0&&c===0) return; const {debitCol,creditCol}=netToCols(d,c,a.normal_balance);
    tbRows.push({"Account Number":a.account_number,"Account Name":a.account_name,"Debit":debitCol||"","Credit":creditCol||""}); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tbRows), "Trial Balance");

  const atbRows=[]; accounts.forEach(a=>{ const uL=linesForAccount(a.id,false), aL=linesForAccount(a.id,true);
    const ud=uL.reduce((s,l)=>s+Number(l.debit),0), uc=uL.reduce((s,l)=>s+Number(l.credit),0), ad=aL.reduce((s,l)=>s+Number(l.debit),0), ac=aL.reduce((s,l)=>s+Number(l.credit),0);
    if(ud===0&&uc===0&&ad===0&&ac===0) return; const F=netToCols(ud+ad,uc+ac,a.normal_balance);
    atbRows.push({"Account Number":a.account_number,"Account Name":a.account_name,"Adjusted Debit":F.debitCol||"","Adjusted Credit":F.creditCol||""}); });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(atbRows), "Adjusted Trial Balance");

  const isStart=document.getElementById("isStart").value, isEnd=document.getElementById("isEnd").value;
  if(isStart && isEnd){
    const revRows=accounts.filter(a=>a.account_type==="Revenue").map(a=>({"Line":a.account_name,"Amount":netAmount(entriesForAccountInRange(a.id,isStart,isEnd),"Credit")})).filter(r=>r.Amount!==0);
    const expRows=accounts.filter(a=>a.account_type==="Expense").map(a=>({"Line":a.account_name,"Amount":netAmount(entriesForAccountInRange(a.id,isStart,isEnd),"Debit")})).filter(r=>r.Amount!==0);
    const {revenue,expense,netIncome}=computeNetIncome(isStart,isEnd);
    const isRows=[{"Line":"Period","Amount":isStart+" to "+isEnd},{},...revRows,{"Line":"Total Revenue","Amount":revenue},{},...expRows,{"Line":"Total Expenses","Amount":expense},{},{"Line":"Net Income","Amount":netIncome}];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(isRows), "Income Statement");
  }

  const soeStart=document.getElementById("soeStart").value, soeEnd=document.getElementById("soeEnd").value;
  if(soeStart && soeEnd){
    let beginning=0, investments=0, drawings=0;
    accounts.filter(a=>a.account_type==="Equity").forEach(a=>{
      beginning+=netAmount(entriesForAccountBefore(a.id,soeStart),"Credit");
      const pl=entriesForAccountInRange(a.id,soeStart,soeEnd);
      if(isDrawing(a)) drawings+=netAmount(pl,"Debit"); else investments+=netAmount(pl,"Credit");
    });
    const {netIncome}=computeNetIncome(soeStart,soeEnd);
    const soeRows=[{"Line":"Period","Amount":soeStart+" to "+soeEnd},{"Line":"Beginning Capital","Amount":beginning},{"Line":"Owner Investments","Amount":investments},
      {"Line":"Net Income","Amount":netIncome},{"Line":"Owner Drawings","Amount":-drawings},{"Line":"Ending Capital","Amount":beginning+investments+netIncome-drawings}];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(soeRows), "Statement of Owner's Equity");
  }

  XLSX.writeFile(wb, "ledgerline-export.xlsx");
  toast("Exported to Excel");
});
})();
