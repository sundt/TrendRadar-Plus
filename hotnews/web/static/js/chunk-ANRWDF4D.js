import{a as h,b as ee}from"./chunk-ICSVECP2.js";var pe="",te=0,x=null,V=null,D=null,F=null,Ce=300;function pt(){return navigator.userAgent.toLowerCase().indexOf("micromessenger")!==-1}function M(){if(pt()){window.location.href="/api/auth/oauth/wechat-mp";return}let e=document.getElementById("loginModal");e&&(e.style.display="flex",ge(),X(1),ye())}function oe(){let e=document.getElementById("loginModal");e&&(e.style.display="none"),x&&(clearInterval(x),x=null),ne(),ve(),ge();let t=document.getElementById("login-email"),o=document.getElementById("login-code");t&&(t.value=""),o&&(o.value="")}async function ye(){let e=document.getElementById("login-qr-loading"),t=document.getElementById("login-qr-image"),o=document.getElementById("login-qr-expired"),n=document.getElementById("login-qr-countdown");e&&(e.style.display="flex"),t&&(t.style.display="none"),o&&(o.style.display="none"),n&&(n.style.display="none"),ne();try{let r=await(await fetch("/api/auth/wechat-qr/create",{method:"POST",headers:{"Content-Type":"application/json"}})).json();r.ok&&r.qr_url?(V=r.session_id,Ce=r.expire_seconds||300,t&&(t.src=r.qr_url,t.onload=()=>{e&&(e.style.display="none"),t.style.display="block"},t.onerror=()=>{e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u52A0\u8F7D\u5931\u8D25")}),gt(Ce),vt()):(e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent=r.message||"\u52A0\u8F7D\u5931\u8D25"))}catch(s){console.error("Failed to load WeChat QR:",s),e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u7F51\u7EDC\u9519\u8BEF")}}function yt(){ye()}function gt(e){let t=document.getElementById("login-qr-countdown"),o=document.getElementById("login-qr-countdown-text");if(!t||!o)return;let n=e;t.style.display="block";let s=()=>{let r=Math.floor(n/60),a=n%60;o.textContent=`${r}:${a.toString().padStart(2,"0")}`,n<60?t.classList.add("warning"):t.classList.remove("warning")};s(),F=setInterval(()=>{n--,n<=0?(clearInterval(F),F=null,Me()):s()},1e3)}function Me(){let e=document.getElementById("login-qr-image"),t=document.getElementById("login-qr-expired"),o=document.getElementById("login-qr-countdown");e&&(e.style.display="none"),t&&(t.style.display="flex",t.querySelector("span").textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F"),o&&(o.style.display="none"),ne()}function vt(){if(!V)return;let e=async()=>{let t=V;if(t)try{let n=await(await fetch(`/api/auth/wechat-qr/status?session_id=${encodeURIComponent(t)}`)).json();if(n.status==="confirmed"&&n.session_token){D&&(clearInterval(D),D=null),F&&(clearInterval(F),F=null),S("\u767B\u5F55\u6210\u529F","success");try{await fetch(`/api/auth/wechat-qr/confirm-cookie?session_id=${encodeURIComponent(t)}`,{method:"POST",headers:{"Content-Type":"application/json"}})}catch(s){console.error("Failed to set cookie:",s)}V=null,setTimeout(()=>{oe(),window.location.reload()},500);return}else if(n.status==="scanned")S("\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4","success");else if(n.status==="expired"){Me();return}}catch(o){console.error("Polling error:",o)}};D=setInterval(e,2e3),e()}function ne(){D&&(clearInterval(D),D=null),F&&(clearInterval(F),F=null),V=null}function wt(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="none"),t&&(t.style.display="block"),ne(),setTimeout(()=>{let o=document.getElementById("login-email");o&&o.focus()},100)}function ge(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="block"),t&&(t.style.display="none"),X(1),ve(),ye()}function ht(e){e.target.id==="loginModal"&&oe()}function S(e,t){let o=document.getElementById("login-message");o&&(o.textContent=e,o.className="login-message "+t)}function ve(){let e=document.getElementById("login-message");e&&(e.className="login-message")}function X(e){document.querySelectorAll(".login-step").forEach(o=>o.classList.remove("active"));let t=document.getElementById("login-step-"+e);t&&t.classList.add("active"),document.querySelectorAll(".login-step-dot").forEach((o,n)=>{o.classList.toggle("active",n<e)}),ve()}function bt(){X(1),x&&(clearInterval(x),x=null)}function xe(){te=60;let e=document.getElementById("login-resend-btn"),t=document.getElementById("login-resend-text");e&&(e.disabled=!0),x=setInterval(()=>{te--,te<=0?(clearInterval(x),x=null,e&&(e.disabled=!1),t&&(t.textContent="\u91CD\u65B0\u53D1\u9001")):t&&(t.textContent=te+"\u79D2\u540E\u91CD\u53D1")},1e3)}async function Tt(e){e.preventDefault();let t=document.getElementById("login-send-btn"),o=document.getElementById("login-email").value.trim();if(!o){S("\u8BF7\u8F93\u5165\u90AE\u7BB1","error");return}t&&(t.disabled=!0,t.textContent="\u53D1\u9001\u4E2D...");try{let n=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:o})}),s=await n.json();if(n.ok){pe=o;let r=document.getElementById("login-display-email");r&&(r.textContent=o),X(2);let a=document.getElementById("login-code");a&&a.focus(),xe()}else{let r=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u53D1\u9001\u5931\u8D25";S(r,"error")}}catch{S("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u83B7\u53D6\u9A8C\u8BC1\u7801")}async function St(){let e=document.getElementById("login-resend-btn");e&&(e.disabled=!0);try{let t=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:pe})}),o=await t.json();if(t.ok)S("\u9A8C\u8BC1\u7801\u5DF2\u91CD\u65B0\u53D1\u9001","success"),xe();else{let n=typeof o.detail=="string"?o.detail:o.detail?.[0]?.msg||o.message||"\u53D1\u9001\u5931\u8D25";S(n,"error"),e&&(e.disabled=!1)}}catch{S("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error"),e&&(e.disabled=!1)}}async function Et(e){e.preventDefault();let t=document.getElementById("login-verify-btn"),o=document.getElementById("login-code").value.trim();if(!o||o.length!==6){S("\u8BF7\u8F93\u51656\u4F4D\u9A8C\u8BC1\u7801","error");return}t&&(t.disabled=!0,t.textContent="\u767B\u5F55\u4E2D...");try{let n=await fetch("/api/auth/verify-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:pe,code:o})}),s=await n.json();if(n.ok)S("\u767B\u5F55\u6210\u529F","success"),setTimeout(()=>{oe(),window.location.reload()},500);else{let r=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u9A8C\u8BC1\u5931\u8D25";S(r,"error")}}catch{S("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u767B\u5F55")}function $e(){let e=document.getElementById("login-code");e&&e.addEventListener("input",function(t){this.value=this.value.replace(/[^0-9]/g,"").slice(0,6)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",$e):$e();window.openLoginModal=M;window.closeLoginModal=oe;window.closeLoginModalOnOverlay=ht;window.loginSendCode=Tt;window.loginVerifyCode=Et;window.loginResendCode=St;window.loginGoBack=bt;window.loginGoToStep=X;window.loginShowMessage=S;window.loginShowEmailForm=wt;window.loginHideEmailForm=ge;window.refreshWechatQR=yt;var E=[],W=!1,Pe=!1,He=!1,De=null;function O(){return h.getUser()?!0:(M(),!1)}async function kt(e=null){let t="/api/user/todos";e&&(t+=`?group_id=${encodeURIComponent(e)}`);let o=await fetch(t);if(!o.ok){if(o.status===401)return[];throw new Error("\u83B7\u53D6 Todo \u5931\u8D25")}return(await o.json()).todos||[]}async function Lt(e){let t=await fetch("/api/user/todos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function It(e,t){let o=await fetch(`/api/user/todos/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!o.ok){let n=await o.json();throw new Error(n.detail||"\u66F4\u65B0\u5931\u8D25")}return await o.json()}async function _t(e){let t=await fetch(`/api/user/todos/${e}`,{method:"DELETE"});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u5220\u9664\u5931\u8D25")}return await t.json()}async function Bt(e){let t=await fetch("/api/user/todos/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({todos:e})});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function be(){if(!O())return[];try{return E=await kt(),K(),E}catch(e){return console.error("[Todo] Load error:",e),[]}}async function z(e,t){if(!O())return null;try{let o=await Lt({text:e,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1});if(o.ok&&o.todo)return E.unshift(o.todo),K(),_("\u5DF2\u6DFB\u52A0\u5230 Todo"),o.todo}catch(o){o.message.includes("\u5DF2\u5B58\u5728")?_("\u8BE5 Todo \u5DF2\u5B58\u5728"):_("\u6DFB\u52A0\u5931\u8D25: "+o.message),console.error("[Todo] Add error:",o)}return null}async function Ct(e){if(!O())return;let t=E.find(n=>n.id===e);if(!t)return;let o=!t.done;try{await It(e,{done:o}),t.done=o,Y(),ie(),K()}catch(n){console.error("[Todo] Toggle error:",n),_("\u66F4\u65B0\u5931\u8D25")}}async function $t(e){if(O())try{await _t(e),E=E.filter(t=>t.id!==e),Y(),ie(),K(),_("\u5DF2\u5220\u9664")}catch(t){console.error("[Todo] Delete error:",t),_("\u5220\u9664\u5931\u8D25")}}async function Te(e,t){if(!O())return null;let o=e.map(n=>({text:n,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1}));try{let n=await Bt(o);if(n.ok){n.added&&n.added.length>0&&(E=[...n.added,...E],K());let s=n.skipped_count>0?`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\uFF0C${n.skipped_count} \u9879\u5DF2\u5B58\u5728`:`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\u5230 Todo`;return _(s),n}}catch(n){console.error("[Todo] Batch add error:",n),_("\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return null}function Se(e){return E.filter(t=>t.source.groupId===e)}function Mt(){return E.filter(e=>!e.done).length}function xt(){let e={};for(let t of E){let o=t.source.groupId;e[o]||(e[o]={groupId:o,groupTitle:t.source.groupTitle,groupUrl:t.source.groupUrl,isCustom:t.source.isCustom,todos:[]}),e[o].todos.push(t)}return Object.values(e)}function B(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}function _(e){if(window.showToast)window.showToast(e);else{let t=document.createElement("div");t.className="todo-toast",t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add("show"),10),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},2e3)}}function K(){let e=document.getElementById("todoBadge");if(!e)return;let t=Mt();t>0?(e.textContent=t>99?"99+":t,e.classList.add("show")):e.classList.remove("show")}var Oe="todo_sidebar_width",Ft=320,qt=800;function At(){if(document.getElementById("todoSidebar"))return;let e=document.createElement("div");e.id="todoSidebarBackdrop",e.className="todo-sidebar-backdrop",document.body.appendChild(e),document.body.insertAdjacentHTML("beforeend",`
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
    `);let o=localStorage.getItem(Oe);if(o){let i=document.getElementById("todoSidebar");i.style.width=o+"px"}let s=document.getElementById("todoSidebar").querySelector(".todo-close-btn"),r=document.getElementById("todoFilterBtn"),a=document.getElementById("todoNewGroupBtn");e.addEventListener("click",we),s.addEventListener("click",we),r.addEventListener("click",Ht),a.addEventListener("click",Dt),Pt()}function Pt(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoResizeHandle");if(!e||!t)return;let o=!1,n=0,s=0;t.addEventListener("mousedown",r=>{o=!0,n=r.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),r.preventDefault()}),document.addEventListener("mousemove",r=>{if(!o)return;let a=n-r.clientX,i=s+a;i=Math.max(Ft,Math.min(qt,i)),e.style.width=i+"px"}),document.addEventListener("mouseup",()=>{o&&(o=!1,e.classList.remove("resizing"),t.classList.remove("active"),localStorage.setItem(Oe,e.offsetWidth),ee.saveSidebarWidths({todo_width:e.offsetWidth}))})}function Ne(){if(!O())return;At();let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e.classList.add("open"),t.classList.add("show"),Pe=!0,be().then(()=>Y())}function we(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e&&e.classList.remove("open"),t&&t.classList.remove("show"),Pe=!1}function Ht(){W=!W;let e=document.getElementById("todoFilterBtn");e&&(e.textContent=W?"\u53EA\u770B\u672A\u5B8C\u6210":"\u663E\u793A\u5168\u90E8"),Y()}function Dt(){let e=document.getElementById("todoSidebarBody");if(!e||e.querySelector(".todo-new-group-input"))return;e.insertAdjacentHTML("afterbegin",`
        <div class="todo-new-group-input">
            <input type="text" placeholder="\u8F93\u5165\u65B0\u6807\u9898\u540D\u79F0..." class="todo-group-name-input" autofocus>
            <button class="todo-group-create-btn">\u521B\u5EFA</button>
            <button class="todo-group-cancel-btn">\u53D6\u6D88</button>
        </div>
    `);let o=e.querySelector(".todo-group-name-input"),n=e.querySelector(".todo-group-create-btn"),s=e.querySelector(".todo-group-cancel-btn");o.focus();let r=()=>{let a=o.value.trim();if(!a){_("\u8BF7\u8F93\u5165\u6807\u9898\u540D\u79F0");return}let i=`custom_${Date.now()}`;Ee(i,a,"",!0),e.querySelector(".todo-new-group-input")?.remove()};n.addEventListener("click",r),s.addEventListener("click",()=>{e.querySelector(".todo-new-group-input")?.remove()}),o.addEventListener("keydown",a=>{a.key==="Enter"&&r(),a.key==="Escape"&&e.querySelector(".todo-new-group-input")?.remove()})}function Ee(e,t,o,n){let s=document.getElementById("todoSidebarBody");if(!s)return;let r=s.querySelector(`.todo-group[data-group-id="${e}"]`);if(r){r.classList.remove("collapsed");let c=se();c[e]=!1,he(c)}else{let c=se();c[e]=!1,he(c);let p=`
            <div class="todo-group" data-group-id="${B(e)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${B(t)}">${B(t)}</span>
                    <span class="todo-group-count">0/0</span>
                    <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner"></div>
                </div>
            </div>
        `;s.insertAdjacentHTML("afterbegin",p),r=s.querySelector(`.todo-group[data-group-id="${e}"]`),r.querySelector(".todo-group-add-btn").addEventListener("click",b=>{b.stopPropagation(),Ee(e,t,o,n)}),r.querySelector(".todo-group-header")?.addEventListener("click",b=>{b.target.closest(".todo-group-add-btn")||je(e)})}let a=r.querySelector(".todo-group-items-inner");if(!a||a.querySelector(".todo-add-input"))return;a.insertAdjacentHTML("afterbegin",`
        <div class="todo-add-input">
            <input type="text" placeholder="\u8F93\u5165 Todo \u5185\u5BB9..." class="todo-text-input" autofocus>
            <button class="todo-add-confirm-btn">\u6DFB\u52A0</button>
        </div>
    `);let d=a.querySelector(".todo-text-input"),m=a.querySelector(".todo-add-confirm-btn");d.focus();let l=async()=>{let c=d.value.trim();if(!c){_("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}await z(c,{groupId:e,groupTitle:t,groupUrl:o||"",isCustom:n||!1})&&(d.value="",Y())};m.addEventListener("click",l),d.addEventListener("keydown",c=>{c.key==="Enter"&&l(),c.key==="Escape"&&a.querySelector(".todo-add-input")?.remove()})}function Y(){let e=document.getElementById("todoSidebarBody");if(!e)return;if((W?E:E.filter(s=>!s.done)).length===0){e.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let o=xt(),n="";for(let s of o){let r=W?s.todos:s.todos.filter(p=>!p.done);if(r.length===0&&!W)continue;let a=s.todos.filter(p=>!p.done).length,i=s.todos.length,d=Fe(s.groupId),l=s.isCustom?"":`
            <button class="todo-group-summary-btn" title="\u67E5\u770B\u603B\u7ED3" data-group-id="${B(s.groupId)}" data-group-title="${B(s.groupTitle)}" data-group-url="${B(s.groupUrl||"")}">\u2728</button>
        `,c=s.groupUrl?`
            <a href="${B(s.groupUrl)}" target="_blank" rel="noopener noreferrer" class="todo-group-link-btn" title="\u67E5\u770B\u539F\u6587" onclick="event.stopPropagation()">\u{1F517}</a>
        `:"";n+=`
            <div class="todo-group ${d?"collapsed":""}" data-group-id="${B(s.groupId)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${B(s.groupTitle)}">${B(s.groupTitle)}</span>
                    <span class="todo-group-count">${a}/${i}</span>
                    <div class="todo-group-actions">
                        ${c}
                        ${l}
                        <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                    </div>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner">
                        ${r.map(p=>Ue(p)).join("")}
                    </div>
                </div>
            </div>
        `}e.innerHTML=n,e.querySelectorAll(".todo-group").forEach(s=>{let r=s.dataset.groupId,a=o.find(l=>l.groupId===r);if(!a)return;s.querySelector(".todo-group-add-btn")?.addEventListener("click",l=>{l.stopPropagation(),Ee(r,a.groupTitle,a.groupUrl,a.isCustom)}),s.querySelector(".todo-group-summary-btn")?.addEventListener("click",l=>{l.stopPropagation(),Ot(a.groupId,a.groupTitle,a.groupUrl)}),s.querySelector(".todo-group-header")?.addEventListener("click",l=>{l.target.closest(".todo-group-add-btn")||l.target.closest(".todo-group-summary-btn")||je(r)}),Fe(r)&&s.classList.add("collapsed")}),We(e)}function Ot(e,t,o){window.openSummaryModal&&window.openSummaryModal(e,t,o,"","")}var Re="todo_collapsed_groups";function se(){try{let e=localStorage.getItem(Re);return e?JSON.parse(e):{}}catch{return{}}}function he(e){try{localStorage.setItem(Re,JSON.stringify(e))}catch{}}function Fe(e){return se()[e]!==!1}function je(e){let t=se(),o=t[e]!==!1;t[e]=!o,he(t);let n=document.querySelector(`.todo-group[data-group-id="${e}"]`);n&&n.classList.toggle("collapsed",!o)}function Ue(e){return`
        <div class="todo-item ${e.done?"done":""}" data-id="${e.id}">
            <input type="checkbox" class="todo-checkbox" ${e.done?"checked":""}>
            <span class="todo-text">${B(e.text)}</span>
            <button class="todo-delete-btn" title="\u5220\u9664">\xD7</button>
        </div>
    `}function We(e){e.querySelectorAll(".todo-item").forEach(t=>{let o=parseInt(t.dataset.id),n=t.querySelector(".todo-checkbox"),s=t.querySelector(".todo-delete-btn");n?.addEventListener("change",()=>Ct(o)),s?.addEventListener("click",r=>{r.stopPropagation(),$t(o)})})}function Nt(){if(document.getElementById("summaryTodoPanel"))return;let e=`
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
    `,t=document.getElementById("summaryModalFooter");t?t.insertAdjacentHTML("beforebegin",e):document.body.insertAdjacentHTML("beforeend",e);let o=document.getElementById("summaryTodoPanel"),n=o.querySelector(".summary-todo-close-btn"),s=o.querySelector(".summary-todo-add-btn"),r=document.getElementById("summaryTodoInput");n.addEventListener("click",ae),s.addEventListener("click",qe),r.addEventListener("keydown",a=>{a.key==="Enter"&&qe()})}function re(e,t,o){if(!O())return;Nt(),De=e;let n=document.getElementById("summaryTodoPanel");n.classList.add("open"),n.dataset.groupId=e,n.dataset.groupTitle=t,n.dataset.groupUrl=o||"",He=!0,ie()}function ae(){let e=document.getElementById("summaryTodoPanel");e&&e.classList.remove("open"),He=!1,De=null}async function qe(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoInput");if(!e||!t)return;let o=t.value.trim();if(!o){_("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}let n=e.dataset.groupId,s=e.dataset.groupTitle,r=e.dataset.groupUrl;await z(o,{groupId:n,groupTitle:s,groupUrl:r,isCustom:!1})&&(t.value="",ie())}function ie(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoBody");if(!e||!t)return;let o=e.dataset.groupId;if(!o){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let n=Se(o);if(n.length===0){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo\uFF0C\u53EF\u5728\u4E0A\u65B9\u8F93\u5165\u6DFB\u52A0</div>';return}t.innerHTML=n.map(s=>Ue(s)).join(""),We(t)}function Rt(e){return Se(e).filter(t=>!t.done).length}var w=null,Ae=!1;function ze(){if(Ae)return;Ae=!0,w=document.createElement("button"),w.className="selection-todo-btn",w.type="button",w.textContent="+Todo",w.style.display="none",document.body.appendChild(w);let e=()=>{w.style.display="none",w.dataset.selectionText="",w._source=null},t=()=>{let n=window.getSelection();if(!n||n.isCollapsed)return null;let s=n.toString();if(!String(s||"").trim())return null;let r=n.rangeCount?n.getRangeAt(0):null;if(!r)return null;let a=r.commonAncestorContainer,i=a?.nodeType===Node.ELEMENT_NODE?a:a?.parentElement;if(!i)return null;let d=document.getElementById("summaryModalBody");return!d||!d.contains(i)||i.closest&&i.closest(".summary-todo-panel")?null:{text:s.trim(),range:r}},o=()=>{let n=t();if(!n){e();return}let s=n.range.getBoundingClientRect();if(!s||!s.width&&!s.height){e();return}let r=64,a=32,i=8,d=Math.min(window.innerWidth-r-i,Math.max(i,s.right-r)),m=Math.min(window.innerHeight-a-i,Math.max(i,s.bottom+i));w.style.left=`${d}px`,w.style.top=`${m}px`,w.style.display="block",w.dataset.selectionText=n.text};w.addEventListener("click",async()=>{let n=w.dataset.selectionText||"";if(!n)return;let s=window._currentSummaryNewsId,r=window._currentSummaryNewsTitle,a=window._currentSummaryNewsUrl;if(!s||!r){_("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}await z(n,{groupId:s,groupTitle:r,groupUrl:a||"",isCustom:!1});try{window.getSelection()?.removeAllRanges()}catch{}e()}),document.addEventListener("mouseup",()=>setTimeout(o,0)),document.addEventListener("keyup",()=>setTimeout(o,0)),document.addEventListener("touchend",()=>setTimeout(o,100)),document.addEventListener("selectionchange",()=>{setTimeout(o,50)}),document.addEventListener("scroll",e,!0),window.addEventListener("resize",e),document.addEventListener("mousedown",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")}),document.addEventListener("touchstart",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")})}function jt(){let e=document.createElement("button");return e.className="icon-btn todo-btn",e.id="todoBtn",e.title="\u6211\u7684 Todo",e.innerHTML='\u{1F4CB}<span class="todo-badge" id="todoBadge"></span>',e.addEventListener("click",Ne),e}function Ut(){let e=document.getElementById("favoritesBtn");if(e&&e.parentNode){let o=jt();e.parentNode.insertBefore(o,e)}h.getUser()&&be()}window.openTodoSidebar=Ne;window.closeTodoSidebar=we;window.openTodoPanel=re;window.closeTodoPanel=ae;window.addTodo=z;window.batchAddTodos=Te;window.loadTodos=be;window.getTodosByGroupId=Se;window.getCurrentTodoCount=Rt;window.initTodoButton=Ut;var Ge=!1,g=null,k=null,N=null,de=null,Wt=1e4;function G(){de&&(clearTimeout(de),de=null)}var zt={news:"\u{1F4F0}",policy:"\u26A0\uFE0F",business:"\u{1F4CA}",tutorial:"\u2705",research:"\u{1F4DA}",product:"\u{1F680}",opinion:"\u{1F4AD}",interview:"\u{1F4AC}",listicle:"\u{1F4D1}",lifestyle:"\u2705",general:"\u{1F4DD}","tech-tutorial":"\u2705",trend:"\u{1F4CA}",other:"\u{1F4DD}"};function Gt(e){let t=e||0;return t>=1e3?(t/1e3).toFixed(1).replace(/\.0$/,"")+"K":t.toString()}function ke(e){if(!e)return e;let t=e.replace(/\[TAGS_?START\][\s\S]*?\[TAGS_?END\]/gi,"");return t=t.replace(/\n*-{3,}\s*$/g,""),t.trim()}function q(e){if(!e)return"";let t=e.replace(/<br\s*\/?>/gi,`
`).replace(/<\/br>/gi,`
`);t=t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),t=t.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code class="language-$1">$2</code></pre>'),t=t.replace(/`([^`]+)`/g,"<code>$1</code>"),t=t.replace(/^#{4}\s+(.+)$/gm,"<h4>$1</h4>"),t=t.replace(/^#{3}\s+(.+)$/gm,"<h3>$1</h3>"),t=t.replace(/^#{2}\s+(.+)$/gm,"<h2>$1</h2>"),t=t.replace(/^#{1}\s+(.+)$/gm,"<h1>$1</h1>"),t=t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),t=t.replace(/\*([^*]+)\*/g,"<em>$1</em>"),t=t.replace(/__([^_]+)__/g,"<strong>$1</strong>"),t=t.replace(/_([^_]+)_/g,"<em>$1</em>"),t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'),t=t.replace(/^&gt;\s*(.*)$/gm,"<blockquote>$1</blockquote>"),t=t.replace(/<\/blockquote>\n<blockquote>/g,`
`),t=t.replace(/^[-]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[*]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[_]{3,}\s*$/gm,"<hr>");let o=t.split(`
`),n=[],s=!1,r=[],a=!1,i=[];for(let d=0;d<o.length;d++){let m=o[d],l=m.trim(),c=/^\|(.+)\|$/.test(l),p=/^\|[\s\-:|]+\|$/.test(l),f=l.match(/^[-*]\s+(.+)$/),T=l.match(/^\d+\.\s+(.+)$/),b=f||T;if(c){if(a&&i.length>0&&(n.push("<ul>"+i.join("")+"</ul>"),i=[],a=!1),s||(s=!0,r=[]),!p){let C=l.slice(1,-1).split("|").map(j=>j.trim()),I=r.length===0?"th":"td",R="<tr>"+C.map(j=>`<${I}>${j}</${I}>`).join("")+"</tr>";r.push(R)}continue}else s&&r.length>0&&(n.push("<table>"+r.join("")+"</table>"),r=[],s=!1);if(b){let C=f?f[1]:T[1];a=!0,i.push("<li>"+C+"</li>");continue}else a&&i.length>0&&(n.push("<ul>"+i.join("")+"</ul>"),i=[],a=!1);n.push(m)}return s&&r.length>0&&n.push("<table>"+r.join("")+"</table>"),a&&i.length>0&&n.push("<ul>"+i.join("")+"</ul>"),t=n.join(`
`),t=t.split(/\n{2,}/).map(d=>(d=d.trim(),d?/^<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(d)||/<\/(h[1-6]|ul|ol|table|pre|blockquote)>$/.test(d)?d:"<p>"+d.replace(/\n/g,"<br>")+"</p>":"")).join(`
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
    `)}async function Ie(e,t,o,n,s){if(!h.getUser()){M();return}Je();let a=document.getElementById("summaryModal"),i=document.getElementById("summaryModalTitle"),d=document.getElementById("summaryModalBody"),m=document.getElementById("summaryModalFooter");if(g=e,k=t,N=o,Ge=!0,window._currentSummaryNewsId=e,window._currentSummaryNewsTitle=t,window._currentSummaryNewsUrl=o,ze(),i){let l=t&&t.length>50?t.substring(0,50)+"...":t||"AI \u603B\u7ED3";i.textContent=`\u2728 ${l}`}a.classList.add("open"),document.body.style.overflow="hidden",d.innerHTML=`
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
    `,m.style.display="none",G(),de=setTimeout(()=>{d.innerHTML=`
            <div class="summary-access-error">
                <div class="summary-access-error-icon">\u{1F6E1}\uFE0F</div>
                <div class="summary-access-error-title">\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u5185\u5BB9</div>
                <div class="summary-access-error-text">\u8BE5\u7F51\u7AD9\u9632\u62A4\u8F83\u5F3A\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
                <div class="summary-access-error-actions">
                    <a href="${o}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn" onclick="closeSummaryModal()">
                        \u{1F4D6} \u9605\u8BFB\u539F\u6587
                    </a>
                    <button class="summary-retry-btn-secondary" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                </div>
                <div class="summary-timeout-actions">
                    <button class="summary-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                    <button class="summary-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                </div>
            </div>
        `},Wt);try{let l=await fetch("/api/summary/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!l.ok){let I=await l.json();throw new Error(I.detail||"\u751F\u6210\u5931\u8D25")}let c=l.body.getReader(),p=new TextDecoder,f="",T="other",b="\u5176\u4ED6",C=!1,$=null;for(;;){let{done:I,value:R}=await c.read();if(I)break;let Z=p.decode(R,{stream:!0}).split(`
`);for(let y of Z)if(y.startsWith("data: "))try{let u=JSON.parse(y.slice(6));switch(u.type){case"status":let P=document.getElementById("summaryStatusText");P&&(P.textContent=u.message);break;case"type":T=u.article_type,b=u.article_type_name,window._currentTypeConfidence=u.confidence||0;break;case"chunk":C||(C=!0,G(),d.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),f+=u.content;let U=document.getElementById("summaryStreamContent");if(U){let v=f;v=v.replace(/\[TAGS_?START\][\s\S]*$/gi,""),U.innerHTML=q(v)+'<span class="summary-cursor">\u258C</span>',U.scrollTop=U.scrollHeight}break;case"cached":G(),f=u.summary,T=u.article_type,b=u.article_type_name,$=u.token_usage||null;let Q=u.feedback||null,H=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,ut=ke(f);if(d.innerHTML=`
                                <div class="summary-content">
                                    ${q(ut)}
                                </div>
                            `,le(o,T,b,!0,$,Q,H),ce(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying cached tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v&&(console.log("[Summary] Found news item for cached, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true")}return;case"done":$=u.token_usage||null;let mt=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,fe=document.getElementById("summaryStreamContent");if(fe){fe.classList.remove("summary-streaming");let v=ke(f);fe.innerHTML=q(v)}let ft=window._currentTypeConfidence||0;if(le(o,T,b,!1,$,null,mt,ft),ce(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v?(console.log("[Summary] Found news item, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true"):console.log("[Summary] News item not found in DOM")}break;case"short_content":G(),d.innerHTML=`
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
                            `,m.style.display="none";return;case"error":throw new Error(u.message)}}catch(u){if(u.message&&!u.message.includes("JSON"))throw u}}if(C&&f&&!document.querySelector('.summary-modal-footer[style*="flex"]')){console.log("[Summary] Stream ended without done event, showing fallback footer");let I=document.getElementById("summaryStreamContent");if(I){I.classList.remove("summary-streaming");let R=ke(f);I.innerHTML=q(R)}le(o,T,b,!1,$,null,null,0),ce(e,!0)}}catch(l){if(console.error("[Summary] Error:",l),G(),l.message&&(l.message.includes("\u8BBF\u95EE\u9650\u5236")||l.message.includes("\u65E0\u6CD5\u83B7\u53D6")||l.message.includes("\u65E0\u6CD5\u8BBF\u95EE")||l.message.includes("\u8BF7\u6C42\u5931\u8D25")))d.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u{1F512}</div>
                    <div class="summary-access-error-title">\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u5185\u5BB9</div>
                    <div class="summary-access-error-text">\u8BE5\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
                    <div class="summary-access-error-actions">
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn" onclick="closeSummaryModal()">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="summary-retry-btn-secondary" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                    </div>
                    <div class="summary-timeout-actions">
                        <button class="summary-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                        <button class="summary-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `;else{Qe();return}}}function le(e,t,o,n,s,r=null,a=null,i=null){let d=document.getElementById("summaryModalFooter"),m=zt[t]||"\u{1F4DD}",l="",c=s?.total_tokens||0;c>0&&(l=`<span class="summary-token-tag" title="\u672C\u6B21\u6D88\u8017">\u{1FA99} ${Gt(c)}</span>`);let p=r==="up"?"active":"",f=r==="down"?"active":"";d.innerHTML=`
        <div class="summary-footer-left">
            ${l}
            <span class="summary-type-tag">${m} ${o}</span>
            <div class="summary-feedback">
                <button class="summary-feedback-btn ${p}" data-vote="up" onclick="handleSummaryFeedback('up')" title="\u6709\u5E2E\u52A9">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                    </svg>
                </button>
                <span class="summary-feedback-divider"></span>
                <button class="summary-feedback-btn ${f}" data-vote="down" onclick="handleSummaryFeedback('down')" title="\u9700\u6539\u8FDB">
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
    `,d.style.display="flex"}async function Jt(e){if(!g)return;let t=document.querySelectorAll(".summary-feedback-btn"),o=document.querySelector(`.summary-feedback-btn[data-vote="${e}"]`),s=o?.classList.contains("active")?"none":e;t.forEach(r=>r.classList.remove("active")),s!=="none"&&o?.classList.add("active");try{let r=await fetch(`/api/summary/${encodeURIComponent(g)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vote:s})});r.ok||console.error("[Summary] Feedback failed:",await r.text())}catch(r){console.error("[Summary] Feedback error:",r)}}function Qe(){let e=document.getElementById("summaryModal");e&&(e.classList.remove("open"),document.body.style.overflow=""),G(),Ge=!1,g=null}function Ve(){let e=document.querySelector(`.news-summary-btn[data-news-id="${g}"]`);if(e){let t=e.dataset.title,o=e.dataset.url,n=e.dataset.sourceId,s=e.dataset.sourceName;Ie(g,t,o,n,s)}}async function Qt(){if(g){try{await fetch(`/api/summary/${encodeURIComponent(g)}`,{method:"DELETE"})}catch(e){console.error("[Summary] Delete error:",e)}Ve()}}async function Vt(e,t,o,n,s){let r=decodeURIComponent(t),a=decodeURIComponent(o),i=decodeURIComponent(s);Xt(e,r,a,n,i)}async function Xt(e,t,o,n,s){if(!h.getUser()){M();return}Je();let a=document.getElementById("summaryModal"),i=document.getElementById("summaryModalBody"),d=document.getElementById("summaryModalFooter");g=e,k=t,N=o,i.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">\u6B63\u5728\u751F\u6210\u603B\u7ED3...</div>
            </div>
        </div>
    `,d.style.display="none";try{let m=await fetch("/api/summary/stream?force=1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!m.ok){let $=await m.json();throw new Error($.detail||"\u751F\u6210\u5931\u8D25")}let l=m.body.getReader(),c=new TextDecoder,p="",f="other",T="\u5176\u4ED6",b=!1,C=null;for(;;){let{done:$,value:I}=await l.read();if($)break;let j=c.decode(I,{stream:!0}).split(`
`);for(let Z of j)if(Z.startsWith("data: "))try{let y=JSON.parse(Z.slice(6));switch(y.type){case"status":let u=document.getElementById("summaryStatusText");u&&(u.textContent=y.message);break;case"type":f=y.article_type,T=y.article_type_name;break;case"chunk":b||(b=!0,i.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),p+=y.content;let P=document.getElementById("summaryStreamContent");P&&(P.innerHTML=q(p)+'<span class="summary-cursor">\u258C</span>',P.scrollTop=P.scrollHeight);break;case"done":C=y.token_usage||null;let U=y.token_balance!==void 0?{token_balance:y.token_balance,tokens_used:y.tokens_used,default_tokens:1e5}:null,Q=document.getElementById("summaryStreamContent");if(Q&&(Q.classList.remove("summary-streaming"),Q.innerHTML=q(p)),le(o,f,T,!1,C,null,U),ce(e,!0),y.tags&&window.ArticleTags){let H=document.querySelector(`.news-item[data-news-id="${e}"]`);H||(H=document.querySelector(`.news-item[data-url="${o}"]`)),H&&(window.ArticleTags.applyTags(H,y.tags),H.dataset.tagsLoaded="true")}break;case"error":throw new Error(y.message)}}catch(y){if(y.message&&!y.message.includes("JSON"))throw y}}}catch(m){console.error("[Summary] Force error:",m),i.innerHTML=`
            <div class="summary-error">
                <div class="summary-error-icon">\u274C</div>
                <div class="summary-error-text">${m.message}</div>
                <button class="summary-retry-btn" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
            </div>
        `}}function ce(e,t){let o=document.querySelector(`.news-summary-btn[data-news-id="${e}"]`);o&&(o.classList.toggle("has-summary",t),o.title=t?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3");let n=document.querySelector(`.news-item[data-news-id="${e}"]`);n&&n.classList.toggle("has-summary",t)}function Kt(e,t,o,n,s,r){e.preventDefault(),e.stopPropagation(),Ie(t,o,n,s,r)}async function J(){try{if(!h.isLoggedIn())return;let e=await fetch("/api/summary/list");if(!e.ok)return;let t=await e.json();if(!t.ok||!t.news_ids)return;let o=new Set(t.news_ids);if(o.size===0)return;document.querySelectorAll(".news-item[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&n.classList.add("has-summary")}),document.querySelectorAll(".news-summary-btn[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&(n.classList.add("has-summary"),n.title="\u67E5\u770B\u603B\u7ED3")}),console.log(`[Summary] Marked ${o.size} summarized items`)}catch(e){console.error("[Summary] Failed to load summarized list:",e)}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{setTimeout(J,500)}):setTimeout(J,500);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){let e=window._lastSummarizedListLoad||0;Date.now()-e>3e4&&(console.log("[Summary] Page visible, reloading summarized list"),J())}});var Yt=J;J=async function(){return window._lastSummarizedListLoad=Date.now(),Yt()};function Zt(){!g||!k||(re(g,k,N),Le(!0))}function eo(){if(!g||!k)return;let e=document.getElementById("summaryTodoPanel");e&&e.classList.contains("open")?(ae(),Le(!1)):(re(g,k,N),Le(!0))}function Le(e){let t=document.getElementById("summaryTodoToggleBtn");t&&t.classList.toggle("active",e)}async function to(){if(!g||!k)return;let e=document.getElementById("summaryModalBody");if(!e)return;let o=e.innerHTML.match(/✅\s*行动清单[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);if(!o){window.showToast&&window.showToast("\u672A\u627E\u5230\u884C\u52A8\u6E05\u5355");return}let r=(o[1].match(/<li>([\s\S]*?)<\/li>/gi)||[]).map(a=>a.replace(/<\/?li>/gi,"").replace(/<[^>]+>/g,"").trim()).filter(a=>a.length>0);if(r.length===0){window.showToast&&window.showToast("\u884C\u52A8\u6E05\u5355\u4E3A\u7A7A");return}await Te(r,{groupId:g,groupTitle:k,groupUrl:N||"",isCustom:!1})}async function oo(){if(!g||!k){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let e=await z(k,{groupId:g,groupTitle:k,groupUrl:N||"",isCustom:!1})}catch(e){console.error("[Summary] Add to todo error:",e),window.showToast&&window.showToast("\u6DFB\u52A0\u5931\u8D25")}}async function no(){if(!g||!k){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let{addFavorite:e}=await import("./favorites-DXC33ABF.js"),t=await e({news_id:g,title:k,url:N||""});t.ok?window.showToast&&window.showToast("\u5DF2\u6536\u85CF"):t.error&&window.showToast&&window.showToast(t.error)}catch(e){console.error("[Summary] Add to favorites error:",e),window.showToast&&window.showToast("\u6536\u85CF\u5931\u8D25")}}window.openSummaryModal=Ie;window.closeSummaryModal=Qe;window.retrySummaryModal=Ve;window.regenerateSummaryModal=Qt;window.handleSummaryClick=Kt;window.loadSummarizedList=J;window.handleSummaryFeedback=Jt;window.openCurrentTodoPanel=Zt;window.toggleCurrentTodoPanel=eo;window.addActionListToTodo=to;window.forceSummary=Vt;window.addCurrentToTodo=oo;window.addCurrentToFavorites=no;var et="hotnews_favorites_v1",tt="hotnews_favorites_width",so=500,_e=320,Be=800,L=null,ue=!1,A=!1;function me(){try{let e=localStorage.getItem(et);return e?JSON.parse(e):[]}catch{return[]}}function ot(e){try{localStorage.setItem(et,JSON.stringify(e))}catch(t){console.error("[Favorites] Failed to save to localStorage:",t)}}async function ro(){try{let e=await fetch("/api/user/favorites");if(e.status===401)return{needsAuth:!0};if(!e.ok)throw new Error("Failed to fetch favorites");let t=await e.json();return t.ok?(L=t.favorites||[],{favorites:L}):{error:t.message||"Unknown error"}}catch(e){return console.error("[Favorites] Fetch error:",e),{error:e.message}}}async function ao(e){if(!h.getUser()){let o=me();return o.some(s=>s.news_id===e.news_id)||(o.unshift({...e,created_at:Math.floor(Date.now()/1e3)}),ot(o)),{ok:!0,local:!0}}try{let n=await(await fetch("/api/user/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json();return n.ok&&L&&L.unshift(n.favorite),n}catch(o){return console.error("[Favorites] Add error:",o),{ok:!1,error:o.message}}}async function nt(e){if(!h.getUser()){let n=me().filter(s=>s.news_id!==e);return ot(n),{ok:!0,local:!0}}try{let n=await(await fetch(`/api/user/favorites/${encodeURIComponent(e)}`,{method:"DELETE"})).json();return n.ok&&L&&(L=L.filter(s=>s.news_id!==e)),n}catch(o){return console.error("[Favorites] Remove error:",o),{ok:!1,error:o.message}}}function st(e){return h.getUser()?L?L.some(o=>o.news_id===e):!1:me().some(n=>n.news_id===e)}async function rt(e,t){let o=e.news_id,n=st(o);t&&(t.classList.toggle("favorited",!n),t.textContent=n?"\u2606":"\u2605");let s;return n?s=await nt(o):s=await ao(e),s.ok||t&&(t.classList.toggle("favorited",n),t.textContent=n?"\u2605":"\u2606"),s}function at(e){if(!e)return"";let t=new Date(e*1e3),o=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${o}-${n}`}function io(e){let t=document.getElementById("favoritesPanelBody");if(!t)return;if(!e||e.length===0){t.innerHTML=`
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
                            ${n.created_at?`<span>\u6536\u85CF\u4E8E ${at(n.created_at)}</span>`:""}
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
    `;t.innerHTML=o}function Xe(){let e=document.getElementById("favoritesPanelBody");if(!e)return;let t=me();t.length>0?e.innerHTML=`
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
                                ${o.created_at?`<span>\u6536\u85CF\u4E8E ${at(o.created_at)}</span>`:""}
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
        `}async function it(){let e=document.getElementById("favoritesPanelBody");if(!e)return;if(e.innerHTML='<div class="favorites-loading">\u52A0\u8F7D\u4E2D...</div>',!h.getUser()){Xe();return}let o=await ro();if(o.needsAuth){Xe();return}if(o.error){e.innerHTML=`
            <div class="favorites-empty">
                <div>\u52A0\u8F7D\u5931\u8D25: ${o.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    \u91CD\u8BD5
                </button>
            </div>
        `;return}io(o.favorites)}function lo(){if(!h.getUser()){M();return}let t=document.getElementById("favoritesPanel"),o=document.getElementById("favoritesOverlay");t&&(o||(o=document.createElement("div"),o.id="favoritesOverlay",o.className="favorites-overlay",o.onclick=dt,document.body.appendChild(o)),ue=!ue,ue?(t.classList.add("open"),o.classList.add("open"),it()):(t.classList.remove("open"),o.classList.remove("open")))}function dt(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesOverlay");ue=!1,e&&e.classList.remove("open"),t&&t.classList.remove("open")}async function co(e){if((await nt(e)).ok){let o=document.querySelector(`.favorite-item[data-news-id="${e}"]`);o&&o.remove();let n=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);n&&(n.classList.remove("favorited"),n.textContent="\u2606");let s=document.querySelector(".favorites-list");s&&s.children.length===0&&it()}}function uo(e,t,o,n,s,r){if(e.preventDefault(),e.stopPropagation(),!h.getUser()){M();return}let i=e.currentTarget;rt({news_id:t,title:o,url:n,source_id:s||"",source_name:r||""},i)}function mo(){try{let e=localStorage.getItem(tt);if(e){let t=parseInt(e,10);if(t>=_e&&t<=Be)return t}}catch{}return so}function Ke(e){try{localStorage.setItem(tt,String(e)),ee.saveSidebarWidths({favorites_width:e})}catch{}}function fo(e){let t=document.getElementById("favoritesPanel");t&&(t.style.width=e+"px")}function Ye(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesResizeHandle");if(!e||!t)return;let o=mo();fo(o);let n=0,s=0;function r(c){c.preventDefault(),A=!0,n=c.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("mousemove",a),document.addEventListener("mouseup",i)}function a(c){if(!A)return;let p=n-c.clientX,f=s+p;f=Math.max(_e,Math.min(Be,f)),e.style.width=f+"px"}function i(){A&&(A=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("mousemove",a),document.removeEventListener("mouseup",i),Ke(e.offsetWidth))}function d(c){c.touches.length===1&&(c.preventDefault(),A=!0,n=c.touches[0].clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("touchmove",m,{passive:!1}),document.addEventListener("touchend",l))}function m(c){if(!A||c.touches.length!==1)return;c.preventDefault();let p=n-c.touches[0].clientX,f=s+p;f=Math.max(_e,Math.min(Be,f)),e.style.width=f+"px"}function l(){A&&(A=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("touchmove",m),document.removeEventListener("touchend",l),Ke(e.offsetWidth))}t.addEventListener("mousedown",r),t.addEventListener("touchstart",d,{passive:!1})}function Ze(){document.addEventListener("click",e=>{let t=e.target.closest(".news-favorite-btn");if(!t)return;if(e.preventDefault(),e.stopPropagation(),!h.getUser()){M();return}let n=t.closest(".news-item");if(!n)return;let s=n.dataset.id||n.dataset.newsId,r=n.dataset.url,a=n.querySelector(".news-title"),i=a?a.textContent.trim():"",d=n.closest(".platform-card"),m=d?d.dataset.platform:"",l=d?d.querySelector(".platform-name"):null,c=l?l.textContent.replace("\u{1F4F1}","").trim():"";rt({news_id:s,title:i,url:r,source_id:m,source_name:c},t)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{Ye(),Ze()}):(Ye(),Ze());async function lt(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(!(!t||!o)){if(o.classList.contains("has-summary")){ct(e);return}o.disabled=!0,o.textContent="\u23F3",o.title="\u751F\u6210\u4E2D...",t.style.display="block",t.innerHTML=`
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
            `,L){let r=L.find(a=>a.news_id===e);r&&(r.summary=s.summary,r.summary_at=s.summary_at)}}else throw new Error(s.error||"\u751F\u6210\u5931\u8D25")}catch(n){console.error("[Favorites] Summary error:",n),t.innerHTML=`
            <div class="summary-error">
                <span>\u274C ${n.message}</span>
                <button onclick="handleFavoriteSummaryClick('${e}')" style="margin-left:8px;">\u91CD\u8BD5</button>
            </div>
        `,o.textContent="\u{1F4DD}",o.title="AI \u603B\u7ED3"}finally{o.disabled=!1}}}function ct(e){let t=document.getElementById(`summary-${e}`);if(!t)return;let o=t.style.display!=="none";t.style.display=o?"none":"block";let n=t.querySelector(".summary-toggle-btn");n&&(n.textContent=o?"\u5C55\u5F00":"\u6536\u8D77")}async function po(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(t){try{await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"DELETE"})}catch(n){console.error("[Favorites] Delete summary error:",n)}if(o&&(o.classList.remove("has-summary"),o.textContent="\u{1F4DD}"),L){let n=L.find(s=>s.news_id===e);n&&(n.summary=null,n.summary_at=null)}await lt(e)}}window.toggleFavoritesPanel=lo;window.closeFavoritesPanel=dt;window.removeFavoriteFromPanel=co;window.handleFavoriteClick=uo;window.isFavorited=st;window.handleFavoriteSummaryClick=lt;window.toggleSummaryDisplay=ct;window.regenerateSummary=po;export{M as a,be as b,Ut as c,ao as d,nt as e,st as f,rt as g,lo as h,dt as i,uo as j};
