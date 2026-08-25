const {createClient}=window.supabase;
const sb=createClient(window.BITHOUSE_SUPABASE_URL,window.BITHOUSE_SUPABASE_KEY);
let user=null, profile=null, weekStart=monday(new Date()), channel=null;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
function monday(d){let x=new Date(d);let n=x.getDay();x.setDate(x.getDate()+(n===0?-6:1-n));x.setHours(12,0,0,0);return x}
function add(d,n){let x=new Date(d);x.setDate(x.getDate()+n);return x}
function iso(d){return d.toISOString().slice(0,10)}
function fmt(d){return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit"}).format(d)}
function cap(p){return Number(p.hours_per_day)*Number(p.days_per_week)*.8}
async function boot(){
 const {data:{session}}=await sb.auth.getSession();
 if(session){user=session.user;await enter()} else {showLogin()}
 sb.auth.onAuthStateChange(async(_,s)=>{if(s){user=s.user;await enter()}});
}
function showLogin(){$("#login").classList.remove("hidden");$("#app").classList.add("hidden")}
async function enter(){
 $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
 let {data:p}=await sb.from("profiles").select("*").eq("id",user.id).single();
 if(!p){
   await sb.from("profiles").upsert({id:user.id,name:user.email?.split("@")[0]||"Membro"});
   ({data:p}=await sb.from("profiles").select("*").eq("id",user.id).single());
 }
 profile=p;$("#userName").textContent=p?.name||user.email;
 subscribe();await refresh();
}
function subscribe(){
 if(channel)sb.removeChannel(channel);
 channel=sb.channel("bithouse-live")
 .on("postgres_changes",{event:"*",schema:"public",table:"commissions"},refresh)
 .on("postgres_changes",{event:"*",schema:"public",table:"agenda_items"},refresh)
 .on("postgres_changes",{event:"*",schema:"public",table:"tasks"},refresh)
 .on("postgres_changes",{event:"*",schema:"public",table:"profiles"},refresh)
 .subscribe((s)=>{$("#syncState").textContent=s==="SUBSCRIBED"?"● sincronizado":"● conectando..."});
}
async function data(){
 const [c,a,t,p]=await Promise.all([
   sb.from("commissions").select("*, owner:profiles!commissions_owner_id_fkey(name)").order("created_at",{ascending:false}),
   sb.from("agenda_items").select("*, commission:commissions(name), profile:profiles(name)"),
   sb.from("tasks").select("*"),
   sb.from("profiles").select("*").eq("active",true).order("name")
 ]);
 return {c:c.data||[],a:a.data||[],t:t.data||[],p:p.data||[]};
}
async function refresh(){
 if(!user)return;const d=await data();render(d);
}
function render(d){
 const active=d.c.filter(x=>x.status!=="Concluído"), high=active.filter(x=>x.priority==="Alta");
 $("#activeCount").textContent=active.length;$("#highCount").textContent=high.length;
 $("#taskCount").textContent=d.t.filter(x=>x.status!=="Concluído").length;
 $("#ownerCount").textContent=d.c.filter(x=>x.owner_id).length;
 const totalCap=d.p.reduce((a,p)=>a+cap(p),0), committed=d.a.reduce((a,x)=>a+Number(x.hours||0),0), pct=totalCap?Math.min(1,committed/totalCap):0;
 $("#capacityPct").textContent=Math.round(pct*100)+"%";$("#capacityBar").style.width=pct*100+"%";
 $("#committed").textContent=committed.toFixed(1)+"h";$("#free").textContent=Math.max(0,totalCap-committed).toFixed(1)+"h";
 $("#freePreview").textContent=Math.max(0,totalCap-committed).toFixed(1)+"h";
 renderAgenda(d);renderCommissions(d);renderTeam(d);
}
function renderAgenda(d){
 $("#weekTitle").textContent=`${fmt(weekStart)} — ${fmt(add(weekStart,5))}`;
 const grid=$("#agendaGrid");grid.innerHTML="";
 for(let i=0;i<6;i++){
   const date=add(weekStart,i), key=iso(date), items=d.a.filter(x=>x.date===key);
   const el=document.createElement("div");el.className="day";
   el.innerHTML=`<div class="day-head"><span>${["SEG","TER","QUA","QUI","SEX","SÁB"][i]}</span><small>${fmt(date)}</small></div>`;
   if(!items.length)el.innerHTML+=`<div class="muted" style="padding:16px">Dia livre ✨</div>`;
   items.forEach(x=>el.innerHTML+=`<div class="item"><b>${esc(x.commission?.name||"Comissão")}</b><small>${esc(x.profile?.name||x.collaborator_name||"Equipe")} • ${esc(x.task)}</small><small><strong>${Number(x.hours).toFixed(1)}h</strong></small></div>`);
   grid.appendChild(el);
 }
}
function renderCommissions(d){
 const grid=$("#commissionGrid");grid.innerHTML="";
 d.c.forEach(c=>{
   const total=d.a.filter(x=>x.commission_id===c.id).reduce((a,x)=>a+Number(x.hours||0),0);
   const el=document.createElement("article");el.className="card";
   el.innerHTML=`<span class="badge ${c.priority==="Alta"?"high":""}">${esc(c.priority)}</span>
   <h3>${esc(c.name)}</h3><div class="muted">${esc(c.client||"Cliente não informado")}</div>
   <div class="bar"><span style="width:${Number(c.progress||0)*100}%"></span></div>
   <div class="meta"><div><small>Responsável</small><b>${esc(c.owner?.name||"Sem responsável")}</b></div>
   <div><small>Horas agendadas</small><b>${total.toFixed(1)}h</b></div>
   <div><small>Prazo</small><b>${c.deadline?fmt(new Date(c.deadline+"T12:00:00")):"—"}</b></div>
   <div><small>Mapa</small><b>${esc(c.map_name||"—")}</b></div></div>`;
   grid.appendChild(el);
 });
}
function renderTeam(d){
 const grid=$("#teamGrid");grid.innerHTML="";
 d.p.forEach(p=>{
   const owned=d.c.filter(c=>c.owner_id===p.id), used=d.a.filter(x=>x.profile_id===p.id).reduce((a,x)=>a+Number(x.hours||0),0), available=Math.max(0,cap(p)-used), pct=cap(p)?Math.min(1,used/cap(p)):0;
   grid.innerHTML+=`<article class="card"><h3>${esc(p.name)}</h3><div class="muted">${esc(p.specialty||p.role||"Equipe")}</div><div style="font:800 30px 'Space Grotesk';margin-top:12px">${available.toFixed(1)}h <span class="muted">livres</span></div><div class="bar"><span style="width:${pct*100}%"></span></div><div class="muted">${owned.length} comissão(ões) como responsável • ${used.toFixed(1)}h comprometidas</div></article>`;
 });
}
function openModal(){$("#modal").classList.remove("hidden");$("#start").value ||= iso(new Date());preview()}
function closeModal(){$("#modal").classList.add("hidden")}
function preview(){const h=["hs","hm","hb"].reduce((a,id)=>a+Number($("#"+id).value||0),0);$("#total").textContent=h.toFixed(1)+"h";$("#verdict").textContent=h?"A agenda será montada por pessoa.":"Preencha as horas"}
async function createCommission(e){
 e.preventDefault();
 const vals={name:$("#name").value.trim(),client:$("#client").value.trim(),priority:$("#priority").value,status:"Planejamento",owner_id:null,start_date:$("#start").value||null,deadline:$("#deadline").value||null,map_name:$("#map").value.trim(),created_by:user.id};
 const ownerName=$("#owner").value;
 if(ownerName){const {data:p}=await sb.from("profiles").select("id").eq("name",ownerName).single();vals.owner_id=p?.id||null}
 const {data:c,error}=await sb.from("commissions").insert(vals).select().single();
 if(error){alert(error.message);return}
 const people={Selenne:Number($("#hs").value||0),Midas:Number($("#hm").value||0),Biell:Number($("#hb").value||0)};
 const {data:profiles}=await sb.from("profiles").select("id,name,hours_per_day,days_per_week").in("name",Object.keys(people));
 const rows=[];
 for(const p of profiles||[]){
   let remaining=people[p.name];if(!remaining)continue;
   let day=new Date((vals.start_date||iso(new Date()))+"T12:00:00"), guard=0;
   while(remaining>0&&guard<365){
     if(day.getDay()!==0){
       const daily=Math.min(Number(p.hours_per_day)*.8,remaining);
       const {data:existing}=await sb.from("agenda_items").select("hours").eq("profile_id",p.id).eq("date",iso(day));
       const used=(existing||[]).reduce((a,x)=>a+Number(x.hours||0),0);
       const room=Math.max(0,Number(p.hours_per_day)*.8-used), put=Math.min(daily,room);
       if(put>0){rows.push({commission_id:c.id,profile_id:p.id,date:iso(day),task:"Produção",hours:put});remaining-=put}
     }
     day=add(day,1);guard++;
   }
 }
 if(rows.length)await sb.from("agenda_items").insert(rows);
 await sb.from("activity_log").insert({actor_id:user.id,action:"created_commission",entity_type:"commission",entity_id:c.id,details:{hours:people}});
 closeModal();e.target.reset();await refresh();location.hash="#agenda";
}
$("#newBtn").onclick=openModal;$("#newBtn2").onclick=openModal;$("#close").onclick=closeModal;$("#cancel").onclick=closeModal;
["hs","hm","hb"].forEach(id=>$("#"+id).addEventListener("input",preview));
$("#form").onsubmit=createCommission;
$("#prev").onclick=()=>{weekStart=add(weekStart,-7);refresh()};$("#next").onclick=()=>{weekStart=add(weekStart,7);refresh()};$("#today").onclick=()=>{weekStart=monday(new Date());refresh()};
$("#loginBtn").onclick=async()=>{const email=$("#loginEmail").value.trim();if(!email)return;const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.href}});$("#loginMsg").textContent=error?error.message:"Link enviado! Verifique seu e-mail."};
$("#logoutBtn").onclick=()=>sb.auth.signOut();
boot();
