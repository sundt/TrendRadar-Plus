import{a as T,b as re}from"./chunk-ICSVECP2.js";var Te="",ie=0,H=null,V=null,U=null,P=null,De=300;function Ct(){return navigator.userAgent.toLowerCase().indexOf("micromessenger")!==-1}function F(){if(Ct()){window.location.href="/api/auth/oauth/wechat-mp";return}let e=document.getElementById("loginModal");e&&(e.style.display="flex",ke(),X(1),Se())}function de(){let e=document.getElementById("loginModal");e&&(e.style.display="none"),H&&(clearInterval(H),H=null),le(),Ee(),ke();let t=document.getElementById("login-email"),o=document.getElementById("login-code");t&&(t.value=""),o&&(o.value="")}async function Se(){let e=document.getElementById("login-qr-loading"),t=document.getElementById("login-qr-image"),o=document.getElementById("login-qr-expired"),n=document.getElementById("login-qr-countdown");e&&(e.style.display="flex"),t&&(t.style.display="none"),o&&(o.style.display="none"),n&&(n.style.display="none"),le();try{let a=await(await fetch("/api/auth/wechat-qr/create",{method:"POST",headers:{"Content-Type":"application/json"}})).json();a.ok&&a.qr_url?(V=a.session_id,De=a.expire_seconds||300,t&&(t.src=a.qr_url,t.onload=()=>{e&&(e.style.display="none"),t.style.display="block"},t.onerror=()=>{e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u52A0\u8F7D\u5931\u8D25")}),Mt(De),xt()):(e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent=a.message||"\u52A0\u8F7D\u5931\u8D25"))}catch(s){console.error("Failed to load WeChat QR:",s),e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u7F51\u7EDC\u9519\u8BEF")}}function $t(){Se()}function Mt(e){let t=document.getElementById("login-qr-countdown"),o=document.getElementById("login-qr-countdown-text");if(!t||!o)return;let n=e;t.style.display="block";let s=()=>{let a=Math.floor(n/60),r=n%60;o.textContent=`${a}:${r.toString().padStart(2,"0")}`,n<60?t.classList.add("warning"):t.classList.remove("warning")};s(),P=setInterval(()=>{n--,n<=0?(clearInterval(P),P=null,Re()):s()},1e3)}function Re(){let e=document.getElementById("login-qr-image"),t=document.getElementById("login-qr-expired"),o=document.getElementById("login-qr-countdown");e&&(e.style.display="none"),t&&(t.style.display="flex",t.querySelector("span").textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F"),o&&(o.style.display="none"),le()}function xt(){if(!V)return;let e=async()=>{let t=V;if(t)try{let n=await(await fetch(`/api/auth/wechat-qr/status?session_id=${encodeURIComponent(t)}`)).json();if(n.status==="confirmed"&&n.session_token){U&&(clearInterval(U),U=null),P&&(clearInterval(P),P=null),E("\u767B\u5F55\u6210\u529F","success");try{await fetch(`/api/auth/wechat-qr/confirm-cookie?session_id=${encodeURIComponent(t)}`,{method:"POST",headers:{"Content-Type":"application/json"}})}catch(s){console.error("Failed to set cookie:",s)}V=null,setTimeout(()=>{de(),window.location.reload()},500);return}else if(n.status==="scanned")E("\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4","success");else if(n.status==="expired"){Re();return}}catch(o){console.error("Polling error:",o)}};U=setInterval(e,2e3),e()}function le(){U&&(clearInterval(U),U=null),P&&(clearInterval(P),P=null),V=null}function At(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="none"),t&&(t.style.display="block"),le(),setTimeout(()=>{let o=document.getElementById("login-email");o&&o.focus()},100)}function ke(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="block"),t&&(t.style.display="none"),X(1),Ee(),Se()}function Ft(e){e.target.id==="loginModal"&&de()}function E(e,t){let o=document.getElementById("login-message");o&&(o.textContent=e,o.className="login-message "+t)}function Ee(){let e=document.getElementById("login-message");e&&(e.className="login-message")}function X(e){document.querySelectorAll(".login-step").forEach(o=>o.classList.remove("active"));let t=document.getElementById("login-step-"+e);t&&t.classList.add("active"),document.querySelectorAll(".login-step-dot").forEach((o,n)=>{o.classList.toggle("active",n<e)}),Ee()}function Ht(){X(1),H&&(clearInterval(H),H=null)}function Ue(){ie=60;let e=document.getElementById("login-resend-btn"),t=document.getElementById("login-resend-text");e&&(e.disabled=!0),H=setInterval(()=>{ie--,ie<=0?(clearInterval(H),H=null,e&&(e.disabled=!1),t&&(t.textContent="\u91CD\u65B0\u53D1\u9001")):t&&(t.textContent=ie+"\u79D2\u540E\u91CD\u53D1")},1e3)}async function Pt(e){e.preventDefault();let t=document.getElementById("login-send-btn"),o=document.getElementById("login-email").value.trim();if(!o){E("\u8BF7\u8F93\u5165\u90AE\u7BB1","error");return}t&&(t.disabled=!0,t.textContent="\u53D1\u9001\u4E2D...");try{let n=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:o})}),s=await n.json();if(n.ok){Te=o;let a=document.getElementById("login-display-email");a&&(a.textContent=o),X(2);let r=document.getElementById("login-code");r&&r.focus(),Ue()}else{let a=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u53D1\u9001\u5931\u8D25";E(a,"error")}}catch{E("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u83B7\u53D6\u9A8C\u8BC1\u7801")}async function qt(){let e=document.getElementById("login-resend-btn");e&&(e.disabled=!0);try{let t=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:Te})}),o=await t.json();if(t.ok)E("\u9A8C\u8BC1\u7801\u5DF2\u91CD\u65B0\u53D1\u9001","success"),Ue();else{let n=typeof o.detail=="string"?o.detail:o.detail?.[0]?.msg||o.message||"\u53D1\u9001\u5931\u8D25";E(n,"error"),e&&(e.disabled=!1)}}catch{E("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error"),e&&(e.disabled=!1)}}async function Ot(e){e.preventDefault();let t=document.getElementById("login-verify-btn"),o=document.getElementById("login-code").value.trim();if(!o||o.length!==6){E("\u8BF7\u8F93\u51656\u4F4D\u9A8C\u8BC1\u7801","error");return}t&&(t.disabled=!0,t.textContent="\u767B\u5F55\u4E2D...");try{let n=await fetch("/api/auth/verify-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:Te,code:o})}),s=await n.json();if(n.ok)E("\u767B\u5F55\u6210\u529F","success"),setTimeout(()=>{de(),window.location.reload()},500);else{let a=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u9A8C\u8BC1\u5931\u8D25";E(a,"error")}}catch{E("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u767B\u5F55")}function Ne(){let e=document.getElementById("login-code");e&&e.addEventListener("input",function(t){this.value=this.value.replace(/[^0-9]/g,"").slice(0,6)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Ne):Ne();window.openLoginModal=F;window.closeLoginModal=de;window.closeLoginModalOnOverlay=Ft;window.loginSendCode=Pt;window.loginVerifyCode=Ot;window.loginResendCode=qt;window.loginGoBack=Ht;window.loginGoToStep=X;window.loginShowMessage=E;window.loginShowEmailForm=At;window.loginHideEmailForm=ke;window.refreshWechatQR=$t;var L=[],z=!1,Ge=!1,Je=!1,Qe=null;function j(){return T.getUser()?!0:(F(),!1)}async function Dt(e=null){let t="/api/user/todos";e&&(t+=`?group_id=${encodeURIComponent(e)}`);let o=await fetch(t);if(!o.ok){if(o.status===401)return[];throw new Error("\u83B7\u53D6 Todo \u5931\u8D25")}return(await o.json()).todos||[]}async function Nt(e){let t=await fetch("/api/user/todos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function Rt(e,t){let o=await fetch(`/api/user/todos/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!o.ok){let n=await o.json();throw new Error(n.detail||"\u66F4\u65B0\u5931\u8D25")}return await o.json()}async function Ut(e){let t=await fetch(`/api/user/todos/${e}`,{method:"DELETE"});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u5220\u9664\u5931\u8D25")}return await t.json()}async function jt(e){let t=await fetch("/api/user/todos/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({todos:e})});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function _e(){if(!j())return[];try{return L=await Dt(),K(),L}catch(e){return console.error("[Todo] Load error:",e),[]}}async function G(e,t){if(!j())return null;try{let o=await Nt({text:e,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1});if(o.ok&&o.todo)return L.unshift(o.todo),K(),$("\u5DF2\u6DFB\u52A0\u5230 Todo"),o.todo}catch(o){o.message.includes("\u5DF2\u5B58\u5728")?$("\u8BE5 Todo \u5DF2\u5B58\u5728"):$("\u6DFB\u52A0\u5931\u8D25: "+o.message),console.error("[Todo] Add error:",o)}return null}async function Wt(e){if(!j())return;let t=L.find(n=>n.id===e);if(!t)return;let o=!t.done;try{await Rt(e,{done:o}),t.done=o,Y(),fe(),K()}catch(n){console.error("[Todo] Toggle error:",n),$("\u66F4\u65B0\u5931\u8D25")}}async function zt(e){if(j())try{await Ut(e),L=L.filter(t=>t.id!==e),Y(),fe(),K(),$("\u5DF2\u5220\u9664")}catch(t){console.error("[Todo] Delete error:",t),$("\u5220\u9664\u5931\u8D25")}}async function Be(e,t){if(!j())return null;let o=e.map(n=>({text:n,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1}));try{let n=await jt(o);if(n.ok){n.added&&n.added.length>0&&(L=[...n.added,...L],K());let s=n.skipped_count>0?`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\uFF0C${n.skipped_count} \u9879\u5DF2\u5B58\u5728`:`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\u5230 Todo`;return $(s),n}}catch(n){console.error("[Todo] Batch add error:",n),$("\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return null}function Ce(e){return L.filter(t=>t.source.groupId===e)}function Gt(){return L.filter(e=>!e.done).length}function Jt(){let e={};for(let t of L){let o=t.source.groupId;e[o]||(e[o]={groupId:o,groupTitle:t.source.groupTitle,groupUrl:t.source.groupUrl,isCustom:t.source.isCustom,todos:[]}),e[o].todos.push(t)}return Object.values(e)}function x(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}function $(e){if(window.showToast)window.showToast(e);else{let t=document.createElement("div");t.className="todo-toast",t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add("show"),10),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},2e3)}}function K(){let e=document.getElementById("todoBadge");if(!e)return;let t=Gt();t>0?(e.textContent=t>99?"99+":t,e.classList.add("show")):e.classList.remove("show")}var Ve="todo_sidebar_width",Qt=320,Vt=800;function Xt(){if(document.getElementById("todoSidebar"))return;let e=document.createElement("div");e.id="todoSidebarBackdrop",e.className="todo-sidebar-backdrop",document.body.appendChild(e),document.body.insertAdjacentHTML("beforeend",`
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
    `);let o=localStorage.getItem(Ve);if(o){let d=document.getElementById("todoSidebar");d.style.width=o+"px"}let s=document.getElementById("todoSidebar").querySelector(".todo-close-btn"),a=document.getElementById("todoFilterBtn"),r=document.getElementById("todoNewGroupBtn");e.addEventListener("click",Le),s.addEventListener("click",Le),a.addEventListener("click",Yt),r.addEventListener("click",Zt),Kt()}function Kt(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoResizeHandle");if(!e||!t)return;let o=!1,n=0,s=0;t.addEventListener("mousedown",a=>{o=!0,n=a.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),a.preventDefault()}),document.addEventListener("mousemove",a=>{if(!o)return;let r=n-a.clientX,d=s+r;d=Math.max(Qt,Math.min(Vt,d)),e.style.width=d+"px"}),document.addEventListener("mouseup",()=>{o&&(o=!1,e.classList.remove("resizing"),t.classList.remove("active"),localStorage.setItem(Ve,e.offsetWidth),re.saveSidebarWidths({todo_width:e.offsetWidth}))})}function Xe(){if(!j())return;Xt();let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e.classList.add("open"),t.classList.add("show"),Ge=!0,_e().then(()=>Y())}function Le(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e&&e.classList.remove("open"),t&&t.classList.remove("show"),Ge=!1}function Yt(){z=!z;let e=document.getElementById("todoFilterBtn");e&&(e.textContent=z?"\u53EA\u770B\u672A\u5B8C\u6210":"\u663E\u793A\u5168\u90E8"),Y()}function Zt(){let e=document.getElementById("todoSidebarBody");if(!e||e.querySelector(".todo-new-group-input"))return;e.insertAdjacentHTML("afterbegin",`
        <div class="todo-new-group-input">
            <input type="text" placeholder="\u8F93\u5165\u65B0\u6807\u9898\u540D\u79F0..." class="todo-group-name-input" autofocus>
            <button class="todo-group-create-btn">\u521B\u5EFA</button>
            <button class="todo-group-cancel-btn">\u53D6\u6D88</button>
        </div>
    `);let o=e.querySelector(".todo-group-name-input"),n=e.querySelector(".todo-group-create-btn"),s=e.querySelector(".todo-group-cancel-btn");o.focus();let a=()=>{let r=o.value.trim();if(!r){$("\u8BF7\u8F93\u5165\u6807\u9898\u540D\u79F0");return}let d=`custom_${Date.now()}`;$e(d,r,"",!0),e.querySelector(".todo-new-group-input")?.remove()};n.addEventListener("click",a),s.addEventListener("click",()=>{e.querySelector(".todo-new-group-input")?.remove()}),o.addEventListener("keydown",r=>{r.key==="Enter"&&a(),r.key==="Escape"&&e.querySelector(".todo-new-group-input")?.remove()})}function $e(e,t,o,n){let s=document.getElementById("todoSidebarBody");if(!s)return;let a=s.querySelector(`.todo-group[data-group-id="${e}"]`);if(a){a.classList.remove("collapsed");let c=ce();c[e]=!1,Ie(c)}else{let c=ce();c[e]=!1,Ie(c);let f=`
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
        `;s.insertAdjacentHTML("afterbegin",f),a=s.querySelector(`.todo-group[data-group-id="${e}"]`),a.querySelector(".todo-group-add-btn").addEventListener("click",S=>{S.stopPropagation(),$e(e,t,o,n)}),a.querySelector(".todo-group-header")?.addEventListener("click",S=>{S.target.closest(".todo-group-add-btn")||Ye(e)})}let r=a.querySelector(".todo-group-items-inner");if(!r||r.querySelector(".todo-add-input"))return;r.insertAdjacentHTML("afterbegin",`
        <div class="todo-add-input">
            <input type="text" placeholder="\u8F93\u5165 Todo \u5185\u5BB9..." class="todo-text-input" autofocus>
            <button class="todo-add-confirm-btn">\u6DFB\u52A0</button>
        </div>
    `);let l=r.querySelector(".todo-text-input"),m=r.querySelector(".todo-add-confirm-btn");l.focus();let i=async()=>{let c=l.value.trim();if(!c){$("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}await G(c,{groupId:e,groupTitle:t,groupUrl:o||"",isCustom:n||!1})&&(l.value="",Y())};m.addEventListener("click",i),l.addEventListener("keydown",c=>{c.key==="Enter"&&i(),c.key==="Escape"&&r.querySelector(".todo-add-input")?.remove()})}function Y(){let e=document.getElementById("todoSidebarBody");if(!e)return;if((z?L:L.filter(s=>!s.done)).length===0){e.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let o=Jt(),n="";for(let s of o){let a=z?s.todos:s.todos.filter(f=>!f.done);if(a.length===0&&!z)continue;let r=s.todos.filter(f=>!f.done).length,d=s.todos.length,l=je(s.groupId),i=s.isCustom?"":`
            <button class="todo-group-summary-btn" title="\u67E5\u770B\u603B\u7ED3" data-group-id="${x(s.groupId)}" data-group-title="${x(s.groupTitle)}" data-group-url="${x(s.groupUrl||"")}">\u2728</button>
        `,c=s.groupUrl?`
            <a href="${x(s.groupUrl)}" target="_blank" rel="noopener noreferrer" class="todo-group-link-btn" title="\u67E5\u770B\u539F\u6587" onclick="event.stopPropagation()">\u{1F517}</a>
        `:"";n+=`
            <div class="todo-group ${l?"collapsed":""}" data-group-id="${x(s.groupId)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${x(s.groupTitle)}">${x(s.groupTitle)}</span>
                    <span class="todo-group-count">${r}/${d}</span>
                    <div class="todo-group-actions">
                        ${c}
                        ${i}
                        <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                    </div>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner">
                        ${a.map(f=>Ze(f)).join("")}
                    </div>
                </div>
            </div>
        `}e.innerHTML=n,e.querySelectorAll(".todo-group").forEach(s=>{let a=s.dataset.groupId,r=o.find(i=>i.groupId===a);if(!r)return;s.querySelector(".todo-group-add-btn")?.addEventListener("click",i=>{i.stopPropagation(),$e(a,r.groupTitle,r.groupUrl,r.isCustom)}),s.querySelector(".todo-group-summary-btn")?.addEventListener("click",i=>{i.stopPropagation(),eo(r.groupId,r.groupTitle,r.groupUrl)}),s.querySelector(".todo-group-header")?.addEventListener("click",i=>{i.target.closest(".todo-group-add-btn")||i.target.closest(".todo-group-summary-btn")||Ye(a)}),je(a)&&s.classList.add("collapsed")}),et(e)}function eo(e,t,o){window.openSummaryModal&&window.openSummaryModal(e,t,o,"","")}var Ke="todo_collapsed_groups";function ce(){try{let e=localStorage.getItem(Ke);return e?JSON.parse(e):{}}catch{return{}}}function Ie(e){try{localStorage.setItem(Ke,JSON.stringify(e))}catch{}}function je(e){return ce()[e]!==!1}function Ye(e){let t=ce(),o=t[e]!==!1;t[e]=!o,Ie(t);let n=document.querySelector(`.todo-group[data-group-id="${e}"]`);n&&n.classList.toggle("collapsed",!o)}function Ze(e){return`
        <div class="todo-item ${e.done?"done":""}" data-id="${e.id}">
            <input type="checkbox" class="todo-checkbox" ${e.done?"checked":""}>
            <span class="todo-text">${x(e.text)}</span>
            <button class="todo-delete-btn" title="\u5220\u9664">\xD7</button>
        </div>
    `}function et(e){e.querySelectorAll(".todo-item").forEach(t=>{let o=parseInt(t.dataset.id),n=t.querySelector(".todo-checkbox"),s=t.querySelector(".todo-delete-btn");n?.addEventListener("change",()=>Wt(o)),s?.addEventListener("click",a=>{a.stopPropagation(),zt(o)})})}function to(){if(document.getElementById("summaryTodoPanel"))return;let e=`
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
    `,t=document.getElementById("summaryModalFooter");t?t.insertAdjacentHTML("beforebegin",e):document.body.insertAdjacentHTML("beforeend",e);let o=document.getElementById("summaryTodoPanel"),n=o.querySelector(".summary-todo-close-btn"),s=o.querySelector(".summary-todo-add-btn"),a=document.getElementById("summaryTodoInput");n.addEventListener("click",me),s.addEventListener("click",We),a.addEventListener("keydown",r=>{r.key==="Enter"&&We()})}function ue(e,t,o){if(!j())return;to(),Qe=e;let n=document.getElementById("summaryTodoPanel");n.classList.add("open"),n.dataset.groupId=e,n.dataset.groupTitle=t,n.dataset.groupUrl=o||"",Je=!0,fe()}function me(){let e=document.getElementById("summaryTodoPanel");e&&e.classList.remove("open"),Je=!1,Qe=null}async function We(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoInput");if(!e||!t)return;let o=t.value.trim();if(!o){$("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}let n=e.dataset.groupId,s=e.dataset.groupTitle,a=e.dataset.groupUrl;await G(o,{groupId:n,groupTitle:s,groupUrl:a,isCustom:!1})&&(t.value="",fe())}function fe(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoBody");if(!e||!t)return;let o=e.dataset.groupId;if(!o){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let n=Ce(o);if(n.length===0){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo\uFF0C\u53EF\u5728\u4E0A\u65B9\u8F93\u5165\u6DFB\u52A0</div>';return}t.innerHTML=n.map(s=>Ze(s)).join(""),et(t)}function oo(e){return Ce(e).filter(t=>!t.done).length}var w=null,ze=!1;function tt(){if(ze)return;ze=!0,w=document.createElement("button"),w.className="selection-todo-btn",w.type="button",w.textContent="+Todo",w.style.display="none",document.body.appendChild(w);let e=()=>{w.style.display="none",w.dataset.selectionText="",w._source=null},t=()=>{let n=window.getSelection();if(!n||n.isCollapsed)return null;let s=n.toString();if(!String(s||"").trim())return null;let a=n.rangeCount?n.getRangeAt(0):null;if(!a)return null;let r=a.commonAncestorContainer,d=r?.nodeType===Node.ELEMENT_NODE?r:r?.parentElement;if(!d)return null;let l=document.getElementById("summaryModalBody");return!l||!l.contains(d)||d.closest&&d.closest(".summary-todo-panel")?null:{text:s.trim(),range:a}},o=()=>{let n=t();if(!n){e();return}let s=n.range.getBoundingClientRect();if(!s||!s.width&&!s.height){e();return}let a=64,r=32,d=8,l=Math.min(window.innerWidth-a-d,Math.max(d,s.right-a)),m=Math.min(window.innerHeight-r-d,Math.max(d,s.bottom+d));w.style.left=`${l}px`,w.style.top=`${m}px`,w.style.display="block",w.dataset.selectionText=n.text};w.addEventListener("click",async()=>{let n=w.dataset.selectionText||"";if(!n)return;let s=window._currentSummaryNewsId,a=window._currentSummaryNewsTitle,r=window._currentSummaryNewsUrl;if(!s||!a){$("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}await G(n,{groupId:s,groupTitle:a,groupUrl:r||"",isCustom:!1});try{window.getSelection()?.removeAllRanges()}catch{}e()}),document.addEventListener("mouseup",()=>setTimeout(o,0)),document.addEventListener("keyup",()=>setTimeout(o,0)),document.addEventListener("touchend",()=>setTimeout(o,100)),document.addEventListener("selectionchange",()=>{setTimeout(o,50)}),document.addEventListener("scroll",e,!0),window.addEventListener("resize",e),document.addEventListener("mousedown",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")}),document.addEventListener("touchstart",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")})}function no(){let e=document.createElement("button");return e.className="icon-btn todo-btn",e.id="todoBtn",e.title="\u6211\u7684 Todo",e.innerHTML='\u{1F4CB}<span class="todo-badge" id="todoBadge"></span>',e.addEventListener("click",Xe),e}function so(){let e=document.createElement("button");return e.className="icon-btn category-settings-header-btn",e.id="categorySettingsHeaderBtn",e.title="\u680F\u76EE\u8BBE\u7F6E",e.innerHTML="\u2699\uFE0F",e.addEventListener("click",()=>{window.openCategorySettings&&window.openCategorySettings()}),e}function ao(){let e=document.getElementById("favoritesBtn");if(e&&e.parentNode){let o=no();e.parentNode.insertBefore(o,e);let n=so();e.parentNode.insertBefore(n,o)}T.getUser()&&_e()}window.openTodoSidebar=Xe;window.closeTodoSidebar=Le;window.openTodoPanel=ue;window.closeTodoPanel=me;window.addTodo=G;window.batchAddTodos=Be;window.loadTodos=_e;window.getTodosByGroupId=Ce;window.getCurrentTodoCount=oo;window.initTodoButton=ao;var ge=!1,y=null,_=null,W=null,ot=null,nt=null,Z=null,ee=null,ro=!1,Me=null,ve=5e3,st=1e4,at=15e3,te=null,q=5,oe=null;window.addEventListener("hotnews-summarizer-sidepanel-ack",()=>{ro=!0,Me&&(clearTimeout(Me),Me=null)});function xe(){if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))return!0;let t=navigator.maxTouchPoints>0,o=window.innerWidth<=768;return t&&o}function io(){return document.documentElement.getAttribute("data-hotnews-summarizer")==="installed"}function lo(){return document.documentElement.getAttribute("data-hotnews-summarizer-version")||null}function co(){Z&&(clearTimeout(Z),Z=null)}function uo(){ee&&(clearTimeout(ee),ee=null)}function ne(){te&&(clearInterval(te),te=null),oe&&(clearTimeout(oe),oe=null),q=5}function I(){co(),uo(),ne()}async function rt(e,t,o){try{await fetch("/api/summary/failures/record",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:e,reason:"client_timeout",error_detail:"\u5BA2\u6237\u7AEF 10 \u79D2\u8D85\u65F6",source_id:t||null,source_name:o||null})}),console.log("[Summary] Recorded client timeout for:",e)}catch(n){console.error("[Summary] Failed to record client timeout:",n)}}var mo={news:"\u{1F4F0}",policy:"\u26A0\uFE0F",business:"\u{1F4CA}",tutorial:"\u2705",research:"\u{1F4DA}",product:"\u{1F680}",opinion:"\u{1F4AD}",interview:"\u{1F4AC}",listicle:"\u{1F4D1}",lifestyle:"\u2705",general:"\u{1F4DD}","tech-tutorial":"\u2705",trend:"\u{1F4CA}",other:"\u{1F4DD}"};function fo(e){let t=e||0;return t>=1e3?(t/1e3).toFixed(1).replace(/\.0$/,"")+"K":t.toString()}function Ae(e){if(!e)return e;let t=e.replace(/\[TAGS_?START\][\s\S]*?\[TAGS_?END\]/gi,"");return t=t.replace(/\n*-{3,}\s*$/g,""),t.trim()}function O(e){if(!e)return"";let t=e.replace(/<br\s*\/?>/gi,`
`).replace(/<\/br>/gi,`
`);t=t.replace(/- \[ \]/g,"-"),t=t.replace(/- \[\]/g,"-"),t=t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),t=t.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code class="language-$1">$2</code></pre>'),t=t.replace(/`([^`]+)`/g,"<code>$1</code>"),t=t.replace(/^#{4}\s+(.+)$/gm,"<h4>$1</h4>"),t=t.replace(/^#{3}\s+(.+)$/gm,"<h3>$1</h3>"),t=t.replace(/^#{2}\s+(.+)$/gm,"<h2>$1</h2>"),t=t.replace(/^#{1}\s+(.+)$/gm,"<h1>$1</h1>"),t=t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),t=t.replace(/\*([^*]+)\*/g,"<em>$1</em>"),t=t.replace(/__([^_]+)__/g,"<strong>$1</strong>"),t=t.replace(/_([^_]+)_/g,"<em>$1</em>"),t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'),t=t.replace(/^&gt;\s*(.*)$/gm,"<blockquote>$1</blockquote>"),t=t.replace(/<\/blockquote>\n<blockquote>/g,`
`),t=t.replace(/^[-]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[*]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[_]{3,}\s*$/gm,"<hr>");let o=t.split(`
`),n=[],s=!1,a=[],r=!1,d=[];for(let l=0;l<o.length;l++){let m=o[l],i=m.trim(),c=/^\|(.+)\|$/.test(i),f=/^\|[\s\-:|]+\|$/.test(i),p=i.match(/^[-*]\s+(.+)$/),h=i.match(/^\d+\.\s+(.+)$/),S=p||h;if(c){if(r&&d.length>0&&(n.push("<ul>"+d.join("")+"</ul>"),d=[],r=!1),s||(s=!0,a=[]),!f){let C=i.slice(1,-1).split("|").map(k=>k.trim()),A=a.length===0?"th":"td",b="<tr>"+C.map(k=>`<${A}>${k}</${A}>`).join("")+"</tr>";a.push(b)}continue}else s&&a.length>0&&(n.push("<table>"+a.join("")+"</table>"),a=[],s=!1);if(S){let C=p?p[1]:h[1];r=!0,d.push("<li>"+C+"</li>");continue}else r&&d.length>0&&(n.push("<ul>"+d.join("")+"</ul>"),d=[],r=!1);n.push(m)}return s&&a.length>0&&n.push("<table>"+a.join("")+"</table>"),r&&d.length>0&&n.push("<ul>"+d.join("")+"</ul>"),t=n.join(`
`),t=t.split(/\n{2,}/).map(l=>(l=l.trim(),l?/^<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(l)||/<\/(h[1-6]|ul|ol|table|pre|blockquote)>$/.test(l)?l:"<p>"+l.replace(/\n/g,"<br>")+"</p>":"")).join(`
`),t=t.replace(/<p>\s*<\/p>/g,""),t=t.replace(/<p><hr><\/p>/g,"<hr>"),t=t.replace(/<p>(<table>)/g,"$1"),t=t.replace(/(<\/table>)<\/p>/g,"$1"),t=t.replace(/<p>(<ul>)/g,"$1"),t=t.replace(/(<\/ul>)<\/p>/g,"$1"),t=t.replace(/<p>(<blockquote>)/g,"$1"),t=t.replace(/(<\/blockquote>)<\/p>/g,"$1"),t=t.replace(/(<h[1-3]>(?:✅\s*|📋\s*)?行动清单\s*<\/h[1-3]>)/gi,'<div class="action-list-header">$1<button class="action-list-add-btn" onclick="addActionListToTodo()">+ Todo</button></div>'),t}function it(){if(document.getElementById("summaryModal"))return;document.body.insertAdjacentHTML("beforeend",`
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
    `)}async function He(e,t,o,n,s){if(!T.getUser()){F();return}it();let r=document.getElementById("summaryModal"),d=document.getElementById("summaryModalTitle"),l=document.getElementById("summaryModalBody"),m=document.getElementById("summaryModalFooter");if(y=e,_=t,W=o,ot=n,nt=s,ge=!0,window._currentSummaryNewsId=e,window._currentSummaryNewsTitle=t,window._currentSummaryNewsUrl=o,tt(),d){let i=t&&t.length>50?t.substring(0,50)+"...":t||"AI \u603B\u7ED3";d.textContent=`\u2728 ${i}`}r.classList.add("open"),document.body.style.overflow="hidden",l.innerHTML=`
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
    `,m.style.display="none",I(),Z=setTimeout(()=>{console.log("[Summary] 5s timeout, starting countdown");let i=document.getElementById("summarySlowHint"),c=document.getElementById("summaryCountdownText");i&&(i.style.display="block"),q=5;let f=()=>{c&&(c.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${q} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};f(),te=setInterval(()=>{q--,q>0?f():ne()},1e3),oe=setTimeout(()=>{console.log("[Summary] 10s timeout, showing click hint"),ne();let p=document.getElementById("summarySlowHint");p&&(p.innerHTML='\u52A0\u8F7D\u8F83\u6162\uFF0C\u8BF7 <a href="'+o+'" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">\u70B9\u51FB\u9605\u8BFB\u539F\u6587</a>')},st-ve)},ve),ee=setTimeout(()=>{rt(o,n,s),I();let i=document.getElementById("summaryModal");i&&(i.classList.remove("open"),document.body.style.overflow=""),ge=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},at);try{let i=await fetch(`/api/summary/failures/check?url=${encodeURIComponent(o)}`);if(i.ok){let b=await i.json();if(console.log("[Summary] Check result:",b),b.summarizable)b.warning&&console.log("[Summary] Warning:",b.warning);else{console.log("[Summary] URL blocked, showing blocked UI:",o),I();let k=!xe()&&io(),se=k?lo():null;!xe()&&!k?l.innerHTML=`
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
                    `:!xe()&&k?l.innerHTML=`
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
                    `,m.style.display="none";return}}let c=await fetch("/api/summary/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!c.ok){let b=await c.json();throw new Error(b.detail||"\u751F\u6210\u5931\u8D25")}let f=c.body.getReader(),p=new TextDecoder,h="",S="other",C="\u5176\u4ED6",D=!1,A=null;for(;;){let{done:b,value:k}=await f.read();if(b)break;let g=p.decode(k,{stream:!0}).split(`
`);for(let Q of g)if(Q.startsWith("data: "))try{let u=JSON.parse(Q.slice(6));switch(u.type){case"status":let ae=document.getElementById("summaryStatusText");ae&&(ae.textContent=u.message);break;case"type":S=u.article_type,C=u.article_type_name,window._currentTypeConfidence=u.confidence||0;break;case"chunk":D||(D=!0,I(),l.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),h+=u.content;let N=document.getElementById("summaryStreamContent");if(N){let v=h;v=v.replace(/\[TAGS_?START\][\s\S]*$/gi,""),N.innerHTML=O(v)+'<span class="summary-cursor">\u258C</span>',N.scrollTop=N.scrollHeight}break;case"cached":I(),h=u.summary,S=u.article_type,C=u.article_type_name,A=u.token_usage||null;let M=u.feedback||null,Lt=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,It=Ae(h);if(l.innerHTML=`
                                <div class="summary-content">
                                    ${O(It)}
                                </div>
                            `,pe(o,S,C,!0,A,M,Lt),ye(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying cached tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v&&(console.log("[Summary] Found news item for cached, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true")}return;case"done":A=u.token_usage||null;let _t=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,be=document.getElementById("summaryStreamContent");if(be){be.classList.remove("summary-streaming");let v=Ae(h);be.innerHTML=O(v)}let Bt=window._currentTypeConfidence||0;if(pe(o,S,C,!1,A,null,_t,Bt),ye(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v?(console.log("[Summary] Found news item, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true"):console.log("[Summary] News item not found in DOM")}break;case"short_content":I(),l.innerHTML=`
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
                            `,m.style.display="none";return;case"error":throw new Error(u.message)}}catch(u){if(u.message&&!u.message.includes("JSON"))throw u}}if(D&&h&&!document.querySelector('.summary-modal-footer[style*="flex"]')){console.log("[Summary] Stream ended without done event, showing fallback footer");let b=document.getElementById("summaryStreamContent");if(b){b.classList.remove("summary-streaming");let k=Ae(h);b.innerHTML=O(k)}pe(o,S,C,!1,A,null,null,0),ye(e,!0)}}catch(i){if(console.error("[Summary] Error:",i),I(),i.message&&(i.message.includes("\u8BBF\u95EE\u9650\u5236")||i.message.includes("\u65E0\u6CD5\u83B7\u53D6")||i.message.includes("\u65E0\u6CD5\u8BBF\u95EE")||i.message.includes("\u8BF7\u6C42\u5931\u8D25")))l.innerHTML=`
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
            `;else{Pe();return}}}function pe(e,t,o,n,s,a=null,r=null,d=null){let l=document.getElementById("summaryModalFooter"),m=mo[t]||"\u{1F4DD}",i="",c=s?.total_tokens||0;c>0&&(i=`<span class="summary-token-tag" title="\u672C\u6B21\u6D88\u8017">\u{1FA99} ${fo(c)}</span>`);let f=a==="up"?"active":"",p=a==="down"?"active":"";l.innerHTML=`
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
    `,l.style.display="flex"}async function po(e){if(!y)return;let t=document.querySelectorAll(".summary-feedback-btn"),o=document.querySelector(`.summary-feedback-btn[data-vote="${e}"]`),s=o?.classList.contains("active")?"none":e;t.forEach(a=>a.classList.remove("active")),s!=="none"&&o?.classList.add("active");try{let a=await fetch(`/api/summary/${encodeURIComponent(y)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vote:s})});a.ok||console.error("[Summary] Feedback failed:",await a.text())}catch(a){console.error("[Summary] Feedback error:",a)}}function Pe(){let e=document.getElementById("summaryModal");e&&(e.classList.remove("open"),document.body.style.overflow=""),I(),ge=!1,y=null}function dt(){let e=document.querySelector(`.news-summary-btn[data-news-id="${y}"]`);if(e){let t=e.dataset.title,o=e.dataset.url,n=e.dataset.sourceId,s=e.dataset.sourceName;He(y,t,o,n,s)}}async function yo(){if(y){try{await fetch(`/api/summary/${encodeURIComponent(y)}`,{method:"DELETE"})}catch(e){console.error("[Summary] Delete error:",e)}dt()}}async function go(e,t,o,n,s){let a=decodeURIComponent(t),r=decodeURIComponent(o),d=decodeURIComponent(s);vo(e,a,r,n,d)}async function vo(e,t,o,n,s){if(!T.getUser()){F();return}it();let r=document.getElementById("summaryModal"),d=document.getElementById("summaryModalBody"),l=document.getElementById("summaryModalFooter");y=e,_=t,W=o,ot=n,nt=s,d.innerHTML=`
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
    `,l.style.display="none",I(),Z=setTimeout(()=>{console.log("[Summary Force] 5s timeout, starting countdown");let m=document.getElementById("summarySlowHint"),i=document.getElementById("summaryCountdownText");m&&(m.style.display="block"),q=5;let c=()=>{i&&(i.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${q} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};c(),te=setInterval(()=>{q--,q>0?c():ne()},1e3),oe=setTimeout(()=>{console.log("[Summary Force] 10s timeout, showing click hint"),ne();let f=document.getElementById("summarySlowHint");f&&(f.innerHTML='\u52A0\u8F7D\u8F83\u6162\uFF0C\u8BF7 <a href="'+o+'" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">\u70B9\u51FB\u9605\u8BFB\u539F\u6587</a>')},st-ve)},ve),ee=setTimeout(()=>{rt(o,n,s),I();let m=document.getElementById("summaryModal");m&&(m.classList.remove("open"),document.body.style.overflow=""),ge=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},at);try{let m=await fetch("/api/summary/stream?force=1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!m.ok){let D=await m.json();throw new Error(D.detail||"\u751F\u6210\u5931\u8D25")}let i=m.body.getReader(),c=new TextDecoder,f="",p="other",h="\u5176\u4ED6",S=!1,C=null;for(;;){let{done:D,value:A}=await i.read();if(D)break;let k=c.decode(A,{stream:!0}).split(`
`);for(let se of k)if(se.startsWith("data: "))try{let g=JSON.parse(se.slice(6));switch(g.type){case"status":let Q=document.getElementById("summaryStatusText");Q&&(Q.textContent=g.message);break;case"type":p=g.article_type,h=g.article_type_name;break;case"chunk":S||(S=!0,I(),d.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),f+=g.content;let u=document.getElementById("summaryStreamContent");if(u){let M=f;M=M.replace(/\[TAGS_?START\][\s\S]*$/gi,""),u.innerHTML=O(M)+'<span class="summary-cursor">\u258C</span>',u.scrollTop=u.scrollHeight}break;case"done":I(),C=g.token_usage||null;let ae=g.token_balance!==void 0?{token_balance:g.token_balance,tokens_used:g.tokens_used,default_tokens:1e5}:null,N=document.getElementById("summaryStreamContent");if(N&&(N.classList.remove("summary-streaming"),N.innerHTML=O(f)),pe(o,p,h,!1,C,null,ae),ye(e,!0),g.tags&&window.ArticleTags){let M=document.querySelector(`.news-item[data-news-id="${e}"]`);M||(M=document.querySelector(`.news-item[data-url="${o}"]`)),M&&(window.ArticleTags.applyTags(M,g.tags),M.dataset.tagsLoaded="true")}break;case"error":throw new Error(g.message)}}catch(g){if(g.message&&!g.message.includes("JSON"))throw g}}}catch(m){if(console.error("[Summary] Force error:",m),I(),m.message&&(m.message.includes("\u8BBF\u95EE\u9650\u5236")||m.message.includes("\u65E0\u6CD5\u83B7\u53D6")||m.message.includes("\u65E0\u6CD5\u8BBF\u95EE")||m.message.includes("\u8BF7\u6C42\u5931\u8D25")))d.innerHTML=`
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
            `;else{Pe();return}}}function ye(e,t){let o=document.querySelector(`.news-summary-btn[data-news-id="${e}"]`);o&&(o.classList.toggle("has-summary",t),o.title=t?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3");let n=document.querySelector(`.news-item[data-news-id="${e}"]`);n&&n.classList.toggle("has-summary",t)}function lt(e,t,o,n,s,a){e.preventDefault(),e.stopPropagation(),He(t,o,n,s,a)}async function J(){try{if(!T.isLoggedIn())return;let e=await fetch("/api/summary/list");if(!e.ok)return;let t=await e.json();if(!t.ok||!t.news_ids)return;let o=new Set(t.news_ids);if(o.size===0)return;document.querySelectorAll(".news-item[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&n.classList.add("has-summary")}),document.querySelectorAll(".news-summary-btn[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&(n.classList.add("has-summary"),n.title="\u67E5\u770B\u603B\u7ED3")}),console.log(`[Summary] Marked ${o.size} summarized items`)}catch(e){console.error("[Summary] Failed to load summarized list:",e)}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{setTimeout(J,500)}):setTimeout(J,500);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){let e=window._lastSummarizedListLoad||0;Date.now()-e>3e4&&(console.log("[Summary] Page visible, reloading summarized list"),J())}});var wo=J;J=async function(){return window._lastSummarizedListLoad=Date.now(),wo()};function ho(){!y||!_||(ue(y,_,W),Fe(!0))}function bo(){if(!y||!_)return;let e=document.getElementById("summaryTodoPanel");e&&e.classList.contains("open")?(me(),Fe(!1)):(ue(y,_,W),Fe(!0))}function Fe(e){let t=document.getElementById("summaryTodoToggleBtn");t&&t.classList.toggle("active",e)}async function To(){if(!y||!_)return;let e=document.getElementById("summaryModalBody");if(!e)return;let o=e.innerHTML.match(/✅\s*行动清单[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);if(!o){window.showToast&&window.showToast("\u672A\u627E\u5230\u884C\u52A8\u6E05\u5355");return}let a=(o[1].match(/<li>([\s\S]*?)<\/li>/gi)||[]).map(r=>r.replace(/<\/?li>/gi,"").replace(/<[^>]+>/g,"").trim()).filter(r=>r.length>0);if(a.length===0){window.showToast&&window.showToast("\u884C\u52A8\u6E05\u5355\u4E3A\u7A7A");return}await Be(a,{groupId:y,groupTitle:_,groupUrl:W||"",isCustom:!1})}async function So(){if(!y||!_){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let e=await G(_,{groupId:y,groupTitle:_,groupUrl:W||"",isCustom:!1})}catch(e){console.error("[Summary] Add to todo error:",e),window.showToast&&window.showToast("\u6DFB\u52A0\u5931\u8D25")}}async function ko(){if(!y||!_){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let{addFavorite:e}=await import("./favorites-EDXYAKVJ.js"),t=await e({news_id:y,title:_,url:W||""});t.ok?window.showToast&&window.showToast("\u5DF2\u6536\u85CF"):t.error&&window.showToast&&window.showToast(t.error)}catch(e){console.error("[Summary] Add to favorites error:",e),window.showToast&&window.showToast("\u6536\u85CF\u5931\u8D25")}}document.addEventListener("click",e=>{let t=e.target.closest(".news-summary-btn");if(!t||t.hasAttribute("onclick"))return;e.preventDefault(),e.stopPropagation();let o=t.dataset.newsId,n=t.dataset.title||"",s=t.dataset.url||"",a=t.dataset.sourceId||"",r=t.dataset.sourceName||"";o&&lt(e,o,n,s,a,r)});window.openSummaryModal=He;window.closeSummaryModal=Pe;window.retrySummaryModal=dt;window.regenerateSummaryModal=yo;window.handleSummaryClick=lt;window.loadSummarizedList=J;window.handleSummaryFeedback=po;window.openCurrentTodoPanel=ho;window.toggleCurrentTodoPanel=bo;window.addActionListToTodo=To;window.forceSummary=go;window.addCurrentToTodo=So;window.addCurrentToFavorites=ko;var pt="hotnews_favorites_v1",yt="hotnews_favorites_width",Eo=500,qe=320,Oe=800,B=null,we=!1,R=!1;function he(){try{let e=localStorage.getItem(pt);return e?JSON.parse(e):[]}catch{return[]}}function gt(e){try{localStorage.setItem(pt,JSON.stringify(e))}catch(t){console.error("[Favorites] Failed to save to localStorage:",t)}}async function Lo(){try{let e=await fetch("/api/user/favorites");if(e.status===401)return{needsAuth:!0};if(!e.ok)throw new Error("Failed to fetch favorites");let t=await e.json();return t.ok?(B=t.favorites||[],{favorites:B}):{error:t.message||"Unknown error"}}catch(e){return console.error("[Favorites] Fetch error:",e),{error:e.message}}}async function Io(e){if(!T.getUser()){let o=he();return o.some(s=>s.news_id===e.news_id)||(o.unshift({...e,created_at:Math.floor(Date.now()/1e3)}),gt(o)),{ok:!0,local:!0}}try{let n=await(await fetch("/api/user/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json();return n.ok&&B&&B.unshift(n.favorite),n}catch(o){return console.error("[Favorites] Add error:",o),{ok:!1,error:o.message}}}async function vt(e){if(!T.getUser()){let n=he().filter(s=>s.news_id!==e);return gt(n),{ok:!0,local:!0}}try{let n=await(await fetch(`/api/user/favorites/${encodeURIComponent(e)}`,{method:"DELETE"})).json();return n.ok&&B&&(B=B.filter(s=>s.news_id!==e)),n}catch(o){return console.error("[Favorites] Remove error:",o),{ok:!1,error:o.message}}}function wt(e){return T.getUser()?B?B.some(o=>o.news_id===e):!1:he().some(n=>n.news_id===e)}async function ht(e,t){let o=e.news_id,n=wt(o);t&&(t.classList.toggle("favorited",!n),t.textContent=n?"\u2606":"\u2605");let s;return n?s=await vt(o):s=await Io(e),s.ok||t&&(t.classList.toggle("favorited",n),t.textContent=n?"\u2605":"\u2606"),s}function bt(e){if(!e)return"";let t=new Date(e*1e3),o=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${o}-${n}`}function _o(e){let t=document.getElementById("favoritesPanelBody");if(!t)return;if(!e||e.length===0){t.innerHTML=`
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
                            ${n.created_at?`<span>\u6536\u85CF\u4E8E ${bt(n.created_at)}</span>`:""}
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
    `;t.innerHTML=o}function ct(){let e=document.getElementById("favoritesPanelBody");if(!e)return;let t=he();t.length>0?e.innerHTML=`
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
                                ${o.created_at?`<span>\u6536\u85CF\u4E8E ${bt(o.created_at)}</span>`:""}
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
        `}async function Tt(){let e=document.getElementById("favoritesPanelBody");if(!e)return;if(e.innerHTML='<div class="favorites-loading">\u52A0\u8F7D\u4E2D...</div>',!T.getUser()){ct();return}let o=await Lo();if(o.needsAuth){ct();return}if(o.error){e.innerHTML=`
            <div class="favorites-empty">
                <div>\u52A0\u8F7D\u5931\u8D25: ${o.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    \u91CD\u8BD5
                </button>
            </div>
        `;return}_o(o.favorites)}function Bo(){if(!T.getUser()){F();return}let t=document.getElementById("favoritesPanel"),o=document.getElementById("favoritesOverlay");t&&(o||(o=document.createElement("div"),o.id="favoritesOverlay",o.className="favorites-overlay",o.onclick=St,document.body.appendChild(o)),we=!we,we?(t.classList.add("open"),o.classList.add("open"),Tt()):(t.classList.remove("open"),o.classList.remove("open")))}function St(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesOverlay");we=!1,e&&e.classList.remove("open"),t&&t.classList.remove("open")}async function Co(e){if((await vt(e)).ok){let o=document.querySelector(`.favorite-item[data-news-id="${e}"]`);o&&o.remove();let n=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);n&&(n.classList.remove("favorited"),n.textContent="\u2606");let s=document.querySelector(".favorites-list");s&&s.children.length===0&&Tt()}}function $o(e,t,o,n,s,a){if(e.preventDefault(),e.stopPropagation(),!T.getUser()){F();return}let d=e.currentTarget;ht({news_id:t,title:o,url:n,source_id:s||"",source_name:a||""},d)}function Mo(){try{let e=localStorage.getItem(yt);if(e){let t=parseInt(e,10);if(t>=qe&&t<=Oe)return t}}catch{}return Eo}function ut(e){try{localStorage.setItem(yt,String(e)),re.saveSidebarWidths({favorites_width:e})}catch{}}function xo(e){let t=document.getElementById("favoritesPanel");t&&(t.style.width=e+"px")}function mt(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesResizeHandle");if(!e||!t)return;let o=Mo();xo(o);let n=0,s=0;function a(c){c.preventDefault(),R=!0,n=c.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("mousemove",r),document.addEventListener("mouseup",d)}function r(c){if(!R)return;let f=n-c.clientX,p=s+f;p=Math.max(qe,Math.min(Oe,p)),e.style.width=p+"px"}function d(){R&&(R=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("mousemove",r),document.removeEventListener("mouseup",d),ut(e.offsetWidth))}function l(c){c.touches.length===1&&(c.preventDefault(),R=!0,n=c.touches[0].clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("touchmove",m,{passive:!1}),document.addEventListener("touchend",i))}function m(c){if(!R||c.touches.length!==1)return;c.preventDefault();let f=n-c.touches[0].clientX,p=s+f;p=Math.max(qe,Math.min(Oe,p)),e.style.width=p+"px"}function i(){R&&(R=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("touchmove",m),document.removeEventListener("touchend",i),ut(e.offsetWidth))}t.addEventListener("mousedown",a),t.addEventListener("touchstart",l,{passive:!1})}function ft(){document.addEventListener("click",e=>{let t=e.target.closest(".news-favorite-btn");if(!t)return;if(e.preventDefault(),e.stopPropagation(),!T.getUser()){F();return}let n=t.closest(".news-item");if(!n)return;let s=n.dataset.id||n.dataset.newsId,a=n.dataset.url,r=n.querySelector(".news-title"),d=r?r.textContent.trim():"",l=n.closest(".platform-card"),m=l?l.dataset.platform:"",i=l?l.querySelector(".platform-name"):null,c=i?i.textContent.replace("\u{1F4F1}","").trim():"";ht({news_id:s,title:d,url:a,source_id:m,source_name:c},t)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{mt(),ft()}):(mt(),ft());async function kt(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(!(!t||!o)){if(o.classList.contains("has-summary")){Et(e);return}o.disabled=!0,o.textContent="\u23F3",o.title="\u751F\u6210\u4E2D...",t.style.display="block",t.innerHTML=`
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
            `,B){let a=B.find(r=>r.news_id===e);a&&(a.summary=s.summary,a.summary_at=s.summary_at)}}else throw new Error(s.error||"\u751F\u6210\u5931\u8D25")}catch(n){console.error("[Favorites] Summary error:",n),t.innerHTML=`
            <div class="summary-error">
                <span>\u274C ${n.message}</span>
                <button onclick="handleFavoriteSummaryClick('${e}')" style="margin-left:8px;">\u91CD\u8BD5</button>
            </div>
        `,o.textContent="\u{1F4DD}",o.title="AI \u603B\u7ED3"}finally{o.disabled=!1}}}function Et(e){let t=document.getElementById(`summary-${e}`);if(!t)return;let o=t.style.display!=="none";t.style.display=o?"none":"block";let n=t.querySelector(".summary-toggle-btn");n&&(n.textContent=o?"\u5C55\u5F00":"\u6536\u8D77")}async function Ao(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(t){try{await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"DELETE"})}catch(n){console.error("[Favorites] Delete summary error:",n)}if(o&&(o.classList.remove("has-summary"),o.textContent="\u{1F4DD}"),B){let n=B.find(s=>s.news_id===e);n&&(n.summary=null,n.summary_at=null)}await kt(e)}}window.toggleFavoritesPanel=Bo;window.closeFavoritesPanel=St;window.removeFavoriteFromPanel=Co;window.handleFavoriteClick=$o;window.isFavorited=wt;window.handleFavoriteSummaryClick=kt;window.toggleSummaryDisplay=Et;window.regenerateSummary=Ao;export{F as a,_e as b,ao as c,Io as d,vt as e,wt as f,ht as g,Bo as h,St as i,$o as j};
