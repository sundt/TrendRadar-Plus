import{a as z,b as H,c as de,d as A}from"./chunk-7VXTVM4T.js";import"./chunk-2LJVOGXX.js";import{a as K,b as le,c as m}from"./chunk-I35K533E.js";import"./chunk-5VHEYNGL.js";import{a as N,b as J}from"./chunk-YRLDCOZY.js";function Ie(e){return new Promise(t=>{let o=document.createElement("div");o.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10010;display:flex;align-items:center;justify-content:center;";let c=document.createElement("div");c.style.cssText="background:#fff;border-radius:12px;padding:24px;max-width:320px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;",c.innerHTML=`
            <div style="font-size:15px;color:#1f2937;line-height:1.6;margin-bottom:20px;">${e}</div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button class="confirm-cancel" style="flex:1;padding:8px 0;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#6b7280;font-size:14px;cursor:pointer;">\u53D6\u6D88</button>
                <button class="confirm-ok" style="flex:1;padding:8px 0;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:14px;cursor:pointer;">\u786E\u8BA4\u5220\u9664</button>
            </div>`,o.appendChild(c),document.body.appendChild(o);let n=s=>{o.remove(),t(s)};c.querySelector(".confirm-cancel").onclick=()=>n(!1),c.querySelector(".confirm-ok").onclick=()=>n(!0),o.addEventListener("click",s=>{s.target===o&&n(!1)})})}var I=[],w=null,d=null,Q=new Map,W=0;function te(e){return Q.has(e)||Q.set(e,{loading:!1,loaded:!1}),Q.get(e)}function oe(e){Q.set(e,{loading:!1,loaded:!1})}function he(){Q.clear()}var F=null,U=null,_=null,ge=null,R=null,E=null,v=null,Y=null;function pe(){let t=N.getUser?.()?.id;document.querySelectorAll(".sub-tab.topic-tab").forEach(c=>{let n=c.dataset.ownerUserId,s=c.dataset.category;if(!t||n&&String(n)!==String(t)){console.warn(`[TopicTracker] Removing topic tab: ${s}, owner=${n}, current=${t}`),c.remove();let a=document.getElementById(`tab-${s}`);a&&a.remove()}})}function Me(){document.querySelectorAll(".sub-tab.topic-tab[data-owner-user-id]").forEach(t=>{let o=t.dataset.category;console.log(`[TopicTracker] Removing server-rendered topic tab: ${o}`),t.remove();let c=document.getElementById(`tab-${o}`);c&&c.remove()})}function ce(){if(console.log("[TopicTracker] Initializing..."),!document.body){console.warn("[TopicTracker] document.body not ready, retrying..."),setTimeout(ce,100);return}Me(),pe(),Ae(),z.on("mainNav:topicsActivated",()=>{console.log("[TopicTracker] mainNav:topicsActivated event received, loading topics..."),D()}),z.on("tab:switched",t=>{let o=t?.categoryId;if(console.log("[TopicTracker] tab:switched event received, categoryId:",o),o&&String(o).startsWith("topic-")){let c=String(o).replace("topic-","");console.log("[TopicTracker] Topic tab switched, loading:",c),j(c)}}),z.on("viewer:rendered",()=>{console.log("[TopicTracker] viewer:rendered event received, resetting states and setting up listeners..."),W++,console.log("[TopicTracker] Generation bumped to:",W),pe(),he(),ye(),D();let t=document.querySelector('.tab-pane.active[id^="tab-topic-"]');if(t){let o=t.id.replace("tab-topic-","");console.log("[TopicTracker] Active topic tab detected after re-render:",o),setTimeout(()=>j(o),100)}}),window.addEventListener("authStateChanged",t=>{console.log("[TopicTracker] Auth state changed, reloading topics..."),qe(),t?.detail?.user&&D()});let e=document.querySelector('.tab-pane.active[id^="tab-topic-"]');if(e){let t=e.id.replace("tab-topic-","");console.log("[TopicTracker] Topic tab already active on page load:",t),setTimeout(()=>j(t),200)}}function qe(){document.querySelectorAll(".sub-tab.topic-tab").forEach(e=>e.remove()),document.querySelectorAll('.tab-pane[id^="tab-topic-"]').forEach(e=>e.remove()),he(),I=[]}async function D(){try{N.initialized||(console.log("[TopicTracker] Waiting for authState to initialize..."),await N.init())}catch(o){console.warn("[TopicTracker] authState init failed:",o)}if(!Oe()){console.log("[TopicTracker] User not logged in, skipping topic tabs loading");return}let e=document.getElementById("topicSubTabs");if(!e){console.warn("[TopicTracker] topicSubTabs not found");return}let t=_e(e);try{console.log("[TopicTracker] Loading topics from API...");let c=await(await fetch("/api/topics",{credentials:"include"})).json();t&&t.remove(),c.ok&&c.topics?.length>0?(I=c.topics,console.log(`[TopicTracker] Loaded ${I.length} topics, rendering tabs...`),Ce(I),Ee()):(console.log("[TopicTracker] No topics found or API error:",c.detail||c.error),I=[])}catch(o){console.error("[TopicTracker] Failed to load topics:",o),t&&t.remove(),I=[]}}function Ee(){try{let e=localStorage.getItem("hotnews_active_tab"),t=localStorage.getItem("tr_active_tab"),o=e&&e.startsWith("topic-")?e:t;if(o&&o.startsWith("topic-")){let c=document.querySelector(`.sub-tab[data-category="${o}"]`),n=document.getElementById(`tab-${o}`);if(c&&n)console.log(`[TopicTracker] Restoring to topic tab: ${o}`),A.switchTab(o);else{console.log(`[TopicTracker] Topic tab not found, clearing saved tab: ${o}`),localStorage.removeItem("tr_active_tab");try{H.consumeNavigationState?.()}catch{}A.switchTab("my-tags")}}}catch(e){console.error("[TopicTracker] Failed to restore topic tab:",e)}}function _e(e){let t=e.querySelector(".sub-tabs-indicator"),o=document.createElement("div");o.className="topic-tabs-loading",o.id="topicTabsSkeleton",o.style.cssText="display:flex;gap:4px;";for(let n=0;n<2;n++){let s=document.createElement("div");s.className="topic-tab-skeleton",s.innerHTML='<div class="skeleton-text"></div>',o.appendChild(s)}let c=e.querySelector(".sub-tab-new");return c?e.insertBefore(o,c):t?e.insertBefore(o,t):e.appendChild(o),o}function Ce(e){let t=document.getElementById("topicSubTabs");if(!t){console.warn("[TopicTracker] topicSubTabs not found");return}let o=t.querySelector(".sub-tabs-indicator");e.forEach(c=>{let n=`topic-${c.id}`;if(t.querySelector(`[data-category="${n}"]`)){console.log(`[TopicTracker] Tab ${n} already exists, skipping`);return}let s=document.createElement("button");s.className="sub-tab topic-tab",s.dataset.category=n,s.dataset.topicId=c.id,s.onclick=()=>{A.switchTab(n)},s.innerHTML=`
                ${m(c.name)}
            `;let a=t.querySelector(".sub-tab-new");t.insertBefore(s,a||null),Le(c),console.log(`[TopicTracker] Created tab for topic: ${c.name}`)}),Re(),A.updateIndicator&&A.updateIndicator(t)}function Le(e){let t=`topic-${e.id}`,o=document.querySelector(".tab-content-area");if(!o){console.error("[TopicTracker] tab-content-area not found");return}if(document.getElementById(`tab-${t}`))return;let c=document.createElement("div");c.className="tab-pane",c.id=`tab-${t}`,c.dataset.lazyLoad="0",c.innerHTML=`
            <div class="platform-grid" id="topicCards-${e.id}" data-topic-id="${e.id}">
                <div class="topic-loading-state" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                    <div style="font-size:48px;margin-bottom:16px;">\u{1F50D}</div>
                    <div style="font-size:16px;">\u52A0\u8F7D\u4E2D...</div>
                </div>
            </div>
        `,o.appendChild(c)}function Ae(){document.body.insertAdjacentHTML("beforeend",`
            <div class="topic-modal-overlay" id="topicModalOverlay">
                <div class="topic-modal">
                    <div class="topic-modal-header">
                        <h3 class="topic-modal-title" id="topicModalTitle">\u65B0\u5EFA\u8FFD\u8E2A\u4E3B\u9898</h3>
                        <button class="topic-modal-close" onclick="TopicTracker.closeModal()">\xD7</button>
                    </div>
                    <div class="topic-modal-body">
                        <div class="topic-form-group">
                            <label class="topic-form-label">\u4E3B\u9898\u540D\u79F0</label>
                            <input type="text" class="topic-form-input" id="topicNameInput" 
                                   placeholder="\u4F8B\u5982\uFF1A\u82F9\u679C\u516C\u53F8\u3001\u7279\u65AF\u62C9\u3001\u4EBA\u5DE5\u667A\u80FD" maxlength="50">
                            <div class="topic-progress-container" id="topicProgressContainer" style="display:none;">
                                <div class="topic-progress-bar">
                                    <div class="topic-progress-fill" id="topicProgressFill"></div>
                                </div>
                                <div class="topic-progress-text" id="topicProgressText">\u51C6\u5907\u4E2D...</div>
                            </div>
                        </div>
                        
                        <div class="topic-form-group" id="topicIconGroup" style="display:none;">
                            <label class="topic-form-label">\u4E3B\u9898\u56FE\u6807</label>
                            <div class="topic-icon-display" id="topicIconDisplay">
                                <span class="topic-icon-preview" id="topicIconPreview">\u{1F3F7}\uFE0F</span>
                                <span class="topic-icon-label">AI \u81EA\u52A8\u751F\u6210</span>
                            </div>
                        </div>
                        
                        <div class="topic-form-group" id="topicKeywordsGroup" style="display:none;">
                            <label class="topic-form-label">\u8FFD\u8E2A\u5173\u952E\u8BCD</label>
                            <div class="topic-keywords-container" id="topicKeywordsContainer">
                                <button class="topic-keyword-add" onclick="TopicTracker.addKeyword()">+ \u6DFB\u52A0\u5173\u952E\u8BCD</button>
                            </div>
                        </div>
                        
                        <div class="topic-form-group" id="topicSourcesGroup" style="display:none;">
                            <label class="topic-form-label">\u63A8\u8350\u6570\u636E\u6E90 (\u4E00\u952E\u6DFB\u52A0)</label>
                            <div class="topic-sources-list" id="topicSourcesContainer"></div>
                            <div class="topic-sources-actions">
                                <button class="topic-sources-action-btn" onclick="TopicTracker.selectAllSources()">\u5168\u9009</button>
                                <button class="topic-sources-action-btn" onclick="TopicTracker.deselectAllSources()">\u53D6\u6D88\u5168\u9009</button>
                            </div>
                        </div>
                    </div>
                    <div id="topicFetchProgress" class="topic-fetch-progress" style="display:none;">
                        <div class="topic-fetch-progress-text">\u6B63\u5728\u6293\u53D6\u6570\u636E\u6E90...</div>
                        <div class="topic-fetch-progress-bar">
                            <div class="topic-fetch-progress-fill" style="width: 0%"></div>
                        </div>
                    </div>
                    <div class="topic-modal-footer">
                        <button class="topic-modal-btn cancel" onclick="TopicTracker.closeModal()">\u53D6\u6D88</button>
                        <button class="topic-modal-btn primary" id="topicAiBtn" onclick="TopicTracker.generateKeywords()">
                            \u{1F916} \u751F\u6210\u5173\u952E\u8BCD\u548C\u63A8\u8350\u6E90
                        </button>
                        <button class="topic-modal-btn primary" id="topicSubmitBtn" onclick="TopicTracker.submitTopic()" style="display:none;">
                            \u521B\u5EFA\u5E76\u5F00\u59CB\u8FFD\u8E2A
                        </button>
                    </div>
                </div>
            </div>
        `),F=document.getElementById("topicModalOverlay"),U=document.getElementById("topicModalTitle"),_=document.getElementById("topicNameInput"),ge=document.getElementById("topicKeywordsContainer"),R=document.getElementById("topicSourcesContainer"),E=document.getElementById("topicAiBtn"),v=document.getElementById("topicSubmitBtn"),console.log("[TopicTracker] Modal created, elements cached:",{modalOverlay:!!F,modalTitle:!!U,topicNameInput:!!_})}function ye(){let e=document.getElementById("topicSubTabs");if(!e){console.warn("[TopicTracker] topicSubTabs not found, will retry later"),setTimeout(ye,1e3);return}if(e.querySelector(".sub-tab-new"))return;let t=document.createElement("button");t.className="sub-tab sub-tab-new",t.textContent="+ \u65B0\u5EFA\u4E3B\u9898",t.onclick=function(){TopicTracker.openModal()},e.insertBefore(t,e.firstChild),console.log("[TopicTracker] New topic button added to topicSubTabs")}async function Be(){await D()}function Re(){document.querySelectorAll('.sub-tab[data-category^="topic-"]').forEach(e=>{let o=e.dataset.category.replace("topic-","");e.addEventListener("click",()=>{setTimeout(()=>j(o),100)}),e.addEventListener("touchstart",()=>{setTimeout(()=>j(o),100)},{passive:!0})}),document.querySelectorAll('.tab-pane[id^="tab-topic-"]').forEach(e=>{let t=e.id.replace("tab-topic-","");new MutationObserver(c=>{for(let n of c)if(n.type==="attributes"&&n.attributeName==="class"&&e.classList.contains("active")){let s=te(t);!s.loading&&!s.loaded&&j(t)}}).observe(e,{attributes:!0,attributeFilter:["class"]})})}function j(e){let t=`topic-${e}`;if(de.get(t)==="timeline"){console.log(`[TopicTracker] Topic ${e} is in timeline mode, skipping card render`);return}let o=te(e);if(o.loading){console.log(`[TopicTracker] Topic ${e} already loading, skipping`);return}if(o.loaded){console.log(`[TopicTracker] Topic ${e} already loaded, skipping`);return}let c=document.getElementById(`topicCards-${e}`);if(!c){console.log(`[TopicTracker] Container topicCards-${e} not found`);return}if(c.querySelector(".news-item")){console.log(`[TopicTracker] Topic ${e} already has real content, marking as loaded`),o.loaded=!0;return}G(e)}async function G(e,t=!1){let o=te(e);if(o.loading){console.log(`[TopicTracker] Topic ${e} already loading, skipping`);return}if(o.loaded&&!t){console.log(`[TopicTracker] Topic ${e} already loaded, skipping`);return}let c=document.getElementById(`topicCards-${e}`);if(!c){console.error(`[TopicTracker] Container topicCards-${e} not found`);return}o.loading=!0,console.log(`[TopicTracker] Loading news for topic ${e}...`),He(c);try{let n=new AbortController,s=setTimeout(()=>n.abort(),15e3),a=`/api/topics/${e}/news?limit=50`;console.log(`[TopicTracker] Fetching: ${a}`);let i=await fetch(a,{credentials:"include",signal:n.signal});if(clearTimeout(s),console.log(`[TopicTracker] API response status: ${i.status}`),!i.ok){if(i.status===401){Pe(c,e),o.loading=!1;return}if(i.status===404){console.log(`[TopicTracker] Topic ${e} not found (404), removing tab`);let p=`topic-${e}`,u=document.querySelector(`.sub-tab[data-category="${p}"]`);u&&u.remove();let l=document.getElementById(`tab-${p}`);l&&l.remove();try{localStorage.getItem("tr_active_tab")===p&&localStorage.removeItem("tr_active_tab")}catch{}A.switchTab("my-tags"),o.loading=!1;return}throw new Error(`HTTP ${i.status}`)}let r=await i.json();if(console.log("[TopicTracker] API response:",{ok:r.ok,hasKeywordsNews:!!r.keywords_news,hasSourcesNews:!!r.sources_news,cached:r.cached}),r.ok){if(Qe(e,r.keywords_news,r.sources_news),o.loaded=!0,W>0||window._trNoRebuildExpected)try{let p=H.peekNavigationState?.()||null,u=`topic-${e}`;if(p&&p.activeTab===u){console.log(`[TopicTracker] Restoring navigation scroll after topic news loaded (gen: ${W}): ${u}`);let l=H.consumeNavigationState();requestAnimationFrame(()=>{H.restoreNavigationScrollY(l||p),H.restoreNavGridScroll(l||p)})}}catch(p){console.error("[TopicTracker] Failed to restore scroll after news load:",p)}else console.log(`[TopicTracker] Skipping scroll restore on initial load (gen: ${W})`);r.cached&&console.log(`[TopicTracker] Loaded from cache (age: ${r.cache_age}s)`)}else throw new Error(r.error||"\u52A0\u8F7D\u5931\u8D25")}catch(n){console.error(`[TopicTracker] Load topic ${e} failed:`,n);let s=n.name==="AbortError"?"\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5":n.message||"\u52A0\u8F7D\u5931\u8D25";je(c,s,e)}finally{o.loading=!1}}function He(e){e.innerHTML=`
            <div class="topic-loading-state" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                <div style="font-size:48px;margin-bottom:16px;">\u{1F50D}</div>
                <div style="font-size:16px;">\u52A0\u8F7D\u4E2D...</div>
            </div>
        `}function je(e,t,o){e.innerHTML=`
            <div class="topic-error-state" style="text-align:center;padding:60px 20px;width:100%;color:#6b7280;">
                <div style="font-size:48px;margin-bottom:16px;">\u{1F615}</div>
                <div style="font-size:16px;margin-bottom:16px;">\u52A0\u8F7D\u5931\u8D25: ${m(t)}</div>
                <button onclick="TopicTracker.retryLoadTopic('${m(o)}')" 
                        style="padding:8px 16px;background:#22c55e;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                    \u91CD\u8BD5
                </button>
            </div>
        `}function Pe(e,t){e.innerHTML=`
            <div class="topic-login-required" style="text-align:center;padding:60px 20px;width:100%;">
                <div style="font-size:48px;margin-bottom:16px;">\u{1F512}</div>
                <div style="font-size:16px;color:#374151;margin-bottom:10px;font-weight:600;">\u8BF7\u5148\u767B\u5F55</div>
                <div style="font-size:13px;color:#6b7280;margin-bottom:20px;">\u767B\u5F55\u540E\u5373\u53EF\u67E5\u770B\u4E3B\u9898\u65B0\u95FB</div>
                <button onclick="openLoginModal()" 
                        style="padding:10px 22px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:white;border:none;cursor:pointer;border-radius:8px;font-weight:500;font-size:14px;">
                    \u7ACB\u5373\u767B\u5F55
                </button>
            </div>
        `}function Ne(e){oe(e),G(e,!0)}function Qe(e,t,o){let c=document.getElementById(`topicCards-${e}`);if(!c){console.error(`[TopicTracker] renderTopicNews: container topicCards-${e} not found`);return}let n=Object.keys(t||{}),s=Object.keys(o||{});console.log(`[TopicTracker] renderTopicNews: topicId=${e}, keywords=`,n,", sources=",s);let a=n.filter(p=>(t[p]||[]).length>0).map(p=>{let u=t[p]||[];return Fe(p,u)}).join(""),i=s.filter(p=>(o[p]||[]).length>0).map(p=>{let u=o[p]||[];return We(p,u)}).join(""),r="";if(a&&(r+=a),i&&(r+=i),!r)c.innerHTML=`
                <div class="topic-no-news-hint">
                    <div class="topic-no-news-icon">\u{1F4ED}</div>
                    <div class="topic-no-news-text">\u6682\u65E0\u5339\u914D\u7684\u65B0\u95FB</div>
                    <div class="topic-no-news-tip">\u8BF7\u7F16\u8F91\u4E3B\u9898\u8C03\u6574\u5173\u952E\u8BCD\u6216\u6DFB\u52A0\u66F4\u591A\u6570\u636E\u6E90</div>
                </div>
            `;else{c.innerHTML=r;let p=n.filter(l=>(t[l]||[]).length>0).length,u=s.filter(l=>(o[l]||[]).length>0).length;console.log(`[TopicTracker] renderTopicNews: rendered ${p} keyword cards, ${u} source cards`)}}function We(e,t){let o=t[0]?.source||"",c=t.length>0?t.slice(0,50).map((i,r)=>{let p=i.id||`source-${Date.now()}-${r}`,u=m(i.title||""),l=m(i.url||""),h=u.replace(/'/g,"\\'").replace(/"/g,"&quot;"),y=l.replace(/'/g,"\\'").replace(/"/g,"&quot;"),x=`source-${e}`,T=m(e).replace(/'/g,"\\'"),g=`<button class="news-summary-btn" data-news-id="${p}" data-title="${u}" data-url="${l}" data-source-id="${x}" data-source-name="${T}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${p}', '${h}', '${y}', '${x}', '${T}')"></button>`,f=`<button class="news-comment-btn" data-url="${l}" data-title="${u}"></button>`;return`
                <li class="news-item" data-news-id="${p}" data-news-title="${u}" data-news-url="${l}">
                    <div class="news-item-content">
                        <span class="news-index">${r+1}</span>
                        <a class="news-title" href="${l}" target="_blank" rel="noopener noreferrer">
                            ${u}
                        </a>
                        <div class="news-actions">
                            <span class="tr-news-date">${Se(i.published_at)}</span>
                            <div class="news-hover-btns">${g}${f}</div>
                        </div>
                    </div>
                </li>
            `}).join(""):'<li class="news-placeholder" style="color:#9ca3af;text-align:center;padding:20px;">\u6682\u65E0\u6587\u7AE0</li>',n=t.length>0?`<span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${t.length}\u6761)</span>`:"",a=t[0]?.source_type==="wechat_mp"?"\u{1F4F1}":"\u{1F4F0}";return`
            <div class="platform-card topic-source-card" data-source="${m(e)}" data-source-id="${m(o)}">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                        ${a} ${m(e)}${n}
                    </div>
                </div>
                <ul class="news-list">${c}</ul>
            </div>
        `}function Fe(e,t){let o=t.length>0?t.slice(0,50).map((n,s)=>{let a=n.id||`topic-${Date.now()}-${s}`,i=m(n.title||""),r=m(n.url||""),p=i.replace(/'/g,"\\'").replace(/"/g,"&quot;"),u=r.replace(/'/g,"\\'").replace(/"/g,"&quot;"),l=`topic-kw-${e}`,h=m(e).replace(/'/g,"\\'"),y=`<button class="news-summary-btn" data-news-id="${a}" data-title="${i}" data-url="${r}" data-source-id="${l}" data-source-name="${h}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${a}', '${p}', '${u}', '${l}', '${h}')"></button>`,x=`<button class="news-comment-btn" data-url="${r}" data-title="${i}"></button>`;return`
                <li class="news-item" data-news-id="${a}" data-news-title="${i}" data-news-url="${r}">
                    <div class="news-item-content">
                        <span class="news-index">${s+1}</span>
                        <a class="news-title" href="${r}" target="_blank" rel="noopener noreferrer">
                            ${i}
                        </a>
                        <div class="news-actions">
                            <span class="tr-news-date">${Se(n.published_at)}</span>
                            <div class="news-hover-btns">${y}${x}</div>
                        </div>
                    </div>
                </li>
            `}).join(""):'<li class="news-placeholder" style="color:#9ca3af;text-align:center;padding:20px;">\u6682\u65E0\u76F8\u5173\u65B0\u95FB</li>',c=t.length>0?`<span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${t.length}\u6761)</span>`:"";return`
            <div class="platform-card" data-keyword="${m(e)}">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                        \u{1F50D} ${m(e)}${c}
                    </div>
                </div>
                <ul class="news-list">${o}</ul>
            </div>
        `}function Oe(){return!!N.getUser()}async function ze(){if(J()){try{let t=await(await fetch("/api/subscription/status",{credentials:"include"})).json();if(t.ok!==!1&&!t.is_vip){alert("\u65B0\u589E\u4E3B\u9898\u4E3A\u4F1A\u5458\u4E13\u5C5E\u529F\u80FD\uFF0C\u8BF7\u524D\u5F80\u8BBE\u7F6E\u4E2D\u5FC3\u5347\u7EA7\u4F1A\u5458\u3002");return}}catch(e){console.error("[TopicTracker] Failed to check subscription status:",e)}w=null,d=null,U.textContent="\u65B0\u5EFA\u8FFD\u8E2A\u4E3B\u9898",_.value="",document.getElementById("topicIconGroup").style.display="none",document.getElementById("topicKeywordsGroup").style.display="none",document.getElementById("topicSourcesGroup").style.display="none",E.style.display="",E.disabled=!1,E.innerHTML="\u{1F916} \u751F\u6210\u5173\u952E\u8BCD\u548C\u63A8\u8350\u6E90",v.style.display="none",F.classList.add("active"),_.focus()}}function V(){F.classList.remove("active"),w=null,d=null}function ue(e,t){return new Promise(o=>{let c=`
                <div class="topic-inactive-dialog-overlay" id="inactiveSourcesDialog">
                    <div class="topic-inactive-dialog">
                        <div class="topic-inactive-dialog-header">
                            <span class="topic-inactive-dialog-icon">\u26A0\uFE0F</span>
                            <h3>\u68C0\u6D4B\u5230\u4E0D\u6D3B\u8DC3\u7684\u516C\u4F17\u53F7</h3>
                        </div>
                        <div class="topic-inactive-dialog-body">
                            <p class="topic-inactive-dialog-desc">\u4EE5\u4E0B ${e.length} \u4E2A\u516C\u4F17\u53F7\u5DF2\u8D85\u8FC7 2 \u4E2A\u6708\u6CA1\u6709\u66F4\u65B0\uFF0C\u53EF\u80FD\u5DF2\u505C\u66F4\uFF1A</p>
                            <ul class="topic-inactive-source-list">
                                ${e.map(r=>{let p=r.days_inactive>0?`${r.days_inactive} \u5929\u672A\u66F4\u65B0`:"\u4ECE\u672A\u66F4\u65B0";return`<li>
                                        <span class="topic-inactive-source-name">\u{1F4F1} ${m(r.name)}</span>
                                        <span class="topic-inactive-source-days">${p}</span>
                                    </li>`}).join("")}
                            </ul>
                            <p class="topic-inactive-dialog-tip">\u79FB\u9664\u4E0D\u6D3B\u8DC3\u8D26\u53F7\u53EF\u4EE5\u8BA9\u4E3B\u9898\u5185\u5BB9\u66F4\u7CBE\u51C6</p>
                        </div>
                        <div class="topic-inactive-dialog-footer">
                            <button class="topic-inactive-btn secondary" id="inactiveKeepBtn">\u4FDD\u7559\u5168\u90E8</button>
                            <button class="topic-inactive-btn primary" id="inactiveRemoveBtn">\u79FB\u9664\u4E0D\u6D3B\u8DC3\u8D26\u53F7</button>
                        </div>
                    </div>
                </div>
            `;document.body.insertAdjacentHTML("beforeend",c);let n=document.getElementById("inactiveSourcesDialog"),s=document.getElementById("inactiveKeepBtn"),a=document.getElementById("inactiveRemoveBtn"),i=document.createElement("style");i.id="inactiveDialogStyle",i.textContent=`
                .topic-inactive-dialog-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10001;
                    animation: fadeIn 0.2s ease;
                }
                .topic-inactive-dialog {
                    background: white;
                    border-radius: 16px;
                    width: 90%;
                    max-width: 420px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    animation: slideUp 0.3s ease;
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .topic-inactive-dialog-header {
                    padding: 24px 24px 16px;
                    text-align: center;
                }
                .topic-inactive-dialog-icon {
                    font-size: 48px;
                    display: block;
                    margin-bottom: 12px;
                }
                .topic-inactive-dialog-header h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #111827;
                }
                .topic-inactive-dialog-body {
                    padding: 0 24px 20px;
                }
                .topic-inactive-dialog-desc {
                    font-size: 14px;
                    color: #6b7280;
                    margin: 0 0 16px;
                    text-align: center;
                }
                .topic-inactive-source-list {
                    list-style: none;
                    padding: 0;
                    margin: 0 0 16px;
                    max-height: 200px;
                    overflow-y: auto;
                    background: #f9fafb;
                    border-radius: 8px;
                    padding: 8px;
                }
                .topic-inactive-source-list li {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 12px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .topic-inactive-source-list li:last-child {
                    border-bottom: none;
                }
                .topic-inactive-source-name {
                    font-size: 14px;
                    color: #374151;
                    font-weight: 500;
                }
                .topic-inactive-source-days {
                    font-size: 12px;
                    color: #ef4444;
                    background: #fef2f2;
                    padding: 2px 8px;
                    border-radius: 4px;
                }
                .topic-inactive-dialog-tip {
                    font-size: 13px;
                    color: #9ca3af;
                    margin: 0;
                    text-align: center;
                }
                .topic-inactive-dialog-footer {
                    padding: 16px 24px 24px;
                    display: flex;
                    gap: 12px;
                }
                .topic-inactive-btn {
                    flex: 1;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }
                .topic-inactive-btn.secondary {
                    background: #f3f4f6;
                    color: #374151;
                }
                .topic-inactive-btn.secondary:hover {
                    background: #e5e7eb;
                }
                .topic-inactive-btn.primary {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                }
                .topic-inactive-btn.primary:hover {
                    background: linear-gradient(135deg, #dc2626, #b91c1c);
                }
            `,document.head.appendChild(i),s.onclick=()=>{n.remove(),document.getElementById("inactiveDialogStyle")?.remove(),o(!1)},a.onclick=()=>{n.remove(),document.getElementById("inactiveDialogStyle")?.remove(),o(!0)}})}async function me(e,t,o){let c=new Set(t.map(s=>s.id)),n=o.filter(s=>!c.has(s));try{let a=await(await fetch(`/api/topics/${e}`,{method:"PUT",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({rss_source_ids:n})})).json();a.ok?console.log(`[TopicTracker] Removed ${t.length} inactive sources`):console.error("[TopicTracker] Failed to remove inactive sources:",a.error)}catch(s){console.error("[TopicTracker] Failed to remove inactive sources:",s)}}async function ve(){if(!_.value.trim()){alert("\u8BF7\u5148\u8F93\u5165\u4E3B\u9898\u540D\u79F0");return}if(!await De()){Ge();return}be()}async function be(){let e=_.value.trim();if(!e){alert("\u8BF7\u5148\u8F93\u5165\u4E3B\u9898\u540D\u79F0");return}E.disabled=!0;let t=document.getElementById("topicProgressContainer"),o=document.getElementById("topicProgressFill"),c=document.getElementById("topicProgressText");t.style.display="block";let n=[{percent:5,text:"\u{1F916} \u6B63\u5728\u5206\u6790\u4E3B\u9898..."},{percent:15,text:"\u{1F50D} \u6B63\u5728\u7406\u89E3\u4E3B\u9898\u542B\u4E49..."},{percent:25,text:"\u{1F4DD} \u6B63\u5728\u751F\u6210\u5173\u952E\u8BCD..."},{percent:35,text:"\u{1F3AF} \u6B63\u5728\u4F18\u5316\u5173\u952E\u8BCD..."},{percent:45,text:"\u{1F4E1} \u6B63\u5728\u641C\u7D22\u76F8\u5173\u6570\u636E\u6E90..."},{percent:55,text:"\u{1F50E} \u6B63\u5728\u5339\u914D\u516C\u4F17\u53F7..."},{percent:65,text:"\u{1F310} \u6B63\u5728\u67E5\u627E RSS \u6E90..."},{percent:72,text:"\u2705 \u6B63\u5728\u9A8C\u8BC1\u6570\u636E\u6E90..."},{percent:78,text:"\u{1F4CA} \u6B63\u5728\u6574\u7406\u63A8\u8350\u7ED3\u679C..."},{percent:83,text:"\u23F3 \u5373\u5C06\u5B8C\u6210\uFF0C\u8BF7\u7A0D\u5019..."},{percent:87,text:"\u23F3 \u6B63\u5728\u505A\u6700\u540E\u5904\u7406..."},{percent:90,text:"\u23F3 \u9A6C\u4E0A\u5C31\u597D..."},{percent:92,text:"\u23F3 \u8FD8\u5DEE\u4E00\u70B9\u70B9..."},{percent:94,text:"\u23F3 \u5FEB\u5B8C\u6210\u4E86..."}],s=0,a=()=>{let u=n[s];o.style.width=u.percent+"%",c.textContent=u.text};a();let i=()=>s<5?2e3:s<9?3e3:4e3,r=()=>{s<n.length-1&&(s++,a(),p=setTimeout(r,i()))},p=setTimeout(r,i());try{let u=await fetch("/api/topics/generate-keywords",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({topic_name:e})});if(u.status===401){alert("\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55"),typeof openLoginModal=="function"&&openLoginModal();return}let l=await u.json();l.ok?(o.style.width="100%",c.textContent="\u2705 \u751F\u6210\u5B8C\u6210\uFF01",d={icon:l.icon||"\u{1F3F7}\uFE0F",keywords:l.keywords||[],recommended_sources:l.recommended_sources||[],has_wechat_credentials:l.has_wechat_credentials},setTimeout(()=>{t.style.display="none",Te(),E.style.display="none",v.style.display="",v.disabled=!1,v.textContent="\u521B\u5EFA\u5E76\u5F00\u59CB\u8FFD\u8E2A"},500)):(o.style.width="100%",o.style.background="#ef4444",c.textContent="\u274C "+(l.error||"AI \u751F\u6210\u5931\u8D25"),setTimeout(()=>{t.style.display="none",o.style.background=""},2e3))}catch(u){console.error("Generate keywords failed:",u),o.style.width="100%",o.style.background="#ef4444",c.textContent="\u274C AI \u751F\u6210\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",setTimeout(()=>{t.style.display="none",o.style.background=""},2e3)}finally{clearTimeout(p),E.disabled=!1,E.innerHTML="\u{1F916} \u751F\u6210\u5173\u952E\u8BCD\u548C\u63A8\u8350\u6E90"}}async function De(){if(Y===!0)return!0;try{let o=(await(await fetch("/api/topics/check-credentials",{credentials:"include"})).json()).has_wechat_credentials===!0;return o&&(Y=!0),o}catch(e){return console.error("Check credentials failed:",e),!1}}function Ue(){Y=!0}function Ge(){if(document.getElementById("wechatQrcodeModal")){document.getElementById("wechatQrcodeModal").classList.add("active"),X();return}let e=document.createElement("div");e.id="wechatQrcodeModal",e.className="wechat-qrcode-modal active",e.innerHTML=`
            <div class="wechat-qrcode-content">
                <button class="wechat-qrcode-close" onclick="TopicTracker.closeQrcodeModal()">\xD7</button>
                <div class="wechat-qrcode-header">
                    <div class="wechat-qrcode-icon">\u{1F4F1}</div>
                    <h3>\u626B\u7801\u6388\u6743\u5FAE\u4FE1\u516C\u4F17\u53F7</h3>
                </div>
                <div class="wechat-qrcode-body">
                    <p>\u4E3A\u4E86\u9A8C\u8BC1\u548C\u83B7\u53D6\u516C\u4F17\u53F7\u6587\u7AE0\uFF0C\u9700\u8981\u5148\u626B\u7801\u6388\u6743\uFF1A</p>
                    <div id="qrcodeModalQRArea" class="wechat-qrcode-area">
                        <div class="topic-wechat-qr-loading">
                            <span class="topic-spinner"></span>
                            \u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801...
                        </div>
                    </div>
                    <div class="wechat-qrcode-tips">
                        <p>\u{1F4A1} \u4F7F\u7528\u5FAE\u4FE1\u626B\u63CF\u4E0A\u65B9\u4E8C\u7EF4\u7801</p>
                        <p>\u26A0\uFE0F \u8BF7\u6CE8\u518C\u516C\u4F17\u53F7\u6216\u670D\u52A1\u53F7</p>
                    </div>
                </div>
                <div class="wechat-qrcode-footer">
                    <button class="wechat-qrcode-btn secondary" onclick="TopicTracker.closeQrcodeModal()">\u7A0D\u540E\u518D\u8BF4</button>
                </div>
            </div>
        `,document.body.appendChild(e),X()}var q={polling:!1,sessionId:null};async function X(){let e=document.getElementById("qrcodeModalQRArea");if(e){e.innerHTML=`
            <div class="topic-wechat-qr-loading">
                <span class="topic-spinner"></span>
                \u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801...
            </div>
        `;try{let o=await(await fetch("/api/wechat/auth/qr/start",{method:"POST",credentials:"include"})).json();if(!o.ok)throw new Error(o.error||"\u521B\u5EFA\u4F1A\u8BDD\u5931\u8D25");q.sessionId=o.session_id;let c=`/api/wechat/auth/qr/image?t=${Date.now()}`;e.innerHTML=`
                <img src="${c}" alt="\u767B\u5F55\u4E8C\u7EF4\u7801" class="wechat-qrcode-image" 
                     onerror="this.parentElement.innerHTML='<p class=wechat-qrcode-error>\u4E8C\u7EF4\u7801\u52A0\u8F7D\u5931\u8D25</p>'">
                <p id="qrcodeModalStatus" class="wechat-qrcode-status">\u7B49\u5F85\u626B\u7801...</p>
                <button class="wechat-qrcode-refresh" onclick="TopicTracker.refreshQrcodeModal()">\u{1F504} \u5237\u65B0\u4E8C\u7EF4\u7801</button>
            `,q.polling=!0,Z()}catch(t){console.error("[TopicTracker] Start QR error:",t),e.innerHTML=`
                <p class="wechat-qrcode-error">\u83B7\u53D6\u4E8C\u7EF4\u7801\u5931\u8D25: ${m(t.message)}</p>
                <button class="wechat-qrcode-refresh" onclick="TopicTracker.refreshQrcodeModal()">\u91CD\u8BD5</button>
            `}}}async function Z(){if(q.polling)try{let t=await(await fetch("/api/wechat/auth/qr/status",{credentials:"include"})).json(),o=document.getElementById("qrcodeModalStatus");if(!o){q.polling=!1;return}if(t.status==="waiting")o.textContent="\u7B49\u5F85\u626B\u7801...",o.className="wechat-qrcode-status";else if(t.status==="scanned")o.textContent="\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u767B\u5F55",o.className="wechat-qrcode-status scanned";else if(t.status==="confirmed"){o.textContent="\u2705 \u6388\u6743\u6210\u529F\uFF01",o.className="wechat-qrcode-status confirmed",q.polling=!1,await Ke();return}else if(t.status==="expired"||t.need_refresh){o.textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F",o.className="wechat-qrcode-status expired",q.polling=!1;let c=document.getElementById("qrcodeModalQRArea");c&&(c.innerHTML=`
                        <p class="wechat-qrcode-error">\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F</p>
                        <button class="wechat-qrcode-refresh" onclick="TopicTracker.refreshQrcodeModal()">\u91CD\u65B0\u83B7\u53D6</button>
                    `);return}else t.status==="error"&&(o.textContent=t.message||"\u51FA\u9519\u4E86",o.className="wechat-qrcode-status error");q.polling&&setTimeout(Z,2e3)}catch(e){console.error("[TopicTracker] Poll QR status error:",e),q.polling&&setTimeout(Z,3e3)}}async function Ke(){try{let t=await(await fetch("/api/wechat/auth/qr/complete",{method:"POST",credentials:"include"})).json();if(t.ok){let o=document.getElementById("qrcodeModalStatus");o&&(o.textContent="\u2705 \u6388\u6743\u6210\u529F\uFF01\u6B63\u5728\u751F\u6210...",o.className="wechat-qrcode-status confirmed"),Ue(),setTimeout(()=>{se(),be()},1e3)}else{let o=document.getElementById("qrcodeModalStatus");o&&(o.textContent=t.error||"\u767B\u5F55\u5931\u8D25",o.className="wechat-qrcode-status error")}}catch(e){console.error("[TopicTracker] Complete QR login error:",e)}}function Je(){q.polling=!1,X()}function se(){let e=document.getElementById("wechatQrcodeModal");e&&e.classList.remove("active")}function Ye(){se(),ve()}function Te(){d&&(document.getElementById("topicIconGroup").style.display="block",document.getElementById("topicIconPreview").textContent=d.icon,document.getElementById("topicKeywordsGroup").style.display="block",ne(),d.recommended_sources.length>0&&(document.getElementById("topicSourcesGroup").style.display="block",ae()))}function ne(){if(!d)return;let e=d.keywordStats||{},t=d.keywords.map(o=>{let c=e[o],n=c!==void 0,s=c>0,a="";return n&&(s?a=`<span class="topic-keyword-count has-news">${c}</span>`:a='<span class="topic-keyword-count no-news" title="\u6682\u65E0\u5339\u914D\u65B0\u95FB">0</span>'),`
                <span class="topic-keyword-tag ${n&&!s?"inactive":""}">
                    ${m(o)}${a}
                    <button class="topic-keyword-remove" onclick="TopicTracker.removeKeyword('${m(o)}')">\xD7</button>
                </span>
            `}).join("")+`
            <button class="topic-keyword-add" onclick="TopicTracker.addKeyword()">+ \u6DFB\u52A0\u5173\u952E\u8BCD</button>
        `;ge.innerHTML=t}function Ve(){let e=prompt("\u8BF7\u8F93\u5165\u5173\u952E\u8BCD\uFF1A");!e||!e.trim()||(d||(d={icon:"\u{1F3F7}\uFE0F",keywords:[],recommended_sources:[]},document.getElementById("topicIconGroup").style.display="block",document.getElementById("topicKeywordsGroup").style.display="block"),d.keywords.includes(e.trim())||(d.keywords.push(e.trim()),ne(),v.disabled=!1))}function Xe(e){d&&(d.keywords=d.keywords.filter(t=>t!==e),ne(),d.keywords.length===0&&(v.disabled=!0))}function ae(){if(!d||!d.recommended_sources)return;let e=d.recommended_sources;if(e.length===0){R.innerHTML=`
                <div class="topic-sources-empty-hint">
                    <div class="topic-sources-empty-icon">\u{1F4ED}</div>
                    <div class="topic-sources-empty-text">\u6682\u672A\u627E\u5230\u5339\u914D\u7684\u6570\u636E\u6E90</div>
                    <div class="topic-sources-empty-tip">\u8BF7\u4F7F\u7528\u4E0B\u65B9\u6309\u94AE\u624B\u52A8\u641C\u7D22\u6DFB\u52A0\u76F8\u5173\u7684\u8BA2\u9605\u6E90\u6216\u516C\u4F17\u53F7</div>
                </div>
                <div class="topic-sources-add">
                    <button class="topic-ai-btn small" onclick="TopicTracker.regenerateSources()">
                        \u{1F504} \u91CD\u65B0\u641C\u7D22
                    </button>
                    <button class="topic-ai-btn small secondary" onclick="TopicTracker.showManualAddForm()">
                        \u2795 \u624B\u52A8\u6DFB\u52A0\u6570\u636E\u6E90
                    </button>
                </div>
            `;return}let t=e.filter(s=>s.verified),o=e.filter(s=>!s.verified),c="";t.length>0&&(c+='<div class="topic-sources-section-title">\u2705 \u5DF2\u9A8C\u8BC1\u6570\u636E\u6E90</div>',c+=t.map((s,a)=>{let i=s.type==="rss",r=i?"RSS":"\u516C\u4F17\u53F7",p=i?"":"wechat",u=i?s.url:s.wechat_id?`\u5FAE\u4FE1\u53F7: ${s.wechat_id}`:"",l=e.indexOf(s);return`
                    <div class="topic-source-item verified">
                        <input type="checkbox" class="topic-source-checkbox" 
                               id="source-${l}" data-source-idx="${l}" 
                               data-source-id="${s.id||""}" checked>
                        <div class="topic-source-info">
                            <div class="topic-source-name">${m(s.name)}</div>
                            ${u?`<div class="topic-source-url">${m(u)}</div>`:""}
                            ${s.description?`<div class="topic-source-desc">${m(s.description)}</div>`:""}
                        </div>
                        <span class="topic-source-type ${p}">${r}</span>
                    </div>
                `}).join("")),o.length>0&&(c+='<div class="topic-sources-section-title">\u26A0\uFE0F AI \u63A8\u8350\uFF08\u9700\u9A8C\u8BC1\uFF09</div>',c+=o.map((s,a)=>{let i=s.type==="rss",r=i?"RSS":"\u516C\u4F17\u53F7",p=i?"":"wechat",u=i?s.url:`\u5FAE\u4FE1\u53F7: ${s.wechat_id}`,l=e.indexOf(s);return`
                    <div class="topic-source-item unverified">
                        <input type="checkbox" class="topic-source-checkbox" 
                               id="source-${l}" data-source-idx="${l}" checked>
                        <div class="topic-source-info">
                            <div class="topic-source-name">${m(s.name)}</div>
                            <div class="topic-source-url">${m(u)}</div>
                            ${s.description?`<div class="topic-source-desc">${m(s.description)}</div>`:""}
                        </div>
                        <span class="topic-source-type ${p}">${r}</span>
                    </div>
                `}).join("")),e.length<3&&(c+=`
                <div class="topic-sources-few-hint">
                    \u{1F4A1} \u6570\u636E\u6E90\u8F83\u5C11\uFF0C\u5EFA\u8BAE\u624B\u52A8\u641C\u7D22\u6DFB\u52A0\u66F4\u591A\u76F8\u5173\u7684\u8BA2\u9605\u6E90\u6216\u516C\u4F17\u53F7
                </div>
            `);let n=`
            <div class="topic-sources-add">
                <button class="topic-ai-btn small" onclick="TopicTracker.regenerateSources()">
                    \u{1F504} AI \u65B0\u589E\u6570\u636E\u6E90
                </button>
                <button class="topic-ai-btn small secondary" onclick="TopicTracker.showManualAddForm()">
                    \u2795 \u624B\u52A8\u6DFB\u52A0\u6570\u636E\u6E90
                </button>
            </div>
        `;R.innerHTML=c+n}async function ie(e){let t="";if(e&&e.length>0)try{let c=await(await fetch("/api/topics/sources/batch",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({source_ids:e})})).json();if(c.ok&&c.sources){let n={};c.sources.forEach(s=>n[s.id]=s),t+='<div class="topic-sources-section-title">\u5DF2\u5173\u8054\u7684\u6570\u636E\u6E90</div>',t+=e.map((s,a)=>{let i=n[s]||{id:s,name:s,type:"rss"},r=i.type!=="wechat_mp",p=r?"RSS":"\u516C\u4F17\u53F7",u=r?"":"wechat",l=r?i.url||"":i.wechat_id?`\u5FAE\u4FE1\u53F7: ${i.wechat_id}`:"";return`
                            <div class="topic-source-item">
                                <input type="checkbox" class="topic-source-checkbox existing-source" 
                                       id="existing-source-${a}" data-source-id="${s}" checked>
                                <div class="topic-source-info">
                                    <div class="topic-source-name">${m(i.name)}</div>
                                    ${l?`<div class="topic-source-url">${m(l)}</div>`:""}
                                </div>
                                <span class="topic-source-type ${u}">${p}</span>
                            </div>
                        `}).join("")}}catch(o){console.error("Failed to fetch source details:",o)}d&&d.recommended_sources&&d.recommended_sources.length>0&&(t+='<div class="topic-sources-section-title">\u65B0\u6DFB\u52A0\u7684\u6570\u636E\u6E90</div>',t+=d.recommended_sources.map((o,c)=>{let n=o.type==="rss",s=n?"RSS":"\u516C\u4F17\u53F7",a=n?"":"wechat",i=n?o.url:`\u5FAE\u4FE1\u53F7: ${o.wechat_id}`,r=o.verified&&o.id?`data-source-id="${m(o.id)}"`:"";return`
                    <div class="topic-source-item">
                        <input type="checkbox" class="topic-source-checkbox" 
                               id="source-${c}" data-source-idx="${c}" ${r} checked>
                        <div class="topic-source-info">
                            <div class="topic-source-name">${m(o.name)}</div>
                            <div class="topic-source-url">${m(i)}</div>
                        </div>
                        <span class="topic-source-type ${a}">${s}</span>
                    </div>
                `}).join("")),t+=`
            <div class="topic-sources-add">
                <button class="topic-ai-btn small" onclick="TopicTracker.regenerateSources()">
                    \u{1F504} AI \u65B0\u589E\u6570\u636E\u6E90
                </button>
                <button class="topic-ai-btn small secondary" onclick="TopicTracker.showManualAddForm()">
                    \u2795 \u624B\u52A8\u6DFB\u52A0\u6570\u636E\u6E90
                </button>
            </div>
        `,R.innerHTML=t}function Ze(){document.querySelectorAll(".topic-source-checkbox").forEach(e=>e.checked=!0)}function et(){document.querySelectorAll(".topic-source-checkbox").forEach(e=>e.checked=!1)}async function tt(){let e=_.value.trim();if(!e){alert("\u8BF7\u8F93\u5165\u4E3B\u9898\u540D\u79F0");return}if(!d||d.keywords.length===0){alert("\u8BF7\u81F3\u5C11\u6DFB\u52A0\u4E00\u4E2A\u5173\u952E\u8BCD");return}let t=[];document.querySelectorAll(".topic-source-checkbox:checked:not(.existing-source)").forEach(c=>{let n=parseInt(c.dataset.sourceIdx);d.recommended_sources&&d.recommended_sources[n]&&t.push(d.recommended_sources[n])});let o=[];document.querySelectorAll(".topic-source-checkbox.existing-source:checked").forEach(c=>{let n=c.dataset.sourceId;n&&o.push(n)}),v.disabled=!0,v.innerHTML='<span class="topic-spinner"></span> \u521B\u5EFA\u4E2D...';try{let c=[],n=[];document.querySelectorAll(".topic-source-checkbox:checked:not(.existing-source)").forEach(h=>{let y=parseInt(h.dataset.sourceIdx),x=h.dataset.sourceId;if(d.recommended_sources&&d.recommended_sources[y]){let T=d.recommended_sources[y];T.verified&&T.id?c.push(T.id):n.push(T)}});let s=[];if(n.length>0){v.innerHTML='<span class="topic-spinner"></span> \u9A8C\u8BC1\u6570\u636E\u6E90...';let y=await(await fetch("/api/topics/validate-sources",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({sources:n})})).json();if(y.ok&&y.validated_sources){s=y.validated_sources.map(f=>f.id);let x=y.validated_sources.filter(f=>f.status==="created").length,T=y.validated_sources.filter(f=>f.status==="exists").length,g=y.failed_sources||[];if(g.length>0){let f=g.map(S=>`\u2022 ${S.name}: ${S.reason}`).join(`
`),k=x+T;k>0?alert(`\u6210\u529F\u6DFB\u52A0 ${k} \u4E2A\u6570\u636E\u6E90

\u4EE5\u4E0B ${g.length} \u4E2A\u6E90\u9A8C\u8BC1\u5931\u8D25\uFF1A
${f}`):c.length===0&&o.length===0&&alert(`\u6240\u6709\u6570\u636E\u6E90\u9A8C\u8BC1\u5931\u8D25\uFF1A
${f}

\u4E3B\u9898\u4ECD\u4F1A\u521B\u5EFA\uFF0C\u4F46\u4E0D\u4F1A\u5173\u8054\u8FD9\u4E9B\u6570\u636E\u6E90\u3002`)}}}let a=[...new Set([...o,...c,...s])];console.log(`[TopicTracker] Source IDs: existing=${o.length}, verified=${c.length}, new=${s.length}, total=${a.length}`),v.innerHTML='<span class="topic-spinner"></span> \u4FDD\u5B58\u4E3B\u9898...';let i={name:e,icon:d.icon,keywords:d.keywords,rss_source_ids:a},r=w?`/api/topics/${w.id}`:"/api/topics",l=await(await fetch(r,{method:w?"PUT":"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify(i)})).json();if(l.ok){let h=l.topic?.id||(w?w.id:null);if(!w&&h){let y=a.length;if(y>0){let T=document.getElementById("topicFetchProgress"),g=T?.querySelector(".topic-fetch-progress-text"),f=T?.querySelector(".topic-fetch-progress-fill");T&&(T.style.display="block"),v.innerHTML='<span class="topic-spinner"></span> \u6293\u53D6\u4E2D...';let k=5;f&&(f.style.width="5%"),g&&(g.textContent=`\u{1F4E1} \u6B63\u5728\u6293\u53D6 ${y} \u4E2A\u6570\u636E\u6E90...`);let S=[{at:20,text:"\u{1F4F1} \u6B63\u5728\u6293\u53D6\u516C\u4F17\u53F7\u6587\u7AE0..."},{at:40,text:"\u{1F4F0} \u6B63\u5728\u83B7\u53D6 RSS \u5185\u5BB9..."},{at:60,text:"\u{1F4BE} \u6B63\u5728\u4FDD\u5B58\u5230\u6570\u636E\u5E93..."},{at:75,text:"\u{1F4CA} \u6B63\u5728\u6574\u7406\u6587\u7AE0\u5217\u8868..."}],B=0,P=setInterval(()=>{if(k<90){k+=(90-k)*.06;let M=Math.round(k);f&&(f.style.width=M+"%"),B<S.length&&M>=S[B].at&&(g&&(g.textContent=S[B].text),B++)}},500);try{let C=await(await fetch(`/api/topics/${h}/fetch-sources`,{method:"POST",credentials:"include"})).json();if(clearInterval(P),C.ok){let L=C.fetched||0;f&&(f.style.width="100%"),g&&(g.textContent=`\u2705 \u6293\u53D6\u5B8C\u6210 (${L}\u6761\u65B0\u95FB)`),v.innerHTML='<span class="topic-spinner"></span> \u5904\u7406\u4E2D...',console.log(`[TopicTracker] Fetch completed: ${L} articles from ${y} sources`);let O=C.inactive_sources||[];O.length>0&&await ue(O,h)&&(g&&(g.textContent="\u{1F5D1}\uFE0F \u6B63\u5728\u79FB\u9664\u4E0D\u6D3B\u8DC3\u8D26\u53F7..."),await me(h,O,a))}else console.warn("[TopicTracker] Fetch sources warning:",C.error),f&&(f.style.width="100%"),g&&(g.textContent="\u2705 \u6293\u53D6\u5B8C\u6210\uFF0C\u5373\u5C06\u8DF3\u8F6C...");await new Promise(L=>setTimeout(L,800))}catch(M){console.error("[TopicTracker] Fetch sources failed:",M),clearInterval(P)}}V();let x=`topic-${h}`;try{localStorage.setItem("tr_active_tab",x)}catch{}window.location.reload()}else if(h){let y=new Set(w.rss_source_ids||w.rss_sources||[]),x=a.filter(g=>!y.has(g));if(x.length>0){let g=document.getElementById("topicFetchProgress"),f=g?.querySelector(".topic-fetch-progress-text"),k=g?.querySelector(".topic-fetch-progress-fill");g&&(g.style.display="block"),v.innerHTML='<span class="topic-spinner"></span> \u6293\u53D6\u65B0\u6570\u636E\u6E90...';let S=5;k&&(k.style.width="5%"),f&&(f.textContent=`\u{1F4E1} \u6B63\u5728\u6293\u53D6 ${x.length} \u4E2A\u65B0\u6570\u636E\u6E90...`);let B=setInterval(()=>{S<90&&(S+=(90-S)*.08,k&&(k.style.width=Math.round(S)+"%"))},500);try{let M=await(await fetch(`/api/topics/${h}/fetch-sources`,{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({source_ids:x})})).json();if(clearInterval(B),M.ok){let C=M.fetched||0;k&&(k.style.width="100%"),f&&(f.textContent=`\u2705 \u6293\u53D6\u5B8C\u6210 (${C}\u6761\u65B0\u6587\u7AE0)`);let L=M.inactive_sources||[];L.length>0&&await ue(L,h)&&(f&&(f.textContent="\u{1F5D1}\uFE0F \u6B63\u5728\u79FB\u9664\u4E0D\u6D3B\u8DC3\u8D26\u53F7..."),await me(h,L,a))}else k&&(k.style.width="100%"),f&&(f.textContent="\u2705 \u4FDD\u5B58\u5B8C\u6210");await new Promise(C=>setTimeout(C,600))}catch(P){console.error("[TopicTracker] Edit fetch failed:",P),clearInterval(B)}}V();let T=`topic-${h}`;try{localStorage.setItem("tr_active_tab",T)}catch{}window.location.reload()}}else alert(l.error||"\u64CD\u4F5C\u5931\u8D25")}catch(c){console.error("Submit topic failed:",c),alert("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5")}finally{v.disabled=!1,v.innerHTML=w?"\u4FDD\u5B58\u66F4\u6539":"\u521B\u5EFA\u5E76\u5F00\u59CB\u8FFD\u8E2A"}}function ot(e){oe(e),G(e,!0)}async function ct(e){if(!J())return;let t=I.find(o=>o.id===e);if(t){w=t,d={icon:t.icon||"\u{1F3F7}\uFE0F",keywords:[...t.keywords],recommended_sources:[],keywordStats:{}};try{let c=await(await fetch(`/api/topics/${e}/news?limit=1`,{credentials:"include"})).json();if(c.ok&&c.keywords_news)for(let n of t.keywords)d.keywordStats[n]=(c.keywords_news[n]||[]).length}catch(o){console.warn("Failed to load keyword stats:",o)}U.textContent="\u7F16\u8F91\u4E3B\u9898",_.value=t.name,E.style.display="none",v.style.display="",v.textContent="\u4FDD\u5B58\u66F4\u6539",v.disabled=!1,Te(),document.getElementById("topicSourcesGroup").style.display="block",await ie(t.rss_sources||[]),F.classList.add("active")}}var b={checked:!1,hasAuth:!1,qrPolling:!1,pollTimer:null,sessionId:null};function st(){$=[];let e=`
            <div class="topic-manual-add-form" id="manualAddForm">
                <div class="topic-manual-tabs">
                    <button class="topic-manual-tab active" data-tab="rss" onclick="TopicTracker.switchManualTab('rss')">RSS \u6E90</button>
                    <button class="topic-manual-tab" data-tab="wechat" onclick="TopicTracker.switchManualTab('wechat')">\u5FAE\u4FE1\u516C\u4F17\u53F7</button>
                </div>
                <div class="topic-manual-content" id="manualTabRss">
                    <div class="topic-form-group compact">
                        <label>RSS \u540D\u79F0</label>
                        <input type="text" id="manualRssName" placeholder="\u4F8B\u5982\uFF1A36\u6C2A\u79D1\u6280" class="topic-form-input">
                    </div>
                    <div class="topic-form-group compact">
                        <label>RSS URL</label>
                        <input type="text" id="manualRssUrl" placeholder="https://example.com/feed.xml" class="topic-form-input">
                    </div>
                </div>
                <div class="topic-manual-content" id="manualTabWechat" style="display:none;">
                    <div id="topicWechatAuthArea">
                        <div class="topic-mp-loading">\u68C0\u67E5\u6388\u6743\u72B6\u6001...</div>
                    </div>
                    <div id="topicWechatSearchArea" style="display:none;">
                        <div class="topic-form-group compact">
                            <label>\u641C\u7D22\u516C\u4F17\u53F7</label>
                            <div class="topic-mp-search-box">
                                <input type="text" id="mpSearchInput" placeholder="\u641C\u7D22\u516C\u4F17\u53F7\uFF08\u81F3\u5C112\u4E2A\u5B57\u7B26\uFF09..." 
                                       class="topic-form-input" onkeydown="if(event.key==='Enter')TopicTracker.doMpSearch()">
                                <button class="topic-mp-search-btn" onclick="TopicTracker.doMpSearch()">\u641C\u7D22</button>
                            </div>
                            <div class="topic-mp-search-results" id="mpSearchResults">
                                <div class="topic-mp-empty">\u8F93\u5165\u5173\u952E\u8BCD\u641C\u7D22\u516C\u4F17\u53F7</div>
                            </div>
                        </div>
                        <div class="topic-mp-selected" id="mpSelectedList"></div>
                    </div>
                </div>
                <div class="topic-manual-actions">
                    <button class="topic-modal-btn cancel small" onclick="TopicTracker.hideManualAddForm()">\u53D6\u6D88</button>
                    <button class="topic-modal-btn primary small" onclick="TopicTracker.addManualSource()">\u6DFB\u52A0</button>
                </div>
            </div>
        `,t=R.querySelector(".topic-sources-add");t?(t.insertAdjacentHTML("beforebegin",e),t.style.display="none"):R.insertAdjacentHTML("beforeend",e)}function nt(){let e=document.getElementById("mpSearchInput");e&&we(e.value)}var $=[];async function we(e){let t=document.getElementById("mpSearchResults");if(!t)return;let o=e.trim();if(o.length<2){t.innerHTML='<div class="topic-mp-empty">\u8BF7\u8F93\u5165\u81F3\u5C112\u4E2A\u5B57\u7B26</div>';return}t.innerHTML='<div class="topic-mp-empty">\u641C\u7D22\u4E2D...</div>';try{let c=await fetch(`/api/wechat/search?keyword=${encodeURIComponent(o)}&limit=20`,{credentials:"include"});if(!c.ok){let a=await c.json().catch(()=>({}));throw new Error(a.detail||"\u641C\u7D22\u5931\u8D25")}let n=await c.json(),s=n.list||n.results||[];if(s.length===0){t.innerHTML='<div class="topic-mp-empty">\u672A\u627E\u5230\u5339\u914D\u7684\u516C\u4F17\u53F7</div>';return}t.innerHTML=s.map(a=>{let i=$.some(r=>r.fakeid===a.fakeid);return`
                    <div class="topic-mp-item ${i?"selected":""}" 
                         data-fakeid="${a.fakeid}" 
                         data-nickname="${m(a.nickname)}"
                         onclick="TopicTracker.toggleMpSelection(this)">
                        ${a.round_head_img?`<img class="topic-mp-avatar" src="${a.round_head_img}" alt="">`:'<div class="topic-mp-avatar-placeholder">\u{1F4F1}</div>'}
                        <div class="topic-mp-info">
                            <div class="topic-mp-name">${m(a.nickname)}</div>
                            ${a.signature?`<div class="topic-mp-sig">${m(a.signature.substring(0,50))}</div>`:""}
                        </div>
                        <span class="topic-mp-check">${i?"\u2713":""}</span>
                    </div>
                `}).join("")}catch(c){console.error("Search MPs failed:",c),t.innerHTML=`<div class="topic-mp-empty">\u641C\u7D22\u5931\u8D25: ${m(c.message)}</div>`}}function at(e){let t=e.dataset.fakeid,o=e.dataset.nickname,c=$.findIndex(n=>n.fakeid===t);c>=0?($.splice(c,1),e.classList.remove("selected"),e.querySelector(".topic-mp-check").textContent=""):($.push({fakeid:t,nickname:o}),e.classList.add("selected"),e.querySelector(".topic-mp-check").textContent="\u2713"),ke()}function ke(){let e=document.getElementById("mpSelectedList");if(e){if($.length===0){e.innerHTML="";return}e.innerHTML=`
            <div class="topic-mp-selected-label">\u5DF2\u9009\u62E9 ${$.length} \u4E2A\u516C\u4F17\u53F7\uFF1A</div>
            <div class="topic-mp-selected-tags">
                ${$.map(t=>`
                    <span class="topic-mp-tag">
                        ${m(t.nickname)}
                        <button onclick="TopicTracker.removeMpSelection('${t.fakeid}')">&times;</button>
                    </span>
                `).join("")}
            </div>
        `}}function it(e){$=$.filter(o=>o.fakeid!==e),ke();let t=document.querySelector(`.topic-mp-item[data-fakeid="${e}"]`);t&&(t.classList.remove("selected"),t.querySelector(".topic-mp-check").textContent="")}function xe(){re();let e=document.getElementById("manualAddForm");e&&e.remove();let t=R.querySelector(".topic-sources-add");t&&(t.style.display="")}function rt(e){document.querySelectorAll(".topic-manual-tab").forEach(t=>t.classList.remove("active")),document.querySelector(`.topic-manual-tab[data-tab="${e}"]`).classList.add("active"),document.getElementById("manualTabRss").style.display=e==="rss"?"":"none",document.getElementById("manualTabWechat").style.display=e==="wechat"?"":"none",e==="wechat"?lt():re()}async function lt(){let e=document.getElementById("topicWechatAuthArea"),t=document.getElementById("topicWechatSearchArea");if(!(!e||!t)){e.innerHTML='<div class="topic-mp-loading">\u68C0\u67E5\u6388\u6743\u72B6\u6001...</div>',e.style.display="",t.style.display="none";try{let c=await(await fetch("/api/wechat/auth/auto",{method:"POST",credentials:"include"})).json();b.checked=!0,b.hasAuth=c.has_auth===!0,b.hasAuth?(e.style.display="none",t.style.display=""):fe()}catch(o){console.error("[TopicTracker] Check wechat auth failed:",o),b.hasAuth=!1,fe()}}}function fe(){let e=document.getElementById("topicWechatAuthArea");e&&(e.innerHTML=`
            <div class="topic-wechat-auth">
                <div class="topic-wechat-qr-area" id="topicWechatQRArea">
                    <div class="topic-wechat-qr-loading">
                        <span class="topic-spinner"></span>
                        \u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801...
                    </div>
                </div>
                <p class="topic-wechat-qr-hint">\u8BF7\u4F7F\u7528\u5FAE\u4FE1\u626B\u63CF\u4E8C\u7EF4\u7801\u6388\u6743</p>
                <p class="topic-wechat-qr-note">
                    \u26A0\uFE0F \u9700\u8981 <a href="https://mp.weixin.qq.com/cgi-bin/registermidpage?action=index&weblogo=1&lang=zh_CN" target="_blank">\u6CE8\u518C\u516C\u4F17\u53F7\u6216\u670D\u52A1\u53F7</a> \u624D\u80FD\u641C\u7D22\u516C\u4F17\u53F7
                </p>
            </div>
        `,e.style.display="",$e())}async function $e(){let e=document.getElementById("topicWechatQRArea");if(e){e.innerHTML=`
            <div class="topic-wechat-qr-loading">
                <span class="topic-spinner"></span>
                \u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801...
            </div>
        `;try{let o=await(await fetch("/api/wechat/auth/qr/start",{method:"POST",credentials:"include"})).json();if(!o.ok)throw new Error(o.error||"\u521B\u5EFA\u4F1A\u8BDD\u5931\u8D25");b.sessionId=o.session_id;let c=`/api/wechat/auth/qr/image?t=${Date.now()}`;e.innerHTML=`
                <img src="${c}" alt="\u767B\u5F55\u4E8C\u7EF4\u7801" class="topic-wechat-qr-image" 
                     onerror="this.parentElement.innerHTML='<p class=topic-wechat-qr-error>\u4E8C\u7EF4\u7801\u52A0\u8F7D\u5931\u8D25</p>'">
                <p id="topicWechatQRStatus" class="topic-wechat-qr-status">\u7B49\u5F85\u626B\u7801...</p>
                <button class="topic-wechat-qr-refresh" onclick="TopicTracker.refreshWechatQR()">\u{1F504} \u5237\u65B0\u4E8C\u7EF4\u7801</button>
            `,b.qrPolling=!0,ee()}catch(t){console.error("[TopicTracker] Start QR error:",t),e.innerHTML=`
                <p class="topic-wechat-qr-error">\u83B7\u53D6\u4E8C\u7EF4\u7801\u5931\u8D25: ${m(t.message)}</p>
                <button class="topic-wechat-qr-refresh" onclick="TopicTracker.refreshWechatQR()">\u91CD\u8BD5</button>
            `}}}async function ee(){if(b.qrPolling)try{let t=await(await fetch("/api/wechat/auth/qr/status",{credentials:"include"})).json(),o=document.getElementById("topicWechatQRStatus");if(!o){b.qrPolling=!1;return}if(t.status==="waiting")o.textContent="\u7B49\u5F85\u626B\u7801...",o.className="topic-wechat-qr-status";else if(t.status==="scanned")o.textContent="\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u767B\u5F55",o.className="topic-wechat-qr-status scanned";else if(t.status==="confirmed"){o.textContent="\u5DF2\u786E\u8BA4\uFF0C\u6B63\u5728\u5B8C\u6210\u767B\u5F55...",o.className="topic-wechat-qr-status confirmed",b.qrPolling=!1,await dt();return}else if(t.status==="expired"||t.need_refresh){o.textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F",o.className="topic-wechat-qr-status expired",b.qrPolling=!1;let c=document.getElementById("topicWechatQRArea");c&&(c.innerHTML=`
                        <p class="topic-wechat-qr-error">\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F</p>
                        <button class="topic-wechat-qr-refresh" onclick="TopicTracker.refreshWechatQR()">\u91CD\u65B0\u83B7\u53D6</button>
                    `);return}else t.status==="error"&&(o.textContent=t.message||"\u51FA\u9519\u4E86",o.className="topic-wechat-qr-status error");b.qrPolling&&(b.pollTimer=setTimeout(ee,2e3))}catch(e){console.error("[TopicTracker] Poll QR error:",e),b.qrPolling&&(b.pollTimer=setTimeout(ee,3e3))}}async function dt(){let e=document.getElementById("topicWechatQRArea");try{let o=await(await fetch("/api/wechat/auth/qr/complete-and-share",{method:"POST",credentials:"include"})).json();if(!o.ok)throw new Error(o.error||"\u767B\u5F55\u5931\u8D25");e&&(e.innerHTML=`
                    <p class="topic-wechat-qr-success">\u2713 \u6388\u6743\u6210\u529F\uFF01</p>
                `),setTimeout(()=>{b.hasAuth=!0;let c=document.getElementById("topicWechatAuthArea"),n=document.getElementById("topicWechatSearchArea");c&&(c.style.display="none"),n&&(n.style.display="")},1e3)}catch(t){console.error("[TopicTracker] Complete QR error:",t),e&&(e.innerHTML=`
                    <p class="topic-wechat-qr-error">\u767B\u5F55\u5931\u8D25: ${m(t.message)}</p>
                    <button class="topic-wechat-qr-refresh" onclick="TopicTracker.refreshWechatQR()">\u91CD\u8BD5</button>
                `)}}function re(){b.qrPolling=!1,b.pollTimer&&(clearTimeout(b.pollTimer),b.pollTimer=null)}function pt(){re(),$e()}async function ut(){if(document.querySelector(".topic-manual-tab.active").dataset.tab==="rss"){let t=document.getElementById("manualRssName").value.trim(),o=document.getElementById("manualRssUrl").value.trim();if(!o){alert("\u8BF7\u8F93\u5165 RSS URL");return}d.recommended_sources||(d.recommended_sources=[]),d.recommended_sources.push({type:"rss",name:t||o,url:o})}else{if($.length===0){alert("\u8BF7\u9009\u62E9\u81F3\u5C11\u4E00\u4E2A\u516C\u4F17\u53F7");return}d.recommended_sources||(d.recommended_sources=[]);for(let t of $)d.recommended_sources.push({type:"wechat_mp",name:t.nickname,wechat_id:t.fakeid});$=[]}xe(),w&&w.rss_sources?await ie(w.rss_sources):ae(),document.getElementById("topicSourcesGroup").style.display="block"}async function mt(){let e=_.value.trim();if(!e){alert("\u8BF7\u5148\u8F93\u5165\u4E3B\u9898\u540D\u79F0");return}let t=document.querySelector(".topic-sources-add .topic-ai-btn"),o=["\u{1F50D} \u6B63\u5728\u641C\u7D22\u6570\u636E\u6E90...","\u{1F4E1} \u6B63\u5728\u9A8C\u8BC1 RSS \u6E90...","\u2705 \u6B63\u5728\u9A8C\u8BC1\u516C\u4F17\u53F7..."],c=0,n=()=>{t&&(t.innerHTML=`<span class="topic-spinner"></span> ${o[c]}`)};t&&(t.disabled=!0,n());let s=setInterval(()=>{c=Math.min(c+1,o.length-1),n()},2e3);try{let i=await(await fetch("/api/topics/generate-keywords",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({topic_name:e})})).json();if(i.ok&&i.recommended_sources&&i.recommended_sources.length>0){let r=d.recommended_sources||[],p=new Set(r.map(l=>l.type==="rss"?l.url:l.wechat_id)),u=0;for(let l of i.recommended_sources){let h=l.type==="rss"?l.url:l.wechat_id;p.has(h)||(r.push(l),p.add(h),u++)}d.recommended_sources=r,document.getElementById("topicSourcesGroup").style.display="block",w?await ie(w.rss_sources||[]):ae(),u>0?console.log(`[TopicTracker] \u65B0\u589E ${u} \u4E2A\u63A8\u8350\u6570\u636E\u6E90`):alert("AI \u63A8\u8350\u7684\u6570\u636E\u6E90\u5DF2\u5168\u90E8\u6DFB\u52A0\u8FC7")}else alert("\u672A\u627E\u5230\u65B0\u7684\u63A8\u8350\u6570\u636E\u6E90")}catch(a){console.error("Regenerate sources failed:",a),alert("\u641C\u7D22\u6570\u636E\u6E90\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5")}finally{clearInterval(s),t&&(t.disabled=!1,t.innerHTML="\u{1F504} AI \u65B0\u589E\u6570\u636E\u6E90")}}async function ft(e){let t=I.find(c=>c.id===e);if(!(!t||!await Ie(`\u786E\u5B9A\u8981\u5220\u9664\u4E3B\u9898\u300C${t.name}\u300D\u5417\uFF1F\u5220\u9664\u540E\u4E0D\u53EF\u6062\u590D\u3002`)))try{let n=await(await fetch(`/api/topics/${e}`,{method:"DELETE",credentials:"include"})).json();if(n.ok){let s="topic-"+e,a=document.querySelector(`.sub-tab[data-category="${s}"]`);a&&(a.remove(),console.log(`[TopicTracker] Removed tab for topic ${e}`));let i=document.getElementById(`tab-${s}`);i&&(i.remove(),console.log(`[TopicTracker] Removed pane for topic ${e}`)),oe(e);try{localStorage.getItem("tr_active_tab")===s&&(localStorage.removeItem("tr_active_tab"),console.log(`[TopicTracker] Cleared saved tab for deleted topic ${e}`))}catch{}A.switchTab("my-tags"),I=I.filter(r=>r.id!==e),K.toast?.show&&K.toast.show(`\u5DF2\u5220\u9664\u4E3B\u9898\u300C${t.name}\u300D`,{variant:"success"})}else alert(n.error||"\u5220\u9664\u5931\u8D25")}catch(c){console.error("Delete topic failed:",c),alert("\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5")}}function Se(e){if(!e)return"";let t=new Date(e*1e3),c=new Date-t,n=Math.floor(c/6e4),s=Math.floor(c/36e5),a=Math.floor(c/864e5);if(n<1)return"\u521A\u521A";if(n<60)return n+"\u5206\u949F\u524D";if(s<24)return s+"\u5C0F\u65F6\u524D";if(a<7)return a+"\u5929\u524D";let i=t.getMonth()+1,r=t.getDate();return i+"-"+r}window.TopicTracker={init:ce,openModal:ze,closeModal:V,generateKeywords:ve,addKeyword:Ve,removeKeyword:Xe,selectAllSources:Ze,deselectAllSources:et,submitTopic:tt,refreshTopic:ot,editTopic:ct,deleteTopic:ft,loadTopics:Be,regenerateSources:mt,showManualAddForm:st,hideManualAddForm:xe,switchManualTab:rt,addManualSource:ut,searchWechatMps:we,doMpSearch:nt,toggleMpSelection:at,removeMpSelection:it,refreshWechatQR:pt,retryLoadTopic:Ne,loadTopicNews:G,closeQrcodeModal:se,retryAfterAuth:Ye,refreshQrcodeModal:Je};le(ce);
