/* BITHOUSE — AGENDA PHASE 2
   Drag & drop, conflict awareness, quick status actions and mobile-safe controls.
*/
(function(){
  "use strict";
  const $=s=>document.querySelector(s);
  const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const status=v=>{const s=norm(v);if(s==="concluido")return "Concluído";if(s==="em andamento")return "Em andamento";if(s==="bloqueado")return "Bloqueado";return "Não iniciado"};
  let dragId=null;

  const css=document.createElement("style");
  css.textContent=`
    .bh-agenda{position:relative;cursor:pointer;touch-action:pan-y}.bh-agenda[draggable="true"]{cursor:grab}.bh-agenda.bh-dragging{opacity:.45;transform:scale(.98)}
    .bh-drop-target{outline:2px dashed #5575d9;outline-offset:-5px;background:rgba(85,117,217,.07)!important}
    .bh-conflict{display:inline-flex;align-items:center;gap:4px;margin-top:5px;padding:3px 7px;border-radius:999px;background:#fff0e8;color:#a6532b;font-size:10px;font-weight:900}
    .bh-quick-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.bh-quick{border:1px solid #d6dfed;background:#fff;border-radius:8px;padding:5px 7px;font-size:10px;font-weight:900;cursor:pointer}.bh-quick:hover{background:#f3f6fb}
    .bh-agenda-hint{font-size:11px;color:#71819d;margin:7px 0 0}.bh-overload{border-color:#e7a47c!important}
    @media(max-width:650px){.bh-quick{padding:7px 9px}.bh-agenda-hint{font-size:10px}}
  `;
  document.head.appendChild(css);

  async function getItem(id){
    if(!window.sb)return null;
    const r=await window.sb.from("agenda_items").select("*").eq("id",id).maybeSingle();
    return r.data||null;
  }
  async function setStatus(id,newStatus){
    if(!window.sb)return;
    const item=await getItem(id);if(!item)return;
    const patch={status:newStatus};
    if(newStatus==="Concluído"){patch.completed_at=new Date().toISOString()}
    const r=await window.sb.from("agenda_items").update(patch).eq("id",id);
    if(r.error){alert("Não foi possível alterar o status.\n\n"+r.error.message);return}
    if(window.appRefresh)await window.appRefresh();
  }

  async function moveToDate(id,date){
    if(!window.sb||!date)return;
    const item=await getItem(id);if(!item)return;
    const r=await window.sb.from("agenda_items").update({date}).eq("id",id);
    if(r.error){alert("Não foi possível mover este item.\n\n"+r.error.message);return}
    if(window.appRefresh)await window.appRefresh();
  }

  function decorate(){
    const grid=$("#agendaGrid");if(!grid)return;
    grid.querySelectorAll(".bh-agenda").forEach(el=>{
      if(el.dataset.phase2Ready)return;
      el.dataset.phase2Ready="1";el.draggable=true;
      const id=el.dataset.agendaId;if(!id)return;
      el.addEventListener("dragstart",e=>{dragId=id;el.classList.add("bh-dragging");e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",id)});
      el.addEventListener("dragend",()=>{dragId=null;el.classList.remove("bh-dragging");grid.querySelectorAll(".bh-drop-target").forEach(x=>x.classList.remove("bh-drop-target"))});
      const quick=document.createElement("div");quick.className="bh-quick-actions";
      const current=norm(el.querySelector(".bh-status")?.textContent);
      const next=current==="nao iniciado"?"Em andamento":current==="em andamento"?"Concluído":"Em andamento";
      quick.innerHTML=`<button type="button" class="bh-quick" data-quick-status="${esc(id)}" data-next-status="${esc(next)}">${next==="Concluído"?"✓ Concluir":"▶ Iniciar"}</button>`;
      if(current==="concluido")quick.innerHTML+=`<button type="button" class="bh-quick" data-quick-status="${esc(id)}" data-next-status="Em andamento">↩ Reabrir</button>`;
      el.appendChild(quick);
      quick.addEventListener("click",e=>{e.stopPropagation();const b=e.target.closest("[data-quick-status]");if(b)setStatus(b.dataset.quickStatus,b.dataset.nextStatus)});
    });
    grid.querySelectorAll(".day").forEach(day=>{
      if(day.dataset.phase2Drop)return;day.dataset.phase2Drop="1";
      day.addEventListener("dragover",e=>{if(!dragId)return;e.preventDefault();day.classList.add("bh-drop-target")});
      day.addEventListener("dragleave",e=>{if(e.target===day)day.classList.remove("bh-drop-target")});
      day.addEventListener("drop",async e=>{e.preventDefault();day.classList.remove("bh-drop-target");const id=e.dataTransfer.getData("text/plain")||dragId;if(!id)return;const head=day.querySelector(".day-head small");const text=head?.textContent||"";const item=await getItem(id);if(!item)return;const currentDate=item.date;const target=day.querySelector(".day-head")?.dataset?.date||null;let dateValue=target;if(!dateValue){const days=[...grid.querySelectorAll(".day")];const idx=days.indexOf(day);const mondayText=$("#weekTitle")?.textContent||"";const match=mondayText.match(/(\d{2})\/(\d{2})\/(\d{4})/);if(match){const d=new Date(`${match[3]}-${match[2]}-${match[1]}T12:00:00`);d.setDate(d.getDate()+idx);dateValue=d.toISOString().slice(0,10)}}if(dateValue&&dateValue!==currentDate)await moveToDate(id,dateValue)});
    });
    // Make the day target explicit from the rendered order and week title.
    const days=[...grid.querySelectorAll(".day")];const title=$("#weekTitle")?.textContent||"";const m=title.match(/(\d{2})\/(\d{2})\/(\d{4})/);if(m){const base=new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`);days.forEach((d,i)=>{const x=new Date(base);x.setDate(x.getDate()+i);d.querySelector(".day-head")?.setAttribute("data-date",x.toISOString().slice(0,10))})}
  }

  const observer=new MutationObserver(()=>decorate());
  function init(){const grid=$("#agendaGrid");if(grid)observer.observe(grid,{childList:true,subtree:true});decorate();}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
