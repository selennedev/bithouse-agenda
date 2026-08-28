/* BITHOUSE — Production Board v3
   Interactive asset queue: status, assignee, schedule, details and realtime. */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const done = (s) => norm(s) === "concluido";
  const progress = (s) => norm(s) === "em andamento";
  const dateBR = (v) => v ? new Intl.DateTimeFormat("pt-BR", {day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(v + "T12:00:00")) : "—";
  const setText = (s,v) => { const e=$(s); if(e) e.textContent=v; };

  let steps = [];
  let profiles = [];
  let channel = null;
  let busy = false;

  /* Keep production UI self-contained so it does not depend on a second CSS deployment. */
  const style = document.createElement("style");
  style.textContent = `
    .production-map{margin:18px 0;padding:18px;border:1px solid #d8e2f3;border-radius:22px;background:rgba(255,255,255,.78);box-shadow:0 8px 28px rgba(34,55,95,.06)}
    .production-map-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
    .production-map-head h3{margin:4px 0 0;font:700 22px 'Space Grotesk',sans-serif;color:#20345e}
    .production-count{padding:7px 11px;border-radius:999px;background:#eef3ff;color:#58709b;font-weight:800;font-size:12px}
    .production-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:12px}
    .production-card{padding:15px;border:1px solid #dce5f4;border-radius:18px;background:#fff;transition:.18s;cursor:pointer;min-width:0}
    .production-card:hover{transform:translateY(-2px);box-shadow:0 10px 25px rgba(34,55,95,.10)}
    .production-card-top{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .production-pill{display:inline-flex;padding:6px 9px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.05em}
    .production-pill.not-started{background:#eef2f7;color:#62718a}.production-pill.progress{background:#e8f0ff;color:#315fd0}.production-pill.done{background:#e8f8ef;color:#21804d}.production-pill.blocked{background:#fff0e8;color:#b65b2d}
    .production-type{font-size:11px;font-weight:800;color:#8190a8;text-transform:uppercase;text-align:right}
    .production-card h4{margin:12px 0 8px;font:700 16px 'Space Grotesk',sans-serif;color:#24385f}
    .production-person,.production-time,.production-dependency{font-size:12px;line-height:1.45;color:#71819d;margin-top:6px}
    .production-dependency{padding:8px 10px;border-radius:10px;background:#fff6ef;color:#9b603c}
    .production-card-actions{display:flex;gap:7px;margin-top:13px}.production-action{border:1px solid #ccd8eb;background:#fff;border-radius:10px;padding:8px 10px;font-weight:800;font-size:11px;cursor:pointer}.production-action.primary{background:#213862;color:#fff;border-color:#213862}.production-action.completed{background:#eef8f1;color:#22734a}
    .production-action:disabled{opacity:.55;cursor:wait}
    .production-empty{padding:30px;text-align:center;border:1px dashed #cbd8eb;border-radius:18px;color:#71819d;background:#fff}.production-empty small{display:block;margin-top:8px}
    .bh-modal{position:fixed;inset:0;z-index:9999;background:rgba(20,35,60,.45);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px}.bh-modal.hidden{display:none}.bh-dialog{width:min(720px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:24px;padding:24px;box-shadow:0 25px 80px rgba(20,35,60,.25);position:relative}.bh-close{position:absolute;right:16px;top:12px;border:0;background:transparent;font-size:28px;cursor:pointer;color:#6e7e99}.bh-dialog h2{margin:4px 42px 18px 0;font:700 26px 'Space Grotesk',sans-serif;color:#20345e}.bh-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.bh-field{padding:12px;border:1px solid #e0e7f2;border-radius:14px;background:#f9fbfe}.bh-field small{display:block;color:#8390a5;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}.bh-field b,.bh-field span{color:#2b3e62;font-size:13px}.bh-full{grid-column:1/-1}.bh-dialog select,.bh-dialog input,.bh-dialog textarea{width:100%;box-sizing:border-box;border:1px solid #ccd8e9;border-radius:10px;padding:9px;background:#fff;font:inherit}.bh-dialog textarea{min-height:90px;resize:vertical}.bh-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.bh-save{border:0;border-radius:11px;padding:10px 16px;background:#203862;color:#fff;font-weight:900;cursor:pointer}.bh-save:disabled{opacity:.6}.bh-agenda{cursor:pointer}.bh-agenda:hover{box-shadow:0 5px 16px rgba(34,55,95,.08)}
    @media(max-width:650px){.bh-grid{grid-template-columns:1fr}.bh-full{grid-column:auto}.production-cards{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function state(step){
    if(done(step.status)) return ["CONCLUÍDA","done"];
    if(step.depends_on_step_id){ const d=steps.find(x=>x.id===step.depends_on_step_id); if(d && !done(d.status)) return ["BLOQUEADA","blocked"]; }
    if(progress(step.status)) return ["EM ANDAMENTO","progress"];
    return ["NÃO INICIADA","not-started"];
  }
  function dependency(step){return step.depends_on_step_id ? steps.find(x=>x.id===step.depends_on_step_id) : null;}

  async function loadProfiles(){
    const ids=[...new Set(steps.map(x=>x.assigned_to).filter(Boolean))];
    if(!ids.length){profiles=[];return;}
    let r=await window.sb.from("profiles").select("*").in("id",ids);
    if(r.error){console.warn("Produção: não foi possível carregar responsáveis",r.error);profiles=[];}else profiles=r.data||[];
    const map=new Map(profiles.map(p=>[p.id,p])); steps.forEach(x=>x._profile=map.get(x.assigned_to));
  }

  async function loadProduction(){
    if(!window.sb || !window.user) return;
    const r=await window.sb.from("asset_steps").select(`id,asset_id,step_type,status,assigned_to,depends_on_step_id,planned_date,planned_start,planned_end,assets!inner(*)`).order("planned_date",{ascending:true,nullsFirst:false}).order("planned_start",{ascending:true,nullsFirst:false});
    if(r.error){console.error("Produção:",r.error);showError(r.error);return;}
    steps=r.data||[];
    await loadProfiles();
    buildFilter();render();
  }

  function showError(e){const g=$("#productionGrid");if(g)g.innerHTML=`<div class="production-empty"><strong>Erro ao carregar produção.</strong><small>${esc(e?.message||"Erro desconhecido")}</small></div>`;}

  function buildFilter(){
    const s=$("#productionFilter");if(!s)return;const old=s.value||"TODAS";
    const ids=[...new Set(steps.map(x=>x.assets?.map_id).filter(Boolean))];
    s.innerHTML='<option value="TODAS">Todos os mapas</option>';
    ids.forEach(id=>{const n=steps.find(x=>x.assets?.map_id===id)?.assets?.map_name||id;s.insertAdjacentHTML("beforeend",`<option value="${esc(id)}">${esc(n)}</option>`)});
    if([...s.options].some(o=>o.value===old))s.value=old;
  }

  function render(){
    const filter=$("#productionFilter")?.value||"TODAS";
    const visible=steps.filter(x=>filter==="TODAS"||x.assets?.map_id===filter);
    const blocked=visible.filter(x=>state(x)[1]==="blocked").length;
    const completed=visible.filter(x=>done(x.status)).length;
    const released=visible.filter(x=>!done(x.status)&&state(x)[1]!=="blocked").length;
    const mine=visible.filter(x=>x.assigned_to===window.user?.id&&!done(x.status)).length;
    setText("#productionTotal",visible.length);setText("#productionBlocked",blocked);setText("#productionCompleted",completed);setText("#productionReleased",released);setText("#myProductionCount",mine);
    const grid=$("#productionGrid");if(!grid)return;grid.innerHTML="";
    if(!visible.length){grid.innerHTML='<div class="production-empty">Nenhuma etapa encontrada.</div>';return;}
    const groups=new Map();visible.forEach(x=>{const k=x.assets?.map_id||"SEM_MAPA";if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)});
    groups.forEach((arr)=>{const first=arr[0], name=first.assets?.map_name||first.assets?.project_name||"Sem mapa";const sec=document.createElement("section");sec.className="production-map";sec.innerHTML=`<div class="production-map-head"><div><span class="eyebrow">MAPA / LOTE</span><h3>${esc(name)}</h3></div><span class="production-count">${arr.length} etapas</span></div><div class="production-cards"></div>`;const cards=sec.querySelector(".production-cards");arr.forEach(x=>cards.appendChild(card(x)));grid.appendChild(sec)});
  }

  function card(step){
    const [label,cls]=state(step), d=dependency(step), person=step._profile?.name||"Sem responsável";
    const el=document.createElement("article");el.className=`production-card ${cls}`;el.dataset.stepId=step.id;
    el.innerHTML=`<div class="production-card-top"><span class="production-pill ${cls}">${label}</span><span class="production-type">${esc(step.step_type||"ETAPA")}</span></div><h4>${esc(step.assets?.name||"Asset")}</h4><div class="production-person">👤 ${esc(person)}</div><div class="production-time">${step.planned_date?`📅 ${dateBR(step.planned_date)} ${step.planned_start?`• ${esc(step.planned_start)}`:""}${step.planned_end?` – ${esc(step.planned_end)}`:""}`:"Sem horário"}</div>${d&&!done(d.status)?`<div class="production-dependency">⏳ Aguardando <strong>${esc(d.assets?.name||"etapa anterior")}</strong></div>`:""}<div class="production-card-actions"><button type="button" class="production-action" data-open-step="${esc(step.id)}">Ver detalhes</button>${done(step.status)?`<button type="button" class="production-action completed" data-status-step="${esc(step.id)}" data-status="Em andamento">Reabrir</button>`:`<button type="button" class="production-action primary" data-status-step="${esc(step.id)}" data-status="${progress(step.status)?"Concluído":"Em andamento"}">${progress(step.status)?"Concluir":"Iniciar"}</button>`}</div>`;
    return el;
  }

  async function saveStep(id, patch, action="updated_asset_step"){
    if(busy)return false;busy=true;
    const {data,error}=await window.sb.from("asset_steps").update(patch).eq("id",id).select("id,asset_id,step_type,status,assigned_to,depends_on_step_id,planned_date,planned_start,planned_end").single();
    if(error){busy=false;alert("Não foi possível salvar.\n\n"+error.message);return false;}
    try{await window.sb.from("activity_log").insert({actor_id:window.user.id,action,entity_type:"asset_step",entity_id:id,details:patch});}catch(e){console.warn("Log não gravado",e)}
    busy=false;await loadProduction();return !!data;
  }

  function ensureModal(){
    if($("#bhStepModal"))return;
    const m=document.createElement("div");m.id="bhStepModal";m.className="bh-modal hidden";m.innerHTML=`<div class="bh-dialog"><button class="bh-close" data-close-modal>×</button><span class="eyebrow">ETAPA DE PRODUÇÃO</span><h2 id="bhTitle">Detalhes</h2><div id="bhBody"></div><div class="bh-actions"><button class="production-action" data-close-modal>Cancelar</button><button class="bh-save" id="bhSave">Salvar alterações</button></div></div>`;document.body.appendChild(m);
    m.addEventListener("click",e=>{if(e.target===m||e.target.closest("[data-close-modal]"))closeModal()});
    $("#bhSave").addEventListener("click",saveModal);
  }
  function closeModal(){$("#bhStepModal")?.classList.add("hidden")}

  function openStep(id){
    ensureModal();const step=steps.find(x=>x.id===id);if(!step)return;
    const a=step.assets||{},d=dependency(step),p=step._profile;
    $("#bhTitle").textContent=a.name||"Asset";
    $("#bhBody").innerHTML=`<div class="bh-grid"><div class="bh-field"><small>Etapa</small><b>${esc(step.step_type||"—")}</b></div><div class="bh-field"><small>Mapa</small><b>${esc(a.map_name||"—")}</b></div><div class="bh-field"><small>Status</small><select id="bhStatus"><option>Não iniciado</option><option>Em andamento</option><option>Concluído</option></select></div><div class="bh-field"><small>Responsável</small><select id="bhAssignee"><option value="">Sem responsável</option>${profiles.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></div><div class="bh-field"><small>Data</small><input id="bhDate" type="date"></div><div class="bh-field"><small>Horário</small><div style="display:flex;gap:6px"><input id="bhStart" type="time"><input id="bhEnd" type="time"></div></div><div class="bh-field bh-full"><small>O que precisa ser feito</small><span>${esc(a.notes||"Nenhuma instrução específica cadastrada para este asset.")}</span></div><div class="bh-field"><small>Categoria</small><span>${esc(a.category||"—")}</span></div><div class="bh-field"><small>Dependência</small><span>${d?`${esc(d.assets?.name||"Etapa anterior")} — ${esc(d.status||"")}`:"Nenhuma"}</span></div><div class="bh-field"><small>Horas estimadas</small><span>${esc(a.estimated_hours||"0")}h</span></div><div class="bh-field"><small>Observações do asset</small><span>${esc(a.notes||"—")}</span></div></div>`;
    $("#bhStatus").value=done(step.status)?"Concluído":progress(step.status)?"Em andamento":"Não iniciado";$("#bhAssignee").value=step.assigned_to||"";$("#bhDate").value=step.planned_date||"";$("#bhStart").value=step.planned_start||"";$("#bhEnd").value=step.planned_end||"";
    $("#bhStepModal").dataset.stepId=id;$("#bhStepModal").classList.remove("hidden");
  }

  async function saveModal(){
    const m=$("#bhStepModal"),id=m?.dataset.stepId;if(!id)return;
    const btn=$("#bhSave");btn.disabled=true;btn.textContent="Salvando...";
    const patch={status:$("#bhStatus").value,assigned_to:$("#bhAssignee").value||null,planned_date:$("#bhDate").value||null,planned_start:$("#bhStart").value||null,planned_end:$("#bhEnd").value||null};
    const ok=await saveStep(id,patch);btn.disabled=false;btn.textContent="Salvar alterações";if(ok)closeModal();
  }

  /* Agenda cards are rendered by app.js. We make them clickable without coupling to its private state. */
  async function openAgendaFromElement(el){
    const day=el.closest(".day"), dateText=day?.querySelector(".day-head small")?.textContent?.trim();
    const commission=el.querySelector("b")?.textContent?.trim();
    const smalls=[...el.querySelectorAll("small")];
    const personTask=smalls[0]?.textContent||"";const task=personTask.split(" • ").slice(1).join(" • ").trim();
    let q=window.sb.from("agenda_items").select(`*,commission:commissions(*),profile:profiles(*)`).eq("task",task);
    const r=await q;
    let item=(r.data||[]).find(x=>(x.commission?.name||"Comissão")===commission);
    if(!item && r.data?.length===1)item=r.data[0];
    if(!item){alert("Não consegui localizar esta atividade no banco.");return;}
    showAgenda(item);
  }

  function showAgenda(item){
    ensureModal();const c=item.commission||{},p=item.profile||{};
    $("#bhTitle").textContent=item.task||"Atividade da agenda";
    $("#bhBody").innerHTML=`<div class="bh-grid"><div class="bh-field"><small>Comissão</small><b>${esc(c.name||"—")}</b></div><div class="bh-field"><small>Responsável</small><b>${esc(p.name||item.collaborator_name||"—")}</b></div><div class="bh-field"><small>Data</small><b>${dateBR(item.date)}</b></div><div class="bh-field"><small>Horas</small><b>${esc(item.hours||0)}h</b></div><div class="bh-field"><small>Status</small><b>${esc(item.status||"Pendente")}</b></div><div class="bh-field"><small>Cliente</small><b>${esc(c.client||"—")}</b></div><div class="bh-field bh-full"><small>O que precisa ser feito</small><span>${esc(item.task||"—")}</span></div><div class="bh-field bh-full"><small>Observações da comissão</small><span>${esc(c.notes||"Nenhuma observação cadastrada.")}</span></div></div>`;
    $("#bhSave").style.display="none";$("#bhStepModal").dataset.stepId="";$("#bhStepModal").classList.remove("hidden");
  }

  function bind(){
    $("#productionFilter")?.addEventListener("change",render);
    $("#productionRefresh")?.addEventListener("click",loadProduction);
    document.addEventListener("click",e=>{
      const statusBtn=e.target.closest("[data-status-step]");if(statusBtn){e.stopPropagation();saveStep(statusBtn.dataset.statusStep,{status:statusBtn.dataset.status});return;}
      const open=e.target.closest("[data-open-step]");if(open){e.stopPropagation();$("#bhSave")&&( $("#bhSave").style.display="");openStep(open.dataset.openStep);return;}
      const card=e.target.closest(".production-card");if(card&&!e.target.closest("button")){openStep(card.dataset.stepId);return;}
      const agenda=e.target.closest("#agendaGrid .item");if(agenda){agenda.classList.add("bh-agenda");openAgendaFromElement(agenda);}
    });
  }

  function subscribe(){
    if(!window.sb)return;if(channel)window.sb.removeChannel(channel);
    channel=window.sb.channel("bithouse-production-v3").on("postgres_changes",{event:"*",schema:"public",table:"asset_steps"},loadProduction).on("postgres_changes",{event:"*",schema:"public",table:"assets"},loadProduction).on("postgres_changes",{event:"*",schema:"public",table:"agenda_items"},loadProduction).subscribe();
  }

  window.loadProduction=loadProduction;
  function init(){ensureModal();bind();if(window.user){loadProduction();subscribe();}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
