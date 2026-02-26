import{c as F}from"./chunk-B5OTNAFO.js";import{a as g}from"./chunk-JPTUFB3N.js";import{a as l,b as k}from"./chunk-YRL7WKAS.js";function q(e){return typeof window.renderMarkdown=="function"?window.renderMarkdown(e):String(e||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}var A="hotnews_favorites_v1",H="hotnews_favorites_width",J=500,_=320,S=800,s=null,h=!1,d=!1,w="summary";function b(){try{let e=localStorage.getItem(A);return e?JSON.parse(e):[]}catch{return[]}}function W(e){try{localStorage.setItem(A,JSON.stringify(e))}catch(o){console.error("[Favorites] Failed to save to localStorage:",o)}}async function U(){try{let e=await fetch("/api/user/favorites");if(e.status===401)return{needsAuth:!0};if(!e.ok)throw new Error("Failed to fetch favorites");let o=await e.json();return o.ok?(s=o.favorites||[],{favorites:s}):{error:o.message||"Unknown error"}}catch(e){return console.error("[Favorites] Fetch error:",e),{error:e.message}}}async function V(e){if(!l.getUser()){let n=b();return n.some(r=>r.news_id===e.news_id)||(n.unshift({...e,created_at:Math.floor(Date.now()/1e3)}),W(n)),{ok:!0,local:!0}}try{let t=await(await fetch("/api/user/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json();return t.ok&&(s||(s=[]),s=s.filter(r=>r.news_id!==e.news_id),s.unshift(t.favorite)),t}catch(n){return console.error("[Favorites] Add error:",n),{ok:!1,error:n.message}}}async function O(e){if(!l.getUser()){let t=b().filter(r=>r.news_id!==e);return W(t),{ok:!0,local:!0}}try{let t=await(await fetch(`/api/user/favorites/${encodeURIComponent(e)}`,{method:"DELETE"})).json();return t.ok&&s&&(s=s.filter(r=>r.news_id!==e)),t}catch(n){return console.error("[Favorites] Remove error:",n),{ok:!1,error:n.message}}}function L(e){if(!l.getUser())return b().some(r=>r.news_id===e);if(s)return s.some(t=>t.news_id===e);let n=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);return n?n.classList.contains("favorited"):!1}async function N(e,o){let n=e.news_id,t=L(n),r=document.querySelectorAll(`.news-favorite-btn[data-news-id="${n}"]`);r.forEach(c=>c.classList.toggle("favorited",!t)),o&&!o.dataset.newsId&&o.classList.toggle("favorited",!t);let a;return t?a=await O(n):a=await V(e),a.ok||(r.forEach(c=>c.classList.toggle("favorited",t)),o&&!o.dataset.newsId&&o.classList.toggle("favorited",t)),a}function $(e){if(!e)return"";let o=new Date(e*1e3),n=String(o.getMonth()+1).padStart(2,"0"),t=String(o.getDate()).padStart(2,"0");return`${n}-${t}`}function K(e){let o=document.getElementById("favoritesPanelBody");if(!o)return;if(!e||e.length===0){o.innerHTML=`
            <div class="favorites-empty">
                <div class="favorites-empty-icon">\u2B50</div>
                <div>\u6682\u65E0\u6536\u85CF</div>
                <div style="font-size:12px;margin-top:8px;color:#64748b;">
                    \u70B9\u51FB\u65B0\u95FB\u6807\u9898\u65C1\u7684 \u2606 \u6DFB\u52A0\u6536\u85CF
                </div>
            </div>
        `;return}let n=`
        <div class="favorites-list">
            ${e.map(t=>`
                <div class="favorite-item" data-news-id="${t.news_id}">
                    <a class="favorite-item-title" href="${t.url||"#"}" target="_blank" rel="noopener noreferrer">
                        ${t.title||"\u65E0\u6807\u9898"}
                    </a>
                    <div class="favorite-item-meta">
                        <span class="favorite-item-source">
                            ${t.source_name?`<span>${t.source_name}</span>`:""}
                            ${t.created_at?`<span>\u6536\u85CF\u4E8E ${$(t.created_at)}</span>`:""}
                        </span>
                        <div class="favorite-item-actions">
                            <button class="favorite-summary-btn${t.summary?" has-summary":""}" 
                                    onclick="handleFavoriteSummaryClick('${t.news_id}')" 
                                    title="${t.summary?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3"}">
                                ${t.summary?"\u{1F4C4}":"\u{1F4DD}"}
                            </button>
                            <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${t.news_id}')" title="\u53D6\u6D88\u6536\u85CF">
                                \u5220\u9664
                            </button>
                        </div>
                    </div>
                    <div class="favorite-item-summary" id="summary-${t.news_id}" style="display:${t.summary?"block":"none"};">
                        <div class="summary-content">${t.summary?q(t.summary):""}</div>
                        ${t.summary?`
                            <div class="summary-actions">
                                <button class="summary-regenerate-btn" onclick="regenerateSummary('${t.news_id}')" title="\u91CD\u65B0\u751F\u6210">
                                    \u{1F504} \u91CD\u65B0\u751F\u6210
                                </button>
                                <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${t.news_id}')">
                                    \u6536\u8D77
                                </button>
                            </div>
                        `:""}
                    </div>
                </div>
            `).join("")}
        </div>
    `;o.innerHTML=n}function Y(e){let o=document.getElementById("favoritesPanelBody");if(!o)return;if(!e||e.length===0){o.innerHTML=`
            <div class="favorites-empty">
                <div class="favorites-empty-icon">\u2606</div>
                <div>\u6682\u65E0\u6536\u85CF</div>
                <div style="font-size:12px;margin-top:8px;color:#64748b;">
                    \u70B9\u51FB\u65B0\u95FB\u6807\u9898\u65C1\u7684 \u2606 \u6DFB\u52A0\u6536\u85CF
                </div>
            </div>
        `;return}let n=`
        <div class="favorites-list">
            ${e.map(t=>`
                <div class="favorite-item" data-news-id="${t.news_id}">
                    <a class="favorite-item-title" href="${t.url||"#"}" target="_blank" rel="noopener noreferrer">
                        ${t.title||"\u65E0\u6807\u9898"}
                    </a>
                    <div class="favorite-item-meta">
                        <span class="favorite-item-source">
                            ${t.source_name?`<span>${t.source_name}</span>`:""}
                            ${t.created_at?`<span>\u6536\u85CF\u4E8E ${$(t.created_at)}</span>`:""}
                        </span>
                        <div class="favorite-item-actions">
                            <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${t.news_id}')" title="\u53D6\u6D88\u6536\u85CF">
                                \u5220\u9664
                            </button>
                        </div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;o.innerHTML=n}function M(){let e=document.getElementById("favoritesPanelBody");if(!e)return;let o=b();o.length>0?e.innerHTML=`
            <div style="padding:12px;background:#334155;border-radius:8px;margin-bottom:16px;font-size:13px;color:#94a3b8;">
                <span style="color:#fbbf24;">\u{1F4A1}</span> \u767B\u5F55\u540E\u53EF\u540C\u6B65\u6536\u85CF\u5230\u4E91\u7AEF
                <button class="favorites-login-btn" onclick="openLoginModal();closeFavoritesPanel();" style="margin-left:8px;padding:4px 12px;font-size:12px;">
                    \u767B\u5F55
                </button>
            </div>
            <div class="favorites-list">
                ${o.map(n=>`
                    <div class="favorite-item" data-news-id="${n.news_id}">
                        <a class="favorite-item-title" href="${n.url||"#"}" target="_blank" rel="noopener noreferrer">
                            ${n.title||"\u65E0\u6807\u9898"}
                        </a>
                        <div class="favorite-item-meta">
                            <span class="favorite-item-source">
                                ${n.source_name?`<span>${n.source_name}</span>`:""}
                                ${n.created_at?`<span>\u6536\u85CF\u4E8E ${$(n.created_at)}</span>`:""}
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
        `:e.innerHTML=`
            <div class="favorites-login-required">
                <div class="favorites-login-icon">\u{1F512}</div>
                <div>\u767B\u5F55\u540E\u53EF\u4F7F\u7528\u6536\u85CF\u529F\u80FD</div>
                <button class="favorites-login-btn" onclick="openLoginModal();closeFavoritesPanel();">
                    \u7ACB\u5373\u767B\u5F55
                </button>
            </div>
        `}async function E(){let e=document.getElementById("favoritesPanelBody");if(!e)return;if(e.innerHTML=F(5),!l.getUser()){M();return}let n=await U();if(n.needsAuth){M();return}if(n.error){e.innerHTML=`
            <div class="favorites-empty">
                <div>\u52A0\u8F7D\u5931\u8D25: ${n.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    \u91CD\u8BD5
                </button>
            </div>
        `;return}if(w==="bookmarks")Y(n.favorites);else{let t=(n.favorites||[]).filter(r=>r.summary);K(t)}}function P(){let e=document.querySelector(".favorites-tab-bar");e&&e.addEventListener("click",o=>{let n=o.target.closest("[data-tab]");if(!n)return;let t=n.dataset.tab;t!==w&&(w=t,e.querySelectorAll(".favorites-tab-btn").forEach(r=>r.classList.toggle("active",r.dataset.tab===w)),E())})}function G(){if(!l.getUser()){g();return}let o=document.getElementById("favoritesPanel"),n=document.getElementById("favoritesOverlay");o&&(n||(n=document.createElement("div"),n.id="favoritesOverlay",n.className="favorites-overlay",n.onclick=j,document.body.appendChild(n)),h=!h,h?(o.classList.add("open"),n.classList.add("open"),E()):(o.classList.remove("open"),n.classList.remove("open")))}function j(){let e=document.getElementById("favoritesPanel"),o=document.getElementById("favoritesOverlay");h=!1,e&&e.classList.remove("open"),o&&o.classList.remove("open")}async function Q(e){if((await O(e)).ok){let n=document.querySelector(`.favorite-item[data-news-id="${e}"]`);n&&n.remove();let t=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);t&&t.classList.remove("favorited");let r=document.querySelector(".favorites-list");r&&r.children.length===0&&E()}}function Z(e,o,n,t,r,a){if(e.preventDefault(),e.stopPropagation(),!l.getUser()){g();return}let v=e.currentTarget;N({news_id:o,title:n,url:t,source_id:r||"",source_name:a||""},v)}function ee(){try{let e=localStorage.getItem(H);if(e){let o=parseInt(e,10);if(o>=_&&o<=S)return o}}catch{}return J}function x(e){try{localStorage.setItem(H,String(e)),k.saveSidebarWidths({favorites_width:e})}catch{}}function te(e){let o=document.getElementById("favoritesPanel");o&&(o.style.width=e+"px")}function T(){let e=document.getElementById("favoritesPanel"),o=document.getElementById("favoritesResizeHandle");if(!e||!o)return;let n=ee();te(n);let t=0,r=0;function a(i){i.preventDefault(),d=!0,t=i.clientX,r=e.offsetWidth,e.classList.add("resizing"),o.classList.add("active"),document.addEventListener("mousemove",c),document.addEventListener("mouseup",v)}function c(i){if(!d)return;let p=t-i.clientX,m=r+p;m=Math.max(_,Math.min(S,m)),e.style.width=m+"px"}function v(){d&&(d=!1,e.classList.remove("resizing"),o.classList.remove("active"),document.removeEventListener("mousemove",c),document.removeEventListener("mouseup",v),x(e.offsetWidth))}function u(i){i.touches.length===1&&(i.preventDefault(),d=!0,t=i.touches[0].clientX,r=e.offsetWidth,e.classList.add("resizing"),o.classList.add("active"),document.addEventListener("touchmove",y,{passive:!1}),document.addEventListener("touchend",f))}function y(i){if(!d||i.touches.length!==1)return;i.preventDefault();let p=t-i.touches[0].clientX,m=r+p;m=Math.max(_,Math.min(S,m)),e.style.width=m+"px"}function f(){d&&(d=!1,e.classList.remove("resizing"),o.classList.remove("active"),document.removeEventListener("touchmove",y),document.removeEventListener("touchend",f),x(e.offsetWidth))}o.addEventListener("mousedown",a),o.addEventListener("touchstart",u,{passive:!1})}function D(){document.addEventListener("click",e=>{let o=e.target.closest(".news-favorite-btn");if(!o)return;if(e.preventDefault(),e.stopPropagation(),!l.getUser()){g();return}let t=o.closest(".news-item");if(!t)return;let r=t.dataset.newsId||t.dataset.id,a=t.dataset.newsUrl||t.dataset.url,c=t.querySelector(".news-title"),v=c?c.textContent.trim():"",u=t.closest(".platform-card"),y=u?u.dataset.platform:"",f=u?u.querySelector(".platform-name"):null,i=f?f.textContent.replace("\u{1F4F1}","").trim():"";N({news_id:r,title:v,url:a,source_id:y,source_name:i},o)})}function I(){B(document);let e=new MutationObserver(n=>{for(let t of n)for(let r of t.addedNodes)r.nodeType===1&&(r.classList?.contains("news-item")?z(r):r.querySelectorAll&&B(r))}),o=document.querySelector(".tab-content-area")||document.body;e.observe(o,{childList:!0,subtree:!0})}function B(e){e.querySelectorAll(".news-item").forEach(n=>z(n))}function z(e){if(e.querySelector(".news-favorite-btn"))return;let o=e.querySelector(".news-hover-btns");if(!o)return;let n=e.dataset.newsId||e.dataset.id||"";if(!n)return;let t=document.createElement("button");t.className="news-favorite-btn",t.dataset.newsId=n,L(n)&&t.classList.add("favorited"),o.insertBefore(t,o.firstChild)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{T(),D(),P(),I(),C()}):(T(),D(),P(),I(),C());async function C(){if(!l.getUser()||s)return;(await U()).favorites&&document.querySelectorAll(".news-favorite-btn[data-news-id]").forEach(n=>{let t=n.dataset.newsId;n.classList.toggle("favorited",L(t))})}async function R(e){let o=document.getElementById(`summary-${e}`),n=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(!(!o||!n)){if(n.classList.contains("has-summary")){X(e);return}n.disabled=!0,n.textContent="\u23F3",n.title="\u751F\u6210\u4E2D...",o.style.display="block",o.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <span>\u6B63\u5728\u751F\u6210 AI \u603B\u7ED3...</span>
        </div>
    `;try{let t=await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"POST"}),r=await t.json();if(!t.ok)throw new Error(r.detail||"\u751F\u6210\u5931\u8D25");if(r.ok&&r.summary){if(n.classList.add("has-summary"),n.textContent="\u{1F4C4}",n.title="\u67E5\u770B\u603B\u7ED3",o.innerHTML=`
                <div class="summary-content">${q(r.summary)}</div>
                <div class="summary-actions">
                    <button class="summary-regenerate-btn" onclick="regenerateSummary('${e}')" title="\u91CD\u65B0\u751F\u6210">
                        \u{1F504} \u91CD\u65B0\u751F\u6210
                    </button>
                    <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${e}')">
                        \u6536\u8D77
                    </button>
                </div>
            `,s){let a=s.find(c=>c.news_id===e);a&&(a.summary=r.summary,a.summary_at=r.summary_at)}}else throw new Error(r.error||"\u751F\u6210\u5931\u8D25")}catch(t){console.error("[Favorites] Summary error:",t),o.innerHTML=`
            <div class="summary-error">
                <span>\u274C ${t.message}</span>
                <button onclick="handleFavoriteSummaryClick('${e}')" style="margin-left:8px;">\u91CD\u8BD5</button>
            </div>
        `,n.textContent="\u{1F4DD}",n.title="AI \u603B\u7ED3"}finally{n.disabled=!1}}}function X(e){let o=document.getElementById(`summary-${e}`);if(!o)return;let n=o.style.display!=="none";o.style.display=n?"none":"block";let t=o.querySelector(".summary-toggle-btn");t&&(t.textContent=n?"\u5C55\u5F00":"\u6536\u8D77")}async function ne(e){let o=document.getElementById(`summary-${e}`),n=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(o){try{await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"DELETE"})}catch(t){console.error("[Favorites] Delete summary error:",t)}if(n&&(n.classList.remove("has-summary"),n.textContent="\u{1F4DD}"),s){let t=s.find(r=>r.news_id===e);t&&(t.summary=null,t.summary_at=null)}await R(e)}}window.toggleFavoritesPanel=G;window.closeFavoritesPanel=j;window.removeFavoriteFromPanel=Q;window.handleFavoriteClick=Z;window.isFavorited=L;window.handleFavoriteSummaryClick=R;window.toggleSummaryDisplay=X;window.regenerateSummary=ne;export{V as addFavorite,j as closeFavoritesPanel,Z as handleFavoriteClick,L as isFavorited,O as removeFavorite,N as toggleFavorite,G as toggleFavoritesPanel};
