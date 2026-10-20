const SUPABASE_URL = "https://bztxlsjzpbcjyymqhdpf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6dHhsc2p6cGJjanl5bXFoZHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NzU5MzEsImV4cCI6MjEwODA1MTkzMX0.9oiDBBlbxxNepsgCApRckePOLs9lWbG5v8XxxmV72xQ";

(function(){
"use strict";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let user=null, myRow=null, viewingId=null, viewingOwn=true, channel=null;
let state = { accounts:[], txns:[], fyEnabled:false, fyStartMonth:1, currency:"PHP" };
const defaultAccounts=[{code:"1000",name:"Cash",type:"Asset"},{code:"1100",name:"Accounts Receivable",type:"Asset"},
 {code:"2000",name:"Accounts Payable",type:"Liability"},{code:"3000",name:"Owner's Equity",type:"Equity"},
 {code:"4000",name:"Service Revenue",type:"Revenue"},{code:"5000",name:"Rent Expense",type:"Expense"}];
const currencySymbols={PHP:"₱",USD:"$"};

function normalSide(t){return (t==="Asset"||t==="Expense")?"Debit":"Credit";}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(n){const s=currencySymbols[state.currency]||"$";return (n<0?"-"+s:s)+Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}
function moneyCell(n){const s=currencySymbols[state.currency]||"$";const v=(n<0?"-":"")+Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});return `<span class="amt"><span class="sym">${s}</span><span class="val">${v}</span></span>`;}
function fmtDate(iso){return new Date(iso+"T00:00:00").toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"});}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
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
  else{ document.getElementById("authScreen").style.display="block"; document.getElementById("appScreen").style.display="none"; if(channel) sb.removeChannel(channel); }
});

// ---------- Data layer ----------
const params=new URLSearchParams(location.search);
const sharedParam=params.get("ledger");

async function boot(){
  if(sharedParam){
    viewingId=sharedParam; viewingOwn=false;
    const {data,error}=await sb.from("ledgers").select("*").eq("id",sharedParam).single();
    if(error || !data || !data.is_shared){ toast("That shared ledger isn't available."); return openOwn(); }
    myRow=data; viewingOwn = data.owner_id===user.id;
    state=Object.assign(state, data.data||{});
  } else {
    await openOwn();
  }
  applyStateToUI(); subscribeRealtime();
}
async function openOwn(){
  viewingOwn=true;
  let {data}=await sb.from("ledgers").select("*").eq("owner_id",user.id).maybeSingle();
  if(!data){
    const seed={accounts:defaultAccounts.map(a=>({...a,normalBalance:normalSide(a.type)})),txns:[],fyEnabled:false,fyStartMonth:1,currency:"PHP"};
    const {data:created,error}=await sb.from("ledgers").insert({owner_id:user.id,data:seed,is_shared:false}).select().single();
    if(error){ toast("Couldn't create your ledger: "+error.message); return; }
    data=created;
  }
  myRow=data; viewingId=data.id; state=Object.assign(state,data.data||{});
}
async function persist(){
  if(!viewingOwn && !(myRow && myRow.is_shared)) return; // read-only viewer of someone else's unshared row (shouldn't happen)
  const {error}=await sb.from("ledgers").update({data:state, updated_at:new Date().toISOString()}).eq("id",viewingId);
  if(error) toast("Sync failed: "+error.message);
}
function subscribeRealtime(){
  if(channel) sb.removeChannel(channel);
  channel=sb.channel("ledger-"+viewingId).on("postgres_changes",{event:"UPDATE",schema:"public",table:"ledgers",filter:"id=eq."+viewingId},
    payload=>{ state=Object.assign({accounts:[],txns:[],fyEnabled:false,fyStartMonth:1,currency:"PHP"}, payload.new.data||{}); myRow=payload.new; applyStateToUI(); }
  ).subscribe();
}
function applyStateToUI(){
  document.getElementById("currencySel").value=state.currency||"PHP";
  const sc=document.getElementById("shareToggle");
  sc.checked = !!(myRow && myRow.is_shared);
  sc.disabled = !viewingOwn;
  updateShareLabel();
  document.getElementById("copyLinkBtn").style.display = (myRow && myRow.is_shared) ? "inline-block" : "none";
  document.getElementById("viewOnlyBanner").style.display = viewingOwn ? "none" : "block";
  ["addAccountBtn","postTxnBtn","addLineBtn","currencySel","coaCode","coaName","coaType","txnDate","txnDesc","txnComment",
   "postAdjBtn","addAdjLineBtn","adjDate","adjDesc","adjComment"].forEach(id=>{
    const el=document.getElementById(id); if(el) el.disabled=!viewingOwn;
  });
  renderAccounts(); refreshAccountDropdowns(); renderTransactions(); renderAdjustments(); renderTrialBalance();
}
function updateShareLabel(){
  document.getElementById("shareLabel").textContent = (myRow && myRow.is_shared) ? "Shared (anyone with the link)" : "Private (only you)";
}
document.getElementById("shareToggle").addEventListener("change", async e=>{
  if(!viewingOwn) return;
  const {data,error}=await sb.from("ledgers").update({is_shared:e.target.checked}).eq("id",viewingId).select().single();
  if(error){ toast("Couldn't update sharing: "+error.message); return; }
  myRow=data; updateShareLabel();
  document.getElementById("copyLinkBtn").style.display = myRow.is_shared ? "inline-block":"none";
  toast(myRow.is_shared ? "Now sharing this ledger" : "Back to private");
});
document.getElementById("copyLinkBtn").addEventListener("click", ()=>{
  const link=location.origin+location.pathname+"?ledger="+viewingId;
  navigator.clipboard.writeText(link).then(()=>toast("Share link copied")).catch(()=>toast(link));
});

