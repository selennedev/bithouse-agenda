/* BITHOUSE — PHASE 8: visual system
   Unifica Inteligência e Controle com a linguagem da Agenda.
*/
(function(){
'use strict';
function inject(){
 if(document.getElementById('bh8-style')) return;
 const s=document.createElement('style'); s.id='bh8-style';
 s.textContent=`
/* ===== INTELIGÊNCIA ===== */
#capacityInsights,#planningInsights,#opsInsights{width:100%;}
#capacityInsights{margin-top:2px}
.capacity-insights{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 14px}
.capacity-insights>div{background:#fff;border:1px solid #d9e1ef;border-radius:17px;padding:15px;min-height:105px}
.capacity-insights small,.planning-card small,.bh6-summary small{display:block;color:#8290a9;font-size:9px;font-weight:900;letter-spacing:1.4px}
.capacity-insights strong,.planning-card strong,.bh6-summary strong{display:block;color:#17294d;font:800 27px/1.1 'Space Grotesk';margin:7px 0 4px}
.capacity-insights span,.planning-card span{display:block;color:#71809a;font-size:11px}
.capacity-alerts{display:grid;gap:8px;margin:0 0 16px}
.capacity-alert{padding:12px 14px;border:1px solid #f0dfaa;border-radius:13px;background:#fff8df;color:#67551c;font-size:12px;font-weight:800}
.capacity-alert.danger{background:#ffecef;border-color:#f0cbd2;color:#8c3448}
.forecast-list{margin-top:18px}
.forecast-list h3,.planning-columns h3{font:700 22px 'Space Grotesk';color:#17294d;margin:0 0 10px}
.forecast-row{display:grid;grid-template-columns:1.5fr 1fr auto;gap:10px;align-items:center;background:#fff;border:1px solid #d9e1ef;border-radius:14px;padding:12px 14px;margin:7px 0;font-size:12px}
.forecast-row span{color:#71809a}.forecast-row em{font-style:normal;font-weight:900;color:#17294d}.forecast-row.danger{border-left:5px solid #d85a6d}.forecast-row.warning{border-left:5px solid #e4b52e}
/* ===== PLANEJAMENTO ===== */
.planning-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}
.planning-card{background:#fff;border:1px solid #d9e1ef;border-radius:17px;padding:15px;min-height:105px}
.planning-columns{display:grid;grid-template-columns:1.4fr 1fr;gap:14px}
.planning-columns>div{background:#fff;border:1px solid #d9e1ef;border-radius:17px;padding:15px}
.planning-row{display:grid;grid-template-columns:1fr auto auto;gap:9px;align-items:center;padding:10px 0;border-top:1px solid #edf0f5;font-size:11px}
.planning-row:first-of-type{border-top:0}.planning-row b{color:#17294d}.planning-row span{color:#71809a}.planning-row em{font-style:normal;font-weight:900;color:#4f7af4}
.planning-alert{padding:11px 13px;background:#fff8df;border:1px solid #f0dfaa;border-radius:12px;font-size:11px;font-weight:800;color:#67551c;margin:7px 0}
.planning-alert.danger{background:#ffecef;border-color:#f0cbd2;color:#8c3448}
/* ===== CONTROLE ===== */
#opsInsights{margin-top:2px}
.bh6-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.bh6-summary>div{background:#fff;border:1px solid #d9e1ef;border-radius:17px;padding:15px;min-height:105px}
#opsInsights>div:nth-child(2){display:grid!important;grid-template-columns:1fr auto auto;gap:8px!important;align-items:center;margin:0 0 12px!important}
#bh6Search,#bh6Status{box-sizing:border-box;border:1px solid #d9e1ef!important;background:#fff!important;color:#17294d!important;border-radius:13px!important;min-height:44px;padding:10px 12px!important;font:700 12px Nunito!important}
#bh6Search{width:100%;min-width:0!important}.bh6-box{background:#fff;border:1px solid #d9e1ef;border-radius:13px;padding:11px 13px!important;margin:7px 0!important;font-size:12px;line-height:1.4;color:#17294d;transition:transform .12s ease}
.bh6-box:hover{transform:translateX(2px)}.bh6-mini{color:#71809a;font-size:11px}.bh6-box b{font-weight:900}
#bh6Export{min-height:44px!important;white-space:nowrap}
/* ===== PADRÃO DOS CONTROLES ===== */
.production-controls{display:flex;gap:8px;align-items:center}.production-controls select{border:2px solid #17294d;border-radius:22px;background:#fff;color:#17294d;padding:9px 12px;font:800 11px Nunito;min-height:38px}
#production .section-head>div:last-child,#capacity .section-head>div:last-child,#operations .section-head>div:last-child{align-self:center}
/* ===== MOBILE ===== */
@media(max-width:850px){
 .capacity-insights,.planning-grid,.bh6-summary{grid-template-columns:1fr 1fr}
 .planning-columns{grid-template-columns:1fr}
 #opsInsights>div:nth-child(2){grid-template-columns:1fr 1fr!important}
 #bh6Search{grid-column:1/-1}
 #bh6Export{width:100%}
}
@media(max-width:650px){
 .capacity-insights,.planning-grid,.bh6-summary{grid-template-columns:1fr 1fr;gap:8px}
 .capacity-insights>div,.planning-card,.bh6-summary>div{min-height:82px;padding:12px;border-radius:14px}
 .capacity-insights strong,.planning-card strong,.bh6-summary strong{font-size:23px}
 .planning-columns>div{padding:13px;border-radius:15px}
 .planning-row{grid-template-columns:1fr auto;gap:5px}.planning-row em{grid-column:1/-1}
 .forecast-row{grid-template-columns:1fr auto;gap:6px}.forecast-row span{grid-column:1/-1}
 #opsInsights>div:nth-child(2){grid-template-columns:1fr!important;gap:7px!important}
 #bh6Search,#bh6Status,#bh6Export{width:100%;min-height:44px!important}
 .production-controls{width:100%;display:grid;grid-template-columns:1fr auto}
 .production-controls select{width:100%}
}
@media(max-width:380px){.capacity-insights,.planning-grid,.bh6-summary{grid-template-columns:1fr}.production-controls{grid-template-columns:1fr}}
`;
 document.head.appendChild(s);
}
function init(){inject();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
