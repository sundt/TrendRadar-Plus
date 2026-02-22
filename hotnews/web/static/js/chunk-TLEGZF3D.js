import{a as f}from"./chunk-YRL7WKAS.js";var c=null,a=null,u=null,b=null,p=0,y=5*60;async function w(){return c||new Promise((t,i)=>{if(window.QRCode){c=window.QRCode,t(c);return}let n=document.createElement("script");n.src="/static/js/lib/qrcode.min.js",n.onload=()=>{c=window.QRCode,t(c)},n.onerror=i,document.head.appendChild(n)})}async function $(){try{let t=await fetch("/api/subscription/status",{credentials:"include"});return t.ok?await t.json():null}catch(t){return console.error("Get subscription status error:",t),null}}async function S(){if(!f.getUser()){window.Toast?.show("\u8BF7\u5148\u767B\u5F55","error"),window.openLoginModal?.();return}let i=document.getElementById("subscriptionModal");i||(i=k(),document.body.appendChild(i)),a=null,e(),i.classList.add("open"),await x()}function C(){let t=document.getElementById("subscriptionModal");t&&t.classList.remove("open"),e(),l(),a=null}function k(){let t=document.createElement("div");return t.id="subscriptionModal",t.className="subscription-modal",t.innerHTML=`
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
    `,q(),t}async function x(){let t=document.getElementById("subscriptionPlansSection"),i=document.getElementById("subscriptionStatusHint");try{let[n,o]=await Promise.all([fetch("/api/subscription/plans"),fetch("/api/subscription/status",{credentials:"include"})]),s=await n.json(),r=await o.json();if(i)if(r.is_vip){let m=new Date(r.expire_at*1e3);i.innerHTML=`<span class="vip-badge">VIP</span> \u5230\u671F: ${m.toLocaleDateString("zh-CN")} \xB7 \u5269\u4F59 ${r.usage_remaining} \u6B21`}else i.textContent="\u5F00\u901A\u4F1A\u5458\uFF0C\u7545\u4EAB AI \u603B\u7ED3";let d=s.plans||[];if(d.length===0){t.innerHTML='<div class="subscription-loading">\u6682\u65E0\u53EF\u7528\u5957\u9910</div>';return}t.innerHTML=`
            <div class="subscription-plans-grid">
                ${d.map((m,h)=>E(m,h===1)).join("")}
            </div>
            <div class="subscription-benefits">
                <div class="subscription-benefit">\u2713 AI \u667A\u80FD\u603B\u7ED3</div>
                <div class="subscription-benefit">\u2713 \u6587\u7AE0\u5206\u7C7B\u6807\u7B7E</div>
                <div class="subscription-benefit">\u2713 \u4F18\u5148\u6280\u672F\u652F\u6301</div>
            </div>
        `}catch(n){console.error("Load subscription plans error:",n),t.innerHTML=`
            <div class="subscription-error">
                <div>\u52A0\u8F7D\u5931\u8D25</div>
                <button onclick="loadSubscriptionPlans()">\u91CD\u8BD5</button>
            </div>
        `}}function E(t,i=!1){let n=t.badge?`<div class="subscription-plan-badge">${t.badge}</div>`:"";return`
        <div class="subscription-plan-card ${i?"recommended":""}" 
             data-plan-id="${t.id}"
             onclick="selectSubscriptionPlan(${t.id})">
            ${n}
            <div class="subscription-plan-name">${t.name}</div>
            <div class="subscription-plan-price">
                <span class="subscription-plan-currency">\xA5</span>
                <span class="subscription-plan-amount">${t.price}</span>
                <span class="subscription-plan-period">/${t.plan_type==="yearly"?"\u5E74":"\u6708"}</span>
            </div>
            <div class="subscription-plan-quota">${t.usage_quota} \u6B21/\u5468\u671F</div>
            <div class="subscription-plan-duration">${t.duration_days} \u5929\u6709\u6548\u671F</div>
        </div>
    `}async function I(t){let i=document.getElementById("subscriptionPlansSection"),n=document.getElementById("subscriptionQRSection"),o=document.getElementById("subscriptionStatus");i.style.display="none",n.style.display="block",o.textContent="\u6B63\u5728\u521B\u5EFA\u8BA2\u5355...",o.className="subscription-status";try{let s=await fetch("/api/subscription/create",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({plan_id:t})});if(!s.ok){let d=await s.json();throw new Error(d.error||d.detail||"\u521B\u5EFA\u8BA2\u5355\u5931\u8D25")}let r=await s.json();a=r.order_no,document.getElementById("subscriptionOrderAmount").textContent=r.amount,document.getElementById("subscriptionOrderPlan").textContent=r.plan_name,await z(r.code_url),o.textContent="\u7B49\u5F85\u652F\u4ED8...",M(),B()}catch(s){console.error("Create subscription order error:",s),o.textContent=s.message||"\u521B\u5EFA\u8BA2\u5355\u5931\u8D25",o.className="subscription-status error"}}async function z(t){let i=document.getElementById("subscriptionQRCode");i.innerHTML="";try{await w(),new c(i,{text:t,width:200,height:200,colorDark:"#1d1d1f",colorLight:"#ffffff",correctLevel:c.CorrectLevel.M})}catch(n){console.error("QR code error:",n),i.innerHTML='<div class="subscription-qr-error">\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25</div>'}}function P(){e(),l(),a=null,document.getElementById("subscriptionPlansSection").style.display="block",document.getElementById("subscriptionQRSection").style.display="none",document.getElementById("subscriptionSuccessSection").style.display="none"}function M(){e();let t=0,i=600;u=setInterval(async()=>{if(!a){e();return}if(t++,t>i){e();let n=document.getElementById("subscriptionStatus");n.textContent="\u8BA2\u5355\u5DF2\u8D85\u65F6\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",n.className="subscription-status error";return}try{let o=await(await fetch(`/api/payment/status?order_no=${a}`)).json();if(o.status==="paid")e(),v();else if(o.status==="expired"){e();let s=document.getElementById("subscriptionStatus");s.textContent="\u8BA2\u5355\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u4E0B\u5355",s.className="subscription-status error"}}catch(n){console.error("Poll status error:",n)}},1e3)}function e(){u&&(clearInterval(u),u=null)}function B(){l(),p=y,g(),b=setInterval(()=>{p--,g(),p<=0&&l()},1e3)}function l(){b&&(clearInterval(b),b=null)}function g(){let t=document.getElementById("subCountdownTime");if(!t)return;let i=Math.floor(p/60),n=p%60;t.textContent=`${i}:${n.toString().padStart(2,"0")}`}function v(){l(),document.getElementById("subscriptionPlansSection").style.display="none",document.getElementById("subscriptionQRSection").style.display="none",document.getElementById("subscriptionSuccessSection").style.display="flex",window.dispatchEvent(new CustomEvent("subscription-success"))}async function R(){if(!a)return;let t=document.getElementById("subscriptionStatus");t.textContent="\u6B63\u5728\u67E5\u8BE2...";try{(await(await fetch(`/api/payment/status?order_no=${a}`)).json()).status==="paid"?(e(),v()):t.textContent="\u5C1A\u672A\u652F\u4ED8\uFF0C\u8BF7\u5B8C\u6210\u652F\u4ED8\u540E\u518D\u8BD5"}catch{t.textContent="\u67E5\u8BE2\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5",t.className="subscription-status error"}}function q(){if(document.getElementById("subscription-modal-styles"))return;let t=document.createElement("style");t.id="subscription-modal-styles",t.textContent=`
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
    `,document.head.appendChild(t)}window.openSubscriptionModal=S;window.closeSubscriptionModal=C;window.selectSubscriptionPlan=I;window.showSubscriptionPlans=P;window.manualCheckSubscription=R;window.loadSubscriptionPlans=x;export{$ as a,S as b,C as c};
