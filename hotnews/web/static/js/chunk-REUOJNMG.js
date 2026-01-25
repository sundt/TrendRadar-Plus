import{a as b,b as Z}from"./chunk-ICSVECP2.js";var ye="",ee=0,F=null,Q=null,N=null,A=null,Me=300;function vt(){return navigator.userAgent.toLowerCase().indexOf("micromessenger")!==-1}function M(){if(vt()){window.location.href="/api/auth/oauth/wechat-mp";return}let e=document.getElementById("loginModal");e&&(e.style.display="flex",ve(),V(1),ge())}function te(){let e=document.getElementById("loginModal");e&&(e.style.display="none"),F&&(clearInterval(F),F=null),oe(),we(),ve();let t=document.getElementById("login-email"),o=document.getElementById("login-code");t&&(t.value=""),o&&(o.value="")}async function ge(){let e=document.getElementById("login-qr-loading"),t=document.getElementById("login-qr-image"),o=document.getElementById("login-qr-expired"),n=document.getElementById("login-qr-countdown");e&&(e.style.display="flex"),t&&(t.style.display="none"),o&&(o.style.display="none"),n&&(n.style.display="none"),oe();try{let r=await(await fetch("/api/auth/wechat-qr/create",{method:"POST",headers:{"Content-Type":"application/json"}})).json();r.ok&&r.qr_url?(Q=r.session_id,Me=r.expire_seconds||300,t&&(t.src=r.qr_url,t.onload=()=>{e&&(e.style.display="none"),t.style.display="block"},t.onerror=()=>{e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u52A0\u8F7D\u5931\u8D25")}),ht(Me),bt()):(e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent=r.message||"\u52A0\u8F7D\u5931\u8D25"))}catch(s){console.error("Failed to load WeChat QR:",s),e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u7F51\u7EDC\u9519\u8BEF")}}function wt(){ge()}function ht(e){let t=document.getElementById("login-qr-countdown"),o=document.getElementById("login-qr-countdown-text");if(!t||!o)return;let n=e;t.style.display="block";let s=()=>{let r=Math.floor(n/60),a=n%60;o.textContent=`${r}:${a.toString().padStart(2,"0")}`,n<60?t.classList.add("warning"):t.classList.remove("warning")};s(),A=setInterval(()=>{n--,n<=0?(clearInterval(A),A=null,Fe()):s()},1e3)}function Fe(){let e=document.getElementById("login-qr-image"),t=document.getElementById("login-qr-expired"),o=document.getElementById("login-qr-countdown");e&&(e.style.display="none"),t&&(t.style.display="flex",t.querySelector("span").textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F"),o&&(o.style.display="none"),oe()}function bt(){if(!Q)return;let e=async()=>{let t=Q;if(t)try{let n=await(await fetch(`/api/auth/wechat-qr/status?session_id=${encodeURIComponent(t)}`)).json();if(n.status==="confirmed"&&n.session_token){N&&(clearInterval(N),N=null),A&&(clearInterval(A),A=null),E("\u767B\u5F55\u6210\u529F","success");try{await fetch(`/api/auth/wechat-qr/confirm-cookie?session_id=${encodeURIComponent(t)}`,{method:"POST",headers:{"Content-Type":"application/json"}})}catch(s){console.error("Failed to set cookie:",s)}Q=null,setTimeout(()=>{te(),window.location.reload()},500);return}else if(n.status==="scanned")E("\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4","success");else if(n.status==="expired"){Fe();return}}catch(o){console.error("Polling error:",o)}};N=setInterval(e,2e3),e()}function oe(){N&&(clearInterval(N),N=null),A&&(clearInterval(A),A=null),Q=null}function Tt(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="none"),t&&(t.style.display="block"),oe(),setTimeout(()=>{let o=document.getElementById("login-email");o&&o.focus()},100)}function ve(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="block"),t&&(t.style.display="none"),V(1),we(),ge()}function St(e){e.target.id==="loginModal"&&te()}function E(e,t){let o=document.getElementById("login-message");o&&(o.textContent=e,o.className="login-message "+t)}function we(){let e=document.getElementById("login-message");e&&(e.className="login-message")}function V(e){document.querySelectorAll(".login-step").forEach(o=>o.classList.remove("active"));let t=document.getElementById("login-step-"+e);t&&t.classList.add("active"),document.querySelectorAll(".login-step-dot").forEach((o,n)=>{o.classList.toggle("active",n<e)}),we()}function Et(){V(1),F&&(clearInterval(F),F=null)}function Ae(){ee=60;let e=document.getElementById("login-resend-btn"),t=document.getElementById("login-resend-text");e&&(e.disabled=!0),F=setInterval(()=>{ee--,ee<=0?(clearInterval(F),F=null,e&&(e.disabled=!1),t&&(t.textContent="\u91CD\u65B0\u53D1\u9001")):t&&(t.textContent=ee+"\u79D2\u540E\u91CD\u53D1")},1e3)}async function kt(e){e.preventDefault();let t=document.getElementById("login-send-btn"),o=document.getElementById("login-email").value.trim();if(!o){E("\u8BF7\u8F93\u5165\u90AE\u7BB1","error");return}t&&(t.disabled=!0,t.textContent="\u53D1\u9001\u4E2D...");try{let n=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:o})}),s=await n.json();if(n.ok){ye=o;let r=document.getElementById("login-display-email");r&&(r.textContent=o),V(2);let a=document.getElementById("login-code");a&&a.focus(),Ae()}else{let r=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u53D1\u9001\u5931\u8D25";E(r,"error")}}catch{E("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u83B7\u53D6\u9A8C\u8BC1\u7801")}async function Lt(){let e=document.getElementById("login-resend-btn");e&&(e.disabled=!0);try{let t=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:ye})}),o=await t.json();if(t.ok)E("\u9A8C\u8BC1\u7801\u5DF2\u91CD\u65B0\u53D1\u9001","success"),Ae();else{let n=typeof o.detail=="string"?o.detail:o.detail?.[0]?.msg||o.message||"\u53D1\u9001\u5931\u8D25";E(n,"error"),e&&(e.disabled=!1)}}catch{E("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error"),e&&(e.disabled=!1)}}async function It(e){e.preventDefault();let t=document.getElementById("login-verify-btn"),o=document.getElementById("login-code").value.trim();if(!o||o.length!==6){E("\u8BF7\u8F93\u51656\u4F4D\u9A8C\u8BC1\u7801","error");return}t&&(t.disabled=!0,t.textContent="\u767B\u5F55\u4E2D...");try{let n=await fetch("/api/auth/verify-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:ye,code:o})}),s=await n.json();if(n.ok)E("\u767B\u5F55\u6210\u529F","success"),setTimeout(()=>{te(),window.location.reload()},500);else{let r=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u9A8C\u8BC1\u5931\u8D25";E(r,"error")}}catch{E("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u767B\u5F55")}function xe(){let e=document.getElementById("login-code");e&&e.addEventListener("input",function(t){this.value=this.value.replace(/[^0-9]/g,"").slice(0,6)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",xe):xe();window.openLoginModal=M;window.closeLoginModal=te;window.closeLoginModalOnOverlay=St;window.loginSendCode=kt;window.loginVerifyCode=It;window.loginResendCode=Lt;window.loginGoBack=Et;window.loginGoToStep=V;window.loginShowMessage=E;window.loginShowEmailForm=Tt;window.loginHideEmailForm=ve;window.refreshWechatQR=wt;var k=[],W=!1,De=!1,Oe=!1,Ne=null;function R(){return b.getUser()?!0:(M(),!1)}async function _t(e=null){let t="/api/user/todos";e&&(t+=`?group_id=${encodeURIComponent(e)}`);let o=await fetch(t);if(!o.ok){if(o.status===401)return[];throw new Error("\u83B7\u53D6 Todo \u5931\u8D25")}return(await o.json()).todos||[]}async function Bt(e){let t=await fetch("/api/user/todos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function Ct(e,t){let o=await fetch(`/api/user/todos/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!o.ok){let n=await o.json();throw new Error(n.detail||"\u66F4\u65B0\u5931\u8D25")}return await o.json()}async function $t(e){let t=await fetch(`/api/user/todos/${e}`,{method:"DELETE"});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u5220\u9664\u5931\u8D25")}return await t.json()}async function Mt(e){let t=await fetch("/api/user/todos/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({todos:e})});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function Te(){if(!R())return[];try{return k=await _t(),X(),k}catch(e){return console.error("[Todo] Load error:",e),[]}}async function z(e,t){if(!R())return null;try{let o=await Bt({text:e,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1});if(o.ok&&o.todo)return k.unshift(o.todo),X(),B("\u5DF2\u6DFB\u52A0\u5230 Todo"),o.todo}catch(o){o.message.includes("\u5DF2\u5B58\u5728")?B("\u8BE5 Todo \u5DF2\u5B58\u5728"):B("\u6DFB\u52A0\u5931\u8D25: "+o.message),console.error("[Todo] Add error:",o)}return null}async function xt(e){if(!R())return;let t=k.find(n=>n.id===e);if(!t)return;let o=!t.done;try{await Ct(e,{done:o}),t.done=o,K(),ae(),X()}catch(n){console.error("[Todo] Toggle error:",n),B("\u66F4\u65B0\u5931\u8D25")}}async function Ft(e){if(R())try{await $t(e),k=k.filter(t=>t.id!==e),K(),ae(),X(),B("\u5DF2\u5220\u9664")}catch(t){console.error("[Todo] Delete error:",t),B("\u5220\u9664\u5931\u8D25")}}async function Se(e,t){if(!R())return null;let o=e.map(n=>({text:n,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1}));try{let n=await Mt(o);if(n.ok){n.added&&n.added.length>0&&(k=[...n.added,...k],X());let s=n.skipped_count>0?`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\uFF0C${n.skipped_count} \u9879\u5DF2\u5B58\u5728`:`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\u5230 Todo`;return B(s),n}}catch(n){console.error("[Todo] Batch add error:",n),B("\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return null}function Ee(e){return k.filter(t=>t.source.groupId===e)}function At(){return k.filter(e=>!e.done).length}function qt(){let e={};for(let t of k){let o=t.source.groupId;e[o]||(e[o]={groupId:o,groupTitle:t.source.groupTitle,groupUrl:t.source.groupUrl,isCustom:t.source.isCustom,todos:[]}),e[o].todos.push(t)}return Object.values(e)}function C(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}function B(e){if(window.showToast)window.showToast(e);else{let t=document.createElement("div");t.className="todo-toast",t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add("show"),10),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},2e3)}}function X(){let e=document.getElementById("todoBadge");if(!e)return;let t=At();t>0?(e.textContent=t>99?"99+":t,e.classList.add("show")):e.classList.remove("show")}var Re="todo_sidebar_width",Pt=320,Ht=800;function Dt(){if(document.getElementById("todoSidebar"))return;let e=document.createElement("div");e.id="todoSidebarBackdrop",e.className="todo-sidebar-backdrop",document.body.appendChild(e),document.body.insertAdjacentHTML("beforeend",`
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
    `);let o=localStorage.getItem(Re);if(o){let i=document.getElementById("todoSidebar");i.style.width=o+"px"}let s=document.getElementById("todoSidebar").querySelector(".todo-close-btn"),r=document.getElementById("todoFilterBtn"),a=document.getElementById("todoNewGroupBtn");e.addEventListener("click",he),s.addEventListener("click",he),r.addEventListener("click",Nt),a.addEventListener("click",Rt),Ot()}function Ot(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoResizeHandle");if(!e||!t)return;let o=!1,n=0,s=0;t.addEventListener("mousedown",r=>{o=!0,n=r.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),r.preventDefault()}),document.addEventListener("mousemove",r=>{if(!o)return;let a=n-r.clientX,i=s+a;i=Math.max(Pt,Math.min(Ht,i)),e.style.width=i+"px"}),document.addEventListener("mouseup",()=>{o&&(o=!1,e.classList.remove("resizing"),t.classList.remove("active"),localStorage.setItem(Re,e.offsetWidth),Z.saveSidebarWidths({todo_width:e.offsetWidth}))})}function je(){if(!R())return;Dt();let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e.classList.add("open"),t.classList.add("show"),De=!0,Te().then(()=>K())}function he(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e&&e.classList.remove("open"),t&&t.classList.remove("show"),De=!1}function Nt(){W=!W;let e=document.getElementById("todoFilterBtn");e&&(e.textContent=W?"\u53EA\u770B\u672A\u5B8C\u6210":"\u663E\u793A\u5168\u90E8"),K()}function Rt(){let e=document.getElementById("todoSidebarBody");if(!e||e.querySelector(".todo-new-group-input"))return;e.insertAdjacentHTML("afterbegin",`
        <div class="todo-new-group-input">
            <input type="text" placeholder="\u8F93\u5165\u65B0\u6807\u9898\u540D\u79F0..." class="todo-group-name-input" autofocus>
            <button class="todo-group-create-btn">\u521B\u5EFA</button>
            <button class="todo-group-cancel-btn">\u53D6\u6D88</button>
        </div>
    `);let o=e.querySelector(".todo-group-name-input"),n=e.querySelector(".todo-group-create-btn"),s=e.querySelector(".todo-group-cancel-btn");o.focus();let r=()=>{let a=o.value.trim();if(!a){B("\u8BF7\u8F93\u5165\u6807\u9898\u540D\u79F0");return}let i=`custom_${Date.now()}`;ke(i,a,"",!0),e.querySelector(".todo-new-group-input")?.remove()};n.addEventListener("click",r),s.addEventListener("click",()=>{e.querySelector(".todo-new-group-input")?.remove()}),o.addEventListener("keydown",a=>{a.key==="Enter"&&r(),a.key==="Escape"&&e.querySelector(".todo-new-group-input")?.remove()})}function ke(e,t,o,n){let s=document.getElementById("todoSidebarBody");if(!s)return;let r=s.querySelector(`.todo-group[data-group-id="${e}"]`);if(r){r.classList.remove("collapsed");let c=ne();c[e]=!1,be(c)}else{let c=ne();c[e]=!1,be(c);let f=`
            <div class="todo-group" data-group-id="${C(e)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${C(t)}">${C(t)}</span>
                    <span class="todo-group-count">0/0</span>
                    <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner"></div>
                </div>
            </div>
        `;s.insertAdjacentHTML("afterbegin",f),r=s.querySelector(`.todo-group[data-group-id="${e}"]`),r.querySelector(".todo-group-add-btn").addEventListener("click",T=>{T.stopPropagation(),ke(e,t,o,n)}),r.querySelector(".todo-group-header")?.addEventListener("click",T=>{T.target.closest(".todo-group-add-btn")||We(e)})}let a=r.querySelector(".todo-group-items-inner");if(!a||a.querySelector(".todo-add-input"))return;a.insertAdjacentHTML("afterbegin",`
        <div class="todo-add-input">
            <input type="text" placeholder="\u8F93\u5165 Todo \u5185\u5BB9..." class="todo-text-input" autofocus>
            <button class="todo-add-confirm-btn">\u6DFB\u52A0</button>
        </div>
    `);let d=a.querySelector(".todo-text-input"),m=a.querySelector(".todo-add-confirm-btn");d.focus();let l=async()=>{let c=d.value.trim();if(!c){B("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}await z(c,{groupId:e,groupTitle:t,groupUrl:o||"",isCustom:n||!1})&&(d.value="",K())};m.addEventListener("click",l),d.addEventListener("keydown",c=>{c.key==="Enter"&&l(),c.key==="Escape"&&a.querySelector(".todo-add-input")?.remove()})}function K(){let e=document.getElementById("todoSidebarBody");if(!e)return;if((W?k:k.filter(s=>!s.done)).length===0){e.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let o=qt(),n="";for(let s of o){let r=W?s.todos:s.todos.filter(f=>!f.done);if(r.length===0&&!W)continue;let a=s.todos.filter(f=>!f.done).length,i=s.todos.length,d=qe(s.groupId),l=s.isCustom?"":`
            <button class="todo-group-summary-btn" title="\u67E5\u770B\u603B\u7ED3" data-group-id="${C(s.groupId)}" data-group-title="${C(s.groupTitle)}" data-group-url="${C(s.groupUrl||"")}">\u2728</button>
        `,c=s.groupUrl?`
            <a href="${C(s.groupUrl)}" target="_blank" rel="noopener noreferrer" class="todo-group-link-btn" title="\u67E5\u770B\u539F\u6587" onclick="event.stopPropagation()">\u{1F517}</a>
        `:"";n+=`
            <div class="todo-group ${d?"collapsed":""}" data-group-id="${C(s.groupId)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${C(s.groupTitle)}">${C(s.groupTitle)}</span>
                    <span class="todo-group-count">${a}/${i}</span>
                    <div class="todo-group-actions">
                        ${c}
                        ${l}
                        <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                    </div>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner">
                        ${r.map(f=>ze(f)).join("")}
                    </div>
                </div>
            </div>
        `}e.innerHTML=n,e.querySelectorAll(".todo-group").forEach(s=>{let r=s.dataset.groupId,a=o.find(l=>l.groupId===r);if(!a)return;s.querySelector(".todo-group-add-btn")?.addEventListener("click",l=>{l.stopPropagation(),ke(r,a.groupTitle,a.groupUrl,a.isCustom)}),s.querySelector(".todo-group-summary-btn")?.addEventListener("click",l=>{l.stopPropagation(),jt(a.groupId,a.groupTitle,a.groupUrl)}),s.querySelector(".todo-group-header")?.addEventListener("click",l=>{l.target.closest(".todo-group-add-btn")||l.target.closest(".todo-group-summary-btn")||We(r)}),qe(r)&&s.classList.add("collapsed")}),Ge(e)}function jt(e,t,o){window.openSummaryModal&&window.openSummaryModal(e,t,o,"","")}var Ue="todo_collapsed_groups";function ne(){try{let e=localStorage.getItem(Ue);return e?JSON.parse(e):{}}catch{return{}}}function be(e){try{localStorage.setItem(Ue,JSON.stringify(e))}catch{}}function qe(e){return ne()[e]!==!1}function We(e){let t=ne(),o=t[e]!==!1;t[e]=!o,be(t);let n=document.querySelector(`.todo-group[data-group-id="${e}"]`);n&&n.classList.toggle("collapsed",!o)}function ze(e){return`
        <div class="todo-item ${e.done?"done":""}" data-id="${e.id}">
            <input type="checkbox" class="todo-checkbox" ${e.done?"checked":""}>
            <span class="todo-text">${C(e.text)}</span>
            <button class="todo-delete-btn" title="\u5220\u9664">\xD7</button>
        </div>
    `}function Ge(e){e.querySelectorAll(".todo-item").forEach(t=>{let o=parseInt(t.dataset.id),n=t.querySelector(".todo-checkbox"),s=t.querySelector(".todo-delete-btn");n?.addEventListener("change",()=>xt(o)),s?.addEventListener("click",r=>{r.stopPropagation(),Ft(o)})})}function Ut(){if(document.getElementById("summaryTodoPanel"))return;let e=`
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
    `,t=document.getElementById("summaryModalFooter");t?t.insertAdjacentHTML("beforebegin",e):document.body.insertAdjacentHTML("beforeend",e);let o=document.getElementById("summaryTodoPanel"),n=o.querySelector(".summary-todo-close-btn"),s=o.querySelector(".summary-todo-add-btn"),r=document.getElementById("summaryTodoInput");n.addEventListener("click",re),s.addEventListener("click",Pe),r.addEventListener("keydown",a=>{a.key==="Enter"&&Pe()})}function se(e,t,o){if(!R())return;Ut(),Ne=e;let n=document.getElementById("summaryTodoPanel");n.classList.add("open"),n.dataset.groupId=e,n.dataset.groupTitle=t,n.dataset.groupUrl=o||"",Oe=!0,ae()}function re(){let e=document.getElementById("summaryTodoPanel");e&&e.classList.remove("open"),Oe=!1,Ne=null}async function Pe(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoInput");if(!e||!t)return;let o=t.value.trim();if(!o){B("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}let n=e.dataset.groupId,s=e.dataset.groupTitle,r=e.dataset.groupUrl;await z(o,{groupId:n,groupTitle:s,groupUrl:r,isCustom:!1})&&(t.value="",ae())}function ae(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoBody");if(!e||!t)return;let o=e.dataset.groupId;if(!o){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let n=Ee(o);if(n.length===0){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo\uFF0C\u53EF\u5728\u4E0A\u65B9\u8F93\u5165\u6DFB\u52A0</div>';return}t.innerHTML=n.map(s=>ze(s)).join(""),Ge(t)}function Wt(e){return Ee(e).filter(t=>!t.done).length}var w=null,He=!1;function Je(){if(He)return;He=!0,w=document.createElement("button"),w.className="selection-todo-btn",w.type="button",w.textContent="+Todo",w.style.display="none",document.body.appendChild(w);let e=()=>{w.style.display="none",w.dataset.selectionText="",w._source=null},t=()=>{let n=window.getSelection();if(!n||n.isCollapsed)return null;let s=n.toString();if(!String(s||"").trim())return null;let r=n.rangeCount?n.getRangeAt(0):null;if(!r)return null;let a=r.commonAncestorContainer,i=a?.nodeType===Node.ELEMENT_NODE?a:a?.parentElement;if(!i)return null;let d=document.getElementById("summaryModalBody");return!d||!d.contains(i)||i.closest&&i.closest(".summary-todo-panel")?null:{text:s.trim(),range:r}},o=()=>{let n=t();if(!n){e();return}let s=n.range.getBoundingClientRect();if(!s||!s.width&&!s.height){e();return}let r=64,a=32,i=8,d=Math.min(window.innerWidth-r-i,Math.max(i,s.right-r)),m=Math.min(window.innerHeight-a-i,Math.max(i,s.bottom+i));w.style.left=`${d}px`,w.style.top=`${m}px`,w.style.display="block",w.dataset.selectionText=n.text};w.addEventListener("click",async()=>{let n=w.dataset.selectionText||"";if(!n)return;let s=window._currentSummaryNewsId,r=window._currentSummaryNewsTitle,a=window._currentSummaryNewsUrl;if(!s||!r){B("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}await z(n,{groupId:s,groupTitle:r,groupUrl:a||"",isCustom:!1});try{window.getSelection()?.removeAllRanges()}catch{}e()}),document.addEventListener("mouseup",()=>setTimeout(o,0)),document.addEventListener("keyup",()=>setTimeout(o,0)),document.addEventListener("touchend",()=>setTimeout(o,100)),document.addEventListener("selectionchange",()=>{setTimeout(o,50)}),document.addEventListener("scroll",e,!0),window.addEventListener("resize",e),document.addEventListener("mousedown",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")}),document.addEventListener("touchstart",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")})}function zt(){let e=document.createElement("button");return e.className="icon-btn todo-btn",e.id="todoBtn",e.title="\u6211\u7684 Todo",e.innerHTML='\u{1F4CB}<span class="todo-badge" id="todoBadge"></span>',e.addEventListener("click",je),e}function Gt(){let e=document.getElementById("favoritesBtn");if(e&&e.parentNode){let o=zt();e.parentNode.insertBefore(o,e)}b.getUser()&&Te()}window.openTodoSidebar=je;window.closeTodoSidebar=he;window.openTodoPanel=se;window.closeTodoPanel=re;window.addTodo=z;window.batchAddTodos=Se;window.loadTodos=Te;window.getTodosByGroupId=Ee;window.getCurrentTodoCount=Wt;window.initTodoButton=Gt;var Qe=!1,y=null,L=null,U=null,Jt=null,Qt=null,ie=null,de=null,Vt=5e3,Xt=1e4;function Kt(){ie&&(clearTimeout(ie),ie=null)}function Yt(){de&&(clearTimeout(de),de=null)}function j(){Kt(),Yt()}async function Zt(e,t,o){try{await fetch("/api/summary/failures/record",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:e,reason:"client_timeout",error_detail:"\u5BA2\u6237\u7AEF 10 \u79D2\u8D85\u65F6",source_id:t||null,source_name:o||null})}),console.log("[Summary] Recorded client timeout for:",e)}catch(n){console.error("[Summary] Failed to record client timeout:",n)}}var eo={news:"\u{1F4F0}",policy:"\u26A0\uFE0F",business:"\u{1F4CA}",tutorial:"\u2705",research:"\u{1F4DA}",product:"\u{1F680}",opinion:"\u{1F4AD}",interview:"\u{1F4AC}",listicle:"\u{1F4D1}",lifestyle:"\u2705",general:"\u{1F4DD}","tech-tutorial":"\u2705",trend:"\u{1F4CA}",other:"\u{1F4DD}"};function to(e){let t=e||0;return t>=1e3?(t/1e3).toFixed(1).replace(/\.0$/,"")+"K":t.toString()}function Le(e){if(!e)return e;let t=e.replace(/\[TAGS_?START\][\s\S]*?\[TAGS_?END\]/gi,"");return t=t.replace(/\n*-{3,}\s*$/g,""),t.trim()}function q(e){if(!e)return"";let t=e.replace(/<br\s*\/?>/gi,`
`).replace(/<\/br>/gi,`
`);t=t.replace(/- \[ \]/g,"-"),t=t.replace(/- \[\]/g,"-"),t=t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),t=t.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code class="language-$1">$2</code></pre>'),t=t.replace(/`([^`]+)`/g,"<code>$1</code>"),t=t.replace(/^#{4}\s+(.+)$/gm,"<h4>$1</h4>"),t=t.replace(/^#{3}\s+(.+)$/gm,"<h3>$1</h3>"),t=t.replace(/^#{2}\s+(.+)$/gm,"<h2>$1</h2>"),t=t.replace(/^#{1}\s+(.+)$/gm,"<h1>$1</h1>"),t=t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),t=t.replace(/\*([^*]+)\*/g,"<em>$1</em>"),t=t.replace(/__([^_]+)__/g,"<strong>$1</strong>"),t=t.replace(/_([^_]+)_/g,"<em>$1</em>"),t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'),t=t.replace(/^&gt;\s*(.*)$/gm,"<blockquote>$1</blockquote>"),t=t.replace(/<\/blockquote>\n<blockquote>/g,`
`),t=t.replace(/^[-]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[*]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[_]{3,}\s*$/gm,"<hr>");let o=t.split(`
`),n=[],s=!1,r=[],a=!1,i=[];for(let d=0;d<o.length;d++){let m=o[d],l=m.trim(),c=/^\|(.+)\|$/.test(l),f=/^\|[\s\-:|]+\|$/.test(l),p=l.match(/^[-*]\s+(.+)$/),h=l.match(/^\d+\.\s+(.+)$/),T=p||h;if(c){if(a&&i.length>0&&(n.push("<ul>"+i.join("")+"</ul>"),i=[],a=!1),s||(s=!0,r=[]),!f){let _=l.slice(1,-1).split("|").map(x=>x.trim()),$=r.length===0?"th":"td",S="<tr>"+_.map(x=>`<${$}>${x}</${$}>`).join("")+"</tr>";r.push(S)}continue}else s&&r.length>0&&(n.push("<table>"+r.join("")+"</table>"),r=[],s=!1);if(T){let _=p?p[1]:h[1];a=!0,i.push("<li>"+_+"</li>");continue}else a&&i.length>0&&(n.push("<ul>"+i.join("")+"</ul>"),i=[],a=!1);n.push(m)}return s&&r.length>0&&n.push("<table>"+r.join("")+"</table>"),a&&i.length>0&&n.push("<ul>"+i.join("")+"</ul>"),t=n.join(`
`),t=t.split(/\n{2,}/).map(d=>(d=d.trim(),d?/^<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(d)||/<\/(h[1-6]|ul|ol|table|pre|blockquote)>$/.test(d)?d:"<p>"+d.replace(/\n/g,"<br>")+"</p>":"")).join(`
`),t=t.replace(/<p>\s*<\/p>/g,""),t=t.replace(/<p><hr><\/p>/g,"<hr>"),t=t.replace(/<p>(<table>)/g,"$1"),t=t.replace(/(<\/table>)<\/p>/g,"$1"),t=t.replace(/<p>(<ul>)/g,"$1"),t=t.replace(/(<\/ul>)<\/p>/g,"$1"),t=t.replace(/<p>(<blockquote>)/g,"$1"),t=t.replace(/(<\/blockquote>)<\/p>/g,"$1"),t=t.replace(/(<h[1-3]>(?:✅\s*|📋\s*)?行动清单\s*<\/h[1-3]>)/gi,'<div class="action-list-header">$1<button class="action-list-add-btn" onclick="addActionListToTodo()">+ Todo</button></div>'),t}function Ve(){if(document.getElementById("summaryModal"))return;document.body.insertAdjacentHTML("beforeend",`
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
    `)}async function Be(e,t,o,n,s){if(!b.getUser()){M();return}Ve();let a=document.getElementById("summaryModal"),i=document.getElementById("summaryModalTitle"),d=document.getElementById("summaryModalBody"),m=document.getElementById("summaryModalFooter");if(y=e,L=t,U=o,Jt=n,Qt=s,Qe=!0,window._currentSummaryNewsId=e,window._currentSummaryNewsTitle=t,window._currentSummaryNewsUrl=o,Je(),i){let l=t&&t.length>50?t.substring(0,50)+"...":t||"AI \u603B\u7ED3";i.textContent=`\u2728 ${l}`}a.classList.add("open"),document.body.style.overflow="hidden",d.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">\u6B63\u5728\u83B7\u53D6\u6587\u7AE0\u5185\u5BB9...</div>
                <div class="summary-loading-hint">\u9996\u6B21\u603B\u7ED3\u9700\u8981 10-30 \u79D2</div>
                <div id="summarySlowHint" class="summary-slow-hint" style="display:none;">
                    <span>\u52A0\u8F7D\u8F83\u6162\uFF1F</span>
                    <a href="${o}" target="_blank" rel="noopener noreferrer" class="summary-slow-link">\u5148\u770B\u539F\u6587 \u2192</a>
                </div>
            </div>
        </div>
    `,m.style.display="none",j(),ie=setTimeout(()=>{let l=document.getElementById("summarySlowHint");l&&(l.style.display="block"),window.matchMedia&&!window.matchMedia("(hover: hover)").matches&&o&&window.open(o,"_blank","noopener,noreferrer")},Vt),de=setTimeout(()=>{Zt(o,n,s),d.innerHTML=`
            <div class="summary-access-error">
                <div class="summary-access-error-icon">\u{1F6E1}\uFE0F</div>
                <div class="summary-access-error-title">\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u5185\u5BB9</div>
                <div class="summary-access-error-text">\u8BE5\u7F51\u7AD9\u9632\u62A4\u8F83\u5F3A\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
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
        `},Xt);try{let l=await fetch(`/api/summary/failures/check?url=${encodeURIComponent(o)}`);if(l.ok){let S=await l.json();if(S.summarizable)S.warning&&console.log("[Summary] Warning:",S.warning);else{j(),Ie(),window.open(o,"_blank");return}}let c=await fetch("/api/summary/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!c.ok){let S=await c.json();throw new Error(S.detail||"\u751F\u6210\u5931\u8D25")}let f=c.body.getReader(),p=new TextDecoder,h="",T="other",_="\u5176\u4ED6",P=!1,$=null;for(;;){let{done:S,value:x}=await f.read();if(S)break;let g=p.decode(x,{stream:!0}).split(`
`);for(let J of g)if(J.startsWith("data: "))try{let u=JSON.parse(J.slice(6));switch(u.type){case"status":let Y=document.getElementById("summaryStatusText");Y&&(Y.textContent=u.message);break;case"type":T=u.article_type,_=u.article_type_name,window._currentTypeConfidence=u.confidence||0;break;case"chunk":P||(P=!0,j(),d.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),h+=u.content;let H=document.getElementById("summaryStreamContent");if(H){let v=h;v=v.replace(/\[TAGS_?START\][\s\S]*$/gi,""),H.innerHTML=q(v)+'<span class="summary-cursor">\u258C</span>',H.scrollTop=H.scrollHeight}break;case"cached":j(),h=u.summary,T=u.article_type,_=u.article_type_name,$=u.token_usage||null;let O=u.feedback||null,ft=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,pt=Le(h);if(d.innerHTML=`
                                <div class="summary-content">
                                    ${q(pt)}
                                </div>
                            `,le(o,T,_,!0,$,O,ft),ce(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying cached tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v&&(console.log("[Summary] Found news item for cached, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true")}return;case"done":$=u.token_usage||null;let yt=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,pe=document.getElementById("summaryStreamContent");if(pe){pe.classList.remove("summary-streaming");let v=Le(h);pe.innerHTML=q(v)}let gt=window._currentTypeConfidence||0;if(le(o,T,_,!1,$,null,yt,gt),ce(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v?(console.log("[Summary] Found news item, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true"):console.log("[Summary] News item not found in DOM")}break;case"short_content":j(),d.innerHTML=`
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
                            `,m.style.display="none";return;case"error":throw new Error(u.message)}}catch(u){if(u.message&&!u.message.includes("JSON"))throw u}}if(P&&h&&!document.querySelector('.summary-modal-footer[style*="flex"]')){console.log("[Summary] Stream ended without done event, showing fallback footer");let S=document.getElementById("summaryStreamContent");if(S){S.classList.remove("summary-streaming");let x=Le(h);S.innerHTML=q(x)}le(o,T,_,!1,$,null,null,0),ce(e,!0)}}catch(l){if(console.error("[Summary] Error:",l),j(),l.message&&(l.message.includes("\u8BBF\u95EE\u9650\u5236")||l.message.includes("\u65E0\u6CD5\u83B7\u53D6")||l.message.includes("\u65E0\u6CD5\u8BBF\u95EE")||l.message.includes("\u8BF7\u6C42\u5931\u8D25")))d.innerHTML=`
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
            `;else{Ie();return}}}function le(e,t,o,n,s,r=null,a=null,i=null){let d=document.getElementById("summaryModalFooter"),m=eo[t]||"\u{1F4DD}",l="",c=s?.total_tokens||0;c>0&&(l=`<span class="summary-token-tag" title="\u672C\u6B21\u6D88\u8017">\u{1FA99} ${to(c)}</span>`);let f=r==="up"?"active":"",p=r==="down"?"active":"";d.innerHTML=`
        <div class="summary-footer-left">
            ${l}
            <span class="summary-type-tag">${m} ${o}</span>
            <div class="summary-feedback">
                <button class="summary-feedback-btn ${f}" data-vote="up" onclick="handleSummaryFeedback('up')" title="\u6709\u5E2E\u52A9">
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
    `,d.style.display="flex"}async function oo(e){if(!y)return;let t=document.querySelectorAll(".summary-feedback-btn"),o=document.querySelector(`.summary-feedback-btn[data-vote="${e}"]`),s=o?.classList.contains("active")?"none":e;t.forEach(r=>r.classList.remove("active")),s!=="none"&&o?.classList.add("active");try{let r=await fetch(`/api/summary/${encodeURIComponent(y)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vote:s})});r.ok||console.error("[Summary] Feedback failed:",await r.text())}catch(r){console.error("[Summary] Feedback error:",r)}}function Ie(){let e=document.getElementById("summaryModal");e&&(e.classList.remove("open"),document.body.style.overflow=""),j(),Qe=!1,y=null}function Xe(){let e=document.querySelector(`.news-summary-btn[data-news-id="${y}"]`);if(e){let t=e.dataset.title,o=e.dataset.url,n=e.dataset.sourceId,s=e.dataset.sourceName;Be(y,t,o,n,s)}}async function no(){if(y){try{await fetch(`/api/summary/${encodeURIComponent(y)}`,{method:"DELETE"})}catch(e){console.error("[Summary] Delete error:",e)}Xe()}}async function so(e,t,o,n,s){let r=decodeURIComponent(t),a=decodeURIComponent(o),i=decodeURIComponent(s);ro(e,r,a,n,i)}async function ro(e,t,o,n,s){if(!b.getUser()){M();return}Ve();let a=document.getElementById("summaryModal"),i=document.getElementById("summaryModalBody"),d=document.getElementById("summaryModalFooter");y=e,L=t,U=o,i.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">\u6B63\u5728\u751F\u6210\u603B\u7ED3...</div>
            </div>
        </div>
    `,d.style.display="none";try{let m=await fetch("/api/summary/stream?force=1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!m.ok){let P=await m.json();throw new Error(P.detail||"\u751F\u6210\u5931\u8D25")}let l=m.body.getReader(),c=new TextDecoder,f="",p="other",h="\u5176\u4ED6",T=!1,_=null;for(;;){let{done:P,value:$}=await l.read();if(P)break;let x=c.decode($,{stream:!0}).split(`
`);for(let fe of x)if(fe.startsWith("data: "))try{let g=JSON.parse(fe.slice(6));switch(g.type){case"status":let J=document.getElementById("summaryStatusText");J&&(J.textContent=g.message);break;case"type":p=g.article_type,h=g.article_type_name;break;case"chunk":T||(T=!0,i.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),f+=g.content;let u=document.getElementById("summaryStreamContent");u&&(u.innerHTML=q(f)+'<span class="summary-cursor">\u258C</span>',u.scrollTop=u.scrollHeight);break;case"done":_=g.token_usage||null;let Y=g.token_balance!==void 0?{token_balance:g.token_balance,tokens_used:g.tokens_used,default_tokens:1e5}:null,H=document.getElementById("summaryStreamContent");if(H&&(H.classList.remove("summary-streaming"),H.innerHTML=q(f)),le(o,p,h,!1,_,null,Y),ce(e,!0),g.tags&&window.ArticleTags){let O=document.querySelector(`.news-item[data-news-id="${e}"]`);O||(O=document.querySelector(`.news-item[data-url="${o}"]`)),O&&(window.ArticleTags.applyTags(O,g.tags),O.dataset.tagsLoaded="true")}break;case"error":throw new Error(g.message)}}catch(g){if(g.message&&!g.message.includes("JSON"))throw g}}}catch(m){console.error("[Summary] Force error:",m),i.innerHTML=`
            <div class="summary-error">
                <div class="summary-error-icon">\u274C</div>
                <div class="summary-error-text">${m.message}</div>
                <button class="summary-retry-btn" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
            </div>
        `}}function ce(e,t){let o=document.querySelector(`.news-summary-btn[data-news-id="${e}"]`);o&&(o.classList.toggle("has-summary",t),o.title=t?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3");let n=document.querySelector(`.news-item[data-news-id="${e}"]`);n&&n.classList.toggle("has-summary",t)}function Ke(e,t,o,n,s,r){e.preventDefault(),e.stopPropagation(),Be(t,o,n,s,r)}async function G(){try{if(!b.isLoggedIn())return;let e=await fetch("/api/summary/list");if(!e.ok)return;let t=await e.json();if(!t.ok||!t.news_ids)return;let o=new Set(t.news_ids);if(o.size===0)return;document.querySelectorAll(".news-item[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&n.classList.add("has-summary")}),document.querySelectorAll(".news-summary-btn[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&(n.classList.add("has-summary"),n.title="\u67E5\u770B\u603B\u7ED3")}),console.log(`[Summary] Marked ${o.size} summarized items`)}catch(e){console.error("[Summary] Failed to load summarized list:",e)}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{setTimeout(G,500)}):setTimeout(G,500);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){let e=window._lastSummarizedListLoad||0;Date.now()-e>3e4&&(console.log("[Summary] Page visible, reloading summarized list"),G())}});var ao=G;G=async function(){return window._lastSummarizedListLoad=Date.now(),ao()};function io(){!y||!L||(se(y,L,U),_e(!0))}function lo(){if(!y||!L)return;let e=document.getElementById("summaryTodoPanel");e&&e.classList.contains("open")?(re(),_e(!1)):(se(y,L,U),_e(!0))}function _e(e){let t=document.getElementById("summaryTodoToggleBtn");t&&t.classList.toggle("active",e)}async function co(){if(!y||!L)return;let e=document.getElementById("summaryModalBody");if(!e)return;let o=e.innerHTML.match(/✅\s*行动清单[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);if(!o){window.showToast&&window.showToast("\u672A\u627E\u5230\u884C\u52A8\u6E05\u5355");return}let r=(o[1].match(/<li>([\s\S]*?)<\/li>/gi)||[]).map(a=>a.replace(/<\/?li>/gi,"").replace(/<[^>]+>/g,"").trim()).filter(a=>a.length>0);if(r.length===0){window.showToast&&window.showToast("\u884C\u52A8\u6E05\u5355\u4E3A\u7A7A");return}await Se(r,{groupId:y,groupTitle:L,groupUrl:U||"",isCustom:!1})}async function uo(){if(!y||!L){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let e=await z(L,{groupId:y,groupTitle:L,groupUrl:U||"",isCustom:!1})}catch(e){console.error("[Summary] Add to todo error:",e),window.showToast&&window.showToast("\u6DFB\u52A0\u5931\u8D25")}}async function mo(){if(!y||!L){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let{addFavorite:e}=await import("./favorites-TLTBESRH.js"),t=await e({news_id:y,title:L,url:U||""});t.ok?window.showToast&&window.showToast("\u5DF2\u6536\u85CF"):t.error&&window.showToast&&window.showToast(t.error)}catch(e){console.error("[Summary] Add to favorites error:",e),window.showToast&&window.showToast("\u6536\u85CF\u5931\u8D25")}}document.addEventListener("click",e=>{let t=e.target.closest(".news-summary-btn");if(!t||t.hasAttribute("onclick"))return;e.preventDefault(),e.stopPropagation();let o=t.dataset.newsId,n=t.dataset.title||"",s=t.dataset.url||"",r=t.dataset.sourceId||"",a=t.dataset.sourceName||"";o&&Ke(e,o,n,s,r,a)});window.openSummaryModal=Be;window.closeSummaryModal=Ie;window.retrySummaryModal=Xe;window.regenerateSummaryModal=no;window.handleSummaryClick=Ke;window.loadSummarizedList=G;window.handleSummaryFeedback=oo;window.openCurrentTodoPanel=io;window.toggleCurrentTodoPanel=lo;window.addActionListToTodo=co;window.forceSummary=so;window.addCurrentToTodo=uo;window.addCurrentToFavorites=mo;var ot="hotnews_favorites_v1",nt="hotnews_favorites_width",fo=500,Ce=320,$e=800,I=null,ue=!1,D=!1;function me(){try{let e=localStorage.getItem(ot);return e?JSON.parse(e):[]}catch{return[]}}function st(e){try{localStorage.setItem(ot,JSON.stringify(e))}catch(t){console.error("[Favorites] Failed to save to localStorage:",t)}}async function po(){try{let e=await fetch("/api/user/favorites");if(e.status===401)return{needsAuth:!0};if(!e.ok)throw new Error("Failed to fetch favorites");let t=await e.json();return t.ok?(I=t.favorites||[],{favorites:I}):{error:t.message||"Unknown error"}}catch(e){return console.error("[Favorites] Fetch error:",e),{error:e.message}}}async function yo(e){if(!b.getUser()){let o=me();return o.some(s=>s.news_id===e.news_id)||(o.unshift({...e,created_at:Math.floor(Date.now()/1e3)}),st(o)),{ok:!0,local:!0}}try{let n=await(await fetch("/api/user/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json();return n.ok&&I&&I.unshift(n.favorite),n}catch(o){return console.error("[Favorites] Add error:",o),{ok:!1,error:o.message}}}async function rt(e){if(!b.getUser()){let n=me().filter(s=>s.news_id!==e);return st(n),{ok:!0,local:!0}}try{let n=await(await fetch(`/api/user/favorites/${encodeURIComponent(e)}`,{method:"DELETE"})).json();return n.ok&&I&&(I=I.filter(s=>s.news_id!==e)),n}catch(o){return console.error("[Favorites] Remove error:",o),{ok:!1,error:o.message}}}function at(e){return b.getUser()?I?I.some(o=>o.news_id===e):!1:me().some(n=>n.news_id===e)}async function it(e,t){let o=e.news_id,n=at(o);t&&(t.classList.toggle("favorited",!n),t.textContent=n?"\u2606":"\u2605");let s;return n?s=await rt(o):s=await yo(e),s.ok||t&&(t.classList.toggle("favorited",n),t.textContent=n?"\u2605":"\u2606"),s}function dt(e){if(!e)return"";let t=new Date(e*1e3),o=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${o}-${n}`}function go(e){let t=document.getElementById("favoritesPanelBody");if(!t)return;if(!e||e.length===0){t.innerHTML=`
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
                            ${n.created_at?`<span>\u6536\u85CF\u4E8E ${dt(n.created_at)}</span>`:""}
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
    `;t.innerHTML=o}function Ye(){let e=document.getElementById("favoritesPanelBody");if(!e)return;let t=me();t.length>0?e.innerHTML=`
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
                                ${o.created_at?`<span>\u6536\u85CF\u4E8E ${dt(o.created_at)}</span>`:""}
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
        `}async function lt(){let e=document.getElementById("favoritesPanelBody");if(!e)return;if(e.innerHTML='<div class="favorites-loading">\u52A0\u8F7D\u4E2D...</div>',!b.getUser()){Ye();return}let o=await po();if(o.needsAuth){Ye();return}if(o.error){e.innerHTML=`
            <div class="favorites-empty">
                <div>\u52A0\u8F7D\u5931\u8D25: ${o.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    \u91CD\u8BD5
                </button>
            </div>
        `;return}go(o.favorites)}function vo(){if(!b.getUser()){M();return}let t=document.getElementById("favoritesPanel"),o=document.getElementById("favoritesOverlay");t&&(o||(o=document.createElement("div"),o.id="favoritesOverlay",o.className="favorites-overlay",o.onclick=ct,document.body.appendChild(o)),ue=!ue,ue?(t.classList.add("open"),o.classList.add("open"),lt()):(t.classList.remove("open"),o.classList.remove("open")))}function ct(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesOverlay");ue=!1,e&&e.classList.remove("open"),t&&t.classList.remove("open")}async function wo(e){if((await rt(e)).ok){let o=document.querySelector(`.favorite-item[data-news-id="${e}"]`);o&&o.remove();let n=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);n&&(n.classList.remove("favorited"),n.textContent="\u2606");let s=document.querySelector(".favorites-list");s&&s.children.length===0&&lt()}}function ho(e,t,o,n,s,r){if(e.preventDefault(),e.stopPropagation(),!b.getUser()){M();return}let i=e.currentTarget;it({news_id:t,title:o,url:n,source_id:s||"",source_name:r||""},i)}function bo(){try{let e=localStorage.getItem(nt);if(e){let t=parseInt(e,10);if(t>=Ce&&t<=$e)return t}}catch{}return fo}function Ze(e){try{localStorage.setItem(nt,String(e)),Z.saveSidebarWidths({favorites_width:e})}catch{}}function To(e){let t=document.getElementById("favoritesPanel");t&&(t.style.width=e+"px")}function et(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesResizeHandle");if(!e||!t)return;let o=bo();To(o);let n=0,s=0;function r(c){c.preventDefault(),D=!0,n=c.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("mousemove",a),document.addEventListener("mouseup",i)}function a(c){if(!D)return;let f=n-c.clientX,p=s+f;p=Math.max(Ce,Math.min($e,p)),e.style.width=p+"px"}function i(){D&&(D=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("mousemove",a),document.removeEventListener("mouseup",i),Ze(e.offsetWidth))}function d(c){c.touches.length===1&&(c.preventDefault(),D=!0,n=c.touches[0].clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("touchmove",m,{passive:!1}),document.addEventListener("touchend",l))}function m(c){if(!D||c.touches.length!==1)return;c.preventDefault();let f=n-c.touches[0].clientX,p=s+f;p=Math.max(Ce,Math.min($e,p)),e.style.width=p+"px"}function l(){D&&(D=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("touchmove",m),document.removeEventListener("touchend",l),Ze(e.offsetWidth))}t.addEventListener("mousedown",r),t.addEventListener("touchstart",d,{passive:!1})}function tt(){document.addEventListener("click",e=>{let t=e.target.closest(".news-favorite-btn");if(!t)return;if(e.preventDefault(),e.stopPropagation(),!b.getUser()){M();return}let n=t.closest(".news-item");if(!n)return;let s=n.dataset.id||n.dataset.newsId,r=n.dataset.url,a=n.querySelector(".news-title"),i=a?a.textContent.trim():"",d=n.closest(".platform-card"),m=d?d.dataset.platform:"",l=d?d.querySelector(".platform-name"):null,c=l?l.textContent.replace("\u{1F4F1}","").trim():"";it({news_id:s,title:i,url:r,source_id:m,source_name:c},t)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{et(),tt()}):(et(),tt());async function ut(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(!(!t||!o)){if(o.classList.contains("has-summary")){mt(e);return}o.disabled=!0,o.textContent="\u23F3",o.title="\u751F\u6210\u4E2D...",t.style.display="block",t.innerHTML=`
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
            `,I){let r=I.find(a=>a.news_id===e);r&&(r.summary=s.summary,r.summary_at=s.summary_at)}}else throw new Error(s.error||"\u751F\u6210\u5931\u8D25")}catch(n){console.error("[Favorites] Summary error:",n),t.innerHTML=`
            <div class="summary-error">
                <span>\u274C ${n.message}</span>
                <button onclick="handleFavoriteSummaryClick('${e}')" style="margin-left:8px;">\u91CD\u8BD5</button>
            </div>
        `,o.textContent="\u{1F4DD}",o.title="AI \u603B\u7ED3"}finally{o.disabled=!1}}}function mt(e){let t=document.getElementById(`summary-${e}`);if(!t)return;let o=t.style.display!=="none";t.style.display=o?"none":"block";let n=t.querySelector(".summary-toggle-btn");n&&(n.textContent=o?"\u5C55\u5F00":"\u6536\u8D77")}async function So(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(t){try{await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"DELETE"})}catch(n){console.error("[Favorites] Delete summary error:",n)}if(o&&(o.classList.remove("has-summary"),o.textContent="\u{1F4DD}"),I){let n=I.find(s=>s.news_id===e);n&&(n.summary=null,n.summary_at=null)}await ut(e)}}window.toggleFavoritesPanel=vo;window.closeFavoritesPanel=ct;window.removeFavoriteFromPanel=wo;window.handleFavoriteClick=ho;window.isFavorited=at;window.handleFavoriteSummaryClick=ut;window.toggleSummaryDisplay=mt;window.regenerateSummary=So;export{M as a,Te as b,Gt as c,yo as d,rt as e,at as f,it as g,vo as h,ct as i,ho as j};
