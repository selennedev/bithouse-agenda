/* BITHOUSE — APP CORE
   Performance optimized: smaller selects, debounced realtime,
   indexed rendering and guarded auth boot.
*/
(function () {
  "use strict";

  const supabaseLib = window.supabase;
  if (!supabaseLib || !window.BITHOUSE_SUPABASE_URL || !window.BITHOUSE_SUPABASE_KEY) {
    console.error("Bithouse: Supabase não configurado.");
    return;
  }

  const sb = supabaseLib.createClient(window.BITHOUSE_SUPABASE_URL, window.BITHOUSE_SUPABASE_KEY);
  window.sb = sb;

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const n = (v) => Number(v || 0);
  const h = (v) => n(v).toFixed(1);
  const status = (v) => {
    const s = norm(v);
    if (s === "concluido") return "Concluído";
    if (s === "em andamento") return "Em andamento";
    if (s === "bloqueado") return "Bloqueado";
    return "Não iniciado";
  };
  const date = (v) => v ? new Intl.DateTimeFormat("pt-BR", {day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(String(v).length === 10 ? v + "T12:00:00" : v)) : "—";
  const monday = (v) => { const d = new Date(v); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); d.setHours(12,0,0,0); return d; };
  const add = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };
  const iso = (d) => new Date(d).toISOString().slice(0,10);
  const capacity = (p) => n(p?.hours_per_day) * n(p?.days_per_week) * .8;

  let user = null;
  let profile = null;
  let weekStart = monday(new Date());
  let channel = null;
  let data = { commissions:[], agenda:[], tasks:[], profiles:[] };
  let enteringUserId = null;
  let enteredUserId = null;
  let refreshTimer = null;
  let refreshRunning = false;
  let refreshQueued = false;

  function showLogin() { $("#login")?.classList.remove("hidden"); $("#app")?.classList.add("hidden"); }
  function showApp() { $("#login")?.classList.add("hidden"); $("#app")?.classList.remove("hidden"); }

  async function boot() {
    try {
      const { data: sessionData, error } = await sb.auth.getSession();
      if (error) console.error("Auth:", error);
      if (sessionData?.session) { user = sessionData.session.user; await enter(); }
      else showLogin();
      sb.auth.onAuthStateChange((_event, session) => {
        if (session) {
          if (user?.id === session.user.id && (enteringUserId === session.user.id || enteredUserId === session.user.id)) return;
          user = session.user;
          enter();
        } else {
          enteringUserId = null;
          enteredUserId = null;
          user = null;
          profile = null;
          if (channel) { sb.removeChannel(channel); channel = null; }
          showLogin();
        }
      });
    } catch (e) { console.error("Boot:", e); showLogin(); }
  }

  async function enter() {
    if (!user || enteringUserId === user.id || enteredUserId === user.id) return;
    enteringUserId = user.id;
    showApp();
    window.user = user;

    try {
      const own = await sb.from("profiles").select("id,name,specialty,role,hours_per_day,days_per_week,active").eq("id", user.id).maybeSingle();
      if (own.error) console.warn("Perfil:", own.error);
      profile = own.data || null;

      if (!profile) {
        const created = await sb.from("profiles").upsert({id:user.id, name:user.email?.split("@")[0] || "Membro"});
        if (!created.error) {
          const again = await sb.from("profiles").select("id,name,specialty,role,hours_per_day,days_per_week,active").eq("id", user.id).maybeSingle();
          profile = again.data || null;
        }
      }
      window.profile = profile;
      if ($("#userName")) $("#userName").textContent = profile?.name || user.email || "Membro";
      ensureGlobalModal();
      subscribe();
      await refresh();
      if (window.loadProduction) await window.loadProduction();
      enteredUserId = user.id;
    } catch (e) {
      console.error("Enter:", e);
    } finally {
      enteringUserId = null;
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { refreshTimer = null; refresh(); }, 180);
  }

  function subscribe() {
    if (channel) sb.removeChannel(channel);
    channel = sb.channel("bithouse-live")
      .on("postgres_changes", {event:"*", schema:"public", table:"commissions"}, scheduleRefresh)
      .on("postgres_changes", {event:"*", schema:"public", table:"agenda_items"}, scheduleRefresh)
      .on("postgres_changes", {event:"*", schema:"public", table:"tasks"}, scheduleRefresh)
      .on("postgres_changes", {event:"*", schema:"public", table:"profiles"}, scheduleRefresh)
      .on("postgres_changes", {event:"*", schema:"public", table:"asset_steps"}, () => {
        clearTimeout(window.__bhProductionTimer);
        window.__bhProductionTimer = setTimeout(() => window.loadProduction?.(), 250);
      })
      .subscribe((s) => { if ($("#syncState")) $("#syncState").textContent = s === "SUBSCRIBED" ? "● sincronizado" : "● conectando..."; });
  }

  async function loadData() {
    const [c,a,t,p] = await Promise.all([
      sb.from("commissions").select("id,name,client,priority,status,owner_id,start_date,deadline,map_name,progress,notes,created_at,created_by").order("created_at", {ascending:false}),
      sb.from("agenda_items").select("id,commission_id,profile_id,collaborator_name,date,task,hours,status,start_time,end_time,description").order("date", {ascending:true}),
      sb.from("tasks").select("id,status"),
      sb.from("profiles").select("id,name,specialty,role,hours_per_day,days_per_week,active").order("name", {ascending:true})
    ]);
    if (c.error) console.error("Comissões:", c.error);
    if (a.error) console.error("Agenda:", a.error);
    if (t.error) console.error("Tasks:", t.error);
    if (p.error) console.error("Profiles:", p.error);

    const commissions = c.data || [];
    const profiles = p.data || [];
    const commissionMap = new Map(commissions.map(x => [x.id, x]));
    const profileMap = new Map(profiles.map(x => [x.id, x]));
    const agenda = (a.data || []).map(x => ({...x, commission: commissionMap.get(x.commission_id) || null, profile: profileMap.get(x.profile_id) || null}));
    commissions.forEach(x => { x.owner = profileMap.get(x.owner_id) || null; });
    return {commissions, agenda, tasks:t.data || [], profiles};
  }

  async function refresh() {
    if (!user || refreshRunning) { if (user) refreshQueued = true; return; }
    refreshRunning = true;
    try {
      data = await loadData();
      requestAnimationFrame(() => render(data));
    } catch (e) { console.error("Refresh:", e); }
    finally {
      refreshRunning = false;
      if (refreshQueued) { refreshQueued = false; scheduleRefresh(); }
    }
  }

  async function refreshAll() {
    await refresh();
    if (window.loadProduction) await window.loadProduction();
  }

  function render(d) {
    const active = d.commissions.filter(c => !["concluido","cancelado"].includes(norm(c.status)));
    const high = active.filter(c => norm(c.priority) === "alta");
    const openTasks = d.tasks.filter(t => norm(t.status) !== "concluido");
    const committed = d.agenda.filter(x => status(x.status) !== "Concluído").reduce((s,x) => s+n(x.hours),0);
    const totalCap = d.profiles.reduce((s,p) => s+capacity(p),0);
    const pct = totalCap ? Math.min(1, committed/totalCap) : 0;
    const agendaByCommission = new Map();
    const usedByProfile = new Map();
    d.agenda.forEach(x => {
      agendaByCommission.set(x.commission_id, (agendaByCommission.get(x.commission_id) || 0) + n(x.hours));
      if (status(x.status) !== "Concluído") usedByProfile.set(x.profile_id, (usedByProfile.get(x.profile_id) || 0) + n(x.hours));
    });
    const commissionsByOwner = new Map();
    d.commissions.forEach(c => { if(c.owner_id) commissionsByOwner.set(c.owner_id, (commissionsByOwner.get(c.owner_id) || 0) + 1); });
    set("#activeCount", active.length); set("#highCount", high.length); set("#taskCount", openTasks.length); set("#ownerCount", d.commissions.filter(c => c.owner_id).length);
    set("#capacityPct", Math.round(pct*100)+"%"); if ($("#capacityBar")) $("#capacityBar").style.width = pct*100+"%";
    set("#committed", h(committed)+"h"); set("#free", h(Math.max(0,totalCap-committed))+"h"); set("#freePreview", h(Math.max(0,totalCap-committed))+"h");
    renderAgenda(d); renderCommissions(d, agendaByCommission); renderTeam(d, usedByProfile, commissionsByOwner);
  }

  function set(sel,v){ const e=$(sel); if(e) e.textContent=v; }

  function renderAgenda(d) {
    const grid = $("#agendaGrid"); if (!grid) return;
    set("#weekTitle", `${date(iso(weekStart))} — ${date(iso(add(weekStart,5)))}`);
    grid.innerHTML = "";
    const names = ["SEG","TER","QUA","QUI","SEX","SÁB"];
    const weekItems = new Map();
    d.agenda.forEach(x => { if(!weekItems.has(x.date)) weekItems.set(x.date, []); weekItems.get(x.date).push(x); });
    for(let i=0;i<6;i++){
      const key=iso(add(weekStart,i));
      const items=(weekItems.get(key)||[]).slice().sort((a,b)=>(a.start_time||"").localeCompare(b.start_time||""));
      const day=document.createElement("div"); day.className="day";
      day.innerHTML=`<div class="day-head"><span>${names[i]}</span><small>${date(key)}</small></div>`;
      if(!items.length) day.innerHTML+=`<div class="muted" style="padding:16px">Dia livre ✨</div>`;
      items.forEach(item=>{
        const st=status(item.status), cls=norm(st)==="concluido"?"done":norm(st)==="em andamento"?"progress":"not-started";
        const el=document.createElement("div"); el.className=`item bh-agenda ${cls}`; el.dataset.agendaId=item.id;
        el.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(item.commission?.name||"Comissão")}</b><span class="bh-status ${cls}">${esc(st)}</span></div><small>${esc(item.profile?.name||item.collaborator_name||"Equipe")} • ${esc(item.task||"Produção")}</small><small><strong>${h(item.hours)}h</strong>${item.start_time?` • ${esc(item.start_time)}${item.end_time?`–${esc(item.end_time)}`:""}`:""}</small>`;
        el.addEventListener("click",()=>openAgenda(item)); day.appendChild(el);
      });
      grid.appendChild(day);
    }
  }

  function renderCommissions(d, totals) {
    const grid=$("#commissionGrid"); if(!grid)return; grid.innerHTML="";
    d.commissions.forEach(c=>{
      const total=totals.get(c.id)||0;
      const el=document.createElement("article"); el.className="card"; el.dataset.commissionId=c.id;
      el.innerHTML=`<span class="badge ${norm(c.priority)==="alta"?"high":""}">${esc(c.priority||"Média")}</span><h3>${esc(c.name)}</h3><div class="muted">${esc(c.client||"Cliente não informado")}</div><div class="bar"><span style="width:${Math.max(0,Math.min(100,n(c.progress)*100))}%"></span></div><div class="meta"><div><small>Responsável</small><b>${esc(c.owner?.name||"Sem responsável")}</b></div><div><small>Horas agendadas</small><b>${h(total)}h</b></div><div><small>Prazo</small><b>${date(c.deadline)}</b></div><div><small>Mapa</small><b>${esc(c.map_name||"—")}</b></div></div><button type="button" class="ghost-btn small bh-open-commission">Ver detalhes</button>`;
      el.querySelector(".bh-open-commission").addEventListener("click",()=>openCommission(c.id)); grid.appendChild(el);
    });
  }

  function renderTeam(d, usedByProfile, commissionsByOwner) {
    const grid=$("#teamGrid"); if(!grid)return; grid.innerHTML="";
    d.profiles.forEach(p=>{
      const used=usedByProfile.get(p.id)||0;
      const cap=capacity(p), free=Math.max(0,cap-used), pct=cap?Math.min(1,used/cap):0;
      grid.innerHTML+=`<article class="card"><h3>${esc(p.name||"Membro")}</h3><div class="muted">${esc(p.specialty||p.role||"Equipe")}</div><div style="font:800 30px 'Space Grotesk';margin-top:12px">${h(free)}h <span class="muted">livres</span></div><div class="bar"><span style="width:${pct*100}%"></span></div><div class="muted">${commissionsByOwner.get(p.id)||0} comissão(ões) como responsável • ${h(used)}h comprometidas</div></article>`;
    });
  }

  function ensureGlobalModal(){
    if($("#bhGlobalModal")) return;
    const m=document.createElement("div"); m.id="bhGlobalModal"; m.className="bh-modal hidden";
    m.innerHTML=`<div class="bh-dialog"><button class="bh-close" data-bh-close>×</button><span class="eyebrow" id="bhModalEyebrow">DETALHES</span><h2 id="bhModalTitle">Detalhes</h2><div id="bhModalBody"></div><div class="bh-actions"><button class="production-action" data-bh-close>Fechar</button><button class="bh-save" id="bhModalSave">Salvar alterações</button></div></div>`;
    document.body.appendChild(m);
    m.addEventListener("click",e=>{if(e.target===m||e.target.closest("[data-bh-close]"))closeGlobalModal();});
  }
  function closeGlobalModal(){ $("#bhGlobalModal")?.classList.add("hidden"); }
  function openGlobal(title,eyebrow,body,save){ ensureGlobalModal(); $("#bhModalTitle").textContent=title; $("#bhModalEyebrow").textContent=eyebrow; $("#bhModalBody").innerHTML=body; $("#bhModalSave").onclick=save; $("#bhGlobalModal").classList.remove("hidden"); }

  function openAgenda(item){
    const c=item.commission||{};
    openGlobal(item.task||"Item da agenda","AGENDA",`<div class="bh-grid"><div class="bh-field"><small>Comissão</small><b>${esc(c.name||"—")}</b></div><div class="bh-field"><small>Responsável</small><b>${esc(item.profile?.name||item.collaborator_name||"Equipe")}</b></div><div class="bh-field"><small>Data</small><input id="bhAdate" type="date" value="${esc(item.date||"")}"></div><div class="bh-field"><small>Status</small><select id="bhAstatus"><option>Não iniciado</option><option>Em andamento</option><option>Concluído</option></select></div><div class="bh-field"><small>Horário</small><div style="display:flex;gap:6px"><input id="bhAstart" type="time" value="${esc(item.start_time||"")}"><input id="bhAend" type="time" value="${esc(item.end_time||"")}"></div></div><div class="bh-field"><small>Horas</small><input id="bhAhours" type="number" min="0" step="0.1" value="${esc(item.hours||0)}"></div><div class="bh-field bh-full"><small>O que precisa ser feito</small><textarea id="bhAdesc">${esc(item.description||item.task||"")}</textarea></div></div>` , async()=>{
      const patch={date:$("#bhAdate").value||null,status:status($("#bhAstatus").value),start_time:$("#bhAstart").value||null,end_time:$("#bhAend").value||null,hours:n($("#bhAhours").value),description:$("#bhAdesc").value.trim()};
      await updateAgenda(item.id,patch);
    });
    $("#bhAstatus").value=status(item.status);
  }

  async function updateAgenda(id,patch){
    const {error}=await sb.from("agenda_items").update(patch).eq("id",id);
    if(error){alert("Não foi possível salvar:\n\n"+error.message);return;}
    await log("updated_agenda_item","agenda_item",id,patch); closeGlobalModal(); await refresh();
  }

  function openCommission(id){
    const c=data.commissions.find(x=>x.id===id); if(!c)return;
    const items=data.agenda.filter(x=>x.commission_id===id);
    const total=items.reduce((s,x)=>s+n(x.hours),0);
    openGlobal(c.name,"COMISSÃO",`<div class="bh-grid"><div class="bh-field"><small>Cliente</small><span>${esc(c.client||"—")}</span></div><div class="bh-field"><small>Status</small><span>${esc(c.status||"—")}</span></div><div class="bh-field"><small>Prioridade</small><span>${esc(c.priority||"—")}</span></div><div class="bh-field"><small>Responsável</small><span>${esc(c.owner?.name||"Sem responsável")}</span></div><div class="bh-field"><small>Início</small><span>${date(c.start_date)}</span></div><div class="bh-field"><small>Prazo</small><span>${date(c.deadline)}</span></div><div class="bh-field"><small>Mapa</small><span>${esc(c.map_name||"—")}</span></div><div class="bh-field"><small>Horas</small><span>${h(total)}h</span></div><div class="bh-field bh-full"><small>Observações</small><textarea id="bhCnotes">${esc(c.notes||"")}</textarea></div></div>`,async()=>{
      const patch={notes:$("#bhCnotes").value.trim()}; const r=await sb.from("commissions").update(patch).eq("id",id); if(r.error){alert(r.error.message);return;} await log("updated_commission","commission",id,patch); closeGlobalModal(); await refresh();
    });
    $("#bhModalSave").textContent="Salvar observações";
  }

  async function log(action,entityType,entityId,metadata={}){
    if(!user)return;
    const r=await sb.from("activity_log").insert({actor:user.id,action,entity_type:entityType,entity_id:entityId,metadata});
    if(r.error) console.warn("Activity log:",r.error);
  }

  function openNew(){
    $("#modal")?.classList.remove("hidden");
    if($("#start")) $("#start").value ||= iso(new Date());
    if(typeof window.preview === "function") window.preview();
  }
  function closeNew(){ $("#modal")?.classList.add("hidden"); }

  async function createCommission(e){
    e.preventDefault();
    if(!user)return;
    const vals={name:$("#name").value.trim(),client:$("#client").value.trim(),priority:$("#priority").value,status:"Planejamento",owner_id:null,start_date:$("#start").value||null,deadline:$("#deadline").value||null,map_name:$("#map").value.trim(),created_by:user.id};
    const ownerName=$("#owner").value;
    if(ownerName){const p=data.profiles.find(x=>x.name===ownerName);vals.owner_id=p?.id||null;}
    const ins=await sb.from("commissions").insert(vals).select("*").single();
    if(ins.error){alert(ins.error.message);return;}
    const people={Selenne:n($("#hs").value),Midas:n($("#hm").value),Biell:n($("#hb").value)};
    const rows=[];
    for(const [name,total] of Object.entries(people)){
      if(!total)continue;
      const p=data.profiles.find(x=>norm(x.name)===norm(name)); if(!p)continue;
      let remaining=total, day=new Date((vals.start_date||iso(new Date()))+"T12:00:00"), guard=0;
      while(remaining>0&&guard<365){
        if(day.getDay()!==0){
          const existing=data.agenda.filter(x=>x.profile_id===p.id&&x.date===iso(day)).reduce((s,x)=>s+n(x.hours),0);
          const room=Math.max(0,n(p.hours_per_day)*.8-existing); const put=Math.min(room,remaining);
          if(put>0){rows.push({commission_id:ins.data.id,profile_id:p.id,collaborator_name:p.name,date:iso(day),task:"Produção",hours:put,status:"Não iniciado"});remaining-=put;}
        }
        day=add(day,1);guard++;
      }
    }
    if(rows.length){const r=await sb.from("agenda_items").insert(rows);if(r.error)console.warn("Agenda criada:",r.error);}
    await log("created_commission","commission",ins.data.id,{hours:people});
    closeNew(); $("#form")?.reset(); await refresh(); location.hash="#agenda";
  }

  function bind(){
    $("#newBtn")?.addEventListener("click",openNew); $("#newBtn2")?.addEventListener("click",openNew);
    $("#close")?.addEventListener("click",closeNew); $("#cancel")?.addEventListener("click",closeNew); $("#form")?.addEventListener("submit",createCommission);
    ["hs","hm","hb"].forEach(id=>$("#"+id)?.addEventListener("input",()=>{if(typeof window.preview==="function")window.preview();}));
    $("#prev")?.addEventListener("click",()=>{weekStart=add(weekStart,-7);refresh();}); $("#next")?.addEventListener("click",()=>{weekStart=add(weekStart,7);refresh();}); $("#today")?.addEventListener("click",()=>{weekStart=monday(new Date());refresh();});
    $("#logoutBtn")?.addEventListener("click",()=>sb.auth.signOut()); $("#productionRefresh")?.addEventListener("click",refreshAll);
  }

  window.appRefresh=refresh;
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{bind();boot();}); else {bind();boot();}
})();