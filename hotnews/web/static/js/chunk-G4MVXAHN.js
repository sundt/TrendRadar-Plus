var i={CATEGORY_CONFIG:"hotnews_categories_config",THEME:"hotnews_theme_mode",FAVORITES_WIDTH:"hotnews_favorites_width",TODO_WIDTH:"todo_sidebar_width"},S="/api/user/preferences/sync";function g(){let e={category_config:null,theme:"light",sidebar_widths:{}};try{let t=localStorage.getItem(i.CATEGORY_CONFIG);t&&(e.category_config=JSON.parse(t));let o=localStorage.getItem(i.THEME);o&&(e.theme=o);let s=localStorage.getItem(i.FAVORITES_WIDTH);s&&(e.sidebar_widths.favorites_width=parseInt(s,10));let n=localStorage.getItem(i.TODO_WIDTH);n&&(e.sidebar_widths.todo_width=parseInt(n,10))}catch(t){console.error("[Preferences] Failed to read from localStorage:",t)}return e}function h(e){try{e.category_config!==void 0&&(e.category_config===null?localStorage.removeItem(i.CATEGORY_CONFIG):localStorage.setItem(i.CATEGORY_CONFIG,JSON.stringify(e.category_config))),e.theme!==void 0&&localStorage.setItem(i.THEME,e.theme),e.sidebar_widths&&(e.sidebar_widths.favorites_width!==void 0&&localStorage.setItem(i.FAVORITES_WIDTH,String(e.sidebar_widths.favorites_width)),e.sidebar_widths.todo_width!==void 0&&localStorage.setItem(i.TODO_WIDTH,String(e.sidebar_widths.todo_width)))}catch(t){console.error("[Preferences] Failed to save to localStorage:",t)}}async function _(){let e=r.getUser();if(!e||!e.id)throw new Error("User not logged in");let t=`${S}?user_id=${encodeURIComponent(e.id)}`,o=await fetch(t);if(!o.ok){if(o.status===401)throw new Error("Not authenticated");if(o.status===404)return null;throw new Error(`Server error: ${o.status}`)}let s=await o.json();if(!s.ok)throw new Error(s.error||"Unknown error");return s.preferences||null}async function I(e){let t=r.getUser();if(!t||!t.id)throw new Error("User not logged in");let o=`${S}?user_id=${encodeURIComponent(t.id)}`,s=await fetch(o,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!s.ok)throw s.status===401?new Error("Not authenticated"):new Error(`Server error: ${s.status}`);let n=await s.json();if(!n.ok)throw new Error(n.error||"Unknown error");return n.preferences}async function b(e){let t=r.getUser();if(!t||!t.id)throw new Error("User not logged in");let o=`${S}?user_id=${encodeURIComponent(t.id)}`,s=await fetch(o,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)});if(!s.ok)throw s.status===401?new Error("Not authenticated"):new Error(`Server error: ${s.status}`);let n=await s.json();if(!n.ok)throw new Error(n.error||"Unknown error");return n.preferences}function k(e){if(!e)return!1;let t=e.category_config&&typeof e.category_config=="object"&&Object.keys(e.category_config).length>0,o=e.theme&&e.theme!=="light",s=e.sidebar_widths&&typeof e.sidebar_widths=="object"&&Object.keys(e.sidebar_widths).length>0;return t||o||s}function O(e){if(!e)return!1;let t=e.category_config&&typeof e.category_config=="object"&&Object.keys(e.category_config).length>0,o=e.theme&&e.theme!=="light",s=e.sidebar_widths&&typeof e.sidebar_widths=="object"&&Object.keys(e.sidebar_widths).length>0;return t||o||s}var v={async getPreferences(){if(!r.isLoggedIn())return g();try{let e=await _();return e?(h(e),e):g()}catch(e){return console.warn("[Preferences] Failed to fetch from server, falling back to localStorage:",e.message),g()}},async savePreferences(e){if(h(e),!!r.isLoggedIn())try{await I(e),console.log("[Preferences] Saved to server")}catch(t){console.warn("[Preferences] Failed to save to server:",t.message)}},async updatePreferences(e){if(h(e),!!r.isLoggedIn())try{await b(e),console.log("[Preferences] Updated on server")}catch(t){console.warn("[Preferences] Failed to update on server:",t.message)}},async syncOnLogin(){if(!r.isLoggedIn()){console.warn("[Preferences] syncOnLogin called but user not logged in");return}console.log("[Preferences] Starting sync on login...");try{let e=await _(),t=g();k(e)?(console.log("[Preferences] Server has preferences, applying to local"),h(e)):O(t)?(console.log("[Preferences] No server preferences, uploading local preferences"),await I(t)):console.log("[Preferences] No preferences to sync"),console.log("[Preferences] Sync completed")}catch(e){console.error("[Preferences] Sync failed:",e.message)}},getCategoryConfig(){try{let e=localStorage.getItem(i.CATEGORY_CONFIG);return e?JSON.parse(e):null}catch{return null}},async saveCategoryConfig(e){try{localStorage.setItem(i.CATEGORY_CONFIG,JSON.stringify(e))}catch(t){console.error("[Preferences] Failed to save category config to localStorage:",t)}if(r.isLoggedIn())try{await b({category_config:e}),console.log("[Preferences] Category config saved to server")}catch(t){console.warn("[Preferences] Failed to save category config to server:",t.message)}},getTheme(){try{return localStorage.getItem(i.THEME)||"light"}catch{return"light"}},async saveTheme(e){try{localStorage.setItem(i.THEME,e)}catch(t){console.error("[Preferences] Failed to save theme to localStorage:",t)}if(r.isLoggedIn())try{await b({theme:e}),console.log("[Preferences] Theme saved to server")}catch(t){console.warn("[Preferences] Failed to save theme to server:",t.message)}},getSidebarWidths(){let e={};try{let t=localStorage.getItem(i.FAVORITES_WIDTH);t&&(e.favorites_width=parseInt(t,10));let o=localStorage.getItem(i.TODO_WIDTH);o&&(e.todo_width=parseInt(o,10))}catch(t){console.error("[Preferences] Failed to get sidebar widths from localStorage:",t)}return e},async saveSidebarWidths(e){try{e.favorites_width!==void 0&&localStorage.setItem(i.FAVORITES_WIDTH,String(e.favorites_width)),e.todo_width!==void 0&&localStorage.setItem(i.TODO_WIDTH,String(e.todo_width))}catch(t){console.error("[Preferences] Failed to save sidebar widths to localStorage:",t)}if(r.isLoggedIn())try{await b({sidebar_widths:e}),console.log("[Preferences] Sidebar widths saved to server")}catch(t){console.warn("[Preferences] Failed to save sidebar widths to server:",t.message)}},getStorageKeys(){return{...i}}};window.preferences=v;var x=class{constructor(){this.currentUser=null,this.listeners=[],this.initialized=!1,this.loading=!1,this._setupBroadcastChannel()}async init(){if(this.initialized)return this.currentUser;try{await this.fetchUser(),this.initialized=!0}catch(t){console.error("[AuthState] Init failed:",t),this.currentUser=null,this.initialized=!0}return this.currentUser}async fetchUser(){if(this.loading)return this.currentUser;this.loading=!0;try{console.log("[AuthState] Fetching user...");let t=await fetch("/api/auth/me");if(t.status===404||t.status===500)this.currentUser=null;else{let o=await t.json();this.currentUser=o.ok&&o.user?o.user:null}return console.log("[AuthState] User fetched:",this.currentUser?"logged in":"not logged in"),this._notifyListeners(),this.currentUser}catch(t){return console.error("[AuthState] Fetch user failed:",t),this.currentUser=null,null}finally{this.loading=!1}}isLoggedIn(){return!!this.currentUser}getUser(){return this.currentUser}subscribe(t){return this.listeners.push(t),t(this.currentUser),()=>{this.listeners=this.listeners.filter(o=>o!==t)}}async logout(){console.log("[AuthState] Logging out...");try{let t=await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"});if(!t.ok)throw new Error(`Logout failed: ${t.status}`);return console.log("[AuthState] Logout successful"),this.currentUser=null,this._notifyListeners(),this._clearUserCaches(),this._broadcast({type:"logout"}),!0}catch(t){throw console.error("[AuthState] Logout failed:",t),t}}async onLogin(){if(console.log("[AuthState] Login detected, refreshing user..."),await this.fetchUser(),this.isLoggedIn())try{await v.syncOnLogin(),console.log("[AuthState] Preferences synced after login")}catch(t){console.error("[AuthState] Failed to sync preferences:",t)}this._broadcast({type:"login"})}_clearUserCaches(){console.log("[AuthState] Clearing user caches...");let t=[];for(let o=0;o<localStorage.length;o++){let s=localStorage.key(o);s&&s.startsWith("hotnews_")&&t.push(s)}t.forEach(o=>localStorage.removeItem(o)),console.log("[AuthState] Cleared",t.length,"cache entries")}_notifyListeners(){this.listeners.forEach(t=>{try{t(this.currentUser)}catch(o){console.error("[AuthState] Listener error:",o)}})}_setupBroadcastChannel(){if(typeof BroadcastChannel>"u"){console.warn("[AuthState] BroadcastChannel not supported");return}try{this.channel=new BroadcastChannel("hotnews_auth"),this.channel.onmessage=t=>{console.log("[AuthState] Received broadcast:",t.data),t.data.type==="logout"?(this.currentUser=null,this._notifyListeners()):t.data.type==="login"&&this.fetchUser()}}catch(t){console.warn("[AuthState] BroadcastChannel setup failed:",t)}}_broadcast(t){if(this.channel)try{this.channel.postMessage(t)}catch(o){console.warn("[AuthState] Broadcast failed:",o)}}async verifyLogout(){try{let o=await(await fetch("/api/auth/me")).json();return!(o.ok&&o.user)}catch{return!0}}},r=new x;(async()=>{try{let e=new URLSearchParams(window.location.search);if(e.has("login")){console.log("[AuthState] OAuth login callback detected, refreshing user..."),await r.onLogin(),e.delete("login");let t=e.toString()?`${window.location.pathname}?${e}`:window.location.pathname;window.history.replaceState({},"",t)}else if(e.has("logout")){console.log("[AuthState] Logout callback detected, clearing state..."),r.currentUser=null,r.initialized=!0,r._notifyListeners(),e.delete("logout");let t=e.toString()?`${window.location.pathname}?${e}`:window.location.pathname;window.history.replaceState({},"",t)}else await r.init();console.log("[AuthState] Auto-initialization complete, user:",r.currentUser?"logged in":"not logged in")}catch(e){console.error("[AuthState] Auto-initialization failed:",e),r.initialized=!0}})();window.authState=r;var l=null,d=null,m=null,w=null,p=0,L=5*60;async function U(){return l||new Promise((e,t)=>{if(window.QRCode){l=window.QRCode,e(l);return}let o=document.createElement("script");o.src="/static/js/lib/qrcode.min.js",o.onload=()=>{l=window.QRCode,e(l)},o.onerror=t,document.head.appendChild(o)})}async function V(){try{let e=await fetch("/api/subscription/status",{credentials:"include"});return e.ok?await e.json():null}catch(e){return console.error("Get subscription status error:",e),null}}async function A(){if(!r.getUser()){window.Toast?.show("\u8BF7\u5148\u767B\u5F55","error"),window.openLoginModal?.();return}let t=document.getElementById("subscriptionModal");t||(t=z(),document.body.appendChild(t)),d=null,c(),t.classList.add("open"),await E()}function R(){let e=document.getElementById("subscriptionModal");e&&e.classList.remove("open"),c(),f(),d=null}function z(){let e=document.createElement("div");return e.id="subscriptionModal",e.className="subscription-modal",e.innerHTML=`
        <div class="subscription-modal-backdrop" onclick="closeSubscriptionModal()"></div>
        <div class="subscription-modal-content">
            <button class="subscription-modal-close" onclick="closeSubscriptionModal()">\xD7</button>
            
            <div class="subscription-modal-header">
                <h2>\u{1F451} \u5F00\u901A\u4F1A\u5458</h2>
                <p class="subscription-status-hint" id="subscriptionStatusHint"></p>
            </div>
            
            <div class="subscription-modal-body">
                <!-- Plans Section -->
                <div id="subscriptionPlansSection" class="subscription-plans-section">
                    <div class="subscription-loading">\u52A0\u8F7D\u4E2D...</div>
                </div>
                
                <!-- QR Code Section -->
                <div id="subscriptionQRSection" class="subscription-qr-section" style="display:none;">
                    <div class="subscription-qr-back" onclick="showSubscriptionPlans()">
                        <span>\u2190 \u8FD4\u56DE\u9009\u62E9\u5957\u9910</span>
                    </div>
                    <div class="subscription-qr-container">
                        <div id="subscriptionQRCode" class="subscription-qr-code"></div>
                        <div class="subscription-qr-hint">\u8BF7\u4F7F\u7528\u5FAE\u4FE1\u626B\u7801\u652F\u4ED8</div>
                        <div id="subscriptionCountdown" class="subscription-countdown">\u6709\u6548\u671F <span id="subCountdownTime">5:00</span></div>
                    </div>
                    <div class="subscription-order-info">
                        <div class="subscription-order-amount">\xA5<span id="subscriptionOrderAmount">--</span></div>
                        <div class="subscription-order-plan"><span id="subscriptionOrderPlan">--</span></div>
                    </div>
                    <div id="subscriptionStatus" class="subscription-status">\u7B49\u5F85\u652F\u4ED8...</div>
                    <div class="subscription-refresh-hint">
                        \u5DF2\u652F\u4ED8\uFF1F<a href="javascript:void(0)" onclick="manualCheckSubscription()">\u5237\u65B0\u72B6\u6001</a>
                    </div>
                </div>
                
                <!-- Success Section -->
                <div id="subscriptionSuccessSection" class="subscription-success-section" style="display:none;">
                    <div class="subscription-success-icon">\u{1F389}</div>
                    <div class="subscription-success-title">\u5F00\u901A\u6210\u529F</div>
                    <div class="subscription-success-desc">\u60A8\u5DF2\u6210\u4E3A VIP \u4F1A\u5458</div>
                    <button class="subscription-success-btn" onclick="closeSubscriptionModal()">\u5B8C\u6210</button>
                </div>
            </div>
        </div>
    `,W(),e}async function E(){let e=document.getElementById("subscriptionPlansSection"),t=document.getElementById("subscriptionStatusHint");try{let[o,s]=await Promise.all([fetch("/api/subscription/plans"),fetch("/api/subscription/status",{credentials:"include"})]),n=await o.json(),a=await s.json();if(t)if(a.is_vip){let y=new Date(a.expire_at*1e3);t.innerHTML=`<span class="vip-badge">VIP</span> \u5230\u671F: ${y.toLocaleDateString("zh-CN")} \xB7 \u5269\u4F59 ${a.usage_remaining} \u6B21`}else t.textContent="\u5F00\u901A\u4F1A\u5458\uFF0C\u7545\u4EAB AI \u603B\u7ED3";let u=n.plans||[];if(u.length===0){e.innerHTML='<div class="subscription-loading">\u6682\u65E0\u53EF\u7528\u5957\u9910</div>';return}e.innerHTML=`
            <div class="subscription-plans-grid">
                ${u.map((y,T)=>$(y,T===1)).join("")}
            </div>
            <div class="subscription-benefits">
                <div class="subscription-benefit">\u2713 AI \u667A\u80FD\u603B\u7ED3</div>
                <div class="subscription-benefit">\u2713 \u6587\u7AE0\u5206\u7C7B\u6807\u7B7E</div>
                <div class="subscription-benefit">\u2713 \u4F18\u5148\u6280\u672F\u652F\u6301</div>
            </div>
        `}catch(o){console.error("Load subscription plans error:",o),e.innerHTML=`
            <div class="subscription-error">
                <div>\u52A0\u8F7D\u5931\u8D25</div>
                <button onclick="loadSubscriptionPlans()">\u91CD\u8BD5</button>
            </div>
        `}}function $(e,t=!1){let o=e.badge?`<div class="subscription-plan-badge">${e.badge}</div>`:"";return`
        <div class="subscription-plan-card ${t?"recommended":""}" 
             data-plan-id="${e.id}"
             onclick="selectSubscriptionPlan(${e.id})">
            ${o}
            <div class="subscription-plan-name">${e.name}</div>
            <div class="subscription-plan-price">
                <span class="subscription-plan-currency">\xA5</span>
                <span class="subscription-plan-amount">${e.price}</span>
                <span class="subscription-plan-period">/${e.plan_type==="yearly"?"\u5E74":"\u6708"}</span>
            </div>
            <div class="subscription-plan-quota">${e.usage_quota} \u6B21/\u5468\u671F</div>
            <div class="subscription-plan-duration">${e.duration_days} \u5929\u6709\u6548\u671F</div>
        </div>
    `}async function F(e){let t=document.getElementById("subscriptionPlansSection"),o=document.getElementById("subscriptionQRSection"),s=document.getElementById("subscriptionStatus");t.style.display="none",o.style.display="block",s.textContent="\u6B63\u5728\u521B\u5EFA\u8BA2\u5355...",s.className="subscription-status";try{let n=await fetch("/api/subscription/create",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({plan_id:e})});if(!n.ok){let u=await n.json();throw new Error(u.error||u.detail||"\u521B\u5EFA\u8BA2\u5355\u5931\u8D25")}let a=await n.json();d=a.order_no,document.getElementById("subscriptionOrderAmount").textContent=a.amount,document.getElementById("subscriptionOrderPlan").textContent=a.plan_name,await N(a.code_url),s.textContent="\u7B49\u5F85\u652F\u4ED8...",B(),M()}catch(n){console.error("Create subscription order error:",n),s.textContent=n.message||"\u521B\u5EFA\u8BA2\u5355\u5931\u8D25",s.className="subscription-status error"}}async function N(e){let t=document.getElementById("subscriptionQRCode");t.innerHTML="";try{await U(),new l(t,{text:e,width:200,height:200,colorDark:"#1d1d1f",colorLight:"#ffffff",correctLevel:l.CorrectLevel.M})}catch(o){console.error("QR code error:",o),t.innerHTML='<div class="subscription-qr-error">\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25</div>'}}function j(){c(),f(),d=null,document.getElementById("subscriptionPlansSection").style.display="block",document.getElementById("subscriptionQRSection").style.display="none",document.getElementById("subscriptionSuccessSection").style.display="none"}function B(){c();let e=0,t=600;m=setInterval(async()=>{if(!d){c();return}if(e++,e>t){c();let o=document.getElementById("subscriptionStatus");o.textContent="\u8BA2\u5355\u5DF2\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",o.className="subscription-status error";return}try{let s=await(await fetch(`/api/payment/status?order_no=${d}`)).json();if(s.status==="paid")c(),P();else if(s.status==="expired"){c();let n=document.getElementById("subscriptionStatus");n.textContent="\u8BA2\u5355\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",n.className="subscription-status error"}}catch(o){console.error("Poll status error:",o)}},1e3)}function c(){m&&(clearInterval(m),m=null)}function M(){f(),p=L,C(),w=setInterval(()=>{p--,C(),p<=0&&f()},1e3)}function f(){w&&(clearInterval(w),w=null)}function C(){let e=document.getElementById("subCountdownTime");if(!e)return;let t=Math.floor(p/60),o=p%60;e.textContent=`${t}:${o.toString().padStart(2,"0")}`}function P(){f(),document.getElementById("subscriptionPlansSection").style.display="none",document.getElementById("subscriptionQRSection").style.display="none",document.getElementById("subscriptionSuccessSection").style.display="flex",window.dispatchEvent(new CustomEvent("subscription-success"))}async function H(){if(!d)return;let e=document.getElementById("subscriptionStatus");e.textContent="\u6B63\u5728\u67E5\u8BE2...";try{(await(await fetch(`/api/payment/status?order_no=${d}`)).json()).status==="paid"?(c(),P()):e.textContent="\u5C1A\u672A\u652F\u4ED8\uFF0C\u8BF7\u5B8C\u6210\u652F\u4ED8\u540E\u518D\u8BD5"}catch{e.textContent="\u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5",e.className="subscription-status error"}}function W(){if(document.getElementById("subscription-modal-styles"))return;let e=document.createElement("style");e.id="subscription-modal-styles",e.textContent=`
        .subscription-modal {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 10000;
        }
        .subscription-modal.open {
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .subscription-modal-backdrop {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.6);
        }
        .subscription-modal-content {
            position: relative;
            background: #1e293b;
            border-radius: 16px;
            width: 90%;
            max-width: 420px;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }
        .subscription-modal-close {
            position: absolute;
            top: 12px; right: 12px;
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 24px;
            cursor: pointer;
            padding: 4px 8px;
            line-height: 1;
            z-index: 1;
        }
        .subscription-modal-close:hover { color: #f1f5f9; }
        .subscription-modal-header {
            padding: 20px 24px 16px;
            border-bottom: 1px solid #334155;
            text-align: center;
        }
        .subscription-modal-header h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            color: #f1f5f9;
        }
        .subscription-status-hint {
            margin: 8px 0 0;
            font-size: 13px;
            color: #94a3b8;
        }
        .vip-badge {
            display: inline-block;
            background: linear-gradient(135deg, #f59e0b, #ef4444);
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            margin-right: 6px;
        }
        .subscription-modal-body {
            padding: 20px 24px;
            overflow-y: auto;
        }
        .subscription-plans-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 20px;
        }
        .subscription-plan-card {
            position: relative;
            background: #0f172a;
            border: 2px solid #334155;
            border-radius: 12px;
            padding: 20px 16px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        .subscription-plan-card:hover {
            border-color: #3b82f6;
            transform: translateY(-2px);
        }
        .subscription-plan-card.recommended {
            border-color: #f59e0b;
            background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(239, 68, 68, 0.1));
        }
        .subscription-plan-badge {
            position: absolute;
            top: -10px;
            right: 10px;
            background: linear-gradient(135deg, #f59e0b, #ef4444);
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 3px 8px;
            border-radius: 4px;
        }
        .subscription-plan-name {
            font-size: 15px;
            font-weight: 600;
            color: #f1f5f9;
            margin-bottom: 12px;
        }
        .subscription-plan-price {
            margin-bottom: 8px;
        }
        .subscription-plan-currency {
            font-size: 16px;
            color: #94a3b8;
        }
        .subscription-plan-amount {
            font-size: 32px;
            font-weight: 700;
            color: #f1f5f9;
        }
        .subscription-plan-period {
            font-size: 14px;
            color: #64748b;
        }
        .subscription-plan-quota {
            font-size: 13px;
            color: #3b82f6;
            margin-bottom: 4px;
        }
        .subscription-plan-duration {
            font-size: 12px;
            color: #64748b;
        }
        .subscription-benefits {
            display: flex;
            flex-wrap: wrap;
            gap: 8px 16px;
            justify-content: center;
            padding: 16px;
            background: rgba(59, 130, 246, 0.1);
            border-radius: 8px;
        }
        .subscription-benefit {
            font-size: 13px;
            color: #94a3b8;
        }
        /* QR Section */
        .subscription-qr-section { text-align: center; }
        .subscription-qr-back {
            text-align: left;
            margin-bottom: 16px;
        }
        .subscription-qr-back span {
            color: #3b82f6;
            cursor: pointer;
            font-size: 14px;
        }
        .subscription-qr-container {
            background: white;
            border-radius: 12px;
            padding: 20px;
            display: inline-block;
            margin-bottom: 16px;
        }
        .subscription-qr-code {
            width: 200px;
            height: 200px;
            margin: 0 auto;
        }
        .subscription-qr-hint {
            margin-top: 12px;
            font-size: 13px;
            color: #64748b;
        }
        .subscription-countdown {
            margin-top: 8px;
            font-size: 12px;
            color: #94a3b8;
        }
        .subscription-order-info {
            margin-bottom: 16px;
        }
        .subscription-order-amount {
            font-size: 28px;
            font-weight: 700;
            color: #f1f5f9;
        }
        .subscription-order-plan {
            font-size: 14px;
            color: #94a3b8;
        }
        .subscription-status {
            font-size: 14px;
            color: #94a3b8;
            margin-bottom: 12px;
        }
        .subscription-status.error { color: #ef4444; }
        .subscription-refresh-hint {
            font-size: 13px;
            color: #64748b;
        }
        .subscription-refresh-hint a {
            color: #3b82f6;
            text-decoration: none;
        }
        /* Success Section */
        .subscription-success-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 40px 20px;
        }
        .subscription-success-icon {
            font-size: 64px;
            margin-bottom: 16px;
        }
        .subscription-success-title {
            font-size: 24px;
            font-weight: 600;
            color: #f1f5f9;
            margin-bottom: 8px;
        }
        .subscription-success-desc {
            font-size: 14px;
            color: #94a3b8;
            margin-bottom: 24px;
        }
        .subscription-success-btn {
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            border: none;
            border-radius: 8px;
            padding: 12px 32px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
        }
        .subscription-loading, .subscription-error {
            text-align: center;
            padding: 32px;
            color: #64748b;
        }
        .subscription-error button {
            margin-top: 12px;
            padding: 8px 16px;
            background: #3b82f6;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
        }
    `,document.head.appendChild(e)}window.openSubscriptionModal=A;window.closeSubscriptionModal=R;window.selectSubscriptionPlan=F;window.showSubscriptionPlans=j;window.manualCheckSubscription=H;window.loadSubscriptionPlans=E;export{r as a,v as b,V as c,A as d,R as e};
