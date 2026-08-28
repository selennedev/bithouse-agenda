/* BITHOUSE — PHASE 4: capacity intelligence */
(function(){
'use strict';
const sb=()=>window.sb,n=v=>Number(v||0),norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const key=d=>new Date(d).toISOString().slice(0,10);
function workdays(a,b){let c=0,d=new Date(a+'T12:00:00'),e=new Date(b+'T12:00:00');while(d<=e){if(d.getDay()>0)c++;d.setDate(d.getDate()+1)}return c}
async function loadCapacity(){
 if(!sb()||!window.user)return;
 const [p,a,c,s]=await Promise.all([
  sb().from('profiles').select('*').eq('active',true),
  sb().from('agenda_items').select('profile_id,date,hours,status'),
  sb().from('commissions').select('id,name,deadline,progress,status'),
  sb().from('asset_steps').select('id,status,estimated_minutes,planned_minutes,assigned_to,planned_date,priority')
 ]);
 const profiles=p.data||[],agenda=a.data||[],commissions=c.data||[],steps=s.data||[];
 const today=key(new Date()),future=new Date();future.setDate(future.getDate()+14);const end=key(future);
 const people=profiles.map(x=>{const daily=n(x.hours_per_day)*.8,days=workdays(today,end),cap=daily*days,used=agenda.filter(a=>a.profile_id===x.id&&a.date>=today&&a.date<=end&&norm(a.status)!=='concluido').reduce((z,a)=>z+n(a.hours),0);return {...x,capacity:cap,used,available:Math.max(0,cap-used),utilization:cap?used/cap:0}});
 const overdue=commissions.filter(x=>x.deadline&&x.deadline<today&&norm(x.status)!=='concluido');
 const soon=commissions.filter(x=>x.deadline&&x.deadline>=today&&x.deadline<=end&&norm(x.status)!=='concluido');
 const unplanned=steps.filter(x=>!x.planned_date&&norm(x.status)!=='concluido').length;
 const alerts=[];people.filter(x=>x.utilization>=.9).forEach(x=>alerts.push({severity:x.utilization>=1?'danger':'warning',message:`${x.name}: ${Math.round(x.utilization*100)}% comprometido nos próximos 14 dias.`}));overdue.forEach(x=>alerts.push({severity:'danger',message:`${x.name}: prazo vencido.`}));soon.forEach(x=>alerts.push({severity:'warning',message:`${x.name}: prazo nos próximos 14 dias.`}));if(unplanned)alerts.push({severity:'warning',message:`${unplanned} etapa(s) ainda sem data planejada.`});
 window.bithouseCapacity={profiles:people,commissions,steps,alerts,generatedAt:new Date().toISOString()};
 render(people,alerts,overdue,soon);
}
function render(people,alerts,overdue,soon){const host=document.querySelector('#capacityInsights');if(!host)return;host.innerHTML=`<div class="capacity-insights"><div><small>14 DIAS</small><strong>${people.reduce((s,p)=>s+p.used,0).toFixed(1)}h</strong><span>comprometidas</span></div><div><small>LIVRE</small><strong>${people.reduce((s,p)=>s+p.available,0).toFixed(1)}h</strong><span>capacidade</span></div><div><small>PRAZOS</small><strong>${overdue.length+soon.length}</strong><span>${overdue.length} atrasado(s)</span></div><div><small>ALERTAS</small><strong>${alerts.length}</strong><span>atenção</span></div></div>${alerts.length?`<div class="capacity-alerts">${alerts.map(a=>`<div class="capacity-alert ${a.severity}">⚠ ${a.message}</div>`).join('')}</div>`:''}`}
window.loadCapacity=loadCapacity;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadCapacity);else loadCapacity();
})();
