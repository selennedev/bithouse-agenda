/* BITHOUSE — CAPACITY | optimized */
(function(){'use strict';
const sb=()=>window.sb,n=v=>Number(v||0),norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),key=d=>new Date(d).toISOString().slice(0,10);
function addDays(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return key(d)}
function workdays(a,b){let c=0,d=new Date(a+'T12:00:00'),e=new Date(b+'T12:00:00');while(d<=e){if(d.getDay()!==0)c++;d.setDate(d.getDate()+1)}return c}
function pct(v){const x=n(v);return Math.min(1,Math.max(0,x>1?x/100:x))}
function forecastDate(start,minutes,daily){if(!daily||minutes<=0)return null;let d=new Date(start+'T12:00:00'),left=minutes;while(left>0){if(d.getDay()!==0)left-=daily;if(left>0)d.setDate(d.getDate()+1)}return key(d)}
async function loadCapacity(){if(!sb()||!window.user)return;const today=key(new Date()),future=addDays(today,14);
const [pr,ag,co,st]=await Promise.all([
 sb().from('profiles').select('id,name,specialty,role,hours_per_day,days_per_week,active').eq('active',true),
 sb().from('agenda_items').select('id,commission_id,asset_step_id,profile_id,date,hours,status').gte('date',today).lte('date',future),
 sb().from('commissions').select('id,name,deadline,progress,status,start_date,priority').neq('status','Concluído'),
 sb().from('asset_steps').select('id,status,assigned_to,estimated_minutes,planned_minutes,priority,step_type').neq('status','Concluído').limit(500)
]);
const profiles=pr.data||[],agenda=ag.data||[],commissions=co.data||[],steps=st.data||[];
const people=profiles.map(p=>{const daily=n(p.hours_per_day)*.8,cap=daily*workdays(today,future),used=agenda.filter(a=>a.profile_id===p.id&&norm(a.status)!=='concluido').reduce((z,a)=>z+n(a.hours),0);return {...p,daily_capacity:daily,capacity:cap,used,available:Math.max(0,cap-used),utilization:cap?used/cap:0}});
const idsByCommission=new Map();agenda.forEach(a=>{if(a.asset_step_id){if(!idsByCommission.has(a.commission_id))idsByCommission.set(a.commission_id,new Set());idsByCommission.get(a.commission_id).add(a.asset_step_id)}});
const stepMap=new Map(steps.map(s=>[s.id,s]));
const forecast=commissions.map(c=>{const ids=idsByCommission.get(c.id)||new Set();const pending=[...ids].map(id=>stepMap.get(id)).filter(Boolean);const mins=pending.reduce((z,s)=>z+(n(s.estimated_minutes)||n(s.planned_minutes)),0),assigned=people.filter(p=>pending.some(s=>s.assigned_to===p.id)),daily=assigned.reduce((z,p)=>z+p.daily_capacity,0),start=c.start_date&&c.start_date>today?c.start_date:today,fd=forecastDate(start,mins,daily);let risk='ok';if(c.deadline&&fd&&fd>c.deadline)risk='danger';else if(c.deadline&&fd&&workdays(today,fd)>=Math.max(1,workdays(today,c.deadline)-1))risk='warning';return {...c,remaining_minutes:mins,forecast_date:fd,risk,assigned_people:assigned.map(p=>p.name)}});
const alerts=[];people.forEach(p=>{if(p.utilization>=1)alerts.push({severity:'danger',message:`${p.name}: capacidade estourada em ${Math.round((p.utilization-1)*100)}%.`});else if(p.utilization>=.9)alerts.push({severity:'warning',message:`${p.name}: ${Math.round(p.utilization*100)}% comprometido.`})});forecast.forEach(c=>{if(c.risk==='danger')alerts.push({severity:'danger',message:`${c.name}: previsão ${c.forecast_date} ultrapassa o prazo ${c.deadline}.`});else if(c.risk==='warning')alerts.push({severity:'warning',message:`${c.name}: prazo muito próximo da previsão.`})});
window.bithouseCapacity={profiles:people,commissions,steps,forecasts:forecast,alerts,generatedAt:new Date().toISOString()};render(people,alerts,forecast)}
function render(people,alerts,forecast){const host=document.querySelector('#capacityInsights');if(!host)return;const used=people.reduce((s,p)=>s+p.used,0),free=people.reduce((s,p)=>s+p.available,0);host.innerHTML=`<div class="capacity-insights"><div><small>PRÓXIMOS 14 DIAS</small><strong>${used.toFixed(1)}h</strong><span>comprometidas</span></div><div><small>CAPACIDADE LIVRE</small><strong>${free.toFixed(1)}h</strong><span>disponível</span></div><div><small>EM RISCO</small><strong>${forecast.filter(x=>x.risk==='danger').length}</strong><span>fora do prazo</span></div><div><small>ALERTAS</small><strong>${alerts.length}</strong><span>atenção</span></div></div>${alerts.length?`<div class="capacity-alerts">${alerts.map(a=>`<div class="capacity-alert ${a.severity}">⚠ ${a.message}</div>`).join('')}</div>`:''}<div class="forecast-list"><h3>Previsão de entrega</h3>${forecast.map(x=>`<div class="forecast-row ${x.risk}"><b>${String(x.name||'Comissão')}</b><span>${x.forecast_date?'Prev. '+x.forecast_date:'Sem capacidade configurada'}</span><em>${Math.round(pct(x.progress)*100)}%</em></div>`).join('')||'<div class="muted">Nenhuma comissão pendente.</div>'}</div>`}
window.loadCapacity=loadCapacity;
})();
