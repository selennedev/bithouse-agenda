/* BITHOUSE — PHASE 9: COMMISSION EDITOR
   Permite editar qualquer comissão já cadastrada sem duplicar agenda.
*/
(function(){
  'use strict';
  const sb=()=>window.sb;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  let observer=null;

  function ensureStyle(){
    if($('#bh9Style'))return;
    const s=document.createElement('style');s.id='bh9Style';
    s.textContent=`
      .bh9-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
      .bh9-edit{width:100%;margin-top:8px}
      .bh9-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .bh9-field{display:flex;flex-direction:column;gap:5px}
      .bh9-field.full{grid-column:1/-1}
      .bh9-field label{font-size:10px;font-weight:900;letter-spacing:.8px;color:#8290a9;text-transform:uppercase}
      .bh9-field input,.bh9-field select,.bh9-field textarea{width:100%;box-sizing:border-box;border:1px solid #d9e1ef;border-radius:12px;background:#fff;color:#17294d;padding:10px 12px;font:700 12px Nunito}
      .bh9-field textarea{min-height:90px;resize:vertical}
      .bh9-progress{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
      .bh9-progress output{font-weight:900;color:#17294d;min-width:42px;text-align:right}
      @media(max-width:650px){.bh9-grid{grid-template-columns:1fr}.bh9-field.full{grid-column:auto}}
    `;document.head.appendChild(s);
  }

  function attach(){
    const grid=$('#commissionGrid'); if(!grid)return;
    grid.querySelectorAll('.card[data-commission-id]').forEach(card=>{
      if(card.querySelector('.bh9-edit'))return;
      const id=card.dataset.commissionId;
      const btn=document.createElement('button');
      btn.type='button';btn.className='ghost-btn small bh9-edit';btn.textContent='✎ Editar comissão';
      btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openEditor(id)});
      const details=card.querySelector('.bh-open-commission');
      if(details)details.insertAdjacentElement('afterend',btn);else card.appendChild(btn);
    });
  }

  async function openEditor(id){
    if(!sb()||!window.user)return;
    const {data:c,error}=await sb().from('commissions').select('*').eq('id',id).maybeSingle();
    if(error||!c){alert(error?.message||'Comissão não encontrada.');return;}

    // A tabela profiles desta instalação não possui coluna "active".
    // Carregamos os três sócios diretamente para o seletor.
    const {data:profiles, error:profilesError}=await sb().from('profiles').select('id,name,role,specialty').order('name');
    if(profilesError){alert('Não foi possível carregar os responsáveis: '+profilesError.message);return;}
    const owners=profiles||[];
    const ownerOptions='<option value="">Sem responsável</option>'+owners.map(p=>`<option value="${esc(p.id)}" ${p.id===c.owner_id?'selected':''}>${esc(p.name)}</option>`).join('');
    const progress=Math.round(Number(c.progress||0)*100);
    const body=`<div class="bh9-grid">
      <div class="bh9-field"><label>Nome da comissão</label><input id="bh9Name" value="${esc(c.name)}" required></div>
      <div class="bh9-field"><label>Cliente</label><input id="bh9Client" value="${esc(c.client||'')}"></div>
      <div class="bh9-field"><label>Status</label><select id="bh9Status">
        ${['Planejamento','Não iniciado','Em andamento','Bloqueado','Concluído','Cancelado'].map(v=>`<option ${norm(v)===norm(c.status)?'selected':''}>${v}</option>`).join('')}
      </select></div>
      <div class="bh9-field"><label>Prioridade</label><select id="bh9Priority">${['Alta','Média','Baixa'].map(v=>`<option ${norm(v)===norm(c.priority)?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="bh9-field"><label>Responsável</label><select id="bh9Owner">${ownerOptions}</select></div>
      <div class="bh9-field"><label>Mapa / lote</label><input id="bh9Map" value="${esc(c.map_name||'')}"></div>
      <div class="bh9-field"><label>Início</label><input id="bh9Start" type="date" value="${esc(c.start_date||'')}"></div>
      <div class="bh9-field"><label>Prazo</label><input id="bh9Deadline" type="date" value="${esc(c.deadline||'')}"></div>
      <div class="bh9-field full"><label>Progresso</label><div class="bh9-progress"><input id="bh9Progress" type="range" min="0" max="100" step="1" value="${progress}"><output id="bh9ProgressOut">${progress}%</output></div></div>
      <div class="bh9-field full"><label>Observações</label><textarea id="bh9Notes">${esc(c.notes||'')}</textarea></div>
    </div>`;
    const modal=$('#bhGlobalModal');
    if(!modal){alert('Interface de edição ainda não carregou. Atualize a página e tente novamente.');return;}
    $('#bhModalEyebrow').textContent='EDITAR COMISSÃO';
    $('#bhModalTitle').textContent=c.name;
    $('#bhModalBody').innerHTML=body;
    $('#bhModalSave').textContent='Salvar comissão';
    $('#bhModalSave').onclick=async()=>save(id);
    modal.classList.remove('hidden');
    $('#bh9Progress').oninput=()=>$('#bh9ProgressOut').textContent=$('#bh9Progress').value+'%';
  }

  async function save(id){
    const name=$('#bh9Name').value.trim();
    if(!name){alert('O nome da comissão é obrigatório.');return;}
    const patch={
      name,
      client:$('#bh9Client').value.trim()||null,
      status:$('#bh9Status').value,
      priority:$('#bh9Priority').value,
      owner_id:$('#bh9Owner').value||null,
      map_name:$('#bh9Map').value.trim()||null,
      start_date:$('#bh9Start').value||null,
      deadline:$('#bh9Deadline').value||null,
      progress:Number($('#bh9Progress').value||0)/100,
      notes:$('#bh9Notes').value.trim()||null,
      updated_at:new Date().toISOString()
    };
    const b=$('#bhModalSave');b.disabled=true;b.textContent='Salvando...';
    const {error}=await sb().from('commissions').update(patch).eq('id',id);
    if(error){b.disabled=false;b.textContent='Salvar comissão';alert('Não foi possível salvar:\n\n'+error.message);return;}
    await sb().from('activity_log').insert({actor_id:window.user?.id||null,action:'updated_commission',entity_type:'commission',entity_id:id,details:patch});
    $('#bhGlobalModal').classList.add('hidden');
    if(window.appRefresh)await window.appRefresh();
  }

  function init(){
    ensureStyle();
    attach();
    if(observer)observer.disconnect();
    observer=new MutationObserver(()=>attach());
    const grid=$('#commissionGrid');if(grid)observer.observe(grid,{childList:true});
    if(window.appRefresh){
      const old=window.appRefresh;
      if(!window.__bh9Wrapped){
        window.__bh9Wrapped=true;
        window.appRefresh=async function(){const r=await old();setTimeout(attach,50);return r;};
      }
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,300));else setTimeout(init,300);
})();