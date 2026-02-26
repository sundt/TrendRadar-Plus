import{a as j}from"./chunk-JPTUFB3N.js";import{a as _,b as F}from"./chunk-YRL7WKAS.js";var P="subscribe_sidebar_width",J=320,V=800;var q=!1,h="tags",H=null,d={recommendations:{loading:!1,data:[],error:null,loaded:!1},tags:{loading:!1,allTags:[],filteredTags:[],searchQuery:"",categoryFilter:"all",followedIds:new Set,loaded:!1},sources:{loading:!1,allSources:[],filteredSources:[],searchQuery:"",typeFilter:"all",subscribedIds:new Set,loaded:!1,displayCount:100,totalCount:0},keywords:{loading:!1,keywords:[],inputValue:"",loaded:!1},wechat:{loading:!1,authStatus:null,subscriptions:[],searchQuery:"",searchResults:[],loaded:!1}};function X(){d.recommendations.loaded||H||!_.getUser()||(console.log("[SubscribeSidebar] Preloading recommendations..."),H=fetch("/api/user/preferences/recommended-tags").then(e=>{if(!e.ok)throw new Error("\u9884\u52A0\u8F7D\u5931\u8D25");return e.json()}).then(e=>{d.recommendations.data=[...e.new_tags||[],...e.hot_tags||[],...e.related_tags||[]],d.recommendations.loaded=!0,console.log("[SubscribeSidebar] Preload complete:",d.recommendations.data.length,"items")}).catch(e=>{console.warn("[SubscribeSidebar] Preload failed:",e.message)}).finally(()=>{H=null}))}function Y(){return _.getUser()?!0:(j(),!1)}function u(t){return t?String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}function b(t){window.showToast?window.showToast(t):console.log("[SubscribeSidebar]",t)}function D(t,e){let s=null;return function(...a){clearTimeout(s),s=setTimeout(()=>t.apply(this,a),e)}}function G(){if(document.getElementById("subscribeSidebar"))return;let t=document.createElement("div");t.id="subscribeSidebarBackdrop",t.className="subscribe-sidebar-backdrop",document.body.appendChild(t),document.body.insertAdjacentHTML("beforeend",`
        <div id="subscribeSidebar" class="subscribe-sidebar">
            <div class="subscribe-resize-handle" id="subscribeResizeHandle"></div>
            <div class="subscribe-sidebar-header">
                <span class="subscribe-sidebar-title">\u2699\uFE0F \u5FEB\u901F\u8BA2\u9605</span>
                <div class="subscribe-sidebar-actions">
                    <button class="subscribe-close-btn" title="\u5173\u95ED">\u2715</button>
                </div>
            </div>
            <div class="subscribe-tabs" id="subscribeTabs">
                <button class="subscribe-tab" data-tab="recommendations">\u{1F525}\u70ED\u95E8</button>
                <button class="subscribe-tab" data-tab="wechat">\u{1F4AC}\u516C\u4F17\u53F7</button>
                <button class="subscribe-tab" data-tab="sources">\u{1F4E1}\u8BA2\u9605\u6E90</button>
                <button class="subscribe-tab active" data-tab="tags">\u{1F3F7}\uFE0F\u6807\u7B7E</button>
                <button class="subscribe-tab" data-tab="keywords">\u{1F50D}\u5173\u952E\u8BCD</button>
            </div>
            <div class="subscribe-sidebar-body" id="subscribeSidebarBody">
                <div class="subscribe-loading">\u52A0\u8F7D\u4E2D...</div>
            </div>
        </div>
    `);let s=localStorage.getItem(P);if(s){let i=document.getElementById("subscribeSidebar");i.style.width=s+"px"}let r=document.getElementById("subscribeSidebar").querySelector(".subscribe-close-btn");t.addEventListener("click",R),r.addEventListener("click",R),document.getElementById("subscribeTabs").addEventListener("click",i=>{let n=i.target.closest(".subscribe-tab");if(!n)return;let o=n.dataset.tab;o&&te(o)}),document.addEventListener("keydown",i=>{i.key==="Escape"&&q&&R()}),Z()}function Z(){let t=document.getElementById("subscribeSidebar"),e=document.getElementById("subscribeResizeHandle");if(!t||!e)return;let s=!1,a=0,r=0;e.addEventListener("mousedown",c=>{s=!0,a=c.clientX,r=t.offsetWidth,t.classList.add("resizing"),e.classList.add("active"),c.preventDefault()}),document.addEventListener("mousemove",c=>{if(!s)return;let i=a-c.clientX,n=r+i;n=Math.max(J,Math.min(V,n)),t.style.width=n+"px"}),document.addEventListener("mouseup",()=>{s&&(s=!1,t.classList.remove("resizing"),e.classList.remove("active"),localStorage.setItem(P,t.offsetWidth),F.saveSidebarWidths({subscribe_width:t.offsetWidth}))})}function ee(){if(!Y())return;G();let t=document.getElementById("subscribeSidebar"),e=document.getElementById("subscribeSidebarBackdrop");t.classList.add("open"),e.classList.add("show"),q=!0,N(h)}function R(){let t=document.getElementById("subscribeSidebar"),e=document.getElementById("subscribeSidebarBackdrop");t&&t.classList.remove("open"),e&&e.classList.remove("show"),q=!1}function Ee(){return q}function te(t){h!==t&&(h=t,document.querySelectorAll(".subscribe-tab").forEach(e=>{e.classList.toggle("active",e.dataset.tab===t)}),N(t))}async function N(t){let e=document.getElementById("subscribeSidebarBody");if(!e)return;d[t].loaded||(e.innerHTML='<div class="subscribe-loading"><div class="tr-skeleton-inline"><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div></div></div>');try{switch(t){case"recommendations":await se();break;case"tags":await ae();break;case"sources":await z();break;case"keywords":await de();break;case"wechat":await be();break}}catch(a){console.error("[SubscribeSidebar] Load tab error:",a),e.innerHTML=`<div class="subscribe-error">\u52A0\u8F7D\u5931\u8D25: ${u(a.message)}</div>`}}async function se(){let t=document.getElementById("subscribeSidebarBody"),e=d.recommendations;if(!e.loaded){e.loading=!0;try{let s=await fetch("/api/user/preferences/recommended-tags");if(!s.ok)throw new Error("\u83B7\u53D6\u63A8\u8350\u5931\u8D25");let a=await s.json();e.data=[...a.new_tags||[],...a.hot_tags||[],...a.related_tags||[]],e.loaded=!0}catch(s){throw e.error=s.message,s}finally{e.loading=!1}}M()}function M(){let t=document.getElementById("subscribeSidebarBody"),e=d.recommendations;if(e.data.length===0){t.innerHTML='<div class="subscribe-empty">\u6682\u65E0\u63A8\u8350</div>';return}let s='<div class="subscribe-list">';for(let a of e.data){let r=d.tags.followedIds.has(a.id);s+=O(a,r)}s+="</div>",t.innerHTML=s,U(t)}async function ae(){let t=document.getElementById("subscribeSidebarBody"),e=d.tags;if(!e.loaded){e.loading=!0;try{let[s,a]=await Promise.all([fetch("/api/admin/tags/public/all"),fetch("/api/user/preferences/tag-settings")]);if(!s.ok)throw new Error("\u83B7\u53D6\u6807\u7B7E\u5931\u8D25");let r=await s.json();if(e.allTags=[...r.categories||[],...r.topics||[],...r.attributes||[]],a.ok){let c=await a.json();e.followedIds=new Set((c.followed||[]).map(i=>i.tag_id))}e.filteredTags=[...e.allTags],e.loaded=!0}catch(s){throw s}finally{e.loading=!1}}T()}function T(){let t=document.getElementById("subscribeSidebarBody"),e=d.tags,s=t.querySelector(".subscribe-list"),a=t.querySelector(".subscribe-empty");if(!document.getElementById("tagSearchInput")){let n=`
            <div class="subscribe-search-box">
                <input type="text" class="subscribe-search-input" id="tagSearchInput" 
                       placeholder="\u641C\u7D22\u6807\u7B7E..." value="${u(e.searchQuery)}">
            </div>
            <div class="subscribe-filters" id="tagFilters">
                <button class="subscribe-filter-btn ${e.categoryFilter==="all"?"active":""}" data-filter="all">\u5168\u90E8</button>
                <button class="subscribe-filter-btn ${e.categoryFilter==="category"?"active":""}" data-filter="category">\u5927\u7C7B</button>
                <button class="subscribe-filter-btn ${e.categoryFilter==="topic"?"active":""}" data-filter="topic">\u4E3B\u9898</button>
                <button class="subscribe-filter-btn ${e.categoryFilter==="attribute"?"active":""}" data-filter="attribute">\u5C5E\u6027</button>
            </div>
            <div class="subscribe-list-container" id="tagListContainer"></div>
        `;t.innerHTML=n,document.getElementById("tagSearchInput")?.addEventListener("input",D(E=>{e.searchQuery=E.target.value,T()},300));let m=document.getElementById("tagFilters");m?.addEventListener("click",E=>{let y=E.target.closest(".subscribe-filter-btn");y&&(e.categoryFilter=y.dataset.filter,m.querySelectorAll(".subscribe-filter-btn").forEach(l=>{l.classList.toggle("active",l.dataset.filter===e.categoryFilter)}),T())})}let c=e.allTags;if(e.searchQuery){let n=e.searchQuery.toLowerCase();c=c.filter(o=>o.name.toLowerCase().includes(n))}e.categoryFilter!=="all"&&(c=c.filter(n=>n.type===e.categoryFilter));let i=document.getElementById("tagListContainer");if(i){if(c.length===0)i.innerHTML='<div class="subscribe-empty">\u6CA1\u6709\u627E\u5230\u5339\u914D\u7684\u6807\u7B7E</div>';else{let n='<div class="subscribe-list">';for(let o of c){let m=e.followedIds.has(o.id);n+=O(o,m)}n+="</div>",i.innerHTML=n}U(i)}}function O(t,e){let s="";return t.badge==="new"?(s='<span class="subscribe-item-badge subscribe-badge-new">NEW</span>',t.first_seen_date&&(s+=`<span class="subscribe-item-date">\u53D1\u73B0\u4E8E${u(t.first_seen_date)}</span>`)):t.badge==="hot"?s='<span class="subscribe-item-badge subscribe-badge-hot">\u{1F525}</span>':t.badge==="related"&&(s='<span class="subscribe-item-badge subscribe-badge-related">\u76F8\u5173</span>'),`
        <div class="subscribe-item" data-id="${u(t.id)}" data-type="tag" ${t.is_candidate?'data-candidate="true"':""}>
            <span class="subscribe-item-icon">${t.icon||"\u{1F3F7}\uFE0F"}</span>
            <div class="subscribe-item-info">
                <span class="subscribe-item-name">${u(t.name)}${s}</span>
            </div>
            <button class="subscribe-item-btn ${e?"followed":""}" data-action="${e?"unfollow":"follow"}">
                ${e?"\u5DF2\u5173\u6CE8":"+\u5173\u6CE8"}
            </button>
        </div>
    `}function U(t){t.querySelectorAll('.subscribe-item[data-type="tag"]').forEach(e=>{let s=e.querySelector(".subscribe-item-btn");s?.addEventListener("click",async a=>{a.stopPropagation();let r=e.dataset.id,c=s.dataset.action;await ie(r,c==="follow")})})}async function ie(t,e){let s=d.tags,a=s.followedIds.has(t);e?s.followedIds.add(t):s.followedIds.delete(t),h==="tags"&&T(),h==="recommendations"&&M();try{if(!(await fetch("/api/user/preferences/tag-settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tag_id:t,preference:e?"follow":"neutral"})})).ok)throw new Error("\u64CD\u4F5C\u5931\u8D25");b(e?"\u5DF2\u5173\u6CE8":"\u5DF2\u53D6\u6D88\u5173\u6CE8");try{localStorage.removeItem("hotnews_my_tags_cache")}catch{}}catch{a?s.followedIds.add(t):s.followedIds.delete(t),h==="tags"&&T(),h==="recommendations"&&M(),b("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5")}}async function z(){let t=document.getElementById("subscribeSidebarBody"),e=d.sources;if(!e.loaded){e.loading=!0;try{let[s,a]=await Promise.all([fetch("/api/sources/all"),fetch("/api/sources/subscriptions")]);if(s.ok){let r=await s.json();e.allSources=r.sources||[],e.filteredSources=[...e.allSources]}if(a.ok){let r=await a.json();e.subscribedIds=new Set((r.subscriptions||[]).map(c=>c.id))}e.loaded=!0}catch(s){throw console.error("[SubscribeSidebar] Load sources error:",s),s}finally{e.loading=!1}}S()}function S(){let t=document.getElementById("subscribeSidebarBody"),e=d.sources,s=e.allSources.filter(l=>l.type==="rss").length,a=e.allSources.filter(l=>l.type==="custom").length,r=e.allSources.filter(l=>l.category==="user").length;if(!document.getElementById("sourceSearchInput")){let l=`
            <div class="subscribe-search-box">
                <input type="text" class="subscribe-search-input" id="sourceSearchInput" 
                       placeholder="\u641C\u7D22\u8BA2\u9605\u6E90..." value="${u(e.searchQuery)}">
                <button class="subscribe-add-rss-btn" id="addRssBtn" title="\u6DFB\u52A0 RSS \u6E90">+ \u6DFB\u52A0</button>
            </div>
            <div class="subscribe-filters" id="sourceFilters">
                <button class="subscribe-filter-btn ${e.typeFilter==="all"?"active":""}" data-filter="all">\u5168\u90E8 (${e.allSources.length})</button>
                <button class="subscribe-filter-btn ${e.typeFilter==="rss"?"active":""}" data-filter="rss">\u{1F4F0} RSS (${s})</button>
                <button class="subscribe-filter-btn ${e.typeFilter==="custom"?"active":""}" data-filter="custom">\u{1F517} \u81EA\u5B9A\u4E49 (${a})</button>
            </div>
            <div class="subscribe-add-rss-form" id="addRssForm" style="display:none;">
                <div class="subscribe-add-rss-title">\u6DFB\u52A0\u65B0\u7684 RSS \u6E90</div>
                <input type="text" class="subscribe-form-input" id="addRssName" placeholder="\u540D\u79F0\uFF08\u53EF\u9009\uFF09">
                <input type="text" class="subscribe-form-input" id="addRssUrl" placeholder="RSS URL\uFF08\u5FC5\u586B\uFF09">
                <div class="subscribe-add-rss-actions">
                    <button class="subscribe-add-rss-cancel" id="addRssCancel">\u53D6\u6D88</button>
                    <button class="subscribe-add-rss-submit" id="addRssSubmit">\u9A8C\u8BC1\u5E76\u6DFB\u52A0</button>
                </div>
            </div>
            <div class="subscribe-list-container" id="sourceListContainer"></div>
        `;t.innerHTML=l,document.getElementById("sourceSearchInput")?.addEventListener("input",D(I=>{e.searchQuery=I.target.value,e.displayCount=100,S()},300));let g=document.getElementById("addRssBtn"),v=document.getElementById("addRssForm"),K=document.getElementById("addRssCancel"),k=document.getElementById("addRssSubmit");g?.addEventListener("click",()=>{v.style.display=v.style.display==="none"?"block":"none"}),K?.addEventListener("click",()=>{v.style.display="none",document.getElementById("addRssName").value="",document.getElementById("addRssUrl").value=""}),k?.addEventListener("click",async()=>{let I=document.getElementById("addRssName").value.trim(),L=document.getElementById("addRssUrl").value.trim();if(!L){b("\u8BF7\u8F93\u5165 RSS URL");return}k.disabled=!0,k.textContent="\u9A8C\u8BC1\u4E2D...";try{let f=await fetch("/api/sources/add-rss",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:I,url:L})}),B=await f.json();f.ok&&B.ok?(b(B.message||"RSS \u6E90\u6DFB\u52A0\u6210\u529F"),v.style.display="none",document.getElementById("addRssName").value="",document.getElementById("addRssUrl").value="",e.loaded=!1,await z()):b(B.detail||B.error||"\u6DFB\u52A0\u5931\u8D25")}catch(f){b("\u6DFB\u52A0\u5931\u8D25: "+f.message)}finally{k.disabled=!1,k.textContent="\u9A8C\u8BC1\u5E76\u6DFB\u52A0"}});let W=document.getElementById("sourceFilters");W?.addEventListener("click",I=>{let L=I.target.closest(".subscribe-filter-btn");L&&(e.typeFilter=L.dataset.filter,e.displayCount=100,W.querySelectorAll(".subscribe-filter-btn").forEach(f=>{f.classList.toggle("active",f.dataset.filter===e.typeFilter)}),S())})}let i=e.allSources;if(e.typeFilter!=="all"&&(i=i.filter(l=>l.type===e.typeFilter)),e.searchQuery){let l=e.searchQuery.toLowerCase();i=i.filter(w=>w.name&&w.name.toLowerCase().includes(l)||w.url&&w.url.toLowerCase().includes(l))}let n=i.length,o=e.searchQuery?n:Math.min(e.displayCount,n),m=i.slice(0,o),E=o<n&&!e.searchQuery,y=document.getElementById("sourceListContainer");if(y){let l="";if(i.length===0)l='<div class="subscribe-empty">\u6CA1\u6709\u627E\u5230\u8BA2\u9605\u6E90</div>';else{l='<div class="subscribe-list subscribe-sources-list">';for(let g of m){let v=e.subscribedIds.has(g.id);l+=re(g,v)}if(l+="</div>",E){let g=n-o;l+=`
                    <div class="subscribe-load-more">
                        <button class="subscribe-load-more-btn" id="loadMoreSourcesBtn">
                            \u52A0\u8F7D\u66F4\u591A (\u8FD8\u6709 ${g} \u4E2A)
                        </button>
                    </div>
                `}}y.innerHTML=l,document.getElementById("loadMoreSourcesBtn")?.addEventListener("click",()=>{e.displayCount+=100,S()}),ce(y)}}function re(t,e){let s="";try{s=t.url?new URL(t.url).hostname:""}catch{s=""}let a=t.type==="custom"?"\u{1F517}":"\u{1F4F0}",r=t.type==="custom"?"\u81EA\u5B9A\u4E49":t.category||"RSS",c=u(t.id),i=u(t.name||t.id);return`
        <div class="subscribe-source-card" data-id="${c}" data-type="source" data-source-type="${u(t.type)}">
            <div class="subscribe-source-header" data-source-id="${c}">
                <span class="subscribe-source-icon">${a}</span>
                <div class="subscribe-source-info">
                    <span class="subscribe-source-name">${i}</span>
                    <span class="subscribe-source-meta">
                        <span>${u(s||r)}</span>
                        <span class="subscribe-source-expand">\u25BC</span>
                    </span>
                </div>
                <button class="subscribe-item-btn ${e?"followed":""}" data-action="${e?"unsubscribe":"subscribe"}">
                    ${e?"\u5DF2\u8BA2\u9605":"+\u8BA2\u9605"}
                </button>
            </div>
            <div class="subscribe-source-preview" id="sourcePreview-${c}">
                <div class="subscribe-source-preview-inner">
                    <div class="subscribe-source-preview-hint">\u70B9\u51FB\u5C55\u5F00\u9884\u89C8\u6700\u65B0\u5185\u5BB9...</div>
                </div>
            </div>
        </div>
    `}function ce(t){t.querySelectorAll(".subscribe-source-card").forEach(e=>{let s=e.querySelector(".subscribe-item-btn");s?.addEventListener("click",async r=>{r.stopPropagation();let c=e.dataset.id,i=e.dataset.sourceType||"rss",n=s.dataset.action;await oe(c,i,n==="subscribe")});let a=e.querySelector(".subscribe-source-header");a&&a.addEventListener("click",r=>{if(r.target.closest(".subscribe-item-btn"))return;let c=e.dataset.id;ne(c)})})}async function ne(t){let e=document.querySelector(`.subscribe-source-card[data-id="${CSS.escape(t)}"]`),s=document.getElementById(`sourcePreview-${t}`);if(!e||!s)return;if(e.classList.contains("expanded"))e.classList.remove("expanded");else{if(e.classList.add("expanded"),s.dataset.loaded==="true")return;let r=s.querySelector(".subscribe-source-preview-inner");r&&(r.innerHTML='<div class="subscribe-source-preview-hint">\u52A0\u8F7D\u4E2D...</div>');try{let c=await fetch(`/api/sources/preview/${encodeURIComponent(t)}?limit=10`);if(!c.ok)throw new Error("Failed to load");let i=await c.json();if(!i.ok)throw new Error(i.error||"Failed");if(i.entries&&i.entries.length>0){let n=i.entries.map(o=>{let m=o.published_at?new Date(o.published_at*1e3).toLocaleDateString("zh-CN"):"";return`
                        <li class="subscribe-source-preview-item">
                            <a href="${u(o.url)}" target="_blank" rel="noopener">${u(o.title)}</a>
                            ${m?`<span class="subscribe-source-preview-date">${m}</span>`:""}
                        </li>
                    `}).join("");r&&(r.innerHTML=`<ul class="subscribe-source-preview-list">${n}</ul>`)}else r&&(r.innerHTML='<div class="subscribe-source-preview-hint">\u6682\u65E0\u5185\u5BB9</div>');s.dataset.loaded="true"}catch{r&&(r.innerHTML='<div class="subscribe-source-preview-hint">\u52A0\u8F7D\u5931\u8D25</div>')}}}async function oe(t,e,s){let a=d.sources,r=a.subscribedIds.has(t);s?a.subscribedIds.add(t):a.subscribedIds.delete(t),S();try{if(!(await fetch(s?"/api/sources/subscribe":"/api/sources/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source_type:e,source_id:t})})).ok)throw new Error("\u64CD\u4F5C\u5931\u8D25");b(s?"\u5DF2\u8BA2\u9605":"\u5DF2\u53D6\u6D88\u8BA2\u9605")}catch{r?a.subscribedIds.add(t):a.subscribedIds.delete(t),S(),b("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5")}}async function de(){let t=document.getElementById("subscribeSidebarBody"),e=d.keywords;if(!e.loaded){e.loading=!0;try{let s=await fetch("/api/user/keywords");if(s.ok){let a=await s.json();e.keywords=a.keywords||[]}e.loaded=!0}catch(s){throw s}finally{e.loading=!1}}$()}function $(){let t=document.getElementById("subscribeSidebarBody"),e=d.keywords,s=`
        <div class="subscribe-add-box">
            <input type="text" class="subscribe-add-input" id="keywordInput" 
                   placeholder="\u8F93\u5165\u5173\u952E\u8BCD\uFF08\u81F3\u5C112\u4E2A\u5B57\u7B26\uFF09..." value="${u(e.inputValue)}">
            <button class="subscribe-add-btn" id="addKeywordBtn">\u6DFB\u52A0</button>
        </div>
    `;if(e.keywords.length===0)s+=`
            <div class="subscribe-empty-state">
                <div class="subscribe-empty-icon">\u{1F511}</div>
                <div class="subscribe-empty-title">\u8F93\u5165\u5173\u952E\u8BCD\uFF0C\u5982\uFF1ADeepSeek\u3001\u91CF\u5B50\u8BA1\u7B97\u3001\u9A6C\u65AF\u514B\u2026</div>
                <div class="subscribe-empty-desc">\u6DFB\u52A0\u5173\u952E\u8BCD\u540E\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u5339\u914D\u5305\u542B\u8FD9\u4E9B\u8BCD\u7684\u65B0\u95FB\u63A8\u9001\u7ED9\u4F60</div>
            </div>
        `;else{s+='<div class="subscribe-keyword-list">';for(let i of e.keywords){let n=i.keyword_type==="fuzzy"?"\u6A21\u7CCA":"\u7CBE\u786E",o=i.match_count>0?`\u5339\u914D ${i.match_count} \u6B21`:"\u6682\u65E0\u5339\u914D";s+=`
                <div class="subscribe-keyword-item" data-id="${i.id}" data-type="keyword">
                    <div class="subscribe-keyword-icon">\u{1F511}</div>
                    <div class="subscribe-keyword-info">
                        <div class="subscribe-keyword-text">${u(i.keyword)}</div>
                        <div class="subscribe-keyword-meta">
                            <span class="subscribe-keyword-badge">${n}</span>
                            <span>${o}</span>
                        </div>
                    </div>
                    <button class="subscribe-keyword-delete" data-action="delete">\u5220\u9664</button>
                </div>
            `}s+="</div>"}t.innerHTML=s;let a=document.getElementById("keywordInput"),r=document.getElementById("addKeywordBtn"),c=async()=>{let i=a.value.trim();if(!i||i.length<2){b("\u5173\u952E\u8BCD\u81F3\u5C11\u9700\u89812\u4E2A\u5B57\u7B26");return}await le(i),a.value="",e.inputValue=""};r?.addEventListener("click",c),a?.addEventListener("keydown",i=>{i.key==="Enter"&&c()}),a?.addEventListener("input",i=>{e.inputValue=i.target.value}),t.querySelectorAll(".subscribe-keyword-item").forEach(i=>{i.querySelector(".subscribe-keyword-delete")?.addEventListener("click",async()=>{let o=parseInt(i.dataset.id);await ue(o)})})}async function le(t){let e=d.keywords;try{let s=await fetch("/api/user/keywords",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({keyword:t,keyword_type:"exact",priority:0})});if(!s.ok){let r=await s.json();throw new Error(r.detail||"\u6DFB\u52A0\u5931\u8D25")}let a=await s.json();e.keywords.push({id:a.keyword_id,keyword:t}),$(),b("\u5173\u952E\u8BCD\u5DF2\u6DFB\u52A0")}catch(s){b("\u6DFB\u52A0\u5931\u8D25: "+s.message)}}async function ue(t){let e=d.keywords,s=[...e.keywords];e.keywords=e.keywords.filter(a=>a.id!==t),$();try{if(!(await fetch(`/api/user/keywords/${t}`,{method:"DELETE"})).ok)throw new Error("\u5220\u9664\u5931\u8D25");b("\u5173\u952E\u8BCD\u5DF2\u5220\u9664")}catch{e.keywords=s,$(),b("\u5220\u9664\u5931\u8D25")}}var p={polling:!1,pollTimer:null,sessionId:null};async function be(){let t=document.getElementById("subscribeSidebarBody"),e=d.wechat;if(!e.loaded){e.loading=!0;try{let s=await fetch("/api/wechat/auth/auto",{method:"POST"});if(s.ok){let a=await s.json();e.authStatus=a.has_auth?"valid":"none"}else e.authStatus="none";if(e.authStatus==="valid"){let a=await fetch("/api/wechat/subscriptions");if(a.ok){let r=await a.json();e.subscriptions=r.subscriptions||[]}}e.loaded=!0}catch(s){throw e.authStatus="none",s}finally{e.loading=!1}}C()}function C(){let t=document.getElementById("subscribeSidebarBody"),e=d.wechat;if(e.authStatus!=="valid"){t.innerHTML=`
            <div class="subscribe-wechat-auth">
                <div id="wechatQRArea" class="subscribe-qr-area">
                    <div class="subscribe-qr-loading">
                        <span class="subscribe-qr-spinner">\u27F3</span>
                        \u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801...
                    </div>
                </div>
                <p class="subscribe-qr-hint">\u8BF7\u4F7F\u7528\u5FAE\u4FE1\u626B\u63CF\u4E8C\u7EF4\u7801\u767B\u5F55</p>
                <p class="subscribe-qr-note">
                    \u26A0\uFE0F <a href="https://mp.weixin.qq.com/cgi-bin/registermidpage?action=index&weblogo=1&lang=zh_CN" target="_blank">\u8BF7\u6CE8\u518C\u516C\u4F17\u53F7\u6216\u670D\u52A1\u53F7</a>
                </p>
            </div>
        `,Q();return}let s=`
        <div class="subscribe-search-box">
            <input type="text" class="subscribe-search-input" id="wechatSearchInput" 
                   placeholder="\u641C\u7D22\u516C\u4F17\u53F7\uFF08\u81F3\u5C112\u4E2A\u5B57\u7B26\uFF09..." value="${u(e.searchQuery)}">
            <button class="subscribe-search-btn" id="wechatSearchBtn">\u641C\u7D22</button>
        </div>
    `;if(e.searchResults.length>0){s+='<div class="subscribe-section-title">\u641C\u7D22\u7ED3\u679C</div>',s+='<div class="subscribe-wechat-list">';for(let i of e.searchResults){let n=e.subscriptions.some(o=>o.fakeid===i.fakeid);s+=A(i,n)}s+="</div>"}if(e.subscriptions.length>0){s+='<div class="subscribe-section-title">\u5DF2\u8BA2\u9605</div>',s+='<div class="subscribe-wechat-list">';for(let i of e.subscriptions)s+=A(i,!0);s+="</div>"}else e.searchResults.length===0&&(s+=`
            <div class="subscribe-empty-state">
                <div class="subscribe-empty-icon">\u{1F4AC}</div>
                <div class="subscribe-empty-title">\u8FD8\u6CA1\u6709\u8BA2\u9605\u516C\u4F17\u53F7</div>
                <div class="subscribe-empty-desc">\u5728\u4E0A\u65B9\u641C\u7D22\u5E76\u8BA2\u9605\u516C\u4F17\u53F7</div>
            </div>
        `);t.innerHTML=s;let a=document.getElementById("wechatSearchInput"),r=document.getElementById("wechatSearchBtn"),c=async()=>{let i=a.value.trim();if(!i||i.length<2){b("\u8BF7\u8F93\u5165\u81F3\u5C112\u4E2A\u5B57\u7B26");return}e.searchQuery=i,await ye(i)};r?.addEventListener("click",c),a?.addEventListener("keydown",i=>{i.key==="Enter"&&c()}),he(t)}async function Q(){let t=document.getElementById("wechatQRArea");if(t){t.innerHTML=`
        <div class="subscribe-qr-loading">
            <span class="subscribe-qr-spinner">\u27F3</span>
            \u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801...
        </div>
    `;try{let s=await(await fetch("/api/wechat/auth/qr/start",{method:"POST"})).json();if(!s.ok)throw new Error(s.error||"\u521B\u5EFA\u4F1A\u8BDD\u5931\u8D25");p.sessionId=s.session_id;let a=`/api/wechat/auth/qr/image?t=${Date.now()}`;t.innerHTML=`
            <img src="${a}" alt="\u767B\u5F55\u4E8C\u7EF4\u7801" class="subscribe-qr-image" 
                 onerror="this.parentElement.innerHTML='<p class=subscribe-qr-error>\u4E8C\u7EF4\u7801\u52A0\u8F7D\u5931\u8D25</p>'">
            <p id="wechatQRStatus" class="subscribe-qr-status">\u7B49\u5F85\u626B\u7801...</p>
            <button class="subscribe-qr-cancel" onclick="window.cancelWechatQRLogin()">\u53D6\u6D88</button>
        `,p.polling=!0,x()}catch(e){console.error("[WechatQR] Start error:",e),t.innerHTML=`
            <p class="subscribe-qr-error">\u83B7\u53D6\u4E8C\u7EF4\u7801\u5931\u8D25: ${u(e.message)}</p>
            <button class="subscribe-qr-retry" onclick="window.retryWechatQRLogin()">\u91CD\u8BD5</button>
        `}}}async function x(){if(p.polling)try{let e=await(await fetch("/api/wechat/auth/qr/status")).json(),s=document.getElementById("wechatQRStatus");if(!s){p.polling=!1;return}if(e.status==="waiting")s.textContent="\u7B49\u5F85\u626B\u7801...",s.className="subscribe-qr-status";else if(e.status==="scanned")s.textContent="\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u767B\u5F55",s.className="subscribe-qr-status scanned";else if(e.status==="confirmed"){s.textContent="\u5DF2\u786E\u8BA4\uFF0C\u6B63\u5728\u5B8C\u6210\u767B\u5F55...",s.className="subscribe-qr-status confirmed",p.polling=!1,await pe();return}else if(e.status==="expired"||e.need_refresh){s.textContent="\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F",s.className="subscribe-qr-status expired",p.polling=!1;let a=document.getElementById("wechatQRArea");a&&(a.innerHTML=`
                    <p class="subscribe-qr-error">\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F</p>
                    <button class="subscribe-qr-retry" onclick="window.retryWechatQRLogin()">\u91CD\u65B0\u83B7\u53D6</button>
                `);return}else e.status==="error"&&(s.textContent=e.message||"\u51FA\u9519\u4E86",s.className="subscribe-qr-status error");p.polling&&(p.pollTimer=setTimeout(x,2e3))}catch(t){console.error("[WechatQR] Poll error:",t),p.polling&&(p.pollTimer=setTimeout(x,3e3))}}async function pe(){let t=document.getElementById("wechatQRArea");try{let s=await(await fetch("/api/wechat/auth/qr/complete-and-share",{method:"POST"})).json();if(!s.ok)throw new Error(s.error||"\u767B\u5F55\u5931\u8D25");t&&(t.innerHTML=`
                <p class="subscribe-qr-success">\u2713 \u767B\u5F55\u6210\u529F\uFF01</p>
                <p class="subscribe-qr-loading-text">\u6B63\u5728\u52A0\u8F7D\u516C\u4F17\u53F7\u529F\u80FD...</p>
            `),b("\u767B\u5F55\u6210\u529F"),setTimeout(async()=>{let a=d.wechat;a.authStatus="valid";try{let r=await fetch("/api/wechat/subscriptions");if(r.ok){let c=await r.json();a.subscriptions=c.subscriptions||[]}}catch{}C()},1e3)}catch(e){console.error("[WechatQR] Complete error:",e),t&&(t.innerHTML=`
                <p class="subscribe-qr-error">\u767B\u5F55\u5931\u8D25: ${u(e.message)}</p>
                <button class="subscribe-qr-retry" onclick="window.retryWechatQRLogin()">\u91CD\u8BD5</button>
            `)}}function me(){p.polling=!1,p.pollTimer&&(clearTimeout(p.pollTimer),p.pollTimer=null),fetch("/api/wechat/auth/qr/cancel",{method:"POST"}).catch(()=>{});let t=document.getElementById("wechatQRArea");t&&(t.innerHTML=`
            <div class="subscribe-qr-loading">
                <span class="subscribe-qr-spinner">\u27F3</span>
                \u6B63\u5728\u83B7\u53D6\u4E8C\u7EF4\u7801...
            </div>
        `),Q()}function fe(){Q()}window.cancelWechatQRLogin=me;window.retryWechatQRLogin=fe;function A(t,e){let s=t.round_head_img?`/api/wechat/img-proxy?url=${encodeURIComponent(t.round_head_img)}`:"",a=s?`<img class="subscribe-wechat-avatar" src="${s}" alt="${u(t.nickname)}" onerror="this.outerHTML='<div class=\\'subscribe-wechat-avatar-placeholder\\'>\u{1F4AC}</div>'">`:'<div class="subscribe-wechat-avatar-placeholder">\u{1F4AC}</div>';return`
        <div class="subscribe-wechat-card" data-fakeid="${u(t.fakeid)}">
            ${a}
            <div class="subscribe-wechat-info">
                <div class="subscribe-wechat-name">${u(t.nickname)}</div>
                <div class="subscribe-wechat-signature">${u(t.signature||"")}</div>
            </div>
            <button class="subscribe-wechat-btn ${e?"subscribed":""}" data-action="${e?"unsubscribe":"subscribe"}">
                ${e?"\u5DF2\u8BA2\u9605 \u2713":"+ \u8BA2\u9605"}
            </button>
        </div>
    `}function he(t){t.querySelectorAll(".subscribe-wechat-card").forEach(e=>{let s=e.querySelector(".subscribe-wechat-btn");s?.addEventListener("click",async a=>{a.stopPropagation();let r=e.dataset.fakeid,c=s.dataset.action;await we(r,c==="subscribe")})})}async function ye(t){let e=d.wechat;try{let s=await fetch(`/api/wechat/search?keyword=${encodeURIComponent(t)}&limit=20`);if(!s.ok){let r=await s.json().catch(()=>({}));throw new Error(r.detail||"\u641C\u7D22\u5931\u8D25")}let a=await s.json();e.searchResults=a.list||a.results||[],C()}catch(s){b("\u641C\u7D22\u5931\u8D25: "+s.message)}}async function we(t,e){let s=d.wechat;try{if(e){let a=s.searchResults.find(c=>c.fakeid===t);if(!a)return;if(!(await fetch("/api/wechat/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fakeid:t,nickname:a.nickname})})).ok)throw new Error("\u8BA2\u9605\u5931\u8D25");s.subscriptions.push(a),b("\u5DF2\u8BA2\u9605")}else{if(!(await fetch("/api/wechat/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fakeid:t})})).ok)throw new Error("\u53D6\u6D88\u8BA2\u9605\u5931\u8D25");s.subscriptions=s.subscriptions.filter(r=>r.fakeid!==t),b("\u5DF2\u53D6\u6D88\u8BA2\u9605")}C()}catch(a){b(a.message)}}window.openSubscribeSidebar=ee;window.closeSubscribeSidebar=R;window.preloadSubscribeSidebar=X;export{R as closeSubscribeSidebar,Ee as isSubscribeSidebarOpen,ee as openSubscribeSidebar,X as preloadRecommendations};