// ---------- Tabs ----------
document.querySelectorAll("nav .tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("nav .tab").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  btn.classList.add("active"); document.getElementById("view-"+btn.dataset.view).classList.add("active");
}));
document.getElementById("currencySel").addEventListener("change", e=>{ state.currency=e.target.value; persist(); renderTransactions(); renderAdjustments(); renderTrialBalance(); updateBalanceBar("txnLines"); updateBalanceBar("adjLines"); });

// ---------- Chart of Accounts ----------
document.getElementById("addAccountBtn").addEventListener("click", ()=>{
  const codeEl=document.getElementById("coaCode"), nameEl=document.getElementById("coaName"), typeEl=document.getElementById("coaType");
  ["coaCode","coaName"].forEach(clearErr);
  const code=codeEl.value.trim(), name=nameEl.value.trim(), type=typeEl.value; let bad=false;
  if(!code){setErr("coaCode","Account code is required.");bad=true;}
  else if(state.accounts.some(a=>a.code===code)){setErr("coaCode","That code is already used.");bad=true;}
  if(!name){setErr("coaName","Account name is required.");bad=true;}
  if(bad) return;
  state.accounts.push({code,name,type,normalBalance:normalSide(type)});
  persist(); codeEl.value=""; nameEl.value=""; renderAccounts(); refreshAccountDropdowns(); toast("Account added");
});
function accountHasTxns(code){ return state.txns.some(t=>t.lines.some(l=>l.account===code)); }
function renderAccounts(){
  const tbody=document.querySelector("#coaTable tbody"); tbody.innerHTML="";
  document.getElementById("coaEmpty").style.display = state.accounts.length?"none":"block";
  state.accounts.slice().sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})).forEach(a=>{
    const used=accountHasTxns(a.code); const tr=document.createElement("tr");
    tr.innerHTML=`<td>${esc(a.code)}</td><td>${esc(a.name)}</td><td><span class="pill">${a.type}</span></td>
      <td><span class="pill ${a.normalBalance==='Debit'?'debit':'credit'}">${a.normalBalance}</span></td>
      <td><button class="iconbtn" data-del="${esc(a.code)}" ${(used||!viewingOwn)?'disabled':''}>✕</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>confirmAction(`Delete account ${b.dataset.del}?`,()=>{
    state.accounts=state.accounts.filter(a=>a.code!==b.dataset.del); persist(); renderAccounts(); refreshAccountDropdowns(); toast("Account deleted");
  })));
}

// ---------- Transactions ----------
function addLine(wrapId){
  const linesWrap=document.getElementById(wrapId);
  const row=document.createElement("div"); row.className="linegrid";
  const sel=document.createElement("select"); sel.className="lineAcct"; row.appendChild(sel);
  const d=document.createElement("input"); d.type="text"; d.inputMode="decimal"; d.placeholder="0.00"; d.className="lineDebit num";
  const c=document.createElement("input"); c.type="text"; c.inputMode="decimal"; c.placeholder="0.00"; c.className="lineCredit num";
  row.appendChild(d); row.appendChild(c);
  const rm=document.createElement("button"); rm.className="iconbtn"; rm.textContent="✕";
  rm.addEventListener("click",()=>{ if(linesWrap.children.length>2){row.remove();updateBalanceBar(wrapId);} else toast("An entry needs at least two lines"); });
  row.appendChild(rm);
  [d,c].forEach(inp=>inp.addEventListener("input",()=>{ if(inp===d&&d.value)c.value=""; if(inp===c&&c.value)d.value=""; updateBalanceBar(wrapId); }));
  linesWrap.appendChild(row); refreshLineDropdown(sel);
}
function refreshLineDropdown(sel){
  const cur=sel.value;
  sel.innerHTML='<option value="">Select account…</option>'+state.accounts.slice().sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}))
    .map(a=>`<option value="${esc(a.code)}">${esc(a.code)} — ${esc(a.name)}</option>`).join("");
  if(cur) sel.value=cur;
}
function refreshAccountDropdowns(){ document.querySelectorAll(".lineAcct").forEach(refreshLineDropdown); }
document.getElementById("addLineBtn").addEventListener("click", ()=>addLine("txnLines"));
document.getElementById("addAdjLineBtn").addEventListener("click", ()=>addLine("adjLines"));
function lineAmounts(wrapId){
  let debit=0,credit=0;
  document.querySelectorAll("#"+wrapId+" .linegrid").forEach(r=>{ debit+=parseFloat(r.querySelector(".lineDebit").value)||0; credit+=parseFloat(r.querySelector(".lineCredit").value)||0; });
  return {debit,credit};
}
function updateBalanceBar(wrapId){
  const barId = wrapId==="adjLines" ? "adjBalanceBar" : "balanceBar";
  const {debit,credit}=lineAmounts(wrapId); const bar=document.getElementById(barId); const diff=Math.round((debit-credit)*100)/100;
  bar.textContent=`Debits ${money(debit)} · Credits ${money(credit)}`+(diff!==0?` · Out of balance by ${money(Math.abs(diff))}`:" · Balanced");
  bar.className="balancebar "+(diff===0&&debit>0?"ok":(diff!==0?"bad":""));
}
function postEntry(opts){
  // opts: {dateId, descId, wrapId, errLinesId, commentId, requireComment, isAdjustment, postedMsg, entryNoun}
  [opts.dateId,opts.descId].forEach(clearErr); document.getElementById(opts.errLinesId).textContent="";
  const dateEl=document.getElementById(opts.dateId), descEl=document.getElementById(opts.descId); let bad=false;
  if(!dateEl.value){setErr(opts.dateId,"Pick a date.");bad=true;}
  if(!descEl.value.trim()){setErr(opts.descId,"Describe this "+opts.entryNoun+".");bad=true;}
  const commentEl=document.getElementById(opts.commentId);
  if(opts.requireComment && !commentEl.value.trim()){ document.getElementById(opts.errLinesId).textContent="Adjusting entries need a comment explaining why."; bad=true; }
  const lines=[];
  document.querySelectorAll("#"+opts.wrapId+" .linegrid").forEach(r=>{
    const acct=r.querySelector(".lineAcct").value, dv=parseFloat(r.querySelector(".lineDebit").value)||0, cv=parseFloat(r.querySelector(".lineCredit").value)||0;
    if(acct&&(dv>0||cv>0)) lines.push({account:acct,debit:dv,credit:cv});
  });
  if(lines.length<2){ document.getElementById(opts.errLinesId).textContent="Add at least two complete lines."; bad=true; }
  const {debit,credit}=lineAmounts(opts.wrapId);
  if(Math.round((debit-credit)*100)!==0){ document.getElementById(opts.errLinesId).textContent="Total debits must equal total credits."; bad=true; }
  if(debit===0){ document.getElementById(opts.errLinesId).textContent="Enter at least one amount greater than zero."; bad=true; }
  if(bad) return;
  state.txns.push({id:uid(),date:dateEl.value,description:descEl.value.trim(),comment:commentEl.value.trim(),lines,isAdjustment:!!opts.isAdjustment});
  persist(); descEl.value=""; commentEl.value="";
  document.getElementById(opts.wrapId).innerHTML=""; addLine(opts.wrapId); addLine(opts.wrapId); updateBalanceBar(opts.wrapId);
  renderAccounts(); renderTransactions(); renderAdjustments(); toast(opts.postedMsg);
}
document.getElementById("postTxnBtn").addEventListener("click", ()=>postEntry({
  dateId:"txnDate",descId:"txnDesc",wrapId:"txnLines",errLinesId:"err-txnLines",commentId:"txnComment",
  requireComment:false,isAdjustment:false,postedMsg:"Transaction posted",entryNoun:"transaction"
}));
document.getElementById("postAdjBtn").addEventListener("click", ()=>postEntry({
  dateId:"adjDate",descId:"adjDesc",wrapId:"adjLines",errLinesId:"err-adjLines",commentId:"adjComment",
  requireComment:true,isAdjustment:true,postedMsg:"Adjusting entry posted",entryNoun:"adjustment"
}));
function renderEntryTable(tableId,emptyId,predicate){
  const tbody=document.querySelector("#"+tableId+" tbody"); tbody.innerHTML="";
  const rows=state.txns.filter(predicate);
  document.getElementById(emptyId).style.display=rows.length?"none":"block";
  rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).forEach(t=>{
    const total=t.lines.reduce((s,l)=>s+l.debit,0);
    const linesTxt=t.lines.map(l=>{const a=state.accounts.find(x=>x.code===l.account);const nm=a?a.name:l.account;
      return l.debit>0?`${nm} (Dr ${money(l.debit)})`:`${nm} (Cr ${money(l.credit)})`;}).join("<br>");
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${fmtDate(t.date)}</td><td>${esc(t.description)}</td><td style="font-size:12px">${linesTxt}</td>
      <td style="font-size:12px;color:var(--ink-2)">${esc(t.comment||"—")}</td><td class="num">${moneyCell(total)}</td>
      <td><button class="iconbtn" data-del="${t.id}" ${!viewingOwn?'disabled':''}>✕</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>confirmAction("Delete this entry?",()=>{
    state.txns=state.txns.filter(t=>t.id!==b.dataset.del); persist(); renderAccounts(); renderTransactions(); renderAdjustments(); toast("Entry deleted");
  })));
}
function renderTransactions(){ renderEntryTable("txnTable","txnEmpty", t=>!t.isAdjustment); }
function renderAdjustments(){ renderEntryTable("adjTable","adjEmpty", t=>!!t.isAdjustment); }

// ---------- Trial Balance ----------
function renderTrialBalance(){
  const tbody=document.querySelector("#tbTable tbody"); tbody.innerHTML=""; let totalDebit=0,totalCredit=0;
  state.accounts.slice().sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true})).forEach(a=>{
    let d=0,c=0; state.txns.forEach(t=>t.lines.forEach(l=>{ if(l.account===a.code){d+=l.debit;c+=l.credit;} }));
    const net=d-c; let debitCol=0,creditCol=0;
    if(a.normalBalance==="Debit"){ if(net>=0)debitCol=net; else creditCol=-net; } else { if(-net>=0)creditCol=-net; else debitCol=net; }
    if(d===0&&c===0) return;
    totalDebit+=debitCol; totalCredit+=creditCol;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${esc(a.code)}</td><td>${esc(a.name)}</td><td><span class="pill">${a.type}</span></td>
      <td class="num">${debitCol!==0?moneyCell(debitCol):"—"}</td><td class="num">${creditCol!==0?moneyCell(creditCol):"—"}</td>`;
    tbody.appendChild(tr);
  });
  if(!tbody.children.length) tbody.innerHTML='<tr><td colspan="5" class="empty">Post a transaction to see your trial balance.</td></tr>';
  const bar=document.getElementById("tbBalanceBar"); const diff=Math.round((totalDebit-totalCredit)*100)/100;
  bar.textContent=`Total debits ${money(totalDebit)} · Total credits ${money(totalCredit)}`+(diff===0?" · Balanced ✓":` · Out of balance by ${money(Math.abs(diff))}`);
  bar.className="balancebar "+(diff===0?"ok":"bad");
}

// ---------- Confirm modal ----------
let pendingAction=null;
function confirmAction(text,fn){ document.getElementById("confirmText").textContent=text; pendingAction=fn; document.getElementById("confirmBg").classList.add("show"); }
document.getElementById("confirmNo").addEventListener("click",()=>document.getElementById("confirmBg").classList.remove("show"));
document.getElementById("confirmYes").addEventListener("click",()=>{ if(pendingAction) pendingAction(); document.getElementById("confirmBg").classList.remove("show"); });

document.getElementById("txnDate").value=new Date().toISOString().slice(0,10);
addLine("txnLines"); addLine("txnLines"); updateBalanceBar("txnLines");
addLine("adjLines"); addLine("adjLines"); updateBalanceBar("adjLines");
})();