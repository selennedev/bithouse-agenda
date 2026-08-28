/* BITHOUSE PHASE 6 — operations dashboard */
(function(){'use strict';
const sb=()=>window.sb;
async function loadOps(){if(!sb()||!window.user)return;const [a,s,c]=await Promise.all([sb().from('agenda_items').select('id,date,task,hours,status,collaborator_name'),sb().from('asset_steps').select('id,status'),sb().from('commissions').select('id,name,status,priority,progress,deadline')]);window.bithouseOps={agenda:a.data||[],steps:s.data||[],commissions:c.data||[],generatedAt:new Date().toISOString()};render();}
function render(){const host=document.querySelector('#opsInsights');if(!host)return;const d=window.bithouseOps||{agenda:[],steps:[],commissions:[]};host.innerHTML='<div class="bh6-summary"><div><small>AGENDA ABERTA</small><strong>'+d.agenda.filter(x=>x.status!=='Concluído').length+'</strong></div><div><small>ETAPAS ABERTAS</small><strong>'+d.steps.filter(x=>x.status!=='Concluído').length+'</strong></div><div><small>COMISSÕES ABERTAS</small><strong>'+d.commissions.filter(x=>x.status!=='Concluído').length+'</strong></div><div><small>ALTA PRIORIDADE</small><strong>'+d.commissions.filter(x=>x.priority==='Alta'&&x.status!=='Concluído').length+'</strong></div></div>';}
window.loadOps=loadOps;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loadOps);else loadOps();
})();
