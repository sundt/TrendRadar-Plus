import{a as T,b as te}from"./chunk-ICSVECP2.js";var he="",oe=0,F=null,Q=null,R=null,A=null,Ae=300;function St(){return navigator.userAgent.toLowerCase().indexOf("micromessenger")!==-1}function x(){if(St()){window.location.href="/api/auth/oauth/wechat-mp";return}let e=document.getElementById("loginModal");e&&(e.style.display="flex",Te(),V(1),be())}function ne(){let e=document.getElementById("loginModal");e&&(e.style.display="none"),F&&(clearInterval(F),F=null),se(),Se(),Te();let t=document.getElementById("login-email"),o=document.getElementById("login-code");t&&(t.value=""),o&&(o.value="")}async function be(){let e=document.getElementById("login-qr-loading"),t=document.getElementById("login-qr-image"),o=document.getElementById("login-qr-expired"),n=document.getElementById("login-qr-countdown");e&&(e.style.display="flex"),t&&(t.style.display="none"),o&&(o.style.display="none"),n&&(n.style.display="none"),se();try{let a=await(await fetch("/api/auth/wechat-qr/create",{method:"POST",headers:{"Content-Type":"application/json"}})).json();a.ok&&a.qr_url?(Q=a.session_id,Ae=a.expire_seconds||300,t&&(t.src=a.qr_url,t.onload=()=>{e&&(e.style.display="none"),t.style.display="block"},t.onerror=()=>{e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u52A0\u8F7D\u5931\u8D25")}),kt(Ae),Lt()):(e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent=a.message||"\u52A0\u8F7D\u5931\u8D25"))}catch(s){console.error("Failed to load WeChat QR:",s),e&&(e.style.display="none"),o&&(o.style.display="flex",o.querySelector("span").textContent="\u7F51\u7EDC\u9519\u8BEF")}}function Et(){be()}function kt(e){let t=document.getElementById("login-qr-countdown"),o=document.getElementById("login-qr-countdown-text");if(!t||!o)return;let n=e;t.style.display="block";let s=()=>{let a=Math.floor(n/60),r=n%60;o.textContent=`${a}:${r.toString().padStart(2,"0")}`,n<60?t.classList.add("warning"):t.classList.remove("warning")};s(),A=setInterval(()=>{n--,n<=0?(clearInterval(A),A=null,qe()):s()},1e3)}function qe(){let e=document.getElementById("login-qr-image"),t=document.getElementById("login-qr-expired"),o=document.getElementById("login-qr-countdown");e&&(e.style.display="none"),t&&(t.style.display="flex",t.querySelector("span").textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F"),o&&(o.style.display="none"),se()}function Lt(){if(!Q)return;let e=async()=>{let t=Q;if(t)try{let n=await(await fetch(`/api/auth/wechat-qr/status?session_id=${encodeURIComponent(t)}`)).json();if(n.status==="confirmed"&&n.session_token){R&&(clearInterval(R),R=null),A&&(clearInterval(A),A=null),E("\u767B\u5F55\u6210\u529F","success");try{await fetch(`/api/auth/wechat-qr/confirm-cookie?session_id=${encodeURIComponent(t)}`,{method:"POST",headers:{"Content-Type":"application/json"}})}catch(s){console.error("Failed to set cookie:",s)}Q=null,setTimeout(()=>{ne(),window.location.reload()},500);return}else if(n.status==="scanned")E("\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4","success");else if(n.status==="expired"){qe();return}}catch(o){console.error("Polling error:",o)}};R=setInterval(e,2e3),e()}function se(){R&&(clearInterval(R),R=null),A&&(clearInterval(A),A=null),Q=null}function It(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="none"),t&&(t.style.display="block"),se(),setTimeout(()=>{let o=document.getElementById("login-email");o&&o.focus()},100)}function Te(){let e=document.getElementById("login-main"),t=document.getElementById("login-email-form");e&&(e.style.display="block"),t&&(t.style.display="none"),V(1),Se(),be()}function _t(e){e.target.id==="loginModal"&&ne()}function E(e,t){let o=document.getElementById("login-message");o&&(o.textContent=e,o.className="login-message "+t)}function Se(){let e=document.getElementById("login-message");e&&(e.className="login-message")}function V(e){document.querySelectorAll(".login-step").forEach(o=>o.classList.remove("active"));let t=document.getElementById("login-step-"+e);t&&t.classList.add("active"),document.querySelectorAll(".login-step-dot").forEach((o,n)=>{o.classList.toggle("active",n<e)}),Se()}function Bt(){V(1),F&&(clearInterval(F),F=null)}function He(){oe=60;let e=document.getElementById("login-resend-btn"),t=document.getElementById("login-resend-text");e&&(e.disabled=!0),F=setInterval(()=>{oe--,oe<=0?(clearInterval(F),F=null,e&&(e.disabled=!1),t&&(t.textContent="\u91CD\u65B0\u53D1\u9001")):t&&(t.textContent=oe+"\u79D2\u540E\u91CD\u53D1")},1e3)}async function Ct(e){e.preventDefault();let t=document.getElementById("login-send-btn"),o=document.getElementById("login-email").value.trim();if(!o){E("\u8BF7\u8F93\u5165\u90AE\u7BB1","error");return}t&&(t.disabled=!0,t.textContent="\u53D1\u9001\u4E2D...");try{let n=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:o})}),s=await n.json();if(n.ok){he=o;let a=document.getElementById("login-display-email");a&&(a.textContent=o),V(2);let r=document.getElementById("login-code");r&&r.focus(),He()}else{let a=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u53D1\u9001\u5931\u8D25";E(a,"error")}}catch{E("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u83B7\u53D6\u9A8C\u8BC1\u7801")}async function $t(){let e=document.getElementById("login-resend-btn");e&&(e.disabled=!0);try{let t=await fetch("/api/auth/send-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:he})}),o=await t.json();if(t.ok)E("\u9A8C\u8BC1\u7801\u5DF2\u91CD\u65B0\u53D1\u9001","success"),He();else{let n=typeof o.detail=="string"?o.detail:o.detail?.[0]?.msg||o.message||"\u53D1\u9001\u5931\u8D25";E(n,"error"),e&&(e.disabled=!1)}}catch{E("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error"),e&&(e.disabled=!1)}}async function Mt(e){e.preventDefault();let t=document.getElementById("login-verify-btn"),o=document.getElementById("login-code").value.trim();if(!o||o.length!==6){E("\u8BF7\u8F93\u51656\u4F4D\u9A8C\u8BC1\u7801","error");return}t&&(t.disabled=!0,t.textContent="\u767B\u5F55\u4E2D...");try{let n=await fetch("/api/auth/verify-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:he,code:o})}),s=await n.json();if(n.ok)E("\u767B\u5F55\u6210\u529F","success"),setTimeout(()=>{ne(),window.location.reload()},500);else{let a=typeof s.detail=="string"?s.detail:s.detail?.[0]?.msg||s.message||"\u9A8C\u8BC1\u5931\u8D25";E(a,"error")}}catch{E("\u7F51\u7EDC\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5","error")}t&&(t.disabled=!1,t.textContent="\u767B\u5F55")}function Pe(){let e=document.getElementById("login-code");e&&e.addEventListener("input",function(t){this.value=this.value.replace(/[^0-9]/g,"").slice(0,6)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Pe):Pe();window.openLoginModal=x;window.closeLoginModal=ne;window.closeLoginModalOnOverlay=_t;window.loginSendCode=Ct;window.loginVerifyCode=Mt;window.loginResendCode=$t;window.loginGoBack=Bt;window.loginGoToStep=V;window.loginShowMessage=E;window.loginShowEmailForm=It;window.loginHideEmailForm=Te;window.refreshWechatQR=Et;var k=[],W=!1,Re=!1,Ue=!1,je=null;function U(){return T.getUser()?!0:(x(),!1)}async function xt(e=null){let t="/api/user/todos";e&&(t+=`?group_id=${encodeURIComponent(e)}`);let o=await fetch(t);if(!o.ok){if(o.status===401)return[];throw new Error("\u83B7\u53D6 Todo \u5931\u8D25")}return(await o.json()).todos||[]}async function Ft(e){let t=await fetch("/api/user/todos",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function At(e,t){let o=await fetch(`/api/user/todos/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!o.ok){let n=await o.json();throw new Error(n.detail||"\u66F4\u65B0\u5931\u8D25")}return await o.json()}async function Pt(e){let t=await fetch(`/api/user/todos/${e}`,{method:"DELETE"});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u5220\u9664\u5931\u8D25")}return await t.json()}async function qt(e){let t=await fetch("/api/user/todos/batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({todos:e})});if(!t.ok){let o=await t.json();throw new Error(o.detail||"\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return await t.json()}async function Le(){if(!U())return[];try{return k=await xt(),X(),k}catch(e){return console.error("[Todo] Load error:",e),[]}}async function z(e,t){if(!U())return null;try{let o=await Ft({text:e,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1});if(o.ok&&o.todo)return k.unshift(o.todo),X(),C("\u5DF2\u6DFB\u52A0\u5230 Todo"),o.todo}catch(o){o.message.includes("\u5DF2\u5B58\u5728")?C("\u8BE5 Todo \u5DF2\u5B58\u5728"):C("\u6DFB\u52A0\u5931\u8D25: "+o.message),console.error("[Todo] Add error:",o)}return null}async function Ht(e){if(!U())return;let t=k.find(n=>n.id===e);if(!t)return;let o=!t.done;try{await At(e,{done:o}),t.done=o,K(),de(),X()}catch(n){console.error("[Todo] Toggle error:",n),C("\u66F4\u65B0\u5931\u8D25")}}async function Ot(e){if(U())try{await Pt(e),k=k.filter(t=>t.id!==e),K(),de(),X(),C("\u5DF2\u5220\u9664")}catch(t){console.error("[Todo] Delete error:",t),C("\u5220\u9664\u5931\u8D25")}}async function Ie(e,t){if(!U())return null;let o=e.map(n=>({text:n,group_id:t.groupId,group_title:t.groupTitle,group_url:t.groupUrl||"",is_custom_group:t.isCustom||!1}));try{let n=await qt(o);if(n.ok){n.added&&n.added.length>0&&(k=[...n.added,...k],X());let s=n.skipped_count>0?`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\uFF0C${n.skipped_count} \u9879\u5DF2\u5B58\u5728`:`\u5DF2\u6DFB\u52A0 ${n.added_count} \u9879\u5230 Todo`;return C(s),n}}catch(n){console.error("[Todo] Batch add error:",n),C("\u6279\u91CF\u6DFB\u52A0\u5931\u8D25")}return null}function _e(e){return k.filter(t=>t.source.groupId===e)}function Dt(){return k.filter(e=>!e.done).length}function Nt(){let e={};for(let t of k){let o=t.source.groupId;e[o]||(e[o]={groupId:o,groupTitle:t.source.groupTitle,groupUrl:t.source.groupUrl,isCustom:t.source.isCustom,todos:[]}),e[o].todos.push(t)}return Object.values(e)}function $(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}function C(e){if(window.showToast)window.showToast(e);else{let t=document.createElement("div");t.className="todo-toast",t.textContent=e,document.body.appendChild(t),setTimeout(()=>t.classList.add("show"),10),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},2e3)}}function X(){let e=document.getElementById("todoBadge");if(!e)return;let t=Dt();t>0?(e.textContent=t>99?"99+":t,e.classList.add("show")):e.classList.remove("show")}var We="todo_sidebar_width",Rt=320,Ut=800;function jt(){if(document.getElementById("todoSidebar"))return;let e=document.createElement("div");e.id="todoSidebarBackdrop",e.className="todo-sidebar-backdrop",document.body.appendChild(e),document.body.insertAdjacentHTML("beforeend",`
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
    `);let o=localStorage.getItem(We);if(o){let i=document.getElementById("todoSidebar");i.style.width=o+"px"}let s=document.getElementById("todoSidebar").querySelector(".todo-close-btn"),a=document.getElementById("todoFilterBtn"),r=document.getElementById("todoNewGroupBtn");e.addEventListener("click",Ee),s.addEventListener("click",Ee),a.addEventListener("click",zt),r.addEventListener("click",Gt),Wt()}function Wt(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoResizeHandle");if(!e||!t)return;let o=!1,n=0,s=0;t.addEventListener("mousedown",a=>{o=!0,n=a.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),a.preventDefault()}),document.addEventListener("mousemove",a=>{if(!o)return;let r=n-a.clientX,i=s+r;i=Math.max(Rt,Math.min(Ut,i)),e.style.width=i+"px"}),document.addEventListener("mouseup",()=>{o&&(o=!1,e.classList.remove("resizing"),t.classList.remove("active"),localStorage.setItem(We,e.offsetWidth),te.saveSidebarWidths({todo_width:e.offsetWidth}))})}function ze(){if(!U())return;jt();let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e.classList.add("open"),t.classList.add("show"),Re=!0,Le().then(()=>K())}function Ee(){let e=document.getElementById("todoSidebar"),t=document.getElementById("todoSidebarBackdrop");e&&e.classList.remove("open"),t&&t.classList.remove("show"),Re=!1}function zt(){W=!W;let e=document.getElementById("todoFilterBtn");e&&(e.textContent=W?"\u53EA\u770B\u672A\u5B8C\u6210":"\u663E\u793A\u5168\u90E8"),K()}function Gt(){let e=document.getElementById("todoSidebarBody");if(!e||e.querySelector(".todo-new-group-input"))return;e.insertAdjacentHTML("afterbegin",`
        <div class="todo-new-group-input">
            <input type="text" placeholder="\u8F93\u5165\u65B0\u6807\u9898\u540D\u79F0..." class="todo-group-name-input" autofocus>
            <button class="todo-group-create-btn">\u521B\u5EFA</button>
            <button class="todo-group-cancel-btn">\u53D6\u6D88</button>
        </div>
    `);let o=e.querySelector(".todo-group-name-input"),n=e.querySelector(".todo-group-create-btn"),s=e.querySelector(".todo-group-cancel-btn");o.focus();let a=()=>{let r=o.value.trim();if(!r){C("\u8BF7\u8F93\u5165\u6807\u9898\u540D\u79F0");return}let i=`custom_${Date.now()}`;Be(i,r,"",!0),e.querySelector(".todo-new-group-input")?.remove()};n.addEventListener("click",a),s.addEventListener("click",()=>{e.querySelector(".todo-new-group-input")?.remove()}),o.addEventListener("keydown",r=>{r.key==="Enter"&&a(),r.key==="Escape"&&e.querySelector(".todo-new-group-input")?.remove()})}function Be(e,t,o,n){let s=document.getElementById("todoSidebarBody");if(!s)return;let a=s.querySelector(`.todo-group[data-group-id="${e}"]`);if(a){a.classList.remove("collapsed");let c=ae();c[e]=!1,ke(c)}else{let c=ae();c[e]=!1,ke(c);let m=`
            <div class="todo-group" data-group-id="${$(e)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${$(t)}">${$(t)}</span>
                    <span class="todo-group-count">0/0</span>
                    <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner"></div>
                </div>
            </div>
        `;s.insertAdjacentHTML("afterbegin",m),a=s.querySelector(`.todo-group[data-group-id="${e}"]`),a.querySelector(".todo-group-add-btn").addEventListener("click",S=>{S.stopPropagation(),Be(e,t,o,n)}),a.querySelector(".todo-group-header")?.addEventListener("click",S=>{S.target.closest(".todo-group-add-btn")||Je(e)})}let r=a.querySelector(".todo-group-items-inner");if(!r||r.querySelector(".todo-add-input"))return;r.insertAdjacentHTML("afterbegin",`
        <div class="todo-add-input">
            <input type="text" placeholder="\u8F93\u5165 Todo \u5185\u5BB9..." class="todo-text-input" autofocus>
            <button class="todo-add-confirm-btn">\u6DFB\u52A0</button>
        </div>
    `);let l=r.querySelector(".todo-text-input"),f=r.querySelector(".todo-add-confirm-btn");l.focus();let d=async()=>{let c=l.value.trim();if(!c){C("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}await z(c,{groupId:e,groupTitle:t,groupUrl:o||"",isCustom:n||!1})&&(l.value="",K())};f.addEventListener("click",d),l.addEventListener("keydown",c=>{c.key==="Enter"&&d(),c.key==="Escape"&&r.querySelector(".todo-add-input")?.remove()})}function K(){let e=document.getElementById("todoSidebarBody");if(!e)return;if((W?k:k.filter(s=>!s.done)).length===0){e.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let o=Nt(),n="";for(let s of o){let a=W?s.todos:s.todos.filter(m=>!m.done);if(a.length===0&&!W)continue;let r=s.todos.filter(m=>!m.done).length,i=s.todos.length,l=Oe(s.groupId),d=s.isCustom?"":`
            <button class="todo-group-summary-btn" title="\u67E5\u770B\u603B\u7ED3" data-group-id="${$(s.groupId)}" data-group-title="${$(s.groupTitle)}" data-group-url="${$(s.groupUrl||"")}">\u2728</button>
        `,c=s.groupUrl?`
            <a href="${$(s.groupUrl)}" target="_blank" rel="noopener noreferrer" class="todo-group-link-btn" title="\u67E5\u770B\u539F\u6587" onclick="event.stopPropagation()">\u{1F517}</a>
        `:"";n+=`
            <div class="todo-group ${l?"collapsed":""}" data-group-id="${$(s.groupId)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">\u25BC</span>
                    <span class="todo-group-title" title="${$(s.groupTitle)}">${$(s.groupTitle)}</span>
                    <span class="todo-group-count">${r}/${i}</span>
                    <div class="todo-group-actions">
                        ${c}
                        ${d}
                        <button class="todo-group-add-btn" title="\u6DFB\u52A0 Todo">+</button>
                    </div>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner">
                        ${a.map(m=>Qe(m)).join("")}
                    </div>
                </div>
            </div>
        `}e.innerHTML=n,e.querySelectorAll(".todo-group").forEach(s=>{let a=s.dataset.groupId,r=o.find(d=>d.groupId===a);if(!r)return;s.querySelector(".todo-group-add-btn")?.addEventListener("click",d=>{d.stopPropagation(),Be(a,r.groupTitle,r.groupUrl,r.isCustom)}),s.querySelector(".todo-group-summary-btn")?.addEventListener("click",d=>{d.stopPropagation(),Jt(r.groupId,r.groupTitle,r.groupUrl)}),s.querySelector(".todo-group-header")?.addEventListener("click",d=>{d.target.closest(".todo-group-add-btn")||d.target.closest(".todo-group-summary-btn")||Je(a)}),Oe(a)&&s.classList.add("collapsed")}),Ve(e)}function Jt(e,t,o){window.openSummaryModal&&window.openSummaryModal(e,t,o,"","")}var Ge="todo_collapsed_groups";function ae(){try{let e=localStorage.getItem(Ge);return e?JSON.parse(e):{}}catch{return{}}}function ke(e){try{localStorage.setItem(Ge,JSON.stringify(e))}catch{}}function Oe(e){return ae()[e]!==!1}function Je(e){let t=ae(),o=t[e]!==!1;t[e]=!o,ke(t);let n=document.querySelector(`.todo-group[data-group-id="${e}"]`);n&&n.classList.toggle("collapsed",!o)}function Qe(e){return`
        <div class="todo-item ${e.done?"done":""}" data-id="${e.id}">
            <input type="checkbox" class="todo-checkbox" ${e.done?"checked":""}>
            <span class="todo-text">${$(e.text)}</span>
            <button class="todo-delete-btn" title="\u5220\u9664">\xD7</button>
        </div>
    `}function Ve(e){e.querySelectorAll(".todo-item").forEach(t=>{let o=parseInt(t.dataset.id),n=t.querySelector(".todo-checkbox"),s=t.querySelector(".todo-delete-btn");n?.addEventListener("change",()=>Ht(o)),s?.addEventListener("click",a=>{a.stopPropagation(),Ot(o)})})}function Qt(){if(document.getElementById("summaryTodoPanel"))return;let e=`
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
    `,t=document.getElementById("summaryModalFooter");t?t.insertAdjacentHTML("beforebegin",e):document.body.insertAdjacentHTML("beforeend",e);let o=document.getElementById("summaryTodoPanel"),n=o.querySelector(".summary-todo-close-btn"),s=o.querySelector(".summary-todo-add-btn"),a=document.getElementById("summaryTodoInput");n.addEventListener("click",ie),s.addEventListener("click",De),a.addEventListener("keydown",r=>{r.key==="Enter"&&De()})}function re(e,t,o){if(!U())return;Qt(),je=e;let n=document.getElementById("summaryTodoPanel");n.classList.add("open"),n.dataset.groupId=e,n.dataset.groupTitle=t,n.dataset.groupUrl=o||"",Ue=!0,de()}function ie(){let e=document.getElementById("summaryTodoPanel");e&&e.classList.remove("open"),Ue=!1,je=null}async function De(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoInput");if(!e||!t)return;let o=t.value.trim();if(!o){C("\u8BF7\u8F93\u5165 Todo \u5185\u5BB9");return}let n=e.dataset.groupId,s=e.dataset.groupTitle,a=e.dataset.groupUrl;await z(o,{groupId:n,groupTitle:s,groupUrl:a,isCustom:!1})&&(t.value="",de())}function de(){let e=document.getElementById("summaryTodoPanel"),t=document.getElementById("summaryTodoBody");if(!e||!t)return;let o=e.dataset.groupId;if(!o){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo</div>';return}let n=_e(o);if(n.length===0){t.innerHTML='<div class="todo-empty">\u6682\u65E0 Todo\uFF0C\u53EF\u5728\u4E0A\u65B9\u8F93\u5165\u6DFB\u52A0</div>';return}t.innerHTML=n.map(s=>Qe(s)).join(""),Ve(t)}function Vt(e){return _e(e).filter(t=>!t.done).length}var w=null,Ne=!1;function Xe(){if(Ne)return;Ne=!0,w=document.createElement("button"),w.className="selection-todo-btn",w.type="button",w.textContent="+Todo",w.style.display="none",document.body.appendChild(w);let e=()=>{w.style.display="none",w.dataset.selectionText="",w._source=null},t=()=>{let n=window.getSelection();if(!n||n.isCollapsed)return null;let s=n.toString();if(!String(s||"").trim())return null;let a=n.rangeCount?n.getRangeAt(0):null;if(!a)return null;let r=a.commonAncestorContainer,i=r?.nodeType===Node.ELEMENT_NODE?r:r?.parentElement;if(!i)return null;let l=document.getElementById("summaryModalBody");return!l||!l.contains(i)||i.closest&&i.closest(".summary-todo-panel")?null:{text:s.trim(),range:a}},o=()=>{let n=t();if(!n){e();return}let s=n.range.getBoundingClientRect();if(!s||!s.width&&!s.height){e();return}let a=64,r=32,i=8,l=Math.min(window.innerWidth-a-i,Math.max(i,s.right-a)),f=Math.min(window.innerHeight-r-i,Math.max(i,s.bottom+i));w.style.left=`${l}px`,w.style.top=`${f}px`,w.style.display="block",w.dataset.selectionText=n.text};w.addEventListener("click",async()=>{let n=w.dataset.selectionText||"";if(!n)return;let s=window._currentSummaryNewsId,a=window._currentSummaryNewsTitle,r=window._currentSummaryNewsUrl;if(!s||!a){C("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}await z(n,{groupId:s,groupTitle:a,groupUrl:r||"",isCustom:!1});try{window.getSelection()?.removeAllRanges()}catch{}e()}),document.addEventListener("mouseup",()=>setTimeout(o,0)),document.addEventListener("keyup",()=>setTimeout(o,0)),document.addEventListener("touchend",()=>setTimeout(o,100)),document.addEventListener("selectionchange",()=>{setTimeout(o,50)}),document.addEventListener("scroll",e,!0),window.addEventListener("resize",e),document.addEventListener("mousedown",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")}),document.addEventListener("touchstart",n=>{w.contains(n.target)||n.target.closest&&n.target.closest(".selection-todo-btn")})}function Xt(){let e=document.createElement("button");return e.className="icon-btn todo-btn",e.id="todoBtn",e.title="\u6211\u7684 Todo",e.innerHTML='\u{1F4CB}<span class="todo-badge" id="todoBadge"></span>',e.addEventListener("click",ze),e}function Kt(){let e=document.getElementById("favoritesBtn");if(e&&e.parentNode){let o=Xt();e.parentNode.insertBefore(o,e)}T.getUser()&&Le()}window.openTodoSidebar=ze;window.closeTodoSidebar=Ee;window.openTodoPanel=re;window.closeTodoPanel=ie;window.addTodo=z;window.batchAddTodos=Ie;window.loadTodos=Le;window.getTodosByGroupId=_e;window.getCurrentTodoCount=Vt;window.initTodoButton=Kt;var Y=!1,y=null,L=null,j=null,Yt=null,Zt=null,le=null,ce=null,Ke=5e3,eo=1e4,to=15e3,ue=null,Z=5,me=null;function oo(){le&&(clearTimeout(le),le=null)}function no(){ce&&(clearTimeout(ce),ce=null)}function Ye(){ue&&(clearInterval(ue),ue=null),me&&(clearTimeout(me),me=null),Z=5}function P(){oo(),no(),Ye()}async function so(e,t,o){try{await fetch("/api/summary/failures/record",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:e,reason:"client_timeout",error_detail:"\u5BA2\u6237\u7AEF 10 \u79D2\u8D85\u65F6",source_id:t||null,source_name:o||null})}),console.log("[Summary] Recorded client timeout for:",e)}catch(n){console.error("[Summary] Failed to record client timeout:",n)}}var ao={news:"\u{1F4F0}",policy:"\u26A0\uFE0F",business:"\u{1F4CA}",tutorial:"\u2705",research:"\u{1F4DA}",product:"\u{1F680}",opinion:"\u{1F4AD}",interview:"\u{1F4AC}",listicle:"\u{1F4D1}",lifestyle:"\u2705",general:"\u{1F4DD}","tech-tutorial":"\u2705",trend:"\u{1F4CA}",other:"\u{1F4DD}"};function ro(e){let t=e||0;return t>=1e3?(t/1e3).toFixed(1).replace(/\.0$/,"")+"K":t.toString()}function Ce(e){if(!e)return e;let t=e.replace(/\[TAGS_?START\][\s\S]*?\[TAGS_?END\]/gi,"");return t=t.replace(/\n*-{3,}\s*$/g,""),t.trim()}function q(e){if(!e)return"";let t=e.replace(/<br\s*\/?>/gi,`
`).replace(/<\/br>/gi,`
`);t=t.replace(/- \[ \]/g,"-"),t=t.replace(/- \[\]/g,"-"),t=t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),t=t.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code class="language-$1">$2</code></pre>'),t=t.replace(/`([^`]+)`/g,"<code>$1</code>"),t=t.replace(/^#{4}\s+(.+)$/gm,"<h4>$1</h4>"),t=t.replace(/^#{3}\s+(.+)$/gm,"<h3>$1</h3>"),t=t.replace(/^#{2}\s+(.+)$/gm,"<h2>$1</h2>"),t=t.replace(/^#{1}\s+(.+)$/gm,"<h1>$1</h1>"),t=t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),t=t.replace(/\*([^*]+)\*/g,"<em>$1</em>"),t=t.replace(/__([^_]+)__/g,"<strong>$1</strong>"),t=t.replace(/_([^_]+)_/g,"<em>$1</em>"),t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'),t=t.replace(/^&gt;\s*(.*)$/gm,"<blockquote>$1</blockquote>"),t=t.replace(/<\/blockquote>\n<blockquote>/g,`
`),t=t.replace(/^[-]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[*]{3,}\s*$/gm,"<hr>"),t=t.replace(/^[_]{3,}\s*$/gm,"<hr>");let o=t.split(`
`),n=[],s=!1,a=[],r=!1,i=[];for(let l=0;l<o.length;l++){let f=o[l],d=f.trim(),c=/^\|(.+)\|$/.test(d),m=/^\|[\s\-:|]+\|$/.test(d),p=d.match(/^[-*]\s+(.+)$/),h=d.match(/^\d+\.\s+(.+)$/),S=p||h;if(c){if(r&&i.length>0&&(n.push("<ul>"+i.join("")+"</ul>"),i=[],r=!1),s||(s=!0,a=[]),!m){let _=d.slice(1,-1).split("|").map(B=>B.trim()),M=a.length===0?"th":"td",b="<tr>"+_.map(B=>`<${M}>${B}</${M}>`).join("")+"</tr>";a.push(b)}continue}else s&&a.length>0&&(n.push("<table>"+a.join("")+"</table>"),a=[],s=!1);if(S){let _=p?p[1]:h[1];r=!0,i.push("<li>"+_+"</li>");continue}else r&&i.length>0&&(n.push("<ul>"+i.join("")+"</ul>"),i=[],r=!1);n.push(f)}return s&&a.length>0&&n.push("<table>"+a.join("")+"</table>"),r&&i.length>0&&n.push("<ul>"+i.join("")+"</ul>"),t=n.join(`
`),t=t.split(/\n{2,}/).map(l=>(l=l.trim(),l?/^<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(l)||/<\/(h[1-6]|ul|ol|table|pre|blockquote)>$/.test(l)?l:"<p>"+l.replace(/\n/g,"<br>")+"</p>":"")).join(`
`),t=t.replace(/<p>\s*<\/p>/g,""),t=t.replace(/<p><hr><\/p>/g,"<hr>"),t=t.replace(/<p>(<table>)/g,"$1"),t=t.replace(/(<\/table>)<\/p>/g,"$1"),t=t.replace(/<p>(<ul>)/g,"$1"),t=t.replace(/(<\/ul>)<\/p>/g,"$1"),t=t.replace(/<p>(<blockquote>)/g,"$1"),t=t.replace(/(<\/blockquote>)<\/p>/g,"$1"),t=t.replace(/(<h[1-3]>(?:✅\s*|📋\s*)?行动清单\s*<\/h[1-3]>)/gi,'<div class="action-list-header">$1<button class="action-list-add-btn" onclick="addActionListToTodo()">+ Todo</button></div>'),t}function Ze(){if(document.getElementById("summaryModal"))return;document.body.insertAdjacentHTML("beforeend",`
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
    `)}async function Me(e,t,o,n,s){if(!T.getUser()){x();return}Ze();let r=document.getElementById("summaryModal"),i=document.getElementById("summaryModalTitle"),l=document.getElementById("summaryModalBody"),f=document.getElementById("summaryModalFooter");if(y=e,L=t,j=o,Yt=n,Zt=s,Y=!0,window._currentSummaryNewsId=e,window._currentSummaryNewsTitle=t,window._currentSummaryNewsUrl=o,Xe(),i){let d=t&&t.length>50?t.substring(0,50)+"...":t||"AI \u603B\u7ED3";i.textContent=`\u2728 ${d}`}r.classList.add("open"),document.body.style.overflow="hidden",l.innerHTML=`
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
    `,f.style.display="none",P(),le=setTimeout(()=>{console.log("[Summary] 5s timeout, starting countdown");let d=document.getElementById("summarySlowHint"),c=document.getElementById("summaryCountdownText");d&&(d.style.display="block"),Z=5;let m=()=>{c&&(c.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${Z} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};m(),ue=setInterval(()=>{Z--,Z>0?m():Ye()},1e3),me=setTimeout(()=>{console.log("[Summary] 10s timeout, opening original article"),P();let p=document.getElementById("summaryModal");p&&(p.classList.remove("open"),document.body.style.overflow=""),Y=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},eo-Ke)},Ke),ce=setTimeout(()=>{so(o,n,s),P();let d=document.getElementById("summaryModal");d&&(d.classList.remove("open"),document.body.style.overflow=""),Y=!1,y=null,o&&window.open(o,"_blank","noopener,noreferrer")},to);try{let d=await fetch(`/api/summary/failures/check?url=${encodeURIComponent(o)}`);if(d.ok){let b=await d.json();if(console.log("[Summary] Check result:",b),b.summarizable)b.warning&&console.log("[Summary] Warning:",b.warning);else{console.log("[Summary] URL blocked, opening original:",o),P();let B=document.getElementById("summaryModal");B&&(B.classList.remove("open"),document.body.style.overflow=""),Y=!1,y=null,window.open(o,"_blank");return}}let c=await fetch("/api/summary/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!c.ok){let b=await c.json();throw new Error(b.detail||"\u751F\u6210\u5931\u8D25")}let m=c.body.getReader(),p=new TextDecoder,h="",S="other",_="\u5176\u4ED6",H=!1,M=null;for(;;){let{done:b,value:B}=await m.read();if(b)break;let g=p.decode(B,{stream:!0}).split(`
`);for(let J of g)if(J.startsWith("data: "))try{let u=JSON.parse(J.slice(6));switch(u.type){case"status":let ee=document.getElementById("summaryStatusText");ee&&(ee.textContent=u.message);break;case"type":S=u.article_type,_=u.article_type_name,window._currentTypeConfidence=u.confidence||0;break;case"chunk":H||(H=!0,P(),l.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),h+=u.content;let O=document.getElementById("summaryStreamContent");if(O){let v=h;v=v.replace(/\[TAGS_?START\][\s\S]*$/gi,""),O.innerHTML=q(v)+'<span class="summary-cursor">\u258C</span>',O.scrollTop=O.scrollHeight}break;case"cached":P(),h=u.summary,S=u.article_type,_=u.article_type_name,M=u.token_usage||null;let N=u.feedback||null,wt=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,ht=Ce(h);if(l.innerHTML=`
                                <div class="summary-content">
                                    ${q(ht)}
                                </div>
                            `,fe(o,S,_,!0,M,N,wt),pe(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying cached tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v&&(console.log("[Summary] Found news item for cached, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true")}return;case"done":M=u.token_usage||null;let bt=u.token_balance!==void 0?{token_balance:u.token_balance,tokens_used:u.tokens_used,default_tokens:1e5}:null,we=document.getElementById("summaryStreamContent");if(we){we.classList.remove("summary-streaming");let v=Ce(h);we.innerHTML=q(v)}let Tt=window._currentTypeConfidence||0;if(fe(o,S,_,!1,M,null,bt,Tt),pe(e,!0),u.tags&&window.ArticleTags){console.log("[Summary] Applying tags for newsId:",e,"tags:",u.tags);let v=document.querySelector(`.news-item[data-news-id="${e}"]`);v||(v=document.querySelector(`.news-item[data-url="${o}"]`)),v?(console.log("[Summary] Found news item, applying tags"),window.ArticleTags.applyTags(v,u.tags),v.dataset.tagsLoaded="true"):console.log("[Summary] News item not found in DOM")}break;case"short_content":P(),l.innerHTML=`
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
                            `,f.style.display="none";return;case"error":throw new Error(u.message)}}catch(u){if(u.message&&!u.message.includes("JSON"))throw u}}if(H&&h&&!document.querySelector('.summary-modal-footer[style*="flex"]')){console.log("[Summary] Stream ended without done event, showing fallback footer");let b=document.getElementById("summaryStreamContent");if(b){b.classList.remove("summary-streaming");let B=Ce(h);b.innerHTML=q(B)}fe(o,S,_,!1,M,null,null,0),pe(e,!0)}}catch(d){if(console.error("[Summary] Error:",d),P(),d.message&&(d.message.includes("\u8BBF\u95EE\u9650\u5236")||d.message.includes("\u65E0\u6CD5\u83B7\u53D6")||d.message.includes("\u65E0\u6CD5\u8BBF\u95EE")||d.message.includes("\u8BF7\u6C42\u5931\u8D25")))l.innerHTML=`
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
            `;else{et();return}}}function fe(e,t,o,n,s,a=null,r=null,i=null){let l=document.getElementById("summaryModalFooter"),f=ao[t]||"\u{1F4DD}",d="",c=s?.total_tokens||0;c>0&&(d=`<span class="summary-token-tag" title="\u672C\u6B21\u6D88\u8017">\u{1FA99} ${ro(c)}</span>`);let m=a==="up"?"active":"",p=a==="down"?"active":"";l.innerHTML=`
        <div class="summary-footer-left">
            ${d}
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
    `,l.style.display="flex"}async function io(e){if(!y)return;let t=document.querySelectorAll(".summary-feedback-btn"),o=document.querySelector(`.summary-feedback-btn[data-vote="${e}"]`),s=o?.classList.contains("active")?"none":e;t.forEach(a=>a.classList.remove("active")),s!=="none"&&o?.classList.add("active");try{let a=await fetch(`/api/summary/${encodeURIComponent(y)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vote:s})});a.ok||console.error("[Summary] Feedback failed:",await a.text())}catch(a){console.error("[Summary] Feedback error:",a)}}function et(){let e=document.getElementById("summaryModal");e&&(e.classList.remove("open"),document.body.style.overflow=""),P(),Y=!1,y=null}function tt(){let e=document.querySelector(`.news-summary-btn[data-news-id="${y}"]`);if(e){let t=e.dataset.title,o=e.dataset.url,n=e.dataset.sourceId,s=e.dataset.sourceName;Me(y,t,o,n,s)}}async function lo(){if(y){try{await fetch(`/api/summary/${encodeURIComponent(y)}`,{method:"DELETE"})}catch(e){console.error("[Summary] Delete error:",e)}tt()}}async function co(e,t,o,n,s){let a=decodeURIComponent(t),r=decodeURIComponent(o),i=decodeURIComponent(s);uo(e,a,r,n,i)}async function uo(e,t,o,n,s){if(!T.getUser()){x();return}Ze();let r=document.getElementById("summaryModal"),i=document.getElementById("summaryModalBody"),l=document.getElementById("summaryModalFooter");y=e,L=t,j=o,i.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">\u6B63\u5728\u751F\u6210\u603B\u7ED3...</div>
            </div>
        </div>
    `,l.style.display="none";try{let f=await fetch("/api/summary/stream?force=1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:t,news_id:e,source_id:n,source_name:s})});if(!f.ok){let H=await f.json();throw new Error(H.detail||"\u751F\u6210\u5931\u8D25")}let d=f.body.getReader(),c=new TextDecoder,m="",p="other",h="\u5176\u4ED6",S=!1,_=null;for(;;){let{done:H,value:M}=await d.read();if(H)break;let B=c.decode(M,{stream:!0}).split(`
`);for(let ve of B)if(ve.startsWith("data: "))try{let g=JSON.parse(ve.slice(6));switch(g.type){case"status":let J=document.getElementById("summaryStatusText");J&&(J.textContent=g.message);break;case"type":p=g.article_type,h=g.article_type_name;break;case"chunk":S||(S=!0,i.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),m+=g.content;let u=document.getElementById("summaryStreamContent");u&&(u.innerHTML=q(m)+'<span class="summary-cursor">\u258C</span>',u.scrollTop=u.scrollHeight);break;case"done":_=g.token_usage||null;let ee=g.token_balance!==void 0?{token_balance:g.token_balance,tokens_used:g.tokens_used,default_tokens:1e5}:null,O=document.getElementById("summaryStreamContent");if(O&&(O.classList.remove("summary-streaming"),O.innerHTML=q(m)),fe(o,p,h,!1,_,null,ee),pe(e,!0),g.tags&&window.ArticleTags){let N=document.querySelector(`.news-item[data-news-id="${e}"]`);N||(N=document.querySelector(`.news-item[data-url="${o}"]`)),N&&(window.ArticleTags.applyTags(N,g.tags),N.dataset.tagsLoaded="true")}break;case"error":throw new Error(g.message)}}catch(g){if(g.message&&!g.message.includes("JSON"))throw g}}}catch(f){console.error("[Summary] Force error:",f),i.innerHTML=`
            <div class="summary-error">
                <div class="summary-error-icon">\u274C</div>
                <div class="summary-error-text">${f.message}</div>
                <button class="summary-retry-btn" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
            </div>
        `}}function pe(e,t){let o=document.querySelector(`.news-summary-btn[data-news-id="${e}"]`);o&&(o.classList.toggle("has-summary",t),o.title=t?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3");let n=document.querySelector(`.news-item[data-news-id="${e}"]`);n&&n.classList.toggle("has-summary",t)}function ot(e,t,o,n,s,a){e.preventDefault(),e.stopPropagation(),Me(t,o,n,s,a)}async function G(){try{if(!T.isLoggedIn())return;let e=await fetch("/api/summary/list");if(!e.ok)return;let t=await e.json();if(!t.ok||!t.news_ids)return;let o=new Set(t.news_ids);if(o.size===0)return;document.querySelectorAll(".news-item[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&n.classList.add("has-summary")}),document.querySelectorAll(".news-summary-btn[data-news-id]").forEach(n=>{let s=n.getAttribute("data-news-id");o.has(s)&&(n.classList.add("has-summary"),n.title="\u67E5\u770B\u603B\u7ED3")}),console.log(`[Summary] Marked ${o.size} summarized items`)}catch(e){console.error("[Summary] Failed to load summarized list:",e)}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{setTimeout(G,500)}):setTimeout(G,500);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){let e=window._lastSummarizedListLoad||0;Date.now()-e>3e4&&(console.log("[Summary] Page visible, reloading summarized list"),G())}});var mo=G;G=async function(){return window._lastSummarizedListLoad=Date.now(),mo()};function fo(){!y||!L||(re(y,L,j),$e(!0))}function po(){if(!y||!L)return;let e=document.getElementById("summaryTodoPanel");e&&e.classList.contains("open")?(ie(),$e(!1)):(re(y,L,j),$e(!0))}function $e(e){let t=document.getElementById("summaryTodoToggleBtn");t&&t.classList.toggle("active",e)}async function yo(){if(!y||!L)return;let e=document.getElementById("summaryModalBody");if(!e)return;let o=e.innerHTML.match(/✅\s*行动清单[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);if(!o){window.showToast&&window.showToast("\u672A\u627E\u5230\u884C\u52A8\u6E05\u5355");return}let a=(o[1].match(/<li>([\s\S]*?)<\/li>/gi)||[]).map(r=>r.replace(/<\/?li>/gi,"").replace(/<[^>]+>/g,"").trim()).filter(r=>r.length>0);if(a.length===0){window.showToast&&window.showToast("\u884C\u52A8\u6E05\u5355\u4E3A\u7A7A");return}await Ie(a,{groupId:y,groupTitle:L,groupUrl:j||"",isCustom:!1})}async function go(){if(!y||!L){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let e=await z(L,{groupId:y,groupTitle:L,groupUrl:j||"",isCustom:!1})}catch(e){console.error("[Summary] Add to todo error:",e),window.showToast&&window.showToast("\u6DFB\u52A0\u5931\u8D25")}}async function vo(){if(!y||!L){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let{addFavorite:e}=await import("./favorites-DVZWP2XG.js"),t=await e({news_id:y,title:L,url:j||""});t.ok?window.showToast&&window.showToast("\u5DF2\u6536\u85CF"):t.error&&window.showToast&&window.showToast(t.error)}catch(e){console.error("[Summary] Add to favorites error:",e),window.showToast&&window.showToast("\u6536\u85CF\u5931\u8D25")}}document.addEventListener("click",e=>{let t=e.target.closest(".news-summary-btn");if(!t||t.hasAttribute("onclick"))return;e.preventDefault(),e.stopPropagation();let o=t.dataset.newsId,n=t.dataset.title||"",s=t.dataset.url||"",a=t.dataset.sourceId||"",r=t.dataset.sourceName||"";o&&ot(e,o,n,s,a,r)});window.openSummaryModal=Me;window.closeSummaryModal=et;window.retrySummaryModal=tt;window.regenerateSummaryModal=lo;window.handleSummaryClick=ot;window.loadSummarizedList=G;window.handleSummaryFeedback=io;window.openCurrentTodoPanel=fo;window.toggleCurrentTodoPanel=po;window.addActionListToTodo=yo;window.forceSummary=co;window.addCurrentToTodo=go;window.addCurrentToFavorites=vo;var it="hotnews_favorites_v1",dt="hotnews_favorites_width",wo=500,xe=320,Fe=800,I=null,ye=!1,D=!1;function ge(){try{let e=localStorage.getItem(it);return e?JSON.parse(e):[]}catch{return[]}}function lt(e){try{localStorage.setItem(it,JSON.stringify(e))}catch(t){console.error("[Favorites] Failed to save to localStorage:",t)}}async function ho(){try{let e=await fetch("/api/user/favorites");if(e.status===401)return{needsAuth:!0};if(!e.ok)throw new Error("Failed to fetch favorites");let t=await e.json();return t.ok?(I=t.favorites||[],{favorites:I}):{error:t.message||"Unknown error"}}catch(e){return console.error("[Favorites] Fetch error:",e),{error:e.message}}}async function bo(e){if(!T.getUser()){let o=ge();return o.some(s=>s.news_id===e.news_id)||(o.unshift({...e,created_at:Math.floor(Date.now()/1e3)}),lt(o)),{ok:!0,local:!0}}try{let n=await(await fetch("/api/user/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json();return n.ok&&I&&I.unshift(n.favorite),n}catch(o){return console.error("[Favorites] Add error:",o),{ok:!1,error:o.message}}}async function ct(e){if(!T.getUser()){let n=ge().filter(s=>s.news_id!==e);return lt(n),{ok:!0,local:!0}}try{let n=await(await fetch(`/api/user/favorites/${encodeURIComponent(e)}`,{method:"DELETE"})).json();return n.ok&&I&&(I=I.filter(s=>s.news_id!==e)),n}catch(o){return console.error("[Favorites] Remove error:",o),{ok:!1,error:o.message}}}function ut(e){return T.getUser()?I?I.some(o=>o.news_id===e):!1:ge().some(n=>n.news_id===e)}async function mt(e,t){let o=e.news_id,n=ut(o);t&&(t.classList.toggle("favorited",!n),t.textContent=n?"\u2606":"\u2605");let s;return n?s=await ct(o):s=await bo(e),s.ok||t&&(t.classList.toggle("favorited",n),t.textContent=n?"\u2605":"\u2606"),s}function ft(e){if(!e)return"";let t=new Date(e*1e3),o=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${o}-${n}`}function To(e){let t=document.getElementById("favoritesPanelBody");if(!t)return;if(!e||e.length===0){t.innerHTML=`
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
                            ${n.created_at?`<span>\u6536\u85CF\u4E8E ${ft(n.created_at)}</span>`:""}
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
    `;t.innerHTML=o}function nt(){let e=document.getElementById("favoritesPanelBody");if(!e)return;let t=ge();t.length>0?e.innerHTML=`
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
                                ${o.created_at?`<span>\u6536\u85CF\u4E8E ${ft(o.created_at)}</span>`:""}
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
        `}async function pt(){let e=document.getElementById("favoritesPanelBody");if(!e)return;if(e.innerHTML='<div class="favorites-loading">\u52A0\u8F7D\u4E2D...</div>',!T.getUser()){nt();return}let o=await ho();if(o.needsAuth){nt();return}if(o.error){e.innerHTML=`
            <div class="favorites-empty">
                <div>\u52A0\u8F7D\u5931\u8D25: ${o.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    \u91CD\u8BD5
                </button>
            </div>
        `;return}To(o.favorites)}function So(){if(!T.getUser()){x();return}let t=document.getElementById("favoritesPanel"),o=document.getElementById("favoritesOverlay");t&&(o||(o=document.createElement("div"),o.id="favoritesOverlay",o.className="favorites-overlay",o.onclick=yt,document.body.appendChild(o)),ye=!ye,ye?(t.classList.add("open"),o.classList.add("open"),pt()):(t.classList.remove("open"),o.classList.remove("open")))}function yt(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesOverlay");ye=!1,e&&e.classList.remove("open"),t&&t.classList.remove("open")}async function Eo(e){if((await ct(e)).ok){let o=document.querySelector(`.favorite-item[data-news-id="${e}"]`);o&&o.remove();let n=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);n&&(n.classList.remove("favorited"),n.textContent="\u2606");let s=document.querySelector(".favorites-list");s&&s.children.length===0&&pt()}}function ko(e,t,o,n,s,a){if(e.preventDefault(),e.stopPropagation(),!T.getUser()){x();return}let i=e.currentTarget;mt({news_id:t,title:o,url:n,source_id:s||"",source_name:a||""},i)}function Lo(){try{let e=localStorage.getItem(dt);if(e){let t=parseInt(e,10);if(t>=xe&&t<=Fe)return t}}catch{}return wo}function st(e){try{localStorage.setItem(dt,String(e)),te.saveSidebarWidths({favorites_width:e})}catch{}}function Io(e){let t=document.getElementById("favoritesPanel");t&&(t.style.width=e+"px")}function at(){let e=document.getElementById("favoritesPanel"),t=document.getElementById("favoritesResizeHandle");if(!e||!t)return;let o=Lo();Io(o);let n=0,s=0;function a(c){c.preventDefault(),D=!0,n=c.clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("mousemove",r),document.addEventListener("mouseup",i)}function r(c){if(!D)return;let m=n-c.clientX,p=s+m;p=Math.max(xe,Math.min(Fe,p)),e.style.width=p+"px"}function i(){D&&(D=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("mousemove",r),document.removeEventListener("mouseup",i),st(e.offsetWidth))}function l(c){c.touches.length===1&&(c.preventDefault(),D=!0,n=c.touches[0].clientX,s=e.offsetWidth,e.classList.add("resizing"),t.classList.add("active"),document.addEventListener("touchmove",f,{passive:!1}),document.addEventListener("touchend",d))}function f(c){if(!D||c.touches.length!==1)return;c.preventDefault();let m=n-c.touches[0].clientX,p=s+m;p=Math.max(xe,Math.min(Fe,p)),e.style.width=p+"px"}function d(){D&&(D=!1,e.classList.remove("resizing"),t.classList.remove("active"),document.removeEventListener("touchmove",f),document.removeEventListener("touchend",d),st(e.offsetWidth))}t.addEventListener("mousedown",a),t.addEventListener("touchstart",l,{passive:!1})}function rt(){document.addEventListener("click",e=>{let t=e.target.closest(".news-favorite-btn");if(!t)return;if(e.preventDefault(),e.stopPropagation(),!T.getUser()){x();return}let n=t.closest(".news-item");if(!n)return;let s=n.dataset.id||n.dataset.newsId,a=n.dataset.url,r=n.querySelector(".news-title"),i=r?r.textContent.trim():"",l=n.closest(".platform-card"),f=l?l.dataset.platform:"",d=l?l.querySelector(".platform-name"):null,c=d?d.textContent.replace("\u{1F4F1}","").trim():"";mt({news_id:s,title:i,url:a,source_id:f,source_name:c},t)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{at(),rt()}):(at(),rt());async function gt(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(!(!t||!o)){if(o.classList.contains("has-summary")){vt(e);return}o.disabled=!0,o.textContent="\u23F3",o.title="\u751F\u6210\u4E2D...",t.style.display="block",t.innerHTML=`
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
            `,I){let a=I.find(r=>r.news_id===e);a&&(a.summary=s.summary,a.summary_at=s.summary_at)}}else throw new Error(s.error||"\u751F\u6210\u5931\u8D25")}catch(n){console.error("[Favorites] Summary error:",n),t.innerHTML=`
            <div class="summary-error">
                <span>\u274C ${n.message}</span>
                <button onclick="handleFavoriteSummaryClick('${e}')" style="margin-left:8px;">\u91CD\u8BD5</button>
            </div>
        `,o.textContent="\u{1F4DD}",o.title="AI \u603B\u7ED3"}finally{o.disabled=!1}}}function vt(e){let t=document.getElementById(`summary-${e}`);if(!t)return;let o=t.style.display!=="none";t.style.display=o?"none":"block";let n=t.querySelector(".summary-toggle-btn");n&&(n.textContent=o?"\u5C55\u5F00":"\u6536\u8D77")}async function _o(e){let t=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(t){try{await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"DELETE"})}catch(n){console.error("[Favorites] Delete summary error:",n)}if(o&&(o.classList.remove("has-summary"),o.textContent="\u{1F4DD}"),I){let n=I.find(s=>s.news_id===e);n&&(n.summary=null,n.summary_at=null)}await gt(e)}}window.toggleFavoritesPanel=So;window.closeFavoritesPanel=yt;window.removeFavoriteFromPanel=Eo;window.handleFavoriteClick=ko;window.isFavorited=ut;window.handleFavoriteSummaryClick=gt;window.toggleSummaryDisplay=vt;window.regenerateSummary=_o;export{x as a,Le as b,Kt as c,bo as d,ct as e,ut as f,mt as g,So as h,yt as i,ko as j};
