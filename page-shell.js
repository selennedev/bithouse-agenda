/* Bithouse — shell compartilhado das páginas */
(function(){
 const css=document.createElement('style');css.textContent='.page-main{padding:30px 0 60px}.page-loading{padding:40px;text-align:center;color:#71809a;background:#fff;border:1px solid #d9e1ef;border-radius:18px}.page-nav-active{font-weight:900!important}';document.head.appendChild(css);
 document.addEventListener('DOMContentLoaded',()=>{const path=location.pathname.split('/').pop()||'index.html';document.querySelectorAll('nav a').forEach(a=>{if(a.getAttribute('href')===path)a.classList.add('page-nav-active')})});
})();