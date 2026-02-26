import{a as A}from"./chunk-JPTUFB3N.js";import{a as h,b as ee}from"./chunk-YRL7WKAS.js";var L=[],U=!1,xe=!1,Ae=!1,He=null;function O(){return h.getUser()?!0:(A(),!1)}async function bt(e=null){let t="/api/user/todos";e&&(t+=`?group_id=${encodeURIComponent(e)}`);let o=await fetch(t);if(!o.ok){if(o.status===401)return[];throw new Error("\u83B7\u53D6 Todo \u5931\u8D25")}return(await o.json()).todos||[]}async function wt(e){let t=await fetch("/api/user/todos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function ht(e,t){let o=await fetch(`/api/user/todos/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!o.ok){let n=await o.json();throw new Error(n.detail||"\u66F4\u65B0\u5931\u8D25")}return await o.json()}async function Tt(e){let t=await fetch(`/api/user/todos/${e}`,{method:"DELETE"});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u5220\u9664\u5931\u8D25")}return await t.json()}async function kt(e){let t=await fetch("/api/user/todos/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({todos:e})});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function ve(){if(!O())return[];try{return L=await bt(),W(),L}catch(e){return console.error("[Todo] Load error:",e),[]}}async function j(e,t){if(!O())return null;try{let o=await wt({text:e,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1});if(o.ok&&o.todo)return L.unshift(o.todo),W(),I("\u5DF2\u6DFB\u52A0\u5230 Todo"),o.todo}catch(o){o.message.includes("\u5DF2\u5B58\u5728")?I("\u8BE5 Todo \u5DF2\u5B58\u5728"):I("\u6DFB\u52A0\u5931\u8D25: "+o.message),console.error("[Todo] Add error:",o)}return null}async function St(e){if(!O())return;let t=L.find(n=>n.id===e);if(!t)return;let o=!t.done;try{await ht(e,{done:o}),t.done=o,G(),se(),W()}catch(n){console.error("[Todo] Toggle error:",n),I("\u66F4\u65B0\u5931\u8D25")}}async function Et(e){if(O())try{await Tt(e),L=L.filter(t=>t.id!==e),G(),se(),W(),I("\u5DF2\u5220\u9664")}catch(t){console.error("[Todo] Delete error:",t),I("\u5220\u9664\u5931\u8D25")}}async function ge(e,t){if(!O())return null;let o=e.map(n=>({text:n,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1}));try{let n=await kt(o);if(n.ok){n.added&&n.added.length>0&&(L=[...n.added,...L],W());let s=n.skipped_count>0?`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\uFF0C${n.skipped_count} \u9879\u5DF2\u5B58\u5728`:`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\u5230 Todo`;return I(s),n}}catch(n){console.error("[Todo] Batch add error:",n),I("\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return null}function be(e){return L.filter(t=>t.source.groupId===e)}function Lt(){return L.filter(e=>!e.done).length}function _t(){let e={};for(let t of L){let o=t.source.groupId;e[o]||(e[o]={groupId:o,groupTitle:t.source.groupTitle,groupUrl:t.source.groupUrl,isCustom:t.source.isCustom,todos:[]}),e[o].todos.push(t)}return Object.values(e)}function M(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}function I(e){if(window.showToast)window.showToast(e);else{let t=document.createElement("div");t.className="todo-toast",t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add("show"),10),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},2e3)}}function W(){let e=document.getElementById("todoBadge");if(!e)return;let t=Lt();t>0?(e.textContent=t>99?"99+":t,e.classList.add("show")):e.classList.remove("show")}var qe="todo_sidebar_width",$t=320,Bt=800;function It(){if(document.getElementById("todoSidebar"))return;let e=document.createElement("div");e.id="todoSidebarBackdrop",e.className="todo-sidebar-backdrop",document.body.appendChild(e),document.body.insertAdjacentHTML("beforeend",`
        <div id="todoSidebar" class="todo-sidebar">
            <div class="todo-resize-handle" id="todoResizeHandle"></div>
            <div class="todo-sidebar-header">
                <span class="todo-sidebar-title">\u{1F4CB} \u6211\u7684 Todo</span>
                <div class="todo-sidebar-actions">
                    <button class="todo-filter-btn" id="todoFilterBtn">\u53EA\u770B\u672A\u5B8C\u6210</button>
                    <button class="todo-close-btn" title="\u5173\u95ED">\u2715</button>
                </div>
            </div>
            <div class="todo-new-group">
                <button class="todo-new-group-btn" id="todoNewGroupBtn">+ \u65B0\u5EFA\u6807\u9898</button>
            </div>
            <div class="todo-sidebar-body" id="todoSidebarBody">
                <div class="todo-empty">\u6682\u65E0 Todo</div>
            </div>
        </div>
    `);let o=localStorage.getItem(qe);if(o){let c=document.getElementById("todoSidebar");c.style.width=o+"px"}let s=document.getElementById("todoSidebar").querySelector(".todo-close-btn"),a=document.getElementById("todoFilterBtn"),r=document.getElementById("todoNewGroupBtn");e.addEventListener("click",pe),s.addEventListener("click",pe),a.addEventListener("click",Mt),r.addEventListener("click",xt),Ct()}function Ct(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoResizeHandle");if(!e||!t)return;let o=!1,n=0,s=0;t.addEventListener("mousedown",a=>{o=!0,n=a.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),a.preventDefault()}),document.addEventListener("mousemove",a=>{if(!o)return;let r=n-a.clientX,c=s+r;c=Math.max($t,Math.min(Bt,c)),e.style.width=c+"px"}),document.addEventListener("mouseup",()=>{o&&(o=!1,e.classList.remove("resizing"),t.classList.remove("active"),localStorage.setItem(qe,e.offsetWidth),ee.saveSidebarWidths({todo_width:e.offsetWidth}))})}function Fe(){if(!O())return;It();let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e.classList.add("open"),t.classList.add("show"),xe=!0,ve().then(()=>G())}function pe(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e&&e.classList.remove("open"),t&&t.classList.remove("show"),xe=!1}function Mt(){U=!U;let e=document.getElementById("todoFilterBtn");e&&(e.textContent=U?"\u53EA\u770B\u672A\u5B8C\u6210":"\u663E\u793A\u5168\u90E8"),G()}function xt(){let e=document.getElementById("todoSidebarBody");if(!e||e.querySelector(".todo-new-group-input"))return;e.insertAdjacentHTML("afterbegin",`
        <div class="todo-new-group-input">
            <input type="text" placeholder="\u8F93\u5165\u65B0\u6807\u9898\u540D\u79F0..." class="todo-group-name-input" autofocus>
            <button class="todo-group-create-btn">\u521B\u5EFA</button>
            <button class="todo-group-cancel-btn">\u53D6\u6D88</button>
        </div>
    `);let o=e.querySelector(".todo-group-name-input"),n=e.querySelector(".todo-group-create-btn"),s=e.querySelector(".todo-group-cancel-btn");o.focus();let a=()=>{let r=o.value.trim();if(!r){I("\u8BF7\u8F93\u5165\u6807\u9898\u540D\u79F0");return}let c=`custom_${Date.now()}`;we(c,r,"",!0),e.querySelector(".todo-new-group-input")?.remove()};n.addEventListener("click",a),s.addEventListener("click",()=>{e.querySelector(".todo-new-group-input")?.remove()}),o.addEventListener("keydown",r=>{r.key==="Enter"&&a(),r.key==="Escape"&&e.querySelector(".todo-new-group-input")?.remove()})}function we(e,t,o,n){let s=document.getElementById("todoSidebarBody");if(!s)return;let a=s.querySelector(`.todo-group[data-group-id="${e}"]`);if(a){a.classList.remove("collapsed");let d=te();d[e]=!1,ye(d)}else{let d=te();d[e]=!1,ye(d);let m=`
            <div class="todo-group" data-group-id="${M(e)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${M(t)}">${M(t)}</span>
                    <span class="todo-group-count">0/0</span>
                    <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner"></div>
                </div>
            </div>
        `;s.insertAdjacentHTML("afterbegin",m),a=s.querySelector(`.todo-group[data-group-id="${e}"]`),a.querySelector(".todo-group-add-btn").addEventListener("click",S=>{S.stopPropagation(),we(e,t,o,n)}),a.querySelector(".todo-group-header")?.addEventListener("click",S=>{S.target.closest(".todo-group-add-btn")||De(e)})}let r=a.querySelector(".todo-group-items-inner");if(!r||r.querySelector(".todo-add-input"))return;r.insertAdjacentHTML("afterbegin",`
        <div class="todo-add-input">
            <input type="text" placeholder="\u8F93\u5165 Todo \u5185\u5BB9..." class="todo-text-input" autofocus>
            <button class="todo-add-confirm-btn">\u6DFB\u52A0</button>
        </div>
    `);let l=r.querySelector(".todo-text-input"),f=r.querySelector(".todo-add-confirm-btn");l.focus();let i=async()=>{let d=l.value.trim();if(!d){I("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}await j(d,{groupId:e,groupTitle:t,groupUrl:o||"",isCustom:n||!1})&&(l.value="",G())};f.addEventListener("click",i),l.addEventListener("keydown",d=>{d.key==="Enter"&&i(),d.key==="Escape"&&r.querySelector(".todo-add-input")?.remove()})}function G(){let e=document.getElementById("todoSidebarBody");if(!e)return;if((U?L:L.filter(s=>!s.done)).length===0){e.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let o=_t(),n="";for(let s of o){let a=U?s.todos:s.todos.filter(m=>!m.done);if(a.length===0&&!U)continue;let r=s.todos.filter(m=>!m.done).length,c=s.todos.length,l=Ie(s.groupId),i=s.isCustom?"":`
            <button class="todo-group-summary-btn" title="\u67E5\u770B\u603B\u7ED3" data-group-id="${M(s.groupId)}" data-group-title="${M(s.groupTitle)}" data-group-url="${M(s.groupUrl||"")}">\u2728</button>
        `,d=s.groupUrl?`
            <a href="${M(s.groupUrl)}" target="_blank" rel="noopener noreferrer" class="todo-group-link-btn" title="\u67E5\u770B\u539F\u6587" onclick="event.stopPropagation()">\u{1F517}</a>
        `:"";n+=`
            <div class="todo-group ${l?"collapsed":""}" data-group-id="${M(s.groupId)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${M(s.groupTitle)}">${M(s.groupTitle)}</span>
                    <span class="todo-group-count">${r}/${c}</span>
                    <div class="todo-group-actions">
                        ${d}
                        ${i}
                        <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                    </div>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner">
                        ${a.map(m=>Oe(m)).join("")}
                    </div>
                </div>
            </div>
        `}e.innerHTML=n,e.querySelectorAll(".todo-group").forEach(s=>{let a=s.dataset.groupId,r=o.find(i=>i.groupId===a);if(!r)return;s.querySelector(".todo-group-add-btn")?.addEventListener("click",i=>{i.stopPropagation(),we(a,r.groupTitle,r.groupUrl,r.isCustom)}),s.querySelector(".todo-group-summary-btn")?.addEventListener("click",i=>{i.stopPropagation(),At(r.groupId,r.groupTitle,r.groupUrl)}),s.querySelector(".todo-group-header")?.addEventListener("click",i=>{i.target.closest(".todo-group-add-btn")||i.target.closest(".todo-group-summary-btn")||De(a)}),Ie(a)&&s.classList.add("collapsed")}),Ne(e)}function At(e,t,o){window.openSummaryModal&&window.openSummaryModal(e,t,o,"","")}var Pe="todo_collapsed_groups";function te(){try{let e=localStorage.getItem(Pe);return e?JSON.parse(e):{}}catch{return{}}}function ye(e){try{localStorage.setItem(Pe,JSON.stringify(e))}catch{}}function Ie(e){return te()[e]!==!1}function De(e){let t=te(),o=t[e]!==!1;t[e]=!o,ye(t);let n=document.querySelector(`.todo-group[data-group-id="${e}"]`);n&&n.classList.toggle("collapsed",!o)}function Oe(e){return`
        <div class="todo-item ${e.done?"done":""}" data-id="${e.id}">
            <input type="checkbox" class="todo-checkbox" ${e.done?"checked":""}>
            <span class="todo-text">${M(e.text)}</span>
            <button class="todo-delete-btn" title="\u5220\u9664">\xD7</button>
        </div>
    `}function Ne(e){e.querySelectorAll(".todo-item").forEach(t=>{let o=parseInt(t.dataset.id),n=t.querySelector(".todo-checkbox"),s=t.querySelector(".todo-delete-btn");n?.addEventListener("change",()=>St(o)),s?.addEventListener("click",a=>{a.stopPropagation(),Et(o)})})}function Ht(){if(document.getElementById("summaryTodoPanel"))return;let e=`
        <div id="summaryTodoPanel" class="summary-todo-panel">
            <div class="summary-todo-header">
                <span>\u{1F4CB} \u5F53\u524D\u6587\u7AE0 Todo</span>
                <button class="summary-todo-close-btn" title="\u5173\u95ED">\u2715</button>
            </div>
            <div class="summary-todo-input-area">
                <input type="text" class="summary-todo-input" placeholder="\u8F93\u5165\u65B0\u7684 Todo..." id="summaryTodoInput">
                <button class="summary-todo-add-btn">\u6DFB\u52A0</button>
            </div>
            <div class="summary-todo-body" id="summaryTodoBody">
                <div class="todo-empty">\u6682\u65E0 Todo</div>
            </div>
        </div>
    `,t=document.getElementById("summaryModalFooter");t?t.insertAdjacentHTML("beforebegin",e):document.body.insertAdjacentHTML("beforeend",e);let o=document.getElementById("summaryTodoPanel"),n=o.querySelector(".summary-todo-close-btn"),s=o.querySelector(".summary-todo-add-btn"),a=document.getElementById("summaryTodoInput");n.addEventListener("click",ne),s.addEventListener("click",Ce),a.addEventListener("keydown",r=>{r.key==="Enter"&&Ce()})}function oe(e,t,o){if(!O())return;Ht(),He=e;let n=document.getElementById("summaryTodoPanel");n.classList.add("open"),n.dataset.groupId=e,n.dataset.groupTitle=t,n.dataset.groupUrl=o||"",Ae=!0,se()}function ne(){let e=document.getElementById("summaryTodoPanel");e&&e.classList.remove("open"),Ae=!1,He=null}async function Ce(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoInput");if(!e||!t)return;let o=t.value.trim();if(!o){I("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}let n=e.dataset.groupId,s=e.dataset.groupTitle,a=e.dataset.groupUrl;await j(o,{groupId:n,groupTitle:s,groupUrl:a,isCustom:!1})&&(t.value="",se())}function se(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoBody");if(!e||!t)return;let o=e.dataset.groupId;if(!o){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let n=be(o);if(n.length===0){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo\uFF0C\u53EF\u5728\u4E0A\u65B9\u8F93\u5165\u6DFB\u52A0</div>';return}t.innerHTML=n.map(s=>Oe(s)).join(""),Ne(t)}function qt(e){return be(e).filter(t=>!t.done).length}var b=null,Me=!1;function Ue(){if(Me)return;Me=!0,b=document.createElement("button"),b.className="selection-todo-btn",b.type="button",b.textContent="+Todo",b.style.display="none",document.body.appendChild(b);let e=()=>{b.style.display="none",b.dataset.selectionText="",b._source=null},t=()=>{let n=window.getSelection();if(!n||n.isCollapsed)return null;let s=n.toString();if(!String(s||"").trim())return null;let a=n.rangeCount?n.getRangeAt(0):null;if(!a)return null;let r=a.commonAncestorContainer,c=r?.nodeType===Node.ELEMENT_NODE?r:r?.parentElement;if(!c)return null;let l=document.getElementById("summaryModalBody");return!l||!l.contains(c)||c.closest&&c.closest(".summary-todo-panel")?null:{text:s.trim(),range:a}},o=()=>{let n=t();if(!n){e();return}let s=n.range.getBoundingClientRect();if(!s||!s.width&&!s.height){e();return}let a=64,r=32,c=8,l=Math.min(window.innerWidth-a-c,Math.max(c,s.right-a)),f=Math.min(window.innerHeight-r-c,Math.max(c,s.bottom+c));b.style.left=`${l}px`,b.style.top=`${f}px`,b.style.display="block",b.dataset.selectionText=n.text};b.addEventListener("click",async()=>{let n=b.dataset.selectionText||"";if(!n)return;let s=window._currentSummaryNewsId,a=window._currentSummaryNewsTitle,r=window._currentSummaryNewsUrl;if(!s||!a){I("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}await j(n,{groupId:s,groupTitle:a,groupUrl:r||"",isCustom:!1});try{window.getSelection()?.removeAllRanges()}catch{}e()}),document.addEventListener("mouseup",()=>setTimeout(o,0)),document.addEventListener("keyup",()=>setTimeout(o,0)),document.addEventListener("touchend",()=>setTimeout(o,100)),document.addEventListener("selectionchange",()=>{setTimeout(o,50)}),document.addEventListener("scroll",e,!0),window.addEventListener("resize",e),document.addEventListener("mousedown",n=>{b.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")}),document.addEventListener("touchstart",n=>{b.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")})}function Ft(){let e=document.createElement("button");return e.className="icon-btn todo-btn",e.id="todoBtn",e.title="\u6211\u7684 Todo",e.innerHTML='\u{1F4CB}<span class="todo-badge" id="todoBadge"></span>',e.addEventListener("click",Fe),e}function Pt(){let e=document.getElementById("favoritesBtn");if(e&&e.parentNode){let o=Ft();e.parentNode.insertBefore(o,e)}h.getUser()&&ve()}window.openTodoSidebar=Fe;window.closeTodoSidebar=pe;window.openTodoPanel=oe;window.closeTodoPanel=ne;window.addTodo=j;window.batchAddTodos=ge;window.loadTodos=ve;window.getTodosByGroupId=be;window.getCurrentTodoCount=qt;window.initTodoButton=Pt;var ie=!1,y=null,$=null,N=null,je=null,Re=null,J=null,X=null,Dt=!1,he=null,de=5e3,ze=1e4,We=15e3,V=null,H=5,K=null;window.addEventListener("hotnews-summarizer-sidepanel-ack",()=>{Dt=!0,he&&(clearTimeout(he),he=null)});function Te(){if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))return!0;let t=navigator.maxTouchPoints>0,o=window.innerWidth<=768;return t&&o}function Ot(){return document.documentElement.getAttribute("data-hotnews-summarizer")==="installed"}function Nt(){return document.documentElement.getAttribute("data-hotnews-summarizer-version")||null}function Ut(){J&&(clearTimeout(J),J=null)}function jt(){X&&(clearTimeout(X),X=null)}function Y(){V&&(clearInterval(V),V=null),K&&(clearTimeout(K),K=null),H=5}function _(){Ut(),jt(),Y()}async function Ge(e,t,o){try{await fetch("/api/summary/failures/record",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:e,reason:"client_timeout",error_detail:"\u5BA2\u6237\u7AEF 10 \u79D2\u8D85\u65F6",source_id:t||null,source_name:o||null})}),console.log("[Summary] Recorded client timeout for:",e)}catch(n){console.error("[Summary] Failed to record client timeout:",n)}}var Rt={news:"\u{1F4F0}",policy:"\u26A0\uFE0F",business:"\u{1F4CA}",tutorial:"\u2705",research:"\u{1F4DA}",product:"\u{1F680}",opinion:"\u{1F4AD}",interview:"\u{1F4AC}",listicle:"\u{1F4D1}",lifestyle:"\u2705",general:"\u{1F4DD}","tech-tutorial":"\u2705",trend:"\u{1F4CA}",other:"\u{1F4DD}"};function zt(e){let t=e||0;return t>=1e3?(t/1e3).toFixed(1).replace(/\.0$/,"")+"K":t.toString()}function ke(e){if(!e)return e;let t=e.replace(/\[TAGS_?START\][\s\S]*?\[TAGS_?END\]/gi,"");return t=t.replace(/\n*-{3,}\s*$/g,""),t.trim()}function q(e){if(!e)return"";let t=e.replace(/<br\s*\/?>/gi,`
`).replace(/<\/br>/gi,`
`);t=t.replace(/- \[ \]/g,"-"),t=t.replace(/- \[\]/g,"-"),t=t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),t=t.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code class="language-$1">$2</code></pre>'),t=t.replace(/`([^`]+)`/g,"<code>$1</code>"),t=t.replace(/^#{4}\s+(.+)$/gm,"<h4>$1</h4>"),t=t.replace(/^#{3}\s+(.+)$/gm,"<h3>$1</h3>"),t=t.replace(/^#{2}\s+(.+)$/gm,"<h2>$1</h2>"),t=t.replace(/^#{1}\s+(.+)$/gm,"<h1>$1</h1>"),t=t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),t=t.replace(/\*([^*]+)\*/g,"<em>$1</em>"),t=t.replace(/__([^_]+)__/g,"<strong>$1</strong>"),t=t.replace(/_([^_]+)_/g,"<em>$1</em>"),t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'),t=t.replace(/^&gt;\s*(.*)$/gm,"<blockquote>$1</blockquote>"),t=t.replace(/<\/blockquote>\n<blockquote>/g,`
`),t=t.replace(/^[-]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[*]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[_]{3,}\s*$/gm,"<hr>");let o=t.split(`
`),n=[],s=!1,a=[],r=!1,c=[];for(let l=0;l<o.length;l++){let f=o[l],i=f.trim(),d=/^\|(.+)\|$/.test(i),m=/^\|[\s\-:|]+\|$/.test(i),p=i.match(/^[-*]\s+(.+)$/),T=i.match(/^\d+\.\s+(.+)$/),S=p||T;if(d){if(r&&c.length>0&&(n.push("<ul>"+c.join("")+"</ul>"),c=[],r=!1),s||(s=!0,a=[]),!m){let B=i.slice(1,-1).split("|").map(E=>E.trim()),x=a.length===0?"th":"td",k="<tr>"+B.map(E=>`<${x}>${E}</${x}>`).join("")+"</tr>";a.push(k)}continue}else s&&a.length>0&&(n.push("<table>"+a.join("")+"</table>"),a=[],s=!1);if(S){let B=p?p[1]:T[1];r=!0,c.push("<li>"+B+"</li>");continue}else r&&c.length>0&&(n.push("<ul>"+c.join("")+"</ul>"),c=[],r=!1);n.push(f)}return s&&a.length>0&&n.push("<table>"+a.join("")+"</table>"),r&&c.length>0&&n.push("<ul>"+c.join("")+"</ul>"),t=n.join(`
`),t=t.split(/\n{2,}/).map(l=>(l=l.trim(),l?/^<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(l)||/<\/(h[1-6]|ul|ol|table|pre|blockquote)>$/.test(l)?l:"<p>"+l.replace(/\n/g,"<br>")+"</p>":"")).join(`
`),t=t.replace(/<p>\s*<\/p>/g,""),t=t.replace(/<p><hr><\/p>/g,"<hr>"),t=t.replace(/<p>(<table>)/g,"$1"),t=t.replace(/(<\/table>)<\/p>/g,"$1"),t=t.replace(/<p>(<ul>)/g,"$1"),t=t.replace(/(<\/ul>)<\/p>/g,"$1"),t=t.replace(/<p>(<blockquote>)/g,"$1"),t=t.replace(/(<\/blockquote>)<\/p>/g,"$1"),t=t.replace(/(<h[1-3]>(?:✅\s*|📋\s*)?行动清单\s*<\/h[1-3]>)/gi,'<div class="action-list-header">$1<button class="action-list-add-btn" onclick="addActionListToTodo()">+ Todo</button></div>'),t}function Je(){if(document.getElementById("summaryModal"))return;document.body.insertAdjacentHTML("beforeend",`
        <div id="summaryModal" class="summary-modal">
            <div class="summary-modal-backdrop" onclick="closeSummaryModal()"></div>
            <div class="summary-modal-content">
                <button class="summary-modal-close" onclick="closeSummaryModal()" title="\u5173\u95ED">\u2715</button>
                <div class="summary-modal-header">
                    <h2 id="summaryModalTitle">\u2728 AI \u603B\u7ED3</h2>
                </div>
                <div class="summary-modal-body" id="summaryModalBody">
                    <!-- Content will be inserted here -->
                </div>
                <div class="summary-modal-footer" id="summaryModalFooter" style="display:none;">
                    <!-- Footer with type tag and actions -->
                </div>
            </div>
        </div>
    `)}async function Ee(e,t,o,n,s){if(!h.getUser()){A();return}Je();let r=document.getElementById("summaryModal"),c=document.getElementById("summaryModalTitle"),l=document.getElementById("summaryModalBody"),f=document.getElementById("summaryModalFooter");if(y=e,$=t,N=o,je=n,Re=s,ie=!0,window._currentSummaryNewsId=e,window._currentSummaryNewsTitle=t,window._currentSummaryNewsUrl=o,Ue(),c){let i=t&&t.length>50?t.substring(0,50)+"...":t||"AI \u603B\u7ED3";c.textContent=`\u2728 ${i}`}r.classList.add("open"),document.body.style.overflow="hidden",l.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">\u6B63\u5728\u83B7\u53D6\u6587\u7AE0\u5185\u5BB9...</div>
                <div class="summary-loading-hint">\u9996\u6B21\u603B\u7ED3\u9700\u8981 10-30 \u79D2</div>
                <div id="summarySlowHint" class="summary-slow-hint" style="display:none;">
                    <span id="summaryCountdownText">\u52A0\u8F7D\u8F83\u6162\uFF0C\u5373\u5C06\u4E3A\u60A8\u6253\u5F00\u539F\u6587...</span>
                </div>
            </div>
        </div>
    `,f.style.display="none",_(),J=setTimeout(()=>{console.log("[Summary] 5s timeout, starting countdown");let i=document.getElementById("summarySlowHint"),d=document.getElementById("summaryCountdownText");i&&(i.style.display="block"),H=5;let m=()=>{d&&(d.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${H} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};m(),V=setInterval(()=>{H--,H>0?m():Y()},1e3),K=setTimeout(()=>{console.log("[Summary] 10s timeout, showing click hint"),Y();let p=document.getElementById("summarySlowHint");p&&(p.innerHTML='\u52A0\u8F7D\u8F83\u6162\uFF0C\u8BF7 <a href="'+o+'" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">\u70B9\u51FB\u9605\u8BFB\u539F\u6587</a>')},ze-de)},de),X=setTimeout(()=>{Ge(o,n,s),_();let i=document.getElementById("summaryModal");i&&(i.classList.remove("open"),document.body.style.overflow=""),ie=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},We);try{let i=await fetch(`/api/summary/failures/check?url=${encodeURIComponent(o)}`);if(i.ok){let k=await i.json();if(console.log("[Summary] Check result:",k),k.summarizable)k.warning&&console.log("[Summary] Warning:",k.warning);else{console.log("[Summary] URL blocked, showing blocked UI:",o),_();let E=!Te()&&Ot(),Q=E?Nt():null;!Te()&&!E?l.innerHTML=`
                        <div class="summary-blocked-v2">
                            <div class="blocked-header">
                                <div class="blocked-icon-badge">
                                    <span class="icon-main">\u{1F512}</span>
                                </div>
                                <div class="blocked-title">\u8BE5\u7F51\u7AD9\u9700\u8981\u63D2\u4EF6\u652F\u6301</div>
                                <div class="blocked-subtitle">\u90E8\u5206\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u9700\u8981\u901A\u8FC7\u6D4F\u89C8\u5668\u63D2\u4EF6\u5728\u539F\u6587\u9875\u9762\u8FDB\u884C\u603B\u7ED3</div>
                            </div>
                            
                            <div class="blocked-extension-promo">
                                <div class="promo-header">
                                    <span class="promo-badge">\u63A8\u8350</span>
                                    <span class="promo-title">\u5B89\u88C5 uihash \u603B\u7ED3\u52A9\u624B</span>
                                </div>
                                <div class="promo-features">
                                    <div class="promo-feature">
                                        <span class="feature-icon">\u2728</span>
                                        <span>\u6253\u5F00\u539F\u6587\u81EA\u52A8\u5F39\u51FA\u603B\u7ED3</span>
                                    </div>
                                    <div class="promo-feature">
                                        <span class="feature-icon">\u{1F504}</span>
                                        <span>\u4E0E\u7F51\u7AD9\u8D26\u53F7\u81EA\u52A8\u540C\u6B65</span>
                                    </div>
                                    <div class="promo-feature">
                                        <span class="feature-icon">\u{1F4AC}</span>
                                        <span>\u652F\u6301\u667A\u80FD\u95EE\u7B54\u5BF9\u8BDD</span>
                                    </div>
                                </div>
                                <a href="/extension/install" target="_blank" class="promo-install-btn">
                                    <span class="btn-icon">\u{1F4E5}</span>
                                    <span class="btn-text">\u514D\u8D39\u5B89\u88C5\u63D2\u4EF6</span>
                                    <span class="btn-arrow">\u2192</span>
                                </a>
                                <div class="promo-browsers">
                                    \u652F\u6301 Chrome / Edge / Arc / Brave
                                </div>
                            </div>
                            
                            <div class="blocked-divider">
                                <span>\u6216\u8005</span>
                            </div>
                            
                            <div class="blocked-fallback">
                                <a href="${o}" target="_blank" rel="noopener noreferrer" class="fallback-link">
                                    \u{1F4D6} \u76F4\u63A5\u9605\u8BFB\u539F\u6587
                                </a>
                                <div class="fallback-actions">
                                    <button class="fallback-btn" onclick="addCurrentToTodo()">\u{1F4CB} Todo</button>
                                    <button class="fallback-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                                </div>
                            </div>
                        </div>
                    `:!Te()&&E?l.innerHTML=`
                        <div class="summary-blocked-v2">
                            <div class="blocked-header">
                                <div class="blocked-icon-badge">
                                    <span class="icon-main">\u{1F512}</span>
                                </div>
                                <div class="blocked-title">\u8BE5\u7F51\u7AD9\u9700\u8981\u5728\u539F\u6587\u9875\u9762\u603B\u7ED3</div>
                                <div class="blocked-subtitle">\u90E8\u5206\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u8BF7\u6253\u5F00\u539F\u6587\u540E\u4F7F\u7528\u63D2\u4EF6\u603B\u7ED3</div>
                            </div>
                            
                            <div class="blocked-extension-ready">
                                <div class="ready-badge">
                                    <span class="ready-icon">\u2705</span>
                                    <span class="ready-text">\u63D2\u4EF6\u5DF2\u5C31\u7EEA</span>
                                </div>
                                <a href="${o}${o.includes("?")?"&":"?"}hotnews_auto_summarize=1" target="_blank" rel="noopener noreferrer" class="ready-open-btn">
                                    <span class="btn-icon">\u{1F4D6}</span>
                                    <span class="btn-text">\u6253\u5F00\u539F\u6587\u5E76\u603B\u7ED3</span>
                                    <span class="btn-arrow">\u2192</span>
                                </a>
                                <div class="ready-hint">\u6253\u5F00\u540E\u4F1A\u81EA\u52A8\u63D0\u793A\u5F00\u59CB\u603B\u7ED3</div>
                            </div>
                            
                            <div class="blocked-fallback" style="margin-top: 20px;">
                                <div class="fallback-actions">
                                    <button class="fallback-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                                    <button class="fallback-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                                </div>
                            </div>
                        </div>
                    `:l.innerHTML=`
                        <div class="summary-blocked-v2">
                            <div class="blocked-header">
                                <div class="blocked-icon-badge">
                                    <span class="icon-main">\u{1F512}</span>
                                </div>
                                <div class="blocked-title">\u8BE5\u7F51\u7AD9\u6682\u4E0D\u652F\u6301 AI \u603B\u7ED3</div>
                                <div class="blocked-subtitle">\u8BE5\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
                            </div>
                            
                            <div class="blocked-fallback">
                                <a href="${o}" target="_blank" rel="noopener noreferrer" class="fallback-link">
                                    \u{1F4D6} \u9605\u8BFB\u539F\u6587
                                </a>
                                <div class="fallback-actions">
                                    <button class="fallback-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                                    <button class="fallback-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                                </div>
                            </div>
                        </div>
                    `,f.style.display="none";return}}let d=await fetch("/api/summary/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!d.ok){let k=await d.json();throw new Error(k.detail||"\u751F\u6210\u5931\u8D25")}let m=d.body.getReader(),p=new TextDecoder,T="",S="other",B="\u5176\u4ED6",F=!1,x=null;for(;;){let{done:k,value:E}=await m.read();if(k)break;let v=p.decode(E,{stream:!0}).split(`
`);for(let z of v)if(z.startsWith("data: "))try{let u=JSON.parse(z.slice(6));switch(u.type){case"status":let Z=document.getElementById("summaryStatusText");Z&&(Z.textContent=u.message);break;case"type":S=u.article_type,B=u.article_type_name,window._currentTypeConfidence=u.confidence||0;break;case"chunk":F||(F=!0,_(),l.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),T+=u.content;let P=document.getElementById("summaryStreamContent");if(P){let g=T;g=g.replace(/\[TAGS_?START\][\s\S]*$/gi,""),P.innerHTML=q(g)+'<span class="summary-cursor">\u258C</span>',P.scrollTop=P.scrollHeight}break;case"cached":_(),T=u.summary,S=u.article_type,B=u.article_type_name,x=u.token_usage||null;let C=u.feedback||null,pt=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,yt=ke(T);if(l.innerHTML=`
                                <div class="summary-content">
                                    ${q(yt)}
                                </div>
                            `,ae(o,S,B,!0,x,C,pt),re(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying cached tags for newsId:",e,"tags:",u.tags);let g=document.querySelector(`.news-item[data-news-id="${e}"]`);g||(g=document.querySelector(`.news-item[data-url="${o}"]`)),g&&(console.log("[Summary] Found news item for cached, applying tags"),window.ArticleTags.applyTags(g,u.tags),g.dataset.tagsLoaded="true")}return;case"done":x=u.token_usage||null;let vt=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,fe=document.getElementById("summaryStreamContent");if(fe){fe.classList.remove("summary-streaming");let g=ke(T);fe.innerHTML=q(g)}let gt=window._currentTypeConfidence||0;if(ae(o,S,B,!1,x,null,vt,gt),re(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying tags for newsId:",e,"tags:",u.tags);let g=document.querySelector(`.news-item[data-news-id="${e}"]`);g||(g=document.querySelector(`.news-item[data-url="${o}"]`)),g?(console.log("[Summary] Found news item, applying tags"),window.ArticleTags.applyTags(g,u.tags),g.dataset.tagsLoaded="true"):console.log("[Summary] News item not found in DOM")}break;case"short_content":_(),l.innerHTML=`
                                <div class="summary-short-content">
                                    <div class="short-content-icon">\u{1F4C4}</div>
                                    <div class="short-content-message">${u.message}</div>
                                    <div class="short-content-length">\u6587\u7AE0\u957F\u5EA6\uFF1A${u.content_length} \u5B57</div>
                                    ${u.preview?`<div class="short-content-preview">${u.preview}</div>`:""}
                                    <div class="short-content-actions">
                                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="short-content-btn primary">
                                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                                        </a>
                                        <button class="short-content-btn secondary" onclick="forceSummary('${e}', '${encodeURIComponent(t)}', '${encodeURIComponent(o)}', '${n||""}', '${encodeURIComponent(s||"")}')">
                                            \u2728 \u4ECD\u8981\u603B\u7ED3
                                        </button>
                                    </div>
                                </div>
                            `,f.style.display="none";return;case"error":throw new Error(u.message)}}catch(u){if(u.message&&!u.message.includes("JSON"))throw u}}if(F&&T&&!document.querySelector('.summary-modal-footer[style*="flex"]')){console.log("[Summary] Stream ended without done event, showing fallback footer");let k=document.getElementById("summaryStreamContent");if(k){k.classList.remove("summary-streaming");let E=ke(T);k.innerHTML=q(E)}ae(o,S,B,!1,x,null,null,0),re(e,!0)}}catch(i){console.error("[Summary] Error:",i),_();let d=i.message||"\u672A\u77E5\u9519\u8BEF",m=d.includes("\u7528\u5B8C")||d.includes("\u914D\u989D")||d.includes("\u6B21\u6570")||d.includes("\u989D\u5EA6")||d.includes("\u5347\u7EA7")||d.includes("\u4F1A\u5458"),p=d.includes("\u8BBF\u95EE\u9650\u5236")||d.includes("\u65E0\u6CD5\u83B7\u53D6")||d.includes("\u65E0\u6CD5\u8BBF\u95EE")||d.includes("\u8BF7\u6C42\u5931\u8D25");m?l.innerHTML=`
                <div class="summary-quota-error">
                    <div class="quota-error-icon">\u2728</div>
                    <div class="quota-error-title">\u989D\u5EA6\u5DF2\u7528\u5B8C</div>
                    <div class="quota-error-text">\u5145\u503C\u540E\u5373\u53EF\u7EE7\u7EED\u4F7F\u7528</div>
                    <div class="quota-error-actions">
                        <button class="quota-upgrade-btn" onclick="openPaymentModal()">
                            \u7ACB\u5373\u5145\u503C
                        </button>
                    </div>
                    <div class="quota-fallback-actions">
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="quota-read-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="quota-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} Todo</button>
                        <button class="quota-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `:p?l.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u{1F512}</div>
                    <div class="summary-access-error-title">\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u5185\u5BB9</div>
                    <div class="summary-access-error-text">\u8BE5\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
                    <div class="summary-access-error-actions">
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="summary-retry-btn-secondary" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                    </div>
                    <div class="summary-timeout-actions">
                        <button class="summary-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                        <button class="summary-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `:l.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u274C</div>
                    <div class="summary-access-error-title">\u603B\u7ED3\u5931\u8D25</div>
                    <div class="summary-access-error-text">${d}</div>
                    <div class="summary-access-error-actions">
                        <button class="summary-retry-btn" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                    </div>
                </div>
            `}}function ae(e,t,o,n,s,a=null,r=null,c=null){let l=document.getElementById("summaryModalFooter"),f=Rt[t]||"\u{1F4DD}",i="",d=s?.total_tokens||0;d>0&&(i=`<span class="summary-token-tag" title="\u672C\u6B21\u6D88\u8017">\u{1FA99} ${zt(d)}</span>`);let m=a==="up"?"active":"",p=a==="down"?"active":"";l.innerHTML=`
        <div class="summary-footer-left">
            ${i}
            <span class="summary-type-tag">${f} ${o}</span>
            <div class="summary-feedback">
                <button class="summary-feedback-btn ${m}" data-vote="up" onclick="handleSummaryFeedback('up')" title="\u6709\u5E2E\u52A9">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                    </svg>
                </button>
                <span class="summary-feedback-divider"></span>
                <button class="summary-feedback-btn ${p}" data-vote="down" onclick="handleSummaryFeedback('down')" title="\u9700\u6539\u8FDB">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="summary-footer-right">
            <button class="summary-todo-btn" id="summaryTodoToggleBtn" onclick="toggleCurrentTodoPanel()" title="\u67E5\u770B Todo">
                \u{1F4CB} Todo
            </button>
            <a href="${e}" target="_blank" rel="noopener noreferrer" class="summary-link-btn">
                \u{1F517} \u67E5\u770B\u539F\u6587
            </a>
            <button class="summary-regenerate-btn" onclick="regenerateSummaryModal()">
                \u{1F504} \u91CD\u65B0\u751F\u6210
            </button>
        </div>
    `,l.style.display="flex"}async function Wt(e){if(!y)return;let t=document.querySelectorAll(".summary-feedback-btn"),o=document.querySelector(`.summary-feedback-btn[data-vote="${e}"]`),s=o?.classList.contains("active")?"none":e;t.forEach(a=>a.classList.remove("active")),s!=="none"&&o?.classList.add("active");try{let a=await fetch(`/api/summary/${encodeURIComponent(y)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vote:s})});a.ok||console.error("[Summary] Feedback failed:",await a.text())}catch(a){console.error("[Summary] Feedback error:",a)}}function Gt(){let e=document.getElementById("summaryModal");e&&(e.classList.remove("open"),document.body.style.overflow=""),_(),ie=!1,y=null}function Xe(){let e=document.querySelector(`.news-summary-btn[data-news-id="${y}"]`);if(e){let t=e.dataset.title,o=e.dataset.url,n=e.dataset.sourceId,s=e.dataset.sourceName;Ee(y,t,o,n,s)}}async function Jt(){if(y){try{await fetch(`/api/summary/${encodeURIComponent(y)}`,{method:"DELETE"})}catch(e){console.error("[Summary] Delete error:",e)}Xe()}}async function Xt(e,t,o,n,s){let a=decodeURIComponent(t),r=decodeURIComponent(o),c=decodeURIComponent(s);Vt(e,a,r,n,c)}async function Vt(e,t,o,n,s){if(!h.getUser()){A();return}Je();let r=document.getElementById("summaryModal"),c=document.getElementById("summaryModalBody"),l=document.getElementById("summaryModalFooter");y=e,$=t,N=o,je=n,Re=s,c.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">\u6B63\u5728\u751F\u6210\u603B\u7ED3...</div>
                <div class="summary-loading-hint">\u9996\u6B21\u603B\u7ED3\u9700\u8981 10-30 \u79D2</div>
                <div id="summarySlowHint" class="summary-slow-hint" style="display:none;">
                    <span id="summaryCountdownText">\u52A0\u8F7D\u8F83\u6162\uFF0C\u5373\u5C06\u4E3A\u60A8\u6253\u5F00\u539F\u6587...</span>
                </div>
            </div>
        </div>
    `,l.style.display="none",_(),J=setTimeout(()=>{console.log("[Summary Force] 5s timeout, starting countdown");let f=document.getElementById("summarySlowHint"),i=document.getElementById("summaryCountdownText");f&&(f.style.display="block"),H=5;let d=()=>{i&&(i.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${H} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};d(),V=setInterval(()=>{H--,H>0?d():Y()},1e3),K=setTimeout(()=>{console.log("[Summary Force] 10s timeout, showing click hint"),Y();let m=document.getElementById("summarySlowHint");m&&(m.innerHTML='\u52A0\u8F7D\u8F83\u6162\uFF0C\u8BF7 <a href="'+o+'" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">\u70B9\u51FB\u9605\u8BFB\u539F\u6587</a>')},ze-de)},de),X=setTimeout(()=>{Ge(o,n,s),_();let f=document.getElementById("summaryModal");f&&(f.classList.remove("open"),document.body.style.overflow=""),ie=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},We);try{let f=await fetch("/api/summary/stream?force=1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!f.ok){let F=await f.json();throw new Error(F.detail||"\u751F\u6210\u5931\u8D25")}let i=f.body.getReader(),d=new TextDecoder,m="",p="other",T="\u5176\u4ED6",S=!1,B=null;for(;;){let{done:F,value:x}=await i.read();if(F)break;let E=d.decode(x,{stream:!0}).split(`
`);for(let Q of E)if(Q.startsWith("data: "))try{let v=JSON.parse(Q.slice(6));switch(v.type){case"status":let z=document.getElementById("summaryStatusText");z&&(z.textContent=v.message);break;case"type":p=v.article_type,T=v.article_type_name;break;case"chunk":S||(S=!0,_(),c.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),m+=v.content;let u=document.getElementById("summaryStreamContent");if(u){let C=m;C=C.replace(/\[TAGS_?START\][\s\S]*$/gi,""),u.innerHTML=q(C)+'<span class="summary-cursor">\u258C</span>',u.scrollTop=u.scrollHeight}break;case"done":_(),B=v.token_usage||null;let Z=v.token_balance!==void 0?{token_balance:v.token_balance,tokens_used:v.tokens_used,default_tokens:1e5}:null,P=document.getElementById("summaryStreamContent");if(P&&(P.classList.remove("summary-streaming"),P.innerHTML=q(m)),ae(o,p,T,!1,B,null,Z),re(e,!0),v.tags&&window.ArticleTags){let C=document.querySelector(`.news-item[data-news-id="${e}"]`);C||(C=document.querySelector(`.news-item[data-url="${o}"]`)),C&&(window.ArticleTags.applyTags(C,v.tags),C.dataset.tagsLoaded="true")}break;case"error":throw new Error(v.message)}}catch(v){if(v.message&&!v.message.includes("JSON"))throw v}}}catch(f){console.error("[Summary] Force error:",f),_();let i=f.message||"\u672A\u77E5\u9519\u8BEF",d=i.includes("\u7528\u5B8C")||i.includes("\u914D\u989D")||i.includes("\u6B21\u6570")||i.includes("\u989D\u5EA6")||i.includes("\u5347\u7EA7")||i.includes("\u4F1A\u5458"),m=i.includes("\u8BBF\u95EE\u9650\u5236")||i.includes("\u65E0\u6CD5\u83B7\u53D6")||i.includes("\u65E0\u6CD5\u8BBF\u95EE")||i.includes("\u8BF7\u6C42\u5931\u8D25");d?c.innerHTML=`
                <div class="summary-quota-error">
                    <div class="quota-error-icon">\u2728</div>
                    <div class="quota-error-title">\u989D\u5EA6\u5DF2\u7528\u5B8C</div>
                    <div class="quota-error-text">\u5145\u503C\u540E\u5373\u53EF\u7EE7\u7EED\u4F7F\u7528</div>
                    <div class="quota-error-actions">
                        <button class="quota-upgrade-btn" onclick="openPaymentModal()">
                            \u7ACB\u5373\u5145\u503C
                        </button>
                    </div>
                    <div class="quota-fallback-actions">
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="quota-read-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="quota-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} Todo</button>
                        <button class="quota-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `:m?c.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u{1F512}</div>
                    <div class="summary-access-error-title">\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u5185\u5BB9</div>
                    <div class="summary-access-error-text">\u8BE5\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
                    <div class="summary-access-error-actions">
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="summary-retry-btn-secondary" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                    </div>
                    <div class="summary-timeout-actions">
                        <button class="summary-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                        <button class="summary-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `:c.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u274C</div>
                    <div class="summary-access-error-title">\u603B\u7ED3\u5931\u8D25</div>
                    <div class="summary-access-error-text">${i}</div>
                    <div class="summary-access-error-actions">
                        <button class="summary-retry-btn" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                    </div>
                </div>
            `}}function re(e,t){let o=document.querySelector(`.news-summary-btn[data-news-id="${e}"]`);o&&(o.classList.toggle("has-summary",t),o.title=t?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3");let n=document.querySelector(`.news-item[data-news-id="${e}"]`);n&&n.classList.toggle("has-summary",t)}function Ve(e,t,o,n,s,a){e.preventDefault(),e.stopPropagation(),Ee(t,o,n,s,a)}async function R(){try{if(!h.isLoggedIn())return;let e=await fetch("/api/summary/list");if(!e.ok)return;let t=await e.json();if(!t.ok||!t.news_ids)return;let o=new Set(t.news_ids);if(o.size===0)return;document.querySelectorAll(".news-item[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&n.classList.add("has-summary")}),document.querySelectorAll(".news-summary-btn[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&(n.classList.add("has-summary"),n.title="\u67E5\u770B\u603B\u7ED3")}),console.log(`[Summary] Marked ${o.size} summarized items`)}catch(e){console.error("[Summary] Failed to load summarized list:",e)}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{setTimeout(R,500)}):setTimeout(R,500);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){let e=window._lastSummarizedListLoad||0;Date.now()-e>3e4&&(console.log("[Summary] Page visible, reloading summarized list"),R())}});var Kt=R;R=async function(){return window._lastSummarizedListLoad=Date.now(),Kt()};function Yt(){!y||!$||(oe(y,$,N),Se(!0))}function Qt(){if(!y||!$)return;let e=document.getElementById("summaryTodoPanel");e&&e.classList.contains("open")?(ne(),Se(!1)):(oe(y,$,N),Se(!0))}function Se(e){let t=document.getElementById("summaryTodoToggleBtn");t&&t.classList.toggle("active",e)}async function Zt(){if(!y||!$)return;let e=document.getElementById("summaryModalBody");if(!e)return;let o=e.innerHTML.match(/✅\s*行动清单[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);if(!o){window.showToast&&window.showToast("\u672A\u627E\u5230\u884C\u52A8\u6E05\u5355");return}let a=(o[1].match(/<li>([\s\S]*?)<\/li>/gi)||[]).map(r=>r.replace(/<\/?li>/gi,"").replace(/<[^>]+>/g,"").trim()).filter(r=>r.length>0);if(a.length===0){window.showToast&&window.showToast("\u884C\u52A8\u6E05\u5355\u4E3A\u7A7A");return}await ge(a,{groupId:y,groupTitle:$,groupUrl:N||"",isCustom:!1})}async function eo(){if(!y||!$){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let e=await j($,{groupId:y,groupTitle:$,groupUrl:N||"",isCustom:!1})}catch(e){console.error("[Summary] Add to todo error:",e),window.showToast&&window.showToast("\u6DFB\u52A0\u5931\u8D25")}}async function to(){if(!y||!$){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let{addFavorite:e}=await import("./favorites-CCHGFFJZ.js"),t=await e({news_id:y,title:$,url:N||""});t.ok?window.showToast&&window.showToast("\u5DF2\u6536\u85CF"):t.error&&window.showToast&&window.showToast(t.error)}catch(e){console.error("[Summary] Add to favorites error:",e),window.showToast&&window.showToast("\u6536\u85CF\u5931\u8D25")}}document.addEventListener("click",e=>{let t=e.target.closest(".news-summary-btn");if(!t||t.hasAttribute("onclick"))return;e.preventDefault(),e.stopPropagation();let o=t.dataset.newsId,n=t.dataset.title||"",s=t.dataset.url||"",a=t.dataset.sourceId||"",r=t.dataset.sourceName||"";o&&Ve(e,o,n,s,a,r)});window.openSummaryModal=Ee;window.closeSummaryModal=Gt;window.retrySummaryModal=Xe;window.regenerateSummaryModal=Jt;window.handleSummaryClick=Ve;window.loadSummarizedList=R;window.handleSummaryFeedback=Wt;window.openCurrentTodoPanel=Yt;window.toggleCurrentTodoPanel=Qt;window.addActionListToTodo=Zt;window.forceSummary=Xt;window.addCurrentToTodo=eo;window.addCurrentToFavorites=to;var st="hotnews_favorites_v1",at="hotnews_favorites_width",oo=500,Le=320,_e=800,w=null,ce=!1,D=!1,le="summary";function ue(){try{let e=localStorage.getItem(st);return e?JSON.parse(e):[]}catch{return[]}}function rt(e){try{localStorage.setItem(st,JSON.stringify(e))}catch(t){console.error("[Favorites] Failed to save to localStorage:",t)}}async function it(){try{let e=await fetch("/api/user/favorites");if(e.status===401)return{needsAuth:!0};if(!e.ok)throw new Error("Failed to fetch favorites");let t=await e.json();return t.ok?(w=t.favorites||[],{favorites:w}):{error:t.message||"Unknown error"}}catch(e){return console.error("[Favorites] Fetch error:",e),{error:e.message}}}async function no(e){if(!h.getUser()){let o=ue();return o.some(s=>s.news_id===e.news_id)||(o.unshift({...e,created_at:Math.floor(Date.now()/1e3)}),rt(o)),{ok:!0,local:!0}}try{let n=await(await fetch("/api/user/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json();return n.ok&&(w||(w=[]),w=w.filter(s=>s.news_id!==e.news_id),w.unshift(n.favorite)),n}catch(o){return console.error("[Favorites] Add error:",o),{ok:!1,error:o.message}}}async function dt(e){if(!h.getUser()){let n=ue().filter(s=>s.news_id!==e);return rt(n),{ok:!0,local:!0}}try{let n=await(await fetch(`/api/user/favorites/${encodeURIComponent(e)}`,{method:"DELETE"})).json();return n.ok&&w&&(w=w.filter(s=>s.news_id!==e)),n}catch(o){return console.error("[Favorites] Remove error:",o),{ok:!1,error:o.message}}}function me(e){if(!h.getUser())return ue().some(s=>s.news_id===e);if(w)return w.some(n=>n.news_id===e);let o=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);return o?o.classList.contains("favorited"):!1}async function ct(e,t){let o=e.news_id,n=me(o),s=document.querySelectorAll(`.news-favorite-btn[data-news-id="${o}"]`);s.forEach(r=>r.classList.toggle("favorited",!n)),t&&!t.dataset.newsId&&t.classList.toggle("favorited",!n);let a;return n?a=await dt(o):a=await no(e),a.ok||(s.forEach(r=>r.classList.toggle("favorited",n)),t&&!t.dataset.newsId&&t.classList.toggle("favorited",n)),a}function $e(e){if(!e)return"";let t=new Date(e*1e3),o=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${o}-${n}`}function so(e){let t=document.getElementById("favoritesPanelBody");if(!t)return;if(!e||e.length===0){t.innerHTML=`
            <div class="favorites-empty">
                <div class="favorites-empty-icon">\u2B50</div>
                <div>\u6682\u65E0\u6536\u85CF</div>
                <div style="font-size:12px;margin-top:8px;color:#64748b;">
                    \u70B9\u51FB\u65B0\u95FB\u6807\u9898\u65C1\u7684 \u2606 \u6DFB\u52A0\u6536\u85CF
                </div>
            </div>
        `;return}let o=`
        <div class="favorites-list">
            ${e.map(n=>`
                <div class="favorite-item" data-news-id="${n.news_id}">
                    <a class="favorite-item-title" href="${n.url||"#"}" target="_blank" rel="noopener noreferrer">
                        ${n.title||"\u65E0\u6807\u9898"}
                    </a>
                    <div class="favorite-item-meta">
                        <span class="favorite-item-source">
                            ${n.source_name?`<span>${n.source_name}</span>`:""}
                            ${n.created_at?`<span>\u6536\u85CF\u4E8E ${$e(n.created_at)}</span>`:""}
                        </span>
                        <div class="favorite-item-actions">
                            <button class="favorite-summary-btn${n.summary?" has-summary":""}" 
                                    onclick="handleFavoriteSummaryClick('${n.news_id}')" 
                                    title="${n.summary?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3"}">
                                ${n.summary?"\u{1F4C4}":"\u{1F4DD}"}
                            </button>
                            <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${n.news_id}')" title="\u53D6\u6D88\u6536\u85CF">
                                \u5220\u9664
                            </button>
                        </div>
                    </div>
                    <div class="favorite-item-summary" id="summary-${n.news_id}" style="display:${n.summary?"block":"none"};">
                        <div class="summary-content">${n.summary?q(n.summary):""}</div>
                        ${n.summary?`
                            <div class="summary-actions">
                                <button class="summary-regenerate-btn" onclick="regenerateSummary('${n.news_id}')" title="\u91CD\u65B0\u751F\u6210">
                                    \u{1F504} \u91CD\u65B0\u751F\u6210
                                </button>
                                <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${n.news_id}')">
                                    \u6536\u8D77
                                </button>
                            </div>
                        `:""}
                    </div>
                </div>
            `).join("")}
        </div>
    `;t.innerHTML=o}function ao(e){let t=document.getElementById("favoritesPanelBody");if(!t)return;if(!e||e.length===0){t.innerHTML=`
            <div class="favorites-empty">
                <div class="favorites-empty-icon">\u2606</div>
                <div>\u6682\u65E0\u6536\u85CF</div>
                <div style="font-size:12px;margin-top:8px;color:#64748b;">
                    \u70B9\u51FB\u65B0\u95FB\u6807\u9898\u65C1\u7684 \u2606 \u6DFB\u52A0\u6536\u85CF
                </div>
            </div>
        `;return}let o=`
        <div class="favorites-list">
            ${e.map(n=>`
                <div class="favorite-item" data-news-id="${n.news_id}">
                    <a class="favorite-item-title" href="${n.url||"#"}" target="_blank" rel="noopener noreferrer">
                        ${n.title||"\u65E0\u6807\u9898"}
                    </a>
                    <div class="favorite-item-meta">
                        <span class="favorite-item-source">
                            ${n.source_name?`<span>${n.source_name}</span>`:""}
                            ${n.created_at?`<span>\u6536\u85CF\u4E8E ${$e(n.created_at)}</span>`:""}
                        </span>
                        <div class="favorite-item-actions">
                            <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${n.news_id}')" title="\u53D6\u6D88\u6536\u85CF">
                                \u5220\u9664
                            </button>
                        </div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;t.innerHTML=o}function Ke(){let e=document.getElementById("favoritesPanelBody");if(!e)return;let t=ue();t.length>0?e.innerHTML=`
            <div style="padding:12px;background:#334155;border-radius:8px;margin-bottom:16px;font-size:13px;color:#94a3b8;">
                <span style="color:#fbbf24;">\u{1F4A1}</span> \u767B\u5F55\u540E\u53EF\u540C\u6B65\u6536\u85CF\u5230\u4E91\u7AEF
                <button class="favorites-login-btn" onclick="openLoginModal();closeFavoritesPanel();" style="margin-left:8px;padding:4px 12px;font-size:12px;">
                    \u767B\u5F55
                </button>
            </div>
            <div class="favorites-list">
                ${t.map(o=>`
                    <div class="favorite-item" data-news-id="${o.news_id}">
                        <a class="favorite-item-title" href="${o.url||"#"}" target="_blank" rel="noopener noreferrer">
                            ${o.title||"\u65E0\u6807\u9898"}
                        </a>
                        <div class="favorite-item-meta">
                            <span class="favorite-item-source">
                                ${o.source_name?`<span>${o.source_name}</span>`:""}
                                ${o.created_at?`<span>\u6536\u85CF\u4E8E ${$e(o.created_at)}</span>`:""}
                            </span>
                            <div class="favorite-item-actions">
                                <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${o.news_id}')" title="\u53D6\u6D88\u6536\u85CF">
                                    \u5220\u9664
                                </button>
                            </div>
                        </div>
                    </div>
                `).join("")}
            </div>
        `:e.innerHTML=`
            <div class="favorites-login-required">
                <div class="favorites-login-icon">\u{1F512}</div>
                <div>\u767B\u5F55\u540E\u53EF\u4F7F\u7528\u6536\u85CF\u529F\u80FD</div>
                <button class="favorites-login-btn" onclick="openLoginModal();closeFavoritesPanel();">
                    \u7ACB\u5373\u767B\u5F55
                </button>
            </div>
        `}async function Be(){let e=document.getElementById("favoritesPanelBody");if(!e)return;if(e.innerHTML='<div class="favorites-loading">\u52A0\u8F7D\u4E2D...</div>',!h.getUser()){Ke();return}let o=await it();if(o.needsAuth){Ke();return}if(o.error){e.innerHTML=`
            <div class="favorites-empty">
                <div>\u52A0\u8F7D\u5931\u8D25: ${o.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    \u91CD\u8BD5
                </button>
            </div>
        `;return}if(le==="bookmarks")ao(o.favorites);else{let n=(o.favorites||[]).filter(s=>s.summary);so(n)}}function Ye(){let e=document.querySelector(".favorites-tab-bar");e&&e.addEventListener("click",t=>{let o=t.target.closest("[data-tab]");if(!o)return;let n=o.dataset.tab;n!==le&&(le=n,e.querySelectorAll(".favorites-tab-btn").forEach(s=>s.classList.toggle("active",s.dataset.tab===le)),Be())})}function ro(){if(!h.getUser()){A();return}let t=document.getElementById("favoritesPanel"),o=document.getElementById("favoritesOverlay");t&&(o||(o=document.createElement("div"),o.id="favoritesOverlay",o.className="favorites-overlay",o.onclick=lt,document.body.appendChild(o)),ce=!ce,ce?(t.classList.add("open"),o.classList.add("open"),Be()):(t.classList.remove("open"),o.classList.remove("open")))}function lt(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesOverlay");ce=!1,e&&e.classList.remove("open"),t&&t.classList.remove("open")}async function io(e){if((await dt(e)).ok){let o=document.querySelector(`.favorite-item[data-news-id="${e}"]`);o&&o.remove();let n=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);n&&n.classList.remove("favorited");let s=document.querySelector(".favorites-list");s&&s.children.length===0&&Be()}}function co(e,t,o,n,s,a){if(e.preventDefault(),e.stopPropagation(),!h.getUser()){A();return}let c=e.currentTarget;ct({news_id:t,title:o,url:n,source_id:s||"",source_name:a||""},c)}function lo(){try{let e=localStorage.getItem(at);if(e){let t=parseInt(e,10);if(t>=Le&&t<=_e)return t}}catch{}return oo}function Qe(e){try{localStorage.setItem(at,String(e)),ee.saveSidebarWidths({favorites_width:e})}catch{}}function uo(e){let t=document.getElementById("favoritesPanel");t&&(t.style.width=e+"px")}function Ze(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesResizeHandle");if(!e||!t)return;let o=lo();uo(o);let n=0,s=0;function a(d){d.preventDefault(),D=!0,n=d.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("mousemove",r),document.addEventListener("mouseup",c)}function r(d){if(!D)return;let m=n-d.clientX,p=s+m;p=Math.max(Le,Math.min(_e,p)),e.style.width=p+"px"}function c(){D&&(D=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("mousemove",r),document.removeEventListener("mouseup",c),Qe(e.offsetWidth))}function l(d){d.touches.length===1&&(d.preventDefault(),D=!0,n=d.touches[0].clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("touchmove",f,{passive:!1}),document.addEventListener("touchend",i))}function f(d){if(!D||d.touches.length!==1)return;d.preventDefault();let m=n-d.touches[0].clientX,p=s+m;p=Math.max(Le,Math.min(_e,p)),e.style.width=p+"px"}function i(){D&&(D=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("touchmove",f),document.removeEventListener("touchend",i),Qe(e.offsetWidth))}t.addEventListener("mousedown",a),t.addEventListener("touchstart",l,{passive:!1})}function et(){document.addEventListener("click",e=>{let t=e.target.closest(".news-favorite-btn");if(!t)return;if(e.preventDefault(),e.stopPropagation(),!h.getUser()){A();return}let n=t.closest(".news-item");if(!n)return;let s=n.dataset.newsId||n.dataset.id,a=n.dataset.newsUrl||n.dataset.url,r=n.querySelector(".news-title"),c=r?r.textContent.trim():"",l=n.closest(".platform-card"),f=l?l.dataset.platform:"",i=l?l.querySelector(".platform-name"):null,d=i?i.textContent.replace("\u{1F4F1}","").trim():"";ct({news_id:s,title:c,url:a,source_id:f,source_name:d},t)})}function tt(){ot(document);let e=new MutationObserver(o=>{for(let n of o)for(let s of n.addedNodes)s.nodeType===1&&(s.classList?.contains("news-item")?ut(s):s.querySelectorAll&&ot(s))}),t=document.querySelector(".tab-content-area")||document.body;e.observe(t,{childList:!0,subtree:!0})}function ot(e){e.querySelectorAll(".news-item").forEach(o=>ut(o))}function ut(e){if(e.querySelector(".news-favorite-btn"))return;let t=e.querySelector(".news-hover-btns");if(!t)return;let o=e.dataset.newsId||e.dataset.id||"";if(!o)return;let n=document.createElement("button");n.className="news-favorite-btn",n.dataset.newsId=o,me(o)&&n.classList.add("favorited"),t.insertBefore(n,t.firstChild)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{Ze(),et(),Ye(),tt(),nt()}):(Ze(),et(),Ye(),tt(),nt());async function nt(){if(!h.getUser()||w)return;(await it()).favorites&&document.querySelectorAll(".news-favorite-btn[data-news-id]").forEach(o=>{let n=o.dataset.newsId;o.classList.toggle("favorited",me(n))})}async function mt(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(!(!t||!o)){if(o.classList.contains("has-summary")){ft(e);return}o.disabled=!0,o.textContent="\u23F3",o.title="\u751F\u6210\u4E2D...",t.style.display="block",t.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <span>\u6B63\u5728\u751F\u6210 AI \u603B\u7ED3...</span>
        </div>
    `;try{let n=await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"POST"}),s=await n.json();if(!n.ok)throw new Error(s.detail||"\u751F\u6210\u5931\u8D25");if(s.ok&&s.summary){if(o.classList.add("has-summary"),o.textContent="\u{1F4C4}",o.title="\u67E5\u770B\u603B\u7ED3",t.innerHTML=`
                <div class="summary-content">${q(s.summary)}</div>
                <div class="summary-actions">
                    <button class="summary-regenerate-btn" onclick="regenerateSummary('${e}')" title="\u91CD\u65B0\u751F\u6210">
                        \u{1F504} \u91CD\u65B0\u751F\u6210
                    </button>
                    <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${e}')">
                        \u6536\u8D77
                    </button>
                </div>
            `,w){let a=w.find(r=>r.news_id===e);a&&(a.summary=s.summary,a.summary_at=s.summary_at)}}else throw new Error(s.error||"\u751F\u6210\u5931\u8D25")}catch(n){console.error("[Favorites] Summary error:",n),t.innerHTML=`
            <div class="summary-error">
                <span>\u274C ${n.message}</span>
                <button onclick="handleFavoriteSummaryClick('${e}')" style="margin-left:8px;">\u91CD\u8BD5</button>
            </div>
        `,o.textContent="\u{1F4DD}",o.title="AI \u603B\u7ED3"}finally{o.disabled=!1}}}function ft(e){let t=document.getElementById(`summary-${e}`);if(!t)return;let o=t.style.display!=="none";t.style.display=o?"none":"block";let n=t.querySelector(".summary-toggle-btn");n&&(n.textContent=o?"\u5C55\u5F00":"\u6536\u8D77")}async function mo(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(t){try{await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"DELETE"})}catch(n){console.error("[Favorites] Delete summary error:",n)}if(o&&(o.classList.remove("has-summary"),o.textContent="\u{1F4DD}"),w){let n=w.find(s=>s.news_id===e);n&&(n.summary=null,n.summary_at=null)}await mt(e)}}window.toggleFavoritesPanel=ro;window.closeFavoritesPanel=lt;window.removeFavoriteFromPanel=io;window.handleFavoriteClick=co;window.isFavorited=me;window.handleFavoriteSummaryClick=mt;window.toggleSummaryDisplay=ft;window.regenerateSummary=mo;export{ve as a,Pt as b,no as c,dt as d,me as e,ct as f,ro as g,lt as h,co as i};
