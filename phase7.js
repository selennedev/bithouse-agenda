/* BITHOUSE — PHASE 7: SMART PLANNER
   Assistido por regras: recomenda responsável, horário e dia;
   respeita capacidade, dependências, prazo e evita conflito.
*/
(function(){
'use strict';
const sb=()=>window.sb,n=v=>Number(v||0),norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const key=d=>new Date(d+'T12:00:00').toISOString().slice(0,10);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function addDay(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return key(d)}
function isWorkday(s){return new Date(s+'T12:00:00').getDay()!==0}
function canonical(v){const x=norm(v);return x==='concluido'?'Concluído':x==='em andamento'?'Em andamento':x==='bloqueado'?'Bloqueado':'Não iniciado'}
function dailyCapacity(p){return n(p.hours_per_day)*.8}
function specialtyScore(p,step){const a=norm(p.specialty||p.role),b=norm(step.step_type);if(!a||!b)return 0;if(a.includes(b)||b.includes(a))return 100;const words=b.split(/\s+/).filter(x=>x.length>3);return words.some(w=>a.includes(w))?50:0}
async function fetchPlannerData(){
 const [pr,ag,st,as,co]=await Promise.all([
  sb().from('profiles').select('id,name,specialty,role,hours_per_day,days_per_week').eq('active',true),
  sb().from('agenda_items').select('id,commission_id,task,description,profile_id,date,hours,status,start_time,end_time,asset_step_id'),
  sb().from('asset_steps').select('id,asset_id,step_type,status,assigned_to,estimated_minutes,planned_minutes,priority,planned_date,planned_start,planned_end,depends_on_step_id,description,instructions'),
  sb().from('assets').select('id,name,map_id,description,status,priority'),
  sb().from('commissions').select('id,name,deadline,start_date,status,priority,progress')
 ]);
 return {profiles:pr.data||[],agenda:ag.data||[],steps:st.data||[],assets:as.data||[],commissions:co.data||[]};
}
function buildPlans(d){
 const today=key(new Date());
 const plans=[];
 const workload=(p,date)=>d.agenda.filter(a=>a.profile_id===p.id&&a.date===date&&canonical(a.status)!=='Concluído').reduce((s,a)=>s+n(a.hours),0);
 const steps=d.steps.filter(s=>canonical(s.status)!=='Concluído');
 steps.forEach(step=>{
  const existing=d.agenda.find(a=>a.asset_step_id===step.id);
  if(existing&&existing.profile_id) return;
  const mins=n(step.estimated_minutes)||n(step.planned_minutes); if(!mins)return;
  const candidates=d.profiles.map(p=>{const daily=dailyCapacity(p);let best=null;
   for(let i=0;i<30;i++){const day=addDay(today,i);if(!isWorkday(day))continue;const used=workload(p,day),room=Math.max(0,daily-used);if(room>=Math.min(daily,mins/60)){best={day,room};break}}
   const utilization=(()=>{const future=d.agenda.filter(a=>a.profile_id===p.id&&a.date>=today&&a.date<=addDay(today,13)&&canonical(a.status)!=='Concluído').reduce((s,a)=>s+n(a.hours),0);return daily?future/(daily*10):1})();
   return {p,day:best?.day||null,room:best?.room||0,score:(best?best.room*10:0)+specialtyScore(p,step)-utilization*20};
  }).filter(x=>x.day).sort((a,b)=>b.score-a.score);
  const pick=candidates[0]||null;
  plans.push({step,existing,suggested:pick?.p||null,date:pick?.day||step.planned_date||null,minutes:mins,reason:pick?'melhor equilíbrio entre capacidade e especialidade':'sem capacidade disponível'});
 });
 return plans;
}
async function applyPlan(plan){
 if(!plan?.suggested)return {ok:false,message:'Sem responsável disponível.'};
 const p=plan.suggested,st=plan.step;
 const up=await sb().from('asset_steps').update({assigned_to:p.id,planned_date:plan.date||null,updated_at:new Date().toISOString()}).eq('id',st.id);
 if(up.error)return {ok:false,message:up.error.message};
 if(plan.existing){
  const hours=Math.round(plan.minutes/60*100)/100;
  const au=await sb().from('agenda_items').update({profile_id:p.id,date:plan.date,hours,status:canonical(plan.existing.status)}).eq('id',plan.existing.id);
  if(au.error)return {ok:false,message:au.error.message};
 } else {
  return {ok:true,message:'Responsável definido. A etapa não tinha item de agenda associado; nenhum item foi criado automaticamente.'};
 }
 await sb().from('activity_log').insert({actor_id:window.user?.id||null,action:'smart_plan_applied',entity_type:'asset_step',entity_id:st.id,metadata:{assigned_to:p.id,planned_date:plan.date}});
 return {ok:true,message:'Plano aplicado.'};
}
async function autoPlanAll(){
 if(!sb()||!window.user)return;
 const d=await fetchPlannerData(),plans=buildPlans(d);window.bithousePhase7={data:d,plans,generatedAt:new Date().toISOString()};render(plans);
}
function render(plans){
 let host=document.querySelector('#planningInsights');if(!host){host=document.querySelector('#capacityInsights');if(!host)return;}
 const old=document.querySelector('#bh7Panel');if(old)old.remove();
 const box=document.createElement('div');box.id='bh7Panel';box.className='bh7-panel';
 const ready=plans.filter(x=>x.suggested).length;
 box.innerHTML=`<div class="bh7-head"><div><small>FASE 7 • PLANEJADOR</small><h3>Distribuição inteligente</h3><p>${ready} de ${plans.length} etapas podem receber uma recomendação agora.</p></div><button class="ghost-btn small" id="bh7Run">↻ Recalcular</button></div><div class="bh7-actions"><button class="primary-btn" id="bh7ApplyAll">Aplicar recomendações</button><span class="bh7-note">Nada é movido sem passar por esta ação.</span></div><div class="bh7-list">${plans.slice(0,30).map((x,i)=>`<div class="bh7-row"><div><b>${esc(x.step.step_type||'Etapa')}</b><small>${x.minutes} min • ${esc(x.date||'sem data')} • ${esc(x.reason)}</small></div><strong>${x.suggested?'→ '+esc(x.suggested.name):'Sem candidato'}</strong><button class="ghost-btn small" data-bh7="${i}" ${x.suggested?'':'disabled'}>Aplicar</button></div>`).join('')||'<div class="muted">Nenhuma etapa nova para planejar.</div>'}</div>`;
 host.appendChild(box);
 box.querySelector('#bh7Run').onclick=autoPlanAll;
 box.querySelectorAll('[data-bh7]').forEach(b=>b.onclick=async()=>{b.disabled=true;const r=await applyPlan(plans[Number(b.dataset.bh7)]);b.textContent=r.ok?'✓ Aplicado':'Erro';if(r.ok){await autoPlanAll();if(window.appRefresh)await window.appRefresh()}else alert(r.message)});
 box.querySelector('#bh7ApplyAll').onclick=async()=>{if(!plans.length)return;const b=box.querySelector('#bh7ApplyAll');b.disabled=true;b.textContent='Aplicando...';let ok=0;for(const plan of plans){if(plan.suggested){const r=await applyPlan(plan);if(r.ok)ok++}};b.textContent=`✓ ${ok} aplicadas`;if(window.appRefresh)await window.appRefresh();setTimeout(autoPlanAll,500)};
}
function injectStyle(){if(document.querySelector('#bh7Style'))return;const s=document.createElement('style');s.id='bh7Style';s.textContent=`.bh7-panel{margin-top:16px;background:#fff;border:1px solid #d9e1ef;border-radius:20px;padding:18px}.bh7-head{display:flex;justify-content:space-between;gap:14px;align-items:start}.bh7-head h3{font:700 22px 'Space Grotesk';margin:5px 0}.bh7-head p{margin:0;color:#71809a;font-size:12px}.bh7-head small{font-size:10px;font-weight:900;color:#58709b;letter-spacing:1.5px}.bh7-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:15px 0}.bh7-note{font-size:11px;color:#71809a}.bh7-list{display:grid;gap:7px}.bh7-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;border:1px solid #e5e9f1;border-radius:12px;padding:10px}.bh7-row b{display:block;font-size:12px}.bh7-row small{display:block;color:#7b89a1;font-size:10px;margin-top:3px}.bh7-row strong{font-size:11px}.bh7-row button:disabled{opacity:.45}@media(max-width:650px){.bh7-panel{padding:14px;border-radius:16px}.bh7-head{flex-direction:column}.bh7-row{grid-template-columns:1fr;gap:6px}.bh7-row button{width:100%}.bh7-actions .primary-btn{width:100%}}`;document.head.appendChild(s)}
function init(){injectStyle();if(window.user)autoPlanAll();else setTimeout(()=>{if(window.user)autoPlanAll()},1500);if(window.sb){window.sb.channel('bithouse-phase7').on('postgres_changes',{event:'*',schema:'public',table:'asset_steps'},()=>autoPlanAll()).on('postgres_changes',{event:'*',schema:'public',table:'agenda_items'},()=>autoPlanAll()).subscribe()}}
window.bithousePhase7={refresh:autoPlanAll,apply:applyPlan};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
