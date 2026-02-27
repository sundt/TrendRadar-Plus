import{b as F}from"./chunk-5VHEYNGL.js";import"./chunk-44PEUINR.js";import{a as m,b as y,c as k}from"./chunk-YRLDCOZY.js";function q(e){return typeof window.renderMarkdown=="function"?window.renderMarkdown(e):String(e||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}var A="hotnews_favorites_v1",H="hotnews_favorites_width",J=500,_=320,S=800,s=null,p=!1,d=!1,g="summary";function h(){try{let e=localStorage.getItem(A);return e?JSON.parse(e):[]}catch{return[]}}function W(e){try{localStorage.setItem(A,JSON.stringify(e))}catch(n){console.error("[Favorites] Failed to save to localStorage:",n)}}async function O(){try{let e=await fetch("/api/user/favorites");if(e.status===401)return{needsAuth:!0};if(!e.ok)throw new Error("Failed to fetch favorites");let n=await e.json();return n.ok?(s=n.favorites||[],{favorites:s}):{error:n.message||"Unknown error"}}catch(e){return console.error("[Favorites] Fetch error:",e),{error:e.message}}}async function V(e){if(!m.getUser()){let o=h();return o.some(r=>r.news_id===e.news_id)||(o.unshift({...e,created_at:Math.floor(Date.now()/1e3)}),W(o)),{ok:!0,local:!0}}try{let t=await(await fetch("/api/user/favorites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)})).json();return t.ok&&(s||(s=[]),s=s.filter(r=>r.news_id!==e.news_id),s.unshift(t.favorite)),t}catch(o){return console.error("[Favorites] Add error:",o),{ok:!1,error:o.message}}}async function N(e){if(!m.getUser()){let t=h().filter(r=>r.news_id!==e);return W(t),{ok:!0,local:!0}}try{let t=await(await fetch(`/api/user/favorites/${encodeURIComponent(e)}`,{method:"DELETE"})).json();return t.ok&&s&&(s=s.filter(r=>r.news_id!==e)),t}catch(o){return console.error("[Favorites] Remove error:",o),{ok:!1,error:o.message}}}function w(e){if(!m.getUser())return h().some(r=>r.news_id===e);if(s)return s.some(t=>t.news_id===e);let o=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);return o?o.classList.contains("favorited"):!1}async function U(e,n){let o=e.news_id,t=w(o),r=document.querySelectorAll(`.news-favorite-btn[data-news-id="${o}"]`);r.forEach(c=>c.classList.toggle("favorited",!t)),n&&!n.dataset.newsId&&n.classList.toggle("favorited",!t);let a;return t?a=await N(o):a=await V(e),a.ok||(r.forEach(c=>c.classList.toggle("favorited",t)),n&&!n.dataset.newsId&&n.classList.toggle("favorited",t)),a}function $(e){if(!e)return"";let n=new Date(e*1e3),o=String(n.getMonth()+1).padStart(2,"0"),t=String(n.getDate()).padStart(2,"0");return`${o}-${t}`}function K(e){let n=document.getElementById("favoritesPanelBody");if(!n)return;if(!e||e.length===0){n.innerHTML=`
            <div class="favorites-empty">
                <div class="favorites-empty-icon">\u2B50</div>
                <div>\u6682\u65E0\u6536\u85CF</div>
                <div style="font-size:12px;margin-top:8px;color:#64748b;">
                    \u70B9\u51FB\u65B0\u95FB\u6807\u9898\u65C1\u7684 \u2606 \u6DFB\u52A0\u6536\u85CF
                </div>
            </div>
        `;return}let o=`
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
    `;n.innerHTML=o}function Y(e){let n=document.getElementById("favoritesPanelBody");if(!n)return;if(!e||e.length===0){n.innerHTML=`
            <div class="favorites-empty">
                <div class="favorites-empty-icon">\u2606</div>
                <div>\u6682\u65E0\u6536\u85CF</div>
                <div style="font-size:12px;margin-top:8px;color:#64748b;">
                    \u70B9\u51FB\u65B0\u95FB\u6807\u9898\u65C1\u7684 \u2606 \u6DFB\u52A0\u6536\u85CF
                </div>
            </div>
        `;return}let o=`
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
    `;n.innerHTML=o}function M(){let e=document.getElementById("favoritesPanelBody");if(!e)return;let n=h();n.length>0?e.innerHTML=`
            <div style="padding:12px;background:#334155;border-radius:8px;margin-bottom:16px;font-size:13px;color:#94a3b8;">
                <span style="color:#fbbf24;">\u{1F4A1}</span> \u767B\u5F55\u540E\u53EF\u540C\u6B65\u6536\u85CF\u5230\u4E91\u7AEF
                <button class="favorites-login-btn" onclick="openLoginModal();closeFavoritesPanel();" style="margin-left:8px;padding:4px 12px;font-size:12px;">
                    \u767B\u5F55
                </button>
            </div>
            <div class="favorites-list">
                ${n.map(o=>`
                    <div class="favorite-item" data-news-id="${o.news_id}">
                        <a class="favorite-item-title" href="${o.url||"#"}" target="_blank" rel="noopener noreferrer">
                            ${o.title||"\u65E0\u6807\u9898"}
                        </a>
                        <div class="favorite-item-meta">
                            <span class="favorite-item-source">
                                ${o.source_name?`<span>${o.source_name}</span>`:""}
                                ${o.created_at?`<span>\u6536\u85CF\u4E8E ${$(o.created_at)}</span>`:""}
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
        `}async function E(){let e=document.getElementById("favoritesPanelBody");if(!e)return;if(e.innerHTML=F(5),!m.getUser()){M();return}let o=await O();if(o.needsAuth){M();return}if(o.error){e.innerHTML=`
            <div class="favorites-empty">
                <div>\u52A0\u8F7D\u5931\u8D25: ${o.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    \u91CD\u8BD5
                </button>
            </div>
        `;return}if(g==="bookmarks")Y(o.favorites);else{let t=(o.favorites||[]).filter(r=>r.summary);K(t)}}function P(){let e=document.querySelector(".favorites-tab-bar");e&&e.addEventListener("click",n=>{let o=n.target.closest("[data-tab]");if(!o)return;let t=o.dataset.tab;t!==g&&(g=t,e.querySelectorAll(".favorites-tab-btn").forEach(r=>r.classList.toggle("active",r.dataset.tab===g)),E())})}function G(){if(!y())return;let e=document.getElementById("favoritesPanel"),n=document.getElementById("favoritesOverlay");e&&(n||(n=document.createElement("div"),n.id="favoritesOverlay",n.className="favorites-overlay",n.onclick=j,document.body.appendChild(n)),p=!p,p?(e.classList.add("open"),n.classList.add("open"),E()):(e.classList.remove("open"),n.classList.remove("open")))}function j(){let e=document.getElementById("favoritesPanel"),n=document.getElementById("favoritesOverlay");p=!1,e&&e.classList.remove("open"),n&&n.classList.remove("open")}async function Q(e){if((await N(e)).ok){let o=document.querySelector(`.favorite-item[data-news-id="${e}"]`);o&&o.remove();let t=document.querySelector(`.news-favorite-btn[data-news-id="${e}"]`);t&&t.classList.remove("favorited");let r=document.querySelector(".favorites-list");r&&r.children.length===0&&E()}}function Z(e,n,o,t,r,a){if(e.preventDefault(),e.stopPropagation(),!y())return;let c=e.currentTarget;U({news_id:n,title:o,url:t,source_id:r||"",source_name:a||""},c)}function ee(){try{let e=localStorage.getItem(H);if(e){let n=parseInt(e,10);if(n>=_&&n<=S)return n}}catch{}return J}function x(e){try{localStorage.setItem(H,String(e)),k.saveSidebarWidths({favorites_width:e})}catch{}}function te(e){let n=document.getElementById("favoritesPanel");n&&(n.style.width=e+"px")}function T(){let e=document.getElementById("favoritesPanel"),n=document.getElementById("favoritesResizeHandle");if(!e||!n)return;let o=ee();te(o);let t=0,r=0;function a(i){i.preventDefault(),d=!0,t=i.clientX,r=e.offsetWidth,e.classList.add("resizing"),n.classList.add("active"),document.addEventListener("mousemove",c),document.addEventListener("mouseup",l)}function c(i){if(!d)return;let L=t-i.clientX,u=r+L;u=Math.max(_,Math.min(S,u)),e.style.width=u+"px"}function l(){d&&(d=!1,e.classList.remove("resizing"),n.classList.remove("active"),document.removeEventListener("mousemove",c),document.removeEventListener("mouseup",l),x(e.offsetWidth))}function b(i){i.touches.length===1&&(i.preventDefault(),d=!0,t=i.touches[0].clientX,r=e.offsetWidth,e.classList.add("resizing"),n.classList.add("active"),document.addEventListener("touchmove",v,{passive:!1}),document.addEventListener("touchend",f))}function v(i){if(!d||i.touches.length!==1)return;i.preventDefault();let L=t-i.touches[0].clientX,u=r+L;u=Math.max(_,Math.min(S,u)),e.style.width=u+"px"}function f(){d&&(d=!1,e.classList.remove("resizing"),n.classList.remove("active"),document.removeEventListener("touchmove",v),document.removeEventListener("touchend",f),x(e.offsetWidth))}n.addEventListener("mousedown",a),n.addEventListener("touchstart",b,{passive:!1})}function D(){document.addEventListener("click",e=>{let n=e.target.closest(".news-favorite-btn");if(!n||(e.preventDefault(),e.stopPropagation(),!y()))return;let o=n.closest(".news-item");if(!o)return;let t=o.dataset.newsId||o.dataset.id,r=o.dataset.newsUrl||o.dataset.url,a=o.querySelector(".news-title"),c=a?a.textContent.trim():"",l=o.closest(".platform-card"),b=l?l.dataset.platform:"",v=l?l.querySelector(".platform-name"):null,f=v?v.textContent.replace("\u{1F4F1}","").trim():"";U({news_id:t,title:c,url:r,source_id:b,source_name:f},n)})}function I(){B(document);let e=new MutationObserver(o=>{for(let t of o)for(let r of t.addedNodes)r.nodeType===1&&(r.classList?.contains("news-item")?z(r):r.querySelectorAll&&B(r))}),n=document.querySelector(".tab-content-area")||document.body;e.observe(n,{childList:!0,subtree:!0})}function B(e){e.querySelectorAll(".news-item").forEach(o=>z(o))}function z(e){if(e.querySelector(".news-favorite-btn"))return;let n=e.querySelector(".news-hover-btns");if(!n)return;let o=e.dataset.newsId||e.dataset.id||"";if(!o)return;let t=document.createElement("button");t.className="news-favorite-btn",t.dataset.newsId=o,w(o)&&t.classList.add("favorited"),n.insertBefore(t,n.firstChild)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{T(),D(),P(),I(),C()}):(T(),D(),P(),I(),C());async function C(){if(!m.getUser()||s)return;(await O()).favorites&&document.querySelectorAll(".news-favorite-btn[data-news-id]").forEach(o=>{let t=o.dataset.newsId;o.classList.toggle("favorited",w(t))})}async function R(e){let n=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(!(!n||!o)){if(o.classList.contains("has-summary")){X(e);return}o.disabled=!0,o.textContent="\u23F3",o.title="\u751F\u6210\u4E2D...",n.style.display="block",n.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <span>\u6B63\u5728\u751F\u6210 AI \u603B\u7ED3...</span>
        </div>
    `;try{let t=await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"POST"}),r=await t.json();if(!t.ok)throw new Error(r.detail||"\u751F\u6210\u5931\u8D25");if(r.ok&&r.summary){if(o.classList.add("has-summary"),o.textContent="\u{1F4C4}",o.title="\u67E5\u770B\u603B\u7ED3",n.innerHTML=`
                <div class="summary-content">${q(r.summary)}</div>
                <div class="summary-actions">
                    <button class="summary-regenerate-btn" onclick="regenerateSummary('${e}')" title="\u91CD\u65B0\u751F\u6210">
                        \u{1F504} \u91CD\u65B0\u751F\u6210
                    </button>
                    <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${e}')">
                        \u6536\u8D77
                    </button>
                </div>
            `,s){let a=s.find(c=>c.news_id===e);a&&(a.summary=r.summary,a.summary_at=r.summary_at)}}else throw new Error(r.error||"\u751F\u6210\u5931\u8D25")}catch(t){console.error("[Favorites] Summary error:",t),n.innerHTML=`
            <div class="summary-error">
                <span>\u274C ${t.message}</span>
                <button onclick="handleFavoriteSummaryClick('${e}')" style="margin-left:8px;">\u91CD\u8BD5</button>
            </div>
        `,o.textContent="\u{1F4DD}",o.title="AI \u603B\u7ED3"}finally{o.disabled=!1}}}function X(e){let n=document.getElementById(`summary-${e}`);if(!n)return;let o=n.style.display!=="none";n.style.display=o?"none":"block";let t=n.querySelector(".summary-toggle-btn");t&&(t.textContent=o?"\u5C55\u5F00":"\u6536\u8D77")}async function ne(e){let n=document.getElementById(`summary-${e}`),o=document.querySelector(`.favorite-item[data-news-id="${e}"] .favorite-summary-btn`);if(n){try{await fetch(`/api/user/favorites/${encodeURIComponent(e)}/summary`,{method:"DELETE"})}catch(t){console.error("[Favorites] Delete summary error:",t)}if(o&&(o.classList.remove("has-summary"),o.textContent="\u{1F4DD}"),s){let t=s.find(r=>r.news_id===e);t&&(t.summary=null,t.summary_at=null)}await R(e)}}window.toggleFavoritesPanel=G;window.closeFavoritesPanel=j;window.removeFavoriteFromPanel=Q;window.handleFavoriteClick=Z;window.isFavorited=w;window.handleFavoriteSummaryClick=R;window.toggleSummaryDisplay=X;window.regenerateSummary=ne;export{V as addFavorite,j as closeFavoritesPanel,Z as handleFavoriteClick,w as isFavorited,N as removeFavorite,U as toggleFavorite,G as toggleFavoritesPanel};
