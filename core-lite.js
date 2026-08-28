/* BITHOUSE CORE LITE — sessão única, sem timers de corrida */
(function(){'use strict';
const SUPABASE_URL=window.SUPABASE_URL||window.supabaseUrl, SUPABASE_KEY=window.SUPABASE_ANON_KEY||window.supabaseKey;
if(!window.supabase||!SUPABASE_URL||!SUPABASE_KEY){console.error('Bithouse: configuração Supabase ausente');return}
window.sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const fmt=v=>{if(!v)return '';const d=new Date(String(v).includes('T')?v:v+'T12:00:00');return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(d)};
window.BH={q:s=>document.querySelector(s),esc,norm,fmt,session:null,user:null};
let readyResolve;window.BH.ready=new Promise(r=>readyResolve=r);
(async()=>{try{const {data,error}=await window.sb.auth.getSession();if(error)throw error;window.BH.session=data.session||null;window.user=data.session?.user||null;window.BH.user=window.user;readyResolve(window.user);document.documentElement.dataset.auth=window.user?'yes':'no';const name=document.querySelector('#userName');if(name)name.textContent=window.user?.user_metadata?.name||window.user?.email?.split('@')[0]||'Sócio';const state=document.querySelector('#syncState');if(state)state.textContent=window.user?'● conectado':'● aguardando login';if(window.user){window.sb.auth.onAuthStateChange((_e,s)=>{window.BH.session=s;window.user=s?.user||null;window.BH.user=window.user;});}}catch(e){console.error('Bithouse sessão:',e);readyResolve(null);}})();
})();