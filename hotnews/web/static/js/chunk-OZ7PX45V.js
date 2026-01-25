import{a as T,b as ae}from"./chunk-ICSVECP2.js";var be="",re=0,P=null,X=null,U=null,q=null,He=300;function _t(){return navigator.userAgent.toLowerCase().indexOf("micromessenger")!==-1}function F(){if(_t()){window.location.href="/api/auth/oauth/wechat-mp";return}let e=document.getElementById("loginModal");e&&(e.style.display="flex",Se(),K(1),Te())}function ie(){let e=document.getElementById("loginModal");e&&(e.style.display="none"),P&&(clearInterval(P),P=null),de(),Ee(),Se();let t=document.getElementById("login-email"),o=document.getElementById("login-code");t&&(t.value=""),o&&(o.value="")}async function Te(){let e=document.getElementById("login-qr-loading"),t=document.getElementById("login-qr-image"),o=document.getElementById("login-qr-expired"),n=document.getElementById("login-qr-countdown");e&&(e.style.display="flex"),t&&(t.style.display="none"),o&&(o.style.display="none"),n&&(n.style.display="none"),de();try{let a=await(await fetch("/api/auth/wechat-qr/create",{method:"POST",headers:{"Content-Type":"application/json"}})).json();a.ok&&a.qr_url?(X=a.session_id,He=a.expire_seconds||300,t&&(t.src=a.qr_url,t.onload=()=>{e&&(e.style.display="none"),t.style.display="block"},t.onerror=()=>{e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u52A0\u8F7D\u5931\u8D25")}),Ct(He),$t()):(e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent=a.message||"\u52A0\u8F7D\u5931\u8D25"))}catch(s){console.error("Failed to load WeChat QR:",s),e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u7F51\u7EDC\u9519\u8BEF")}}function Bt(){Te()}function Ct(e){let t=document.getElementById("login-qr-countdown"),o=document.getElementById("login-qr-countdown-text");if(!t||!o)return;let n=e;t.style.display="block";let s=()=>{let a=Math.floor(n/60),r=n%60;o.textContent=`${a}:${r.toString().padStart(2,"0")}`,n<60?t.classList.add("warning"):t.classList.remove("warning")};s(),q=setInterval(()=>{n--,n<=0?(clearInterval(q),q=null,De()):s()},1e3)}function De(){let e=document.getElementById("login-qr-image"),t=document.getElementById("login-qr-expired"),o=document.getElementById("login-qr-countdown");e&&(e.style.display="none"),t&&(t.style.display="flex",t.querySelector("span").textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F"),o&&(o.style.display="none"),de()}function $t(){if(!X)return;let e=async()=>{let t=X;if(t)try{let n=await(await fetch(`/api/auth/wechat-qr/status?session_id=${encodeURIComponent(t)}`)).json();if(n.status==="confirmed"&&n.session_token){U&&(clearInterval(U),U=null),q&&(clearInterval(q),q=null),k("\u767B\u5F55\u6210\u529F","success");try{await fetch(`/api/auth/wechat-qr/confirm-cookie?session_id=${encodeURIComponent(t)}`,{method:"POST",headers:{"Content-Type":"application/json"}})}catch(s){console.error("Failed to set cookie:",s)}X=null,setTimeout(()=>{ie(),window.location.reload()},500);return}else if(n.status==="scanned")k("\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4","success");else if(n.status==="expired"){De();return}}catch(o){console.error("Polling error:",o)}};U=setInterval(e,2e3),e()}function de(){U&&(clearInterval(U),U=null),q&&(clearInterval(q),q=null),X=null}function Mt(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="none"),t&&(t.style.display="block"),de(),setTimeout(()=>{let o=document.getElementById("login-email");o&&o.focus()},100)}function Se(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="block"),t&&(t.style.display="none"),K(1),Ee(),Te()}function xt(e){e.target.id==="loginModal"&&ie()}function k(e,t){let o=document.getElementById("login-message");o&&(o.textContent=e,o.className="login-message "+t)}function Ee(){let e=document.getElementById("login-message");e&&(e.className="login-message")}function K(e){document.querySelectorAll(".login-step").forEach(o=>o.classList.remove("active"));let t=document.getElementById("login-step-"+e);t&&t.classList.add("active"),document.querySelectorAll(".login-step-dot").forEach((o,n)=>{o.classList.toggle("active",n<e)}),Ee()}function At(){K(1),P&&(clearInterval(P),P=null)}function Ne(){re=60;let e=document.getElementById("login-resend-btn"),t=document.getElementById("login-resend-text");e&&(e.disabled=!0),P=setInterval(()=>{re--,re<=0?(clearInterval(P),P=null,e&&(e.disabled=!1),t&&(t.textContent="\u91CD\u65B0\u53D1\u9001")):t&&(t.textContent=re+"\u79D2\u540E\u91CD\u53D1")},1e3)}async function Ft(e){e.preventDefault();let t=document.getElementById("login-send-btn"),o=document.getElementById("login-email").value.trim();if(!o){k("\u8BF7\u8F93\u5165\u90AE\u7BB1","error");return}t&&(t.disabled=!0,t.textContent="\u53D1\u9001\u4E2D...");try{let n=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:o})}),s=await n.json();if(n.ok){be=o;let a=document.getElementById("login-display-email");a&&(a.textContent=o),K(2);let r=document.getElementById("login-code");r&&r.focus(),Ne()}else{let a=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u53D1\u9001\u5931\u8D25";k(a,"error")}}catch{k("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u83B7\u53D6\u9A8C\u8BC1\u7801")}async function Pt(){let e=document.getElementById("login-resend-btn");e&&(e.disabled=!0);try{let t=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:be})}),o=await t.json();if(t.ok)k("\u9A8C\u8BC1\u7801\u5DF2\u91CD\u65B0\u53D1\u9001","success"),Ne();else{let n=typeof o.detail=="string"?o.detail:o.detail?.[0]?.msg||o.message||"\u53D1\u9001\u5931\u8D25";k(n,"error"),e&&(e.disabled=!1)}}catch{k("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error"),e&&(e.disabled=!1)}}async function qt(e){e.preventDefault();let t=document.getElementById("login-verify-btn"),o=document.getElementById("login-code").value.trim();if(!o||o.length!==6){k("\u8BF7\u8F93\u51656\u4F4D\u9A8C\u8BC1\u7801","error");return}t&&(t.disabled=!0,t.textContent="\u767B\u5F55\u4E2D...");try{let n=await fetch("/api/auth/verify-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:be,code:o})}),s=await n.json();if(n.ok)k("\u767B\u5F55\u6210\u529F","success"),setTimeout(()=>{ie(),window.location.reload()},500);else{let a=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u9A8C\u8BC1\u5931\u8D25";k(a,"error")}}catch{k("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u767B\u5F55")}function Oe(){let e=document.getElementById("login-code");e&&e.addEventListener("input",function(t){this.value=this.value.replace(/[^0-9]/g,"").slice(0,6)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Oe):Oe();window.openLoginModal=F;window.closeLoginModal=ie;window.closeLoginModalOnOverlay=xt;window.loginSendCode=Ft;window.loginVerifyCode=qt;window.loginResendCode=Pt;window.loginGoBack=At;window.loginGoToStep=K;window.loginShowMessage=k;window.loginShowEmailForm=Mt;window.loginHideEmailForm=Se;window.refreshWechatQR=Bt;var L=[],G=!1,We=!1,ze=!1,Ge=null;function j(){return T.getUser()?!0:(F(),!1)}async function Ht(e=null){let t="/api/user/todos";e&&(t+=`?group_id=${encodeURIComponent(e)}`);let o=await fetch(t);if(!o.ok){if(o.status===401)return[];throw new Error("\u83B7\u53D6 Todo \u5931\u8D25")}return(await o.json()).todos||[]}async function Ot(e){let t=await fetch("/api/user/todos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function Dt(e,t){let o=await fetch(`/api/user/todos/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!o.ok){let n=await o.json();throw new Error(n.detail||"\u66F4\u65B0\u5931\u8D25")}return await o.json()}async function Nt(e){let t=await fetch(`/api/user/todos/${e}`,{method:"DELETE"});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u5220\u9664\u5931\u8D25")}return await t.json()}async function Rt(e){let t=await fetch("/api/user/todos/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({todos:e})});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function Ie(){if(!j())return[];try{return L=await Ht(),Y(),L}catch(e){return console.error("[Todo] Load error:",e),[]}}async function J(e,t){if(!j())return null;try{let o=await Ot({text:e,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1});if(o.ok&&o.todo)return L.unshift(o.todo),Y(),$("\u5DF2\u6DFB\u52A0\u5230 Todo"),o.todo}catch(o){o.message.includes("\u5DF2\u5B58\u5728")?$("\u8BE5 Todo \u5DF2\u5B58\u5728"):$("\u6DFB\u52A0\u5931\u8D25: "+o.message),console.error("[Todo] Add error:",o)}return null}async function Ut(e){if(!j())return;let t=L.find(n=>n.id===e);if(!t)return;let o=!t.done;try{await Dt(e,{done:o}),t.done=o,Z(),me(),Y()}catch(n){console.error("[Todo] Toggle error:",n),$("\u66F4\u65B0\u5931\u8D25")}}async function jt(e){if(j())try{await Nt(e),L=L.filter(t=>t.id!==e),Z(),me(),Y(),$("\u5DF2\u5220\u9664")}catch(t){console.error("[Todo] Delete error:",t),$("\u5220\u9664\u5931\u8D25")}}async function _e(e,t){if(!j())return null;let o=e.map(n=>({text:n,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1}));try{let n=await Rt(o);if(n.ok){n.added&&n.added.length>0&&(L=[...n.added,...L],Y());let s=n.skipped_count>0?`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\uFF0C${n.skipped_count} \u9879\u5DF2\u5B58\u5728`:`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\u5230 Todo`;return $(s),n}}catch(n){console.error("[Todo] Batch add error:",n),$("\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return null}function Be(e){return L.filter(t=>t.source.groupId===e)}function Wt(){return L.filter(e=>!e.done).length}function zt(){let e={};for(let t of L){let o=t.source.groupId;e[o]||(e[o]={groupId:o,groupTitle:t.source.groupTitle,groupUrl:t.source.groupUrl,isCustom:t.source.isCustom,todos:[]}),e[o].todos.push(t)}return Object.values(e)}function x(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}function $(e){if(window.showToast)window.showToast(e);else{let t=document.createElement("div");t.className="todo-toast",t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add("show"),10),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},2e3)}}function Y(){let e=document.getElementById("todoBadge");if(!e)return;let t=Wt();t>0?(e.textContent=t>99?"99+":t,e.classList.add("show")):e.classList.remove("show")}var Je="todo_sidebar_width",Gt=320,Jt=800;function Qt(){if(document.getElementById("todoSidebar"))return;let e=document.createElement("div");e.id="todoSidebarBackdrop",e.className="todo-sidebar-backdrop",document.body.appendChild(e),document.body.insertAdjacentHTML("beforeend",`
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
    `);let o=localStorage.getItem(Je);if(o){let d=document.getElementById("todoSidebar");d.style.width=o+"px"}let s=document.getElementById("todoSidebar").querySelector(".todo-close-btn"),a=document.getElementById("todoFilterBtn"),r=document.getElementById("todoNewGroupBtn");e.addEventListener("click",ke),s.addEventListener("click",ke),a.addEventListener("click",Xt),r.addEventListener("click",Kt),Vt()}function Vt(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoResizeHandle");if(!e||!t)return;let o=!1,n=0,s=0;t.addEventListener("mousedown",a=>{o=!0,n=a.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),a.preventDefault()}),document.addEventListener("mousemove",a=>{if(!o)return;let r=n-a.clientX,d=s+r;d=Math.max(Gt,Math.min(Jt,d)),e.style.width=d+"px"}),document.addEventListener("mouseup",()=>{o&&(o=!1,e.classList.remove("resizing"),t.classList.remove("active"),localStorage.setItem(Je,e.offsetWidth),ae.saveSidebarWidths({todo_width:e.offsetWidth}))})}function Qe(){if(!j())return;Qt();let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e.classList.add("open"),t.classList.add("show"),We=!0,Ie().then(()=>Z())}function ke(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e&&e.classList.remove("open"),t&&t.classList.remove("show"),We=!1}function Xt(){G=!G;let e=document.getElementById("todoFilterBtn");e&&(e.textContent=G?"\u53EA\u770B\u672A\u5B8C\u6210":"\u663E\u793A\u5168\u90E8"),Z()}function Kt(){let e=document.getElementById("todoSidebarBody");if(!e||e.querySelector(".todo-new-group-input"))return;e.insertAdjacentHTML("afterbegin",`
        <div class="todo-new-group-input">
            <input type="text" placeholder="\u8F93\u5165\u65B0\u6807\u9898\u540D\u79F0..." class="todo-group-name-input" autofocus>
            <button class="todo-group-create-btn">\u521B\u5EFA</button>
            <button class="todo-group-cancel-btn">\u53D6\u6D88</button>
        </div>
    `);let o=e.querySelector(".todo-group-name-input"),n=e.querySelector(".todo-group-create-btn"),s=e.querySelector(".todo-group-cancel-btn");o.focus();let a=()=>{let r=o.value.trim();if(!r){$("\u8BF7\u8F93\u5165\u6807\u9898\u540D\u79F0");return}let d=`custom_${Date.now()}`;Ce(d,r,"",!0),e.querySelector(".todo-new-group-input")?.remove()};n.addEventListener("click",a),s.addEventListener("click",()=>{e.querySelector(".todo-new-group-input")?.remove()}),o.addEventListener("keydown",r=>{r.key==="Enter"&&a(),r.key==="Escape"&&e.querySelector(".todo-new-group-input")?.remove()})}function Ce(e,t,o,n){let s=document.getElementById("todoSidebarBody");if(!s)return;let a=s.querySelector(`.todo-group[data-group-id="${e}"]`);if(a){a.classList.remove("collapsed");let l=le();l[e]=!1,Le(l)}else{let l=le();l[e]=!1,Le(l);let f=`
            <div class="todo-group" data-group-id="${x(e)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${x(t)}">${x(t)}</span>
                    <span class="todo-group-count">0/0</span>
                    <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner"></div>
                </div>
            </div>
        `;s.insertAdjacentHTML("afterbegin",f),a=s.querySelector(`.todo-group[data-group-id="${e}"]`),a.querySelector(".todo-group-add-btn").addEventListener("click",E=>{E.stopPropagation(),Ce(e,t,o,n)}),a.querySelector(".todo-group-header")?.addEventListener("click",E=>{E.target.closest(".todo-group-add-btn")||Xe(e)})}let r=a.querySelector(".todo-group-items-inner");if(!r||r.querySelector(".todo-add-input"))return;r.insertAdjacentHTML("afterbegin",`
        <div class="todo-add-input">
            <input type="text" placeholder="\u8F93\u5165 Todo \u5185\u5BB9..." class="todo-text-input" autofocus>
            <button class="todo-add-confirm-btn">\u6DFB\u52A0</button>
        </div>
    `);let c=r.querySelector(".todo-text-input"),m=r.querySelector(".todo-add-confirm-btn");c.focus();let i=async()=>{let l=c.value.trim();if(!l){$("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}await J(l,{groupId:e,groupTitle:t,groupUrl:o||"",isCustom:n||!1})&&(c.value="",Z())};m.addEventListener("click",i),c.addEventListener("keydown",l=>{l.key==="Enter"&&i(),l.key==="Escape"&&r.querySelector(".todo-add-input")?.remove()})}function Z(){let e=document.getElementById("todoSidebarBody");if(!e)return;if((G?L:L.filter(s=>!s.done)).length===0){e.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let o=zt(),n="";for(let s of o){let a=G?s.todos:s.todos.filter(f=>!f.done);if(a.length===0&&!G)continue;let r=s.todos.filter(f=>!f.done).length,d=s.todos.length,c=Re(s.groupId),i=s.isCustom?"":`
            <button class="todo-group-summary-btn" title="\u67E5\u770B\u603B\u7ED3" data-group-id="${x(s.groupId)}" data-group-title="${x(s.groupTitle)}" data-group-url="${x(s.groupUrl||"")}">\u2728</button>
        `,l=s.groupUrl?`
            <a href="${x(s.groupUrl)}" target="_blank" rel="noopener noreferrer" class="todo-group-link-btn" title="\u67E5\u770B\u539F\u6587" onclick="event.stopPropagation()">\u{1F517}</a>
        `:"";n+=`
            <div class="todo-group ${c?"collapsed":""}" data-group-id="${x(s.groupId)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${x(s.groupTitle)}">${x(s.groupTitle)}</span>
                    <span class="todo-group-count">${r}/${d}</span>
                    <div class="todo-group-actions">
                        ${l}
                        ${i}
                        <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                    </div>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner">
                        ${a.map(f=>Ke(f)).join("")}
                    </div>
                </div>
            </div>
        `}e.innerHTML=n,e.querySelectorAll(".todo-group").forEach(s=>{let a=s.dataset.groupId,r=o.find(i=>i.groupId===a);if(!r)return;s.querySelector(".todo-group-add-btn")?.addEventListener("click",i=>{i.stopPropagation(),Ce(a,r.groupTitle,r.groupUrl,r.isCustom)}),s.querySelector(".todo-group-summary-btn")?.addEventListener("click",i=>{i.stopPropagation(),Yt(r.groupId,r.groupTitle,r.groupUrl)}),s.querySelector(".todo-group-header")?.addEventListener("click",i=>{i.target.closest(".todo-group-add-btn")||i.target.closest(".todo-group-summary-btn")||Xe(a)}),Re(a)&&s.classList.add("collapsed")}),Ye(e)}function Yt(e,t,o){window.openSummaryModal&&window.openSummaryModal(e,t,o,"","")}var Ve="todo_collapsed_groups";function le(){try{let e=localStorage.getItem(Ve);return e?JSON.parse(e):{}}catch{return{}}}function Le(e){try{localStorage.setItem(Ve,JSON.stringify(e))}catch{}}function Re(e){return le()[e]!==!1}function Xe(e){let t=le(),o=t[e]!==!1;t[e]=!o,Le(t);let n=document.querySelector(`.todo-group[data-group-id="${e}"]`);n&&n.classList.toggle("collapsed",!o)}function Ke(e){return`
        <div class="todo-item ${e.done?"done":""}" data-id="${e.id}">
            <input type="checkbox" class="todo-checkbox" ${e.done?"checked":""}>
            <span class="todo-text">${x(e.text)}</span>
            <button class="todo-delete-btn" title="\u5220\u9664">\xD7</button>
        </div>
    `}function Ye(e){e.querySelectorAll(".todo-item").forEach(t=>{let o=parseInt(t.dataset.id),n=t.querySelector(".todo-checkbox"),s=t.querySelector(".todo-delete-btn");n?.addEventListener("change",()=>Ut(o)),s?.addEventListener("click",a=>{a.stopPropagation(),jt(o)})})}function Zt(){if(document.getElementById("summaryTodoPanel"))return;let e=`
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
    `,t=document.getElementById("summaryModalFooter");t?t.insertAdjacentHTML("beforebegin",e):document.body.insertAdjacentHTML("beforeend",e);let o=document.getElementById("summaryTodoPanel"),n=o.querySelector(".summary-todo-close-btn"),s=o.querySelector(".summary-todo-add-btn"),a=document.getElementById("summaryTodoInput");n.addEventListener("click",ue),s.addEventListener("click",Ue),a.addEventListener("keydown",r=>{r.key==="Enter"&&Ue()})}function ce(e,t,o){if(!j())return;Zt(),Ge=e;let n=document.getElementById("summaryTodoPanel");n.classList.add("open"),n.dataset.groupId=e,n.dataset.groupTitle=t,n.dataset.groupUrl=o||"",ze=!0,me()}function ue(){let e=document.getElementById("summaryTodoPanel");e&&e.classList.remove("open"),ze=!1,Ge=null}async function Ue(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoInput");if(!e||!t)return;let o=t.value.trim();if(!o){$("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}let n=e.dataset.groupId,s=e.dataset.groupTitle,a=e.dataset.groupUrl;await J(o,{groupId:n,groupTitle:s,groupUrl:a,isCustom:!1})&&(t.value="",me())}function me(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoBody");if(!e||!t)return;let o=e.dataset.groupId;if(!o){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let n=Be(o);if(n.length===0){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo\uFF0C\u53EF\u5728\u4E0A\u65B9\u8F93\u5165\u6DFB\u52A0</div>';return}t.innerHTML=n.map(s=>Ke(s)).join(""),Ye(t)}function eo(e){return Be(e).filter(t=>!t.done).length}var w=null,je=!1;function Ze(){if(je)return;je=!0,w=document.createElement("button"),w.className="selection-todo-btn",w.type="button",w.textContent="+Todo",w.style.display="none",document.body.appendChild(w);let e=()=>{w.style.display="none",w.dataset.selectionText="",w._source=null},t=()=>{let n=window.getSelection();if(!n||n.isCollapsed)return null;let s=n.toString();if(!String(s||"").trim())return null;let a=n.rangeCount?n.getRangeAt(0):null;if(!a)return null;let r=a.commonAncestorContainer,d=r?.nodeType===Node.ELEMENT_NODE?r:r?.parentElement;if(!d)return null;let c=document.getElementById("summaryModalBody");return!c||!c.contains(d)||d.closest&&d.closest(".summary-todo-panel")?null:{text:s.trim(),range:a}},o=()=>{let n=t();if(!n){e();return}let s=n.range.getBoundingClientRect();if(!s||!s.width&&!s.height){e();return}let a=64,r=32,d=8,c=Math.min(window.innerWidth-a-d,Math.max(d,s.right-a)),m=Math.min(window.innerHeight-r-d,Math.max(d,s.bottom+d));w.style.left=`${c}px`,w.style.top=`${m}px`,w.style.display="block",w.dataset.selectionText=n.text};w.addEventListener("click",async()=>{let n=w.dataset.selectionText||"";if(!n)return;let s=window._currentSummaryNewsId,a=window._currentSummaryNewsTitle,r=window._currentSummaryNewsUrl;if(!s||!a){$("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}await J(n,{groupId:s,groupTitle:a,groupUrl:r||"",isCustom:!1});try{window.getSelection()?.removeAllRanges()}catch{}e()}),document.addEventListener("mouseup",()=>setTimeout(o,0)),document.addEventListener("keyup",()=>setTimeout(o,0)),document.addEventListener("touchend",()=>setTimeout(o,100)),document.addEventListener("selectionchange",()=>{setTimeout(o,50)}),document.addEventListener("scroll",e,!0),window.addEventListener("resize",e),document.addEventListener("mousedown",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")}),document.addEventListener("touchstart",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")})}function to(){let e=document.createElement("button");return e.className="icon-btn todo-btn",e.id="todoBtn",e.title="\u6211\u7684 Todo",e.innerHTML='\u{1F4CB}<span class="todo-badge" id="todoBadge"></span>',e.addEventListener("click",Qe),e}function oo(){let e=document.getElementById("favoritesBtn");if(e&&e.parentNode){let o=to();e.parentNode.insertBefore(o,e)}T.getUser()&&Ie()}window.openTodoSidebar=Qe;window.closeTodoSidebar=ke;window.openTodoPanel=ce;window.closeTodoPanel=ue;window.addTodo=J;window.batchAddTodos=_e;window.loadTodos=Ie;window.getTodosByGroupId=Be;window.getCurrentTodoCount=eo;window.initTodoButton=oo;var W=!1,y=null,I=null,z=null,et=null,tt=null,ee=null,te=null,pe=5e3,ot=1e4,nt=15e3,oe=null,H=5,ne=null;function no(){ee&&(clearTimeout(ee),ee=null)}function so(){te&&(clearTimeout(te),te=null)}function xe(){oe&&(clearInterval(oe),oe=null),ne&&(clearTimeout(ne),ne=null),H=5}function S(){no(),so(),xe()}async function st(e,t,o){try{await fetch("/api/summary/failures/record",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:e,reason:"client_timeout",error_detail:"\u5BA2\u6237\u7AEF 10 \u79D2\u8D85\u65F6",source_id:t||null,source_name:o||null})}),console.log("[Summary] Recorded client timeout for:",e)}catch(n){console.error("[Summary] Failed to record client timeout:",n)}}var ao={news:"\u{1F4F0}",policy:"\u26A0\uFE0F",business:"\u{1F4CA}",tutorial:"\u2705",research:"\u{1F4DA}",product:"\u{1F680}",opinion:"\u{1F4AD}",interview:"\u{1F4AC}",listicle:"\u{1F4D1}",lifestyle:"\u2705",general:"\u{1F4DD}","tech-tutorial":"\u2705",trend:"\u{1F4CA}",other:"\u{1F4DD}"};function ro(e){let t=e||0;return t>=1e3?(t/1e3).toFixed(1).replace(/\.0$/,"")+"K":t.toString()}function $e(e){if(!e)return e;let t=e.replace(/\[TAGS_?START\][\s\S]*?\[TAGS_?END\]/gi,"");return t=t.replace(/\n*-{3,}\s*$/g,""),t.trim()}function O(e){if(!e)return"";let t=e.replace(/<br\s*\/?>/gi,`
`).replace(/<\/br>/gi,`
`);t=t.replace(/- \[ \]/g,"-"),t=t.replace(/- \[\]/g,"-"),t=t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),t=t.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code class="language-$1">$2</code></pre>'),t=t.replace(/`([^`]+)`/g,"<code>$1</code>"),t=t.replace(/^#{4}\s+(.+)$/gm,"<h4>$1</h4>"),t=t.replace(/^#{3}\s+(.+)$/gm,"<h3>$1</h3>"),t=t.replace(/^#{2}\s+(.+)$/gm,"<h2>$1</h2>"),t=t.replace(/^#{1}\s+(.+)$/gm,"<h1>$1</h1>"),t=t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),t=t.replace(/\*([^*]+)\*/g,"<em>$1</em>"),t=t.replace(/__([^_]+)__/g,"<strong>$1</strong>"),t=t.replace(/_([^_]+)_/g,"<em>$1</em>"),t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'),t=t.replace(/^&gt;\s*(.*)$/gm,"<blockquote>$1</blockquote>"),t=t.replace(/<\/blockquote>\n<blockquote>/g,`
`),t=t.replace(/^[-]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[*]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[_]{3,}\s*$/gm,"<hr>");let o=t.split(`
`),n=[],s=!1,a=[],r=!1,d=[];for(let c=0;c<o.length;c++){let m=o[c],i=m.trim(),l=/^\|(.+)\|$/.test(i),f=/^\|[\s\-:|]+\|$/.test(i),p=i.match(/^[-*]\s+(.+)$/),h=i.match(/^\d+\.\s+(.+)$/),E=p||h;if(l){if(r&&d.length>0&&(n.push("<ul>"+d.join("")+"</ul>"),d=[],r=!1),s||(s=!0,a=[]),!f){let B=i.slice(1,-1).split("|").map(C=>C.trim()),A=a.length===0?"th":"td",b="<tr>"+B.map(C=>`<${A}>${C}</${A}>`).join("")+"</tr>";a.push(b)}continue}else s&&a.length>0&&(n.push("<table>"+a.join("")+"</table>"),a=[],s=!1);if(E){let B=p?p[1]:h[1];r=!0,d.push("<li>"+B+"</li>");continue}else r&&d.length>0&&(n.push("<ul>"+d.join("")+"</ul>"),d=[],r=!1);n.push(m)}return s&&a.length>0&&n.push("<table>"+a.join("")+"</table>"),r&&d.length>0&&n.push("<ul>"+d.join("")+"</ul>"),t=n.join(`
`),t=t.split(/\n{2,}/).map(c=>(c=c.trim(),c?/^<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(c)||/<\/(h[1-6]|ul|ol|table|pre|blockquote)>$/.test(c)?c:"<p>"+c.replace(/\n/g,"<br>")+"</p>":"")).join(`
`),t=t.replace(/<p>\s*<\/p>/g,""),t=t.replace(/<p><hr><\/p>/g,"<hr>"),t=t.replace(/<p>(<table>)/g,"$1"),t=t.replace(/(<\/table>)<\/p>/g,"$1"),t=t.replace(/<p>(<ul>)/g,"$1"),t=t.replace(/(<\/ul>)<\/p>/g,"$1"),t=t.replace(/<p>(<blockquote>)/g,"$1"),t=t.replace(/(<\/blockquote>)<\/p>/g,"$1"),t=t.replace(/(<h[1-3]>(?:✅\s*|📋\s*)?行动清单\s*<\/h[1-3]>)/gi,'<div class="action-list-header">$1<button class="action-list-add-btn" onclick="addActionListToTodo()">+ Todo</button></div>'),t}function at(){if(document.getElementById("summaryModal"))return;document.body.insertAdjacentHTML("beforeend",`
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
    `)}async function Ae(e,t,o,n,s){if(!T.getUser()){F();return}at();let r=document.getElementById("summaryModal"),d=document.getElementById("summaryModalTitle"),c=document.getElementById("summaryModalBody"),m=document.getElementById("summaryModalFooter");if(y=e,I=t,z=o,et=n,tt=s,W=!0,window._currentSummaryNewsId=e,window._currentSummaryNewsTitle=t,window._currentSummaryNewsUrl=o,Ze(),d){let i=t&&t.length>50?t.substring(0,50)+"...":t||"AI \u603B\u7ED3";d.textContent=`\u2728 ${i}`}r.classList.add("open"),document.body.style.overflow="hidden",c.innerHTML=`
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
    `,m.style.display="none",S(),ee=setTimeout(()=>{console.log("[Summary] 5s timeout, starting countdown");let i=document.getElementById("summarySlowHint"),l=document.getElementById("summaryCountdownText");i&&(i.style.display="block"),H=5;let f=()=>{l&&(l.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${H} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};f(),oe=setInterval(()=>{H--,H>0?f():xe()},1e3),ne=setTimeout(()=>{console.log("[Summary] 10s timeout, opening original article"),S();let p=document.getElementById("summaryModal");p&&(p.classList.remove("open"),document.body.style.overflow=""),W=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},ot-pe)},pe),te=setTimeout(()=>{st(o,n,s),S();let i=document.getElementById("summaryModal");i&&(i.classList.remove("open"),document.body.style.overflow=""),W=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},nt);try{let i=await fetch(`/api/summary/failures/check?url=${encodeURIComponent(o)}`);if(i.ok){let b=await i.json();if(console.log("[Summary] Check result:",b),b.summarizable)b.warning&&console.log("[Summary] Warning:",b.warning);else{console.log("[Summary] URL blocked, opening original:",o),S();let C=document.getElementById("summaryModal");C&&(C.classList.remove("open"),document.body.style.overflow=""),W=!1,y=null,window.open(o,"_blank");return}}let l=await fetch("/api/summary/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!l.ok){let b=await l.json();throw new Error(b.detail||"\u751F\u6210\u5931\u8D25")}let f=l.body.getReader(),p=new TextDecoder,h="",E="other",B="\u5176\u4ED6",D=!1,A=null;for(;;){let{done:b,value:C}=await f.read();if(b)break;let g=p.decode(C,{stream:!0}).split(`
`);for(let V of g)if(V.startsWith("data: "))try{let u=JSON.parse(V.slice(6));switch(u.type){case"status":let se=document.getElementById("summaryStatusText");se&&(se.textContent=u.message);break;case"type":E=u.article_type,B=u.article_type_name,window._currentTypeConfidence=u.confidence||0;break;case"chunk":D||(D=!0,S(),c.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),h+=u.content;let N=document.getElementById("summaryStreamContent");if(N){let v=h;v=v.replace(/\[TAGS_?START\][\s\S]*$/gi,""),N.innerHTML=O(v)+'<span class="summary-cursor">\u258C</span>',N.scrollTop=N.scrollHeight}break;case"cached":S(),h=u.summary,E=u.article_type,B=u.article_type_name,A=u.token_usage||null;let M=u.feedback||null,Et=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,kt=$e(h);if(c.innerHTML=`
                                <div class="summary-content">
                                    ${O(kt)}
                                </div>
                            `,fe(o,E,B,!0,A,M,Et),ye(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying cached tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v&&(console.log("[Summary] Found news item for cached, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true")}return;case"done":A=u.token_usage||null;let Lt=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,he=document.getElementById("summaryStreamContent");if(he){he.classList.remove("summary-streaming");let v=$e(h);he.innerHTML=O(v)}let It=window._currentTypeConfidence||0;if(fe(o,E,B,!1,A,null,Lt,It),ye(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v?(console.log("[Summary] Found news item, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true"):console.log("[Summary] News item not found in DOM")}break;case"short_content":S(),c.innerHTML=`
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
                            `,m.style.display="none";return;case"error":throw new Error(u.message)}}catch(u){if(u.message&&!u.message.includes("JSON"))throw u}}if(D&&h&&!document.querySelector('.summary-modal-footer[style*="flex"]')){console.log("[Summary] Stream ended without done event, showing fallback footer");let b=document.getElementById("summaryStreamContent");if(b){b.classList.remove("summary-streaming");let C=$e(h);b.innerHTML=O(C)}fe(o,E,B,!1,A,null,null,0),ye(e,!0)}}catch(i){if(console.error("[Summary] Error:",i),S(),i.message&&(i.message.includes("\u8BBF\u95EE\u9650\u5236")||i.message.includes("\u65E0\u6CD5\u83B7\u53D6")||i.message.includes("\u65E0\u6CD5\u8BBF\u95EE")||i.message.includes("\u8BF7\u6C42\u5931\u8D25")))c.innerHTML=`
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
            `;else{Fe();return}}}function fe(e,t,o,n,s,a=null,r=null,d=null){let c=document.getElementById("summaryModalFooter"),m=ao[t]||"\u{1F4DD}",i="",l=s?.total_tokens||0;l>0&&(i=`<span class="summary-token-tag" title="\u672C\u6B21\u6D88\u8017">\u{1FA99} ${ro(l)}</span>`);let f=a==="up"?"active":"",p=a==="down"?"active":"";c.innerHTML=`
        <div class="summary-footer-left">
            ${i}
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
    `,c.style.display="flex"}async function io(e){if(!y)return;let t=document.querySelectorAll(".summary-feedback-btn"),o=document.querySelector(`.summary-feedback-btn[data-vote="${e}"]`),s=o?.classList.contains("active")?"none":e;t.forEach(a=>a.classList.remove("active")),s!=="none"&&o?.classList.add("active");try{let a=await fetch(`/api/summary/${encodeURIComponent(y)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vote:s})});a.ok||console.error("[Summary] Feedback failed:",await a.text())}catch(a){console.error("[Summary] Feedback error:",a)}}function Fe(){let e=document.getElementById("summaryModal");e&&(e.classList.remove("open"),document.body.style.overflow=""),S(),W=!1,y=null}function rt(){let e=document.querySelector(`.news-summary-btn[data-news-id="${y}"]`);if(e){let t=e.dataset.title,o=e.dataset.url,n=e.dataset.sourceId,s=e.dataset.sourceName;Ae(y,t,o,n,s)}}async function lo(){if(y){try{await fetch(`/api/summary/${encodeURIComponent(y)}`,{method:"DELETE"})}catch(e){console.error("[Summary] Delete error:",e)}rt()}}async function co(e,t,o,n,s){let a=decodeURIComponent(t),r=decodeURIComponent(o),d=decodeURIComponent(s);uo(e,a,r,n,d)}async function uo(e,t,o,n,s){if(!T.getUser()){F();return}at();let r=document.getElementById("summaryModal"),d=document.getElementById("summaryModalBody"),c=document.getElementById("summaryModalFooter");y=e,I=t,z=o,et=n,tt=s,d.innerHTML=`
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
    `,c.style.display="none",S(),ee=setTimeout(()=>{console.log("[Summary Force] 5s timeout, starting countdown");let m=document.getElementById("summarySlowHint"),i=document.getElementById("summaryCountdownText");m&&(m.style.display="block"),H=5;let l=()=>{i&&(i.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${H} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};l(),oe=setInterval(()=>{H--,H>0?l():xe()},1e3),ne=setTimeout(()=>{console.log("[Summary Force] 10s timeout, opening original article"),S();let f=document.getElementById("summaryModal");f&&(f.classList.remove("open"),document.body.style.overflow=""),W=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},ot-pe)},pe),te=setTimeout(()=>{st(o,n,s),S();let m=document.getElementById("summaryModal");m&&(m.classList.remove("open"),document.body.style.overflow=""),W=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},nt);try{let m=await fetch("/api/summary/stream?force=1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!m.ok){let D=await m.json();throw new Error(D.detail||"\u751F\u6210\u5931\u8D25")}let i=m.body.getReader(),l=new TextDecoder,f="",p="other",h="\u5176\u4ED6",E=!1,B=null;for(;;){let{done:D,value:A}=await i.read();if(D)break;let C=l.decode(A,{stream:!0}).split(`
`);for(let we of C)if(we.startsWith("data: "))try{let g=JSON.parse(we.slice(6));switch(g.type){case"status":let V=document.getElementById("summaryStatusText");V&&(V.textContent=g.message);break;case"type":p=g.article_type,h=g.article_type_name;break;case"chunk":E||(E=!0,S(),d.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),f+=g.content;let u=document.getElementById("summaryStreamContent");if(u){let M=f;M=M.replace(/\[TAGS_?START\][\s\S]*$/gi,""),u.innerHTML=O(M)+'<span class="summary-cursor">\u258C</span>',u.scrollTop=u.scrollHeight}break;case"done":S(),B=g.token_usage||null;let se=g.token_balance!==void 0?{token_balance:g.token_balance,tokens_used:g.tokens_used,default_tokens:1e5}:null,N=document.getElementById("summaryStreamContent");if(N&&(N.classList.remove("summary-streaming"),N.innerHTML=O(f)),fe(o,p,h,!1,B,null,se),ye(e,!0),g.tags&&window.ArticleTags){let M=document.querySelector(`.news-item[data-news-id="${e}"]`);M||(M=document.querySelector(`.news-item[data-url="${o}"]`)),M&&(window.ArticleTags.applyTags(M,g.tags),M.dataset.tagsLoaded="true")}break;case"error":throw new Error(g.message)}}catch(g){if(g.message&&!g.message.includes("JSON"))throw g}}}catch(m){if(console.error("[Summary] Force error:",m),S(),m.message&&(m.message.includes("\u8BBF\u95EE\u9650\u5236")||m.message.includes("\u65E0\u6CD5\u83B7\u53D6")||m.message.includes("\u65E0\u6CD5\u8BBF\u95EE")||m.message.includes("\u8BF7\u6C42\u5931\u8D25")))d.innerHTML=`
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
            `;else{Fe();return}}}function ye(e,t){let o=document.querySelector(`.news-summary-btn[data-news-id="${e}"]`);o&&(o.classList.toggle("has-summary",t),o.title=t?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3");let n=document.querySelector(`.news-item[data-news-id="${e}"]`);n&&n.classList.toggle("has-summary",t)}function it(e,t,o,n,s,a){e.preventDefault(),e.stopPropagation(),Ae(t,o,n,s,a)}async function Q(){try{if(!T.isLoggedIn())return;let e=await fetch("/api/summary/list");if(!e.ok)return;let t=await e.json();if(!t.ok||!t.news_ids)return;let o=new Set(t.news_ids);if(o.size===0)return;document.querySelectorAll(".news-item[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&n.classList.add("has-summary")}),document.querySelectorAll(".news-summary-btn[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&(n.classList.add("has-summary"),n.title="\u67E5\u770B\u603B\u7ED3")}),console.log(`[Summary] Marked ${o.size} summarized items`)}catch(e){console.error("[Summary] Failed to load summarized list:",e)}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{setTimeout(Q,500)}):setTimeout(Q,500);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){let e=window._lastSummarizedListLoad||0;Date.now()-e>3e4&&(console.log("[Summary] Page visible, reloading summarized list"),Q())}});var mo=Q;Q=async function(){return window._lastSummarizedListLoad=Date.now(),mo()};function fo(){!y||!I||(ce(y,I,z),Me(!0))}function yo(){if(!y||!I)return;let e=document.getElementById("summaryTodoPanel");e&&e.classList.contains("open")?(ue(),Me(!1)):(ce(y,I,z),Me(!0))}function Me(e){let t=document.getElementById("summaryTodoToggleBtn");t&&t.classList.toggle("active",e)}async function po(){if(!y||!I)return;let e=document.getElementById("summaryModalBody");if(!e)return;let o=e.innerHTML.match(/✅\s*行动清单[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);if(!o){window.showToast&&window.showToast("\u672A\u627E\u5230\u884C\u52A8\u6E05\u5355");return}let a=(o[1].match(/<li>([\s\S]*?)<\/li>/gi)||[]).map(r=>r.replace(/<\/?li>/gi,"").replace(/<[^>]+>/g,"").trim()).filter(r=>r.length>0);if(a.length===0){window.showToast&&window.showToast("\u884C\u52A8\u6E05\u5355\u4E3A\u7A7A");return}await _e(a,{groupId:y,groupTitle:I,groupUrl:z||"",isCustom:!1})}async function go(){if(!y||!I){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let e=await J(I,{groupId:y,groupTitle:I,groupUrl:z||"",isCustom:!1})}catch(e){console.error("[Summary] Add to todo error:",e),window.showToast&&window.showToast("\u6DFB\u52A0\u5931\u8D25")}}async function vo(){if(!y||!I){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let{addFavorite:e}=await import("./favorites-2ILMWGG2.js"),t=await e({news_id:y,title:I,url:z||""});t.ok?window.showToast&&window.showToast("\u5DF2\u6536\u85CF"):t.error&&window.showToast&&window.showToast(t.error)}catch(e){console.error("[Summary] Add to favorites error:",e),window.showToast&&window.showToast("\u6536\u85CF\u5931\u8D25")}}document.addEventListener("click",e=>{let t=e.target.closest(".news-summary-btn");if(!t||t.hasAttribute("onclick"))return;e.preventDefault(),e.stopPropagation();let o=t.dataset.newsId,n=t.dataset.title||"",s=t.dataset.url||"",a=t.dataset.sourceId||"",r=t.dataset.sourceName||"";o&&it(e,o,n,s,a,r)});window.openSummaryModal=Ae;window.closeSummaryModal=Fe;window.retrySummaryModal=rt;window.regenerateSummaryModal=lo;window.handleSummaryClick=it;window.loadSummarizedList=Q;window.handleSummaryFeedback=io;window.openCurrentTodoPanel=fo;window.toggleCurrentTodoPanel=yo;window.addActionListToTodo=po;window.forceSummary=co;window.addCurrentToTodo=go;window.addCurrentToFavorites=vo;var mt="hotnews_favorites_v1",ft="hotnews_favorites_width",wo=500,Pe=320,qe=800,_=null,ge=!1,R=!1;function ve(){try{let e=localStorage.getItem(mt);return e?JSON.parse(e):[]}catch{return[]}}function yt(e){try{localStorage.setItem(mt,JSON.stringify(e))}catch(t){console.error("[Favorites] Failed to save to localStorage:",t)}}async function ho(){try{let e=await fetch("/api/user/favorites");if(e.status===401)return{needsAuth:!0};if(!e.ok)throw new Error("Failed to fetch favorites");let t=await e.json();return t.ok?(_=t.favorites||[],{favorites:_}):{error:t.message||"Unknown error"}}catch(e){return console.error("[Favorites] Fetch error:",e),{error:e.message}}}async function bo(e){if(!T.getUser()){let o=ve();return o.some(s=>s.news_id===e.news_id)||(o.unshift({...e,created_at:Math.floor(Date.now()/1e3)}),yt(o)),{ok:!0,local:!0}}try{let n=await(await fetch("/api/user/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json();return n.ok&&_&&_.unshift(n.favorite),n}catch(o){return console.error("[Favorites] Add error:",o),{ok:!1,error:o.message}}}async function pt(e){if(!T.getUser()){let n=ve().filter(s=>s.news_id!==e);return yt(n),{ok:!0,local:!0}}try{let n=await(await fetch(`/api/user/favorites/${encodeURIComponent(e)}`,{method:"DELETE"})).json();return n.ok&&_&&(_=_.filter(s=>s.news_id!==e)),n}catch(o){return console.error("[Favorites] Remove error:",o),{ok:!1,error:o.message}}}function gt(e){return T.getUser()?_?_.some(o=>o.news_id===e):!1:ve().some(n=>n.news_id===e)}async function vt(e,t){let o=e.news_id,n=gt(o);t&&(t.classList.toggle("favorited",!n),t.textContent=n?"\u2606":"\u2605");let s;return n?s=await pt(o):s=await bo(e),s.ok||t&&(t.classList.toggle("favorited",n),t.textContent=n?"\u2605":"\u2606"),s}function wt(e){if(!e)return"";let t=new Date(e*1e3),o=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${o}-${n}`}function To(e){let t=document.getElementById("favoritesPanelBody");if(!t)return;if(!e||e.length===0){t.innerHTML=`
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
                            ${n.created_at?`<span>\u6536\u85CF\u4E8E ${wt(n.created_at)}</span>`:""}
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
                        <div class="summary-content">${n.summary?O(n.summary):""}</div>
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
    `;t.innerHTML=o}function dt(){let e=document.getElementById("favoritesPanelBody");if(!e)return;let t=ve();t.length>0?e.innerHTML=`
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
                                ${o.created_at?`<span>\u6536\u85CF\u4E8E ${wt(o.created_at)}</span>`:""}
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
        `}async function ht(){let e=document.getElementById("favoritesPanelBody");if(!e)return;if(e.innerHTML='<div class="favorites-loading">\u52A0\u8F7D\u4E2D...</div>',!T.getUser()){dt();return}let o=await ho();if(o.needsAuth){dt();return}if(o.error){e.innerHTML=`
            <div class="favorites-empty">
                <div>\u52A0\u8F7D\u5931\u8D25: ${o.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    \u91CD\u8BD5
                </button>
            </div>
        `;return}To(o.favorites)}function So(){if(!T.getUser()){F();return}let t=document.getElementById("favoritesPanel"),o=document.getElementById("favoritesOverlay");t&&(o||(o=document.createElement("div"),o.id="favoritesOverlay",o.className="favorites-overlay",o.onclick=bt,document.body.appendChild(o)),ge=!ge,ge?(t.classList.add("open"),o.classList.add("open"),ht()):(t.classList.remove("open"),o.classList.remove("open")))}function bt(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesOverlay");ge=!1,e&&e.classList.remove("open"),t&&t.classList.remove("open")}async function Eo(e){if((await pt(e)).ok){let o=document.querySelector(`.favorite-item[data-news-id="${e}"]`);o&&o.remove();let n=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);n&&(n.classList.remove("favorited"),n.textContent="\u2606");let s=document.querySelector(".favorites-list");s&&s.children.length===0&&ht()}}function ko(e,t,o,n,s,a){if(e.preventDefault(),e.stopPropagation(),!T.getUser()){F();return}let d=e.currentTarget;vt({news_id:t,title:o,url:n,source_id:s||"",source_name:a||""},d)}function Lo(){try{let e=localStorage.getItem(ft);if(e){let t=parseInt(e,10);if(t>=Pe&&t<=qe)return t}}catch{}return wo}function lt(e){try{localStorage.setItem(ft,String(e)),ae.saveSidebarWidths({favorites_width:e})}catch{}}function Io(e){let t=document.getElementById("favoritesPanel");t&&(t.style.width=e+"px")}function ct(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesResizeHandle");if(!e||!t)return;let o=Lo();Io(o);let n=0,s=0;function a(l){l.preventDefault(),R=!0,n=l.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("mousemove",r),document.addEventListener("mouseup",d)}function r(l){if(!R)return;let f=n-l.clientX,p=s+f;p=Math.max(Pe,Math.min(qe,p)),e.style.width=p+"px"}function d(){R&&(R=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("mousemove",r),document.removeEventListener("mouseup",d),lt(e.offsetWidth))}function c(l){l.touches.length===1&&(l.preventDefault(),R=!0,n=l.touches[0].clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("touchmove",m,{passive:!1}),document.addEventListener("touchend",i))}function m(l){if(!R||l.touches.length!==1)return;l.preventDefault();let f=n-l.touches[0].clientX,p=s+f;p=Math.max(Pe,Math.min(qe,p)),e.style.width=p+"px"}function i(){R&&(R=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("touchmove",m),document.removeEventListener("touchend",i),lt(e.offsetWidth))}t.addEventListener("mousedown",a),t.addEventListener("touchstart",c,{passive:!1})}function ut(){document.addEventListener("click",e=>{let t=e.target.closest(".news-favorite-btn");if(!t)return;if(e.preventDefault(),e.stopPropagation(),!T.getUser()){F();return}let n=t.closest(".news-item");if(!n)return;let s=n.dataset.id||n.dataset.newsId,a=n.dataset.url,r=n.querySelector(".news-title"),d=r?r.textContent.trim():"",c=n.closest(".platform-card"),m=c?c.dataset.platform:"",i=c?c.querySelector(".platform-name"):null,l=i?i.textContent.replace("\u{1F4F1}","").trim():"";vt({news_id:s,title:d,url:a,source_id:m,source_name:l},t)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{ct(),ut()}):(ct(),ut());async function Tt(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(!(!t||!o)){if(o.classList.contains("has-summary")){St(e);return}o.disabled=!0,o.textContent="\u23F3",o.title="\u751F\u6210\u4E2D...",t.style.display="block",t.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <span>\u6B63\u5728\u751F\u6210 AI \u603B\u7ED3...</span>
        </div>
    `;try{let n=await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"POST"}),s=await n.json();if(!n.ok)throw new Error(s.detail||"\u751F\u6210\u5931\u8D25");if(s.ok&&s.summary){if(o.classList.add("has-summary"),o.textContent="\u{1F4C4}",o.title="\u67E5\u770B\u603B\u7ED3",t.innerHTML=`
                <div class="summary-content">${O(s.summary)}</div>
                <div class="summary-actions">
                    <button class="summary-regenerate-btn" onclick="regenerateSummary('${e}')" title="\u91CD\u65B0\u751F\u6210">
                        \u{1F504} \u91CD\u65B0\u751F\u6210
                    </button>
                    <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${e}')">
                        \u6536\u8D77
                    </button>
                </div>
            `,_){let a=_.find(r=>r.news_id===e);a&&(a.summary=s.summary,a.summary_at=s.summary_at)}}else throw new Error(s.error||"\u751F\u6210\u5931\u8D25")}catch(n){console.error("[Favorites] Summary error:",n),t.innerHTML=`
            <div class="summary-error">
                <span>\u274C ${n.message}</span>
                <button onclick="handleFavoriteSummaryClick('${e}')" style="margin-left:8px;">\u91CD\u8BD5</button>
            </div>
        `,o.textContent="\u{1F4DD}",o.title="AI \u603B\u7ED3"}finally{o.disabled=!1}}}function St(e){let t=document.getElementById(`summary-${e}`);if(!t)return;let o=t.style.display!=="none";t.style.display=o?"none":"block";let n=t.querySelector(".summary-toggle-btn");n&&(n.textContent=o?"\u5C55\u5F00":"\u6536\u8D77")}async function _o(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(t){try{await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"DELETE"})}catch(n){console.error("[Favorites] Delete summary error:",n)}if(o&&(o.classList.remove("has-summary"),o.textContent="\u{1F4DD}"),_){let n=_.find(s=>s.news_id===e);n&&(n.summary=null,n.summary_at=null)}await Tt(e)}}window.toggleFavoritesPanel=So;window.closeFavoritesPanel=bt;window.removeFavoriteFromPanel=Eo;window.handleFavoriteClick=ko;window.isFavorited=gt;window.handleFavoriteSummaryClick=Tt;window.toggleSummaryDisplay=St;window.regenerateSummary=_o;export{F as a,Ie as b,oo as c,bo as d,pt as e,gt as f,vt as g,So as h,bt as i,ko as j};
