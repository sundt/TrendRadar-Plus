import{a as T,b as U}from"./chunk-I35K533E.js";import{b as H}from"./chunk-ZRMZIGTH.js";var C=null,q=!1,z=null,ct=`
.tr-export-widget {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Expanded state */
.tr-export-expanded {
    width: 340px;
    background: #1a1a2e;
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.08);
    color: #eee;
}
.tr-export-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
}
.tr-export-title {
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
}
.tr-export-title .spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: #818cf8;
    border-radius: 50%;
    animation: tr-spin 0.8s linear infinite;
}
.tr-export-btns {
    display: flex;
    gap: 4px;
}
.tr-export-btn {
    background: none; border: none; color: #888; cursor: pointer;
    font-size: 16px; padding: 2px 4px; border-radius: 4px;
    transition: color 0.15s, background 0.15s;
}
.tr-export-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
.tr-export-status {
    font-size: 12px; color: #aaa; margin-bottom: 8px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tr-export-bar-track {
    height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;
}
.tr-export-bar-fill {
    height: 100%; background: linear-gradient(90deg, #818cf8, #6366f1);
    border-radius: 2px; transition: width 0.3s ease;
}
.tr-export-bar-fill.indeterminate {
    width: 40% !important;
    animation: tr-slide 1.2s ease-in-out infinite;
}
.tr-export-actions {
    display: flex; gap: 8px; margin-top: 12px;
}
.tr-export-action {
    flex: 1; padding: 8px 0; border: none; border-radius: 8px;
    font-size: 13px; font-weight: 500; cursor: pointer;
    transition: opacity 0.15s;
}
.tr-export-action:hover { opacity: 0.85; }
.tr-export-action.primary {
    background: linear-gradient(135deg, #818cf8, #6366f1);
    color: #fff;
}
.tr-export-action.secondary {
    background: rgba(255,255,255,0.1); color: #ccc;
}

/* Minimized state */
.tr-export-mini {
    width: 48px; height: 48px;
    background: #1a1a2e;
    border-radius: 50%;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: transform 0.2s;
}
.tr-export-mini:hover { transform: scale(1.08); }
.tr-export-mini .spinner {
    width: 20px; height: 20px;
    border: 2.5px solid rgba(255,255,255,0.15);
    border-top-color: #818cf8;
    border-radius: 50%;
    animation: tr-spin 0.8s linear infinite;
}
.tr-export-mini .done-icon {
    font-size: 22px;
}
.tr-export-mini .fail-icon {
    font-size: 22px;
}

@keyframes tr-spin { to { transform: rotate(360deg); } }
@keyframes tr-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
}
`;function dt(){if(document.getElementById("tr-export-styles"))return;let o=document.createElement("style");o.id="tr-export-styles",o.textContent=ct,document.head.appendChild(o)}function ft(){return j(),dt(),C=document.createElement("div"),C.className="tr-export-widget",document.body.appendChild(C),C}function j(){C&&(C.remove(),C=null)}function J(o){if(!C)return;let{status:a,progress:l,done:s,error:c,htmlResult:r}=o,d="";s&&!c&&r?d=`
            <div class="tr-export-actions">
                <button class="tr-export-action primary" data-act="open">\u{1F4C4} \u6253\u5F00\u5408\u96C6</button>
                <button class="tr-export-action secondary" data-act="close">\u5173\u95ED</button>
            </div>`:s&&c&&(d=`
            <div class="tr-export-actions">
                <button class="tr-export-action secondary" data-act="close">\u5173\u95ED</button>
            </div>`);let u=s||l>0?"":"indeterminate",b=s?"100%":l>0?`${l}%`:"40%";C.innerHTML=`
        <div class="tr-export-expanded">
            <div class="tr-export-header">
                <div class="tr-export-title">
                    ${s?c?"\u274C":"\u2705":'<span class="spinner"></span>'}
                    ${s?c?"\u5BFC\u51FA\u5931\u8D25":"\u5BFC\u51FA\u5B8C\u6210":"\u6B63\u5728\u5BFC\u51FA\u6587\u7AE0"}
                </div>
                <div class="tr-export-btns">
                    ${s?"":'<button class="tr-export-btn" data-act="minimize" title="\u6700\u5C0F\u5316">\u25AC</button>'}
                    ${s?"":'<button class="tr-export-btn" data-act="cancel" title="\u53D6\u6D88">\u2715</button>'}
                </div>
            </div>
            <div class="tr-export-status">${a}</div>
            <div class="tr-export-bar-track">
                <div class="tr-export-bar-fill ${u}" style="width: ${b}"></div>
            </div>
            ${d}
        </div>`,C.querySelectorAll("[data-act]").forEach(v=>{v.addEventListener("click",S=>{let _=S.currentTarget.dataset.act;_==="minimize"?(q=!0,K(o)):_==="cancel"?(z&&z.abort(),j()):_==="open"&&r?pt(r):_==="close"&&j()})})}function K(o){if(!C)return;let{done:a,error:l}=o,s;a&&l?s='<span class="fail-icon">\u274C</span>':a?s='<span class="done-icon">\u2705</span>':s='<span class="spinner"></span>',C.innerHTML=`<div class="tr-export-mini">${s}</div>`,C.querySelector(".tr-export-mini").addEventListener("click",()=>{q=!1,J(o)})}function Y(o){C&&(q?K(o):J(o))}function pt(o){let a=window.open("","_blank");if(a)a.document.open(),a.document.write(o),a.document.close();else{let l=new Blob([o],{type:"text/html; charset=utf-8"}),s=URL.createObjectURL(l);window.open(s,"_blank"),setTimeout(()=>URL.revokeObjectURL(s),5e3)}}function Q(o){let a=Array.from(o.querySelectorAll(".news-list .news-item")),l=[];for(let r of a){let d=r.querySelector(".news-title");!d||!d.href||l.push({title:d.textContent?.trim()||"",url:d.href})}if(!l.length){window.TR?.toast?.show&&window.TR.toast.show("\u8BE5\u5361\u7247\u6682\u65E0\u6587\u7AE0",{variant:"warning",durationMs:1500});return}let s=o.querySelector(".platform-name")?.textContent?.trim()||"\u6587\u7AE0\u5408\u96C6";ft(),q=!1,z=new AbortController;let c={status:`\u6B63\u5728\u83B7\u53D6 ${l.length} \u7BC7\u6587\u7AE0\u5185\u5BB9...`,progress:0,done:!1,error:null,htmlResult:null};Y(c),fetch("/api/articles/export",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({articles:l,card_title:s}),signal:z.signal}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text()}).then(r=>{c.done=!0,c.progress=100,c.htmlResult=r;let d=r.match(/成功获取 (\d+) 篇/),u=r.match(/共 (\d+) 篇文章/),b=d?d[1]:"?",v=u?u[1]:l.length;c.status=`${v} \u7BC7\u6587\u7AE0\u5DF2\u5904\u7406\uFF0C${b} \u7BC7\u83B7\u53D6\u6210\u529F`,Y(c)}).catch(r=>{if(r.name==="AbortError"){j();return}c.done=!0,c.error=r.message,c.status=`\u5BFC\u51FA\u5931\u8D25: ${r.message}`,Y(c)})}function tt(o){return new Promise(a=>{let l=document.createElement("div");l.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10010;display:flex;align-items:center;justify-content:center;";let s=document.createElement("div");s.style.cssText="background:#fff;border-radius:12px;padding:24px;max-width:320px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;",s.innerHTML=`
            <div style="font-size:15px;color:#1f2937;line-height:1.6;margin-bottom:20px;">${o}</div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button class="confirm-cancel" style="flex:1;padding:8px 0;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#6b7280;font-size:14px;cursor:pointer;">\u53D6\u6D88</button>
                <button class="confirm-ok" style="flex:1;padding:8px 0;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:14px;cursor:pointer;">\u786E\u8BA4\u5220\u9664</button>
            </div>
        `,l.appendChild(s),document.body.appendChild(l);let c=r=>{l.remove(),a(r)};s.querySelector(".confirm-cancel").onclick=()=>c(!1),s.querySelector(".confirm-ok").onclick=()=>c(!0),l.addEventListener("click",r=>{r.target===l&&c(!1)})})}function V(o){let l=o?.closest?.(".tab-pane")?.id||"";return l.startsWith("tab-")?l.slice(4):null}function ut(o,a,l){let s=Array.from(o.querySelectorAll(".platform-card:not(.dragging):not(.platform-card-placeholder)")),c=null,r=1/0;for(let d of s){let u=d.getBoundingClientRect(),b=u.left+u.width/2,v=u.top+u.height/2,S=a-b,_=l-v,R=S*S+_*_;R<r&&(r=R,c={card:d,rect:u,cx:b,cy:v})}return c}function Z(o,a){if(!o||!Array.isArray(a))return;let l=T.settings.getCategoryConfig()||T.settings.getDefaultCategoryConfig(),s=T.settings.normalizeCategoryConfig(l);if((T.settings.getMergedCategoryConfig().customCategories||[]).find(d=>d.id===o)){let d=(s.customCategories||[]).findIndex(u=>u.id===o);d>=0&&(s.customCategories[d]={...s.customCategories[d],platforms:a})}else(!s.platformOrder||typeof s.platformOrder!="object")&&(s.platformOrder={}),s.platformOrder[o]=a;T.settings.saveCategoryConfig(s)}function ht(o,a,l){if(!a)return;let s=o?.querySelector(".platform-name")?.textContent?.replace(/📱\s*/,"").replace(/NEW$/,"").trim()||a,c=T.settings.getCategoryConfig()||T.settings.getDefaultCategoryConfig(),r=T.settings.normalizeCategoryConfig(c);r.hiddenPlatforms.includes(a)||r.hiddenPlatforms.push(a),T.settings.saveCategoryConfig(r),o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u9690\u85CF\u300C${s}\u300D\uFF0C\u53EF\u5728\u680F\u76EE\u8BBE\u7F6E\u4E2D\u6062\u590D`,{variant:"success",durationMs:2500})}async function gt(o,a,l){if(!(!a||!l||!await tt(`\u786E\u5B9A\u8981\u4ECE\u4E3B\u9898\u4E2D\u5220\u9664\u6570\u636E\u6E90\u300C${a}\u300D\u5417\uFF1F`)))try{let c=await fetch(`/api/topics/${l}`,{credentials:"include"});if(!c.ok)throw new Error("\u83B7\u53D6\u4E3B\u9898\u4FE1\u606F\u5931\u8D25");let r=await c.json();if(!r.ok||!r.topic)throw new Error("\u4E3B\u9898\u4E0D\u5B58\u5728");let u=r.topic.rss_source_ids||[],b=o?.dataset?.sourceId;if(!b){console.warn("Source ID not found in card, cannot remove"),window.TR?.toast?.show&&window.TR.toast.show("\u65E0\u6CD5\u5220\u9664\u6B64\u6570\u636E\u6E90\uFF0C\u8BF7\u901A\u8FC7\u7F16\u8F91\u4E3B\u9898\u79FB\u9664",{variant:"warning",durationMs:3e3});return}let v=u.filter(R=>R!==b);if(v.length===u.length){console.warn("Source not found in topic sources:",b),o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u79FB\u9664\u300C${a}\u300D`,{variant:"success",durationMs:2e3});return}let S=await fetch(`/api/topics/${l}`,{method:"PUT",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({rss_source_ids:v})});if(!S.ok)throw new Error("\u66F4\u65B0\u4E3B\u9898\u5931\u8D25");let _=await S.json();if(!_.ok)throw new Error(_.error||"\u66F4\u65B0\u4E3B\u9898\u5931\u8D25");o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u4ECE\u4E3B\u9898\u4E2D\u79FB\u9664\u300C${a}\u300D`,{variant:"success",durationMs:2500})}catch(c){console.error("Remove topic source failed:",c),window.TR?.toast?.show&&window.TR.toast.show("\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3})}}async function mt(o,a,l){if(!(!a||!l||!await tt(`\u786E\u5B9A\u8981\u4ECE\u4E3B\u9898\u4E2D\u5220\u9664\u5173\u952E\u8BCD\u300C${a}\u300D\u5417\uFF1F`)))try{let c=await fetch(`/api/topics/${l}`,{credentials:"include"});if(!c.ok)throw new Error("\u83B7\u53D6\u4E3B\u9898\u4FE1\u606F\u5931\u8D25");let r=await c.json();if(!r.ok||!r.topic)throw new Error("\u4E3B\u9898\u4E0D\u5B58\u5728");let u=r.topic.keywords||[],b=u.filter(_=>_!==a);if(b.length===0){window.TR?.toast?.show&&window.TR.toast.show("\u81F3\u5C11\u9700\u8981\u4FDD\u7559\u4E00\u4E2A\u5173\u952E\u8BCD",{variant:"warning",durationMs:2500});return}if(b.length===u.length){console.warn("Keyword not found in topic:",a),o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u79FB\u9664\u5173\u952E\u8BCD\u300C${a}\u300D`,{variant:"success",durationMs:2e3});return}let v=await fetch(`/api/topics/${l}`,{method:"PUT",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({keywords:b})});if(!v.ok)throw new Error("\u66F4\u65B0\u4E3B\u9898\u5931\u8D25");let S=await v.json();if(!S.ok)throw new Error(S.error||"\u66F4\u65B0\u4E3B\u9898\u5931\u8D25");o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u4ECE\u4E3B\u9898\u4E2D\u79FB\u9664\u5173\u952E\u8BCD\u300C${a}\u300D`,{variant:"success",durationMs:2500})}catch(c){console.error("Remove topic keyword failed:",c),window.TR?.toast?.show&&window.TR.toast.show("\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3})}}var et={_draggingCard:null,_draggingPlatformId:null,_originGrid:null,_originCategoryId:null,_pointerId:null,_ghostEl:null,_placeholderEl:null,_ghostRaf:null,_ghostClientX:0,_ghostClientY:0,_ghostOffsetX:0,_ghostOffsetY:0,_prevUserSelect:null,_autoScrollRaf:null,_autoScrollGrid:null,_autoScrollDir:0,_autoScrollSpeed:0,_reorderRaf:null,_reorderGrid:null,_reorderX:0,_reorderY:0,_reorderOverCard:null,attach(){if(this._attached)return;this._attached=!0;let o=80,a=35,l=1400,s=5200,c=5200,r=null,d=null,u=null,b=()=>{r||d||(r=document.createElement("div"),r.className="tr-drag-edge-arrow tr-drag-edge-arrow-left",r.innerHTML="\u25C0",r.style.cssText=`
                position: fixed;
                left: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 60px;
                height: 120px;
                background: linear-gradient(90deg, rgba(99, 102, 241, 0.9) 0%, rgba(99, 102, 241, 0.3) 100%);
                color: white;
                font-size: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                cursor: pointer;
                border-radius: 0 12px 12px 0;
                pointer-events: all;
                transition: background 0.2s;
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            `,r.style.opacity="0.25",d=document.createElement("div"),d.className="tr-drag-edge-arrow tr-drag-edge-arrow-right",d.innerHTML="\u25B6",d.style.cssText=`
                position: fixed;
                right: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 60px;
                height: 120px;
                background: linear-gradient(90deg, rgba(99, 102, 241, 0.3) 0%, rgba(99, 102, 241, 0.9) 100%);
                color: white;
                font-size: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                cursor: pointer;
                border-radius: 12px 0 0 12px;
                pointer-events: all;
                transition: background 0.2s;
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            `,d.style.opacity="0.25",document.body.appendChild(r),document.body.appendChild(d))},v=()=>{r&&(r.remove(),r=null),d&&(d.remove(),d=null),u&&(cancelAnimationFrame(u),u=null)},S=(e,t)=>{u&&cancelAnimationFrame(u);let n=0,i=0,h=g=>{if(!t)return;n||(n=g),i||(i=g);let p=Math.max(0,g-i);i=g;let f=Math.max(0,g-n),m=Math.min(s,l+f/1e3*c),A=Math.max(0,(t.scrollWidth||0)-(t.clientWidth||0)),O=e*m*(p/1e3),M=Math.max(0,Math.min(A,(t.scrollLeft||0)+O));t.scrollLeft=M,u=requestAnimationFrame(h)};u=requestAnimationFrame(h)},_=()=>{u&&(cancelAnimationFrame(u),u=null)},R=(e,t)=>{r&&(r.style.opacity=e?"1":"0.25"),d&&(d.style.opacity=t?"1":"0.25")},$=()=>{this._autoScrollRaf&&cancelAnimationFrame(this._autoScrollRaf),this._autoScrollRaf=null,this._autoScrollGrid=null,this._autoScrollDir=0,this._autoScrollSpeed=0},ot=()=>{this._ghostRaf&&cancelAnimationFrame(this._ghostRaf),this._ghostRaf=null},F=(e,t)=>{this._ghostClientX=e,this._ghostClientY=t,!this._ghostRaf&&(this._ghostRaf=requestAnimationFrame(()=>{if(this._ghostRaf=null,!this._ghostEl)return;let n=this._ghostClientX-this._ghostOffsetX,i=this._ghostClientY-this._ghostOffsetY;this._ghostEl.style.transform=`translate3d(${n}px, ${i}px, 0)`}))},rt=()=>{if(this._autoScrollRaf)return;let e=0,t=()=>{if(!this._autoScrollGrid||!this._autoScrollDir||!this._autoScrollSpeed){$();return}let n=this._autoScrollGrid,i=Math.max(0,(n.scrollWidth||0)-(n.clientWidth||0));if(i<=0){$();return}let h=performance.now();e||(e=h);let g=Math.max(0,h-e);e=h;let p=this._autoScrollSpeed*(g/16.6667),f=Math.max(0,Math.min(i,(n.scrollLeft||0)+this._autoScrollDir*p));n.scrollLeft=f,this._autoScrollRaf=requestAnimationFrame(t)};this._autoScrollRaf=requestAnimationFrame(t)},nt=(e,t)=>{if(!this._draggingCard||!t)return $(),R(!1,!1),_(),"none";let n=e.clientX;if(r&&d){let M=r.getBoundingClientRect(),D=d.getBoundingClientRect();if(n>=M.left&&n<=M.right)return R(!0,!1),$(),S(-1,t),"arrow";if(n>=D.left&&n<=D.right)return R(!1,!0),$(),S(1,t),"arrow";_()}if(Math.max(0,(t.scrollWidth||0)-(t.clientWidth||0))<=0)return $(),R(!1,!1),"none";let h=t.getBoundingClientRect(),g=n-h.left,p=h.right-n,f=0,m=0;if(g>=0&&g<=o)f=-1,m=g;else if(p>=0&&p<=o)f=1,m=p;else return R(!1,!1),$(),"none";R(f===-1,f===1);let A=Math.max(0,Math.min(1,(o-m)/o)),O=Math.max(1,Math.round(A*A*a));return this._autoScrollGrid=t,this._autoScrollDir=f,this._autoScrollSpeed=O,rt(),"edge"},N=()=>{this._reorderRaf&&cancelAnimationFrame(this._reorderRaf),this._reorderRaf=null,this._reorderGrid=null,this._reorderOverCard=null},it=()=>{if(this._reorderRaf)return;let e=()=>{this._reorderRaf=null;let t=this._reorderGrid,n=this._placeholderEl||this._draggingCard;if(!t||!n)return;let i=this._reorderOverCard;if((!i||i===n||!t.contains(i)||i.classList?.contains?.("platform-card-placeholder"))&&(i=ut(t,this._reorderX,this._reorderY)?.card||null),!i||i===n)return;let h=i.getBoundingClientRect(),p=this._reorderX<h.left+h.width/2?i:i.nextSibling;p===n||p===n.nextSibling||t.insertBefore(n,p)};this._reorderRaf=requestAnimationFrame(e)},W=(e,t,n)=>{!this._draggingCard||!t||(this._reorderGrid=t,this._reorderX=e.clientX,this._reorderY=e.clientY,this._reorderOverCard=n,it())},st=()=>{this._ghostEl&&(this._ghostEl.remove(),this._ghostEl=null),ot(),this._prevUserSelect!=null&&(document.body.style.userSelect=this._prevUserSelect,this._prevUserSelect=null),this._draggingCard&&this._draggingCard.classList.remove("dragging"),this._draggingCard=null,this._draggingPlatformId=null,this._originGrid=null,this._originCategoryId=null,this._pointerId=null,this._placeholderEl=null,$(),_(),N(),R(!1,!1),v()},B=()=>{let e=this._originGrid,t=this._originCategoryId,n=this._draggingCard,i=this._placeholderEl;if(n&&i&&i.parentNode&&i.replaceWith(n),e&&t){let h=Array.from(e.querySelectorAll(".platform-card")).map(g=>g.dataset.platform).filter(Boolean);Z(t,h)}st()};document.addEventListener("pointerdown",e=>{if(e.button!==0)return;let t=e.target?.closest?.(".platform-drag-handle");if(!t)return;let n=t.closest(".platform-card"),i=t.closest(".platform-grid"),h=V(i),g=n?.dataset?.platform||null;if(!n||!i||!h||!g)return;e.preventDefault(),this._prevUserSelect=document.body.style.userSelect,document.body.style.userSelect="none",t.style.touchAction="none";try{t.setPointerCapture(e.pointerId)}catch{}this._pointerId=e.pointerId,this._draggingCard=n,this._draggingPlatformId=g,this._originGrid=i,this._originCategoryId=h;let p=n.getBoundingClientRect();this._ghostOffsetX=e.clientX-p.left,this._ghostOffsetY=e.clientY-p.top;let f=document.createElement("div");f.className="platform-card platform-card-placeholder",f.style.width=p.width+"px",f.style.height=p.height+"px",f.style.boxSizing="border-box",f.style.border="2px dashed rgba(99, 102, 241, 0.6)",f.style.borderRadius="12px",f.style.background="rgba(99, 102, 241, 0.06)",this._placeholderEl=f,n.parentNode&&n.parentNode.replaceChild(f,n);let m=n.cloneNode(!0);m.classList.add("dragging"),m.style.position="fixed",m.style.left="0",m.style.top="0",m.style.width=p.width+"px",m.style.height=p.height+"px",m.style.margin="0",m.style.zIndex="10001",m.style.pointerEvents="none",m.style.opacity="0.92",m.style.willChange="transform",m.style.transform=`translate3d(${p.left}px, ${p.top}px, 0)`,this._ghostEl=m,document.body.appendChild(m),b(),R(!1,!1),n.classList.add("dragging"),F(e.clientX,e.clientY)},!0),document.addEventListener("pointermove",e=>{if(!this._draggingCard||this._pointerId==null||e.pointerId!==this._pointerId)return;e.preventDefault(),F(e.clientX,e.clientY);let t=this._originGrid;if(!t)return;if(nt(e,t)!=="none"){N();return}let i=t.getBoundingClientRect();if(!(e.clientX>=i.left&&e.clientX<=i.right&&e.clientY>=i.top&&e.clientY<=i.bottom)){N();return}let p=document.elementFromPoint(e.clientX,e.clientY)?.closest?.(".platform-card");if(p&&p.classList?.contains?.("platform-card-placeholder")){W(e,t,null);return}W(e,t,p)},!0),document.addEventListener("pointerup",e=>{this._pointerId!=null&&e.pointerId===this._pointerId&&(e.preventDefault(),B())},!0),document.addEventListener("pointercancel",e=>{this._pointerId!=null&&e.pointerId===this._pointerId&&(e.preventDefault(),B())},!0),document.addEventListener("dragstart",e=>{e.target?.closest?.(".platform-drag-handle")&&e.preventDefault()},!0);let y=null,k=()=>{y&&y.parentNode&&y.parentNode.removeChild(y),y=null},at=(e,t,n,i)=>{k();let h=i==="my-tags",g=i==="discovery",p=i.startsWith("topic-"),f=t.dataset?.tagId,m=t.dataset?.platform,A=t.dataset?.keyword,O=t.dataset?.source;y=document.createElement("div"),y.className="tr-platform-context-menu";let M="";g&&f?M=`
                    <div class="tr-ctx-item" data-action="follow">\u2795 \u4E00\u952E\u5173\u6CE8</div>
                `:p?A?M=`
                        <div class="tr-ctx-item" data-action="remove-keyword">\u{1F5D1}\uFE0F \u5220\u9664\u6B64\u5173\u952E\u8BCD</div>
                    `:O&&(M=`
                        <div class="tr-ctx-item" data-action="remove-source">\u{1F5D1}\uFE0F \u5220\u9664\u6B64\u6570\u636E\u6E90</div>
                    `):(M=`
                    <div class="tr-ctx-item" data-action="top">\u2B06\uFE0F \u7F6E\u9876</div>
                    <div class="tr-ctx-item" data-action="bottom">\u2B07\uFE0F \u7F6E\u5E95</div>
                    <div class="tr-ctx-item" data-action="hide" style="border-top:1px solid #e5e7eb;">\u{1F441}\uFE0F\u200D\u{1F5E8}\uFE0F \u9690\u85CF\u5361\u7247</div>
                `,h&&f&&(M+='<div class="tr-ctx-item" data-action="unfollow" style="border-top:1px solid #e5e7eb;color:#ef4444;">\u{1F6AB} \u53D6\u6D88\u5173\u6CE8</div>')),M+='<div class="tr-ctx-item" data-action="copy-all-links" style="border-top:1px solid #e5e7eb;">\u{1F4CB} \u590D\u5236\u6240\u6709\u94FE\u63A5</div>',M+='<div class="tr-ctx-item" data-action="export-pdf">\u{1F4C4} \u751F\u6210\u6587\u7AE0\u5408\u96C6</div>',y.innerHTML=M,y.style.cssText=`
                position: fixed;
                left: ${e.clientX}px;
                top: ${e.clientY}px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                min-width: 120px;
                overflow: hidden;
            `;let D=`
                padding: 10px 16px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.15s;
            `;y.querySelectorAll(".tr-ctx-item").forEach(I=>{I.style.cssText=D,I.addEventListener("mouseenter",()=>I.style.background="#f3f4f6"),I.addEventListener("mouseleave",()=>I.style.background="white")}),y.addEventListener("click",I=>{let E=I.target?.dataset?.action;if(!E)return;if(E==="copy-all-links"){k();let w=Array.from(t.querySelectorAll(".news-list .news-title")).map(x=>x.href).filter(Boolean);w.length?navigator.clipboard.writeText(w.join(`
`)).then(()=>{window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u590D\u5236 ${w.length} \u6761\u94FE\u63A5`,{variant:"success",durationMs:2e3})}).catch(()=>{window.TR?.toast?.show&&window.TR.toast.show("\u590D\u5236\u5931\u8D25",{variant:"error",durationMs:2e3})}):window.TR?.toast?.show&&window.TR.toast.show("\u8BE5\u5361\u7247\u6682\u65E0\u94FE\u63A5",{variant:"warning",durationMs:1500});return}if(E==="export-pdf"){k(),Q(t);return}if(E==="edit"){k(),window.openCategorySettings&&(window.openCategorySettings(),setTimeout(()=>{try{T.settings&&typeof T.settings.editCategory=="function"&&T.settings.editCategory(i)}catch(w){console.error("Failed to edit category:",w)}},100));return}if(E==="edit-topic"&&p){k();let w=i.replace("topic-","");window.TopicTracker&&typeof window.TopicTracker.editTopic=="function"&&window.TopicTracker.editTopic(w);return}if(E==="delete-topic"&&p){k();let w=i.replace("topic-","");window.TopicTracker&&typeof window.TopicTracker.deleteTopic=="function"&&window.TopicTracker.deleteTopic(w);return}if(E==="remove-keyword"&&p&&A){k();let w=i.replace("topic-","");mt(t,A,w);return}if(E==="remove-source"&&p&&O){k();let w=i.replace("topic-","");gt(t,O,w);return}if(E==="hide"&&m){k(),ht(t,m,i);return}if(E==="follow"&&g&&f){if(k(),!H())return;let w=t.querySelector(".platform-name")?.textContent?.replace(/NEW.*$/,"").replace(/发现于.*$/,"").replace(/\(.*\)/,"").trim()||f;fetch("/api/user/preferences/tag-settings",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({tag_id:f,preference:"follow"})}).then(x=>{if(!x.ok)throw new Error("\u5173\u6CE8\u5931\u8D25");return x.json()}).then(x=>{if(!x.ok)throw new Error(x.error||"\u5173\u6CE8\u5931\u8D25");try{localStorage.removeItem("hotnews_my_tags_cache")}catch{}window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u5173\u6CE8\u300C${w}\u300D`,{variant:"success",durationMs:2e3})}).catch(x=>{console.error("Follow failed:",x),window.TR?.toast?.show&&window.TR.toast.show("\u5173\u6CE8\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3})});return}if(E==="unfollow"&&h&&f){k();let w=t.querySelector(".platform-name")?.textContent?.replace(/\(.*\)/,"").trim()||f,x=t.dataset?.itemType||"tag",P;if(x==="source"){let L=f.startsWith("custom-")||f.startsWith("custom_")?"custom":"rss";P=fetch("/api/sources/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({source_id:f,source_type:L})})}else if(x==="keyword"){let L=t.dataset?.keywordId;if(L)P=fetch(`/api/user/keywords/${encodeURIComponent(L)}`,{method:"DELETE",credentials:"include"});else{let G=f.match(/^keyword_(\d+)$/);G&&(P=fetch(`/api/user/keywords/${G[1]}`,{method:"DELETE",credentials:"include"}))}}else if(x==="wechat"){let L=t.dataset?.fakeid||f.replace(/^mp-/,"");P=fetch("/api/wechat/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({fakeid:L})})}else P=fetch("/api/user/preferences/tag-settings",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({tag_id:f,preference:"neutral"})});if(!P){window.TR?.toast?.show&&window.TR.toast.show("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3});return}P.then(L=>{if(!L.ok)throw new Error("\u53D6\u6D88\u5173\u6CE8\u5931\u8D25");t.style.transition="opacity 0.3s, transform 0.3s",t.style.opacity="0",t.style.transform="scale(0.95)",setTimeout(()=>t.remove(),300);try{localStorage.removeItem("hotnews_my_tags_cache")}catch{}window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u53D6\u6D88\u5173\u6CE8\u300C${w}\u300D`,{variant:"success",durationMs:2e3})}).catch(L=>{console.error("Unfollow failed:",L),window.TR?.toast?.show&&window.TR.toast.show("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3})});return}let lt=Array.from(n.querySelectorAll(".platform-card"));if(E==="top"?n.insertBefore(t,lt[0]):E==="bottom"&&n.appendChild(t),h){let w=Array.from(n.querySelectorAll(".platform-card")).map(x=>x.dataset.tagId).filter(Boolean);fetch("/api/user/preferences/tag-order",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify(w)}).then(()=>{try{localStorage.removeItem("hotnews_my_tags_cache")}catch{}}).catch(x=>{console.error("Save my-tags order failed:",x),window.TR?.toast?.show&&window.TR.toast.show("\u4FDD\u5B58\u987A\u5E8F\u5931\u8D25\uFF0C\u5237\u65B0\u540E\u5C06\u590D\u539F",{variant:"warning",durationMs:2500})})}else{let w=Array.from(n.querySelectorAll(".platform-card")).map(x=>x.dataset.platform).filter(Boolean);Z(i,w)}k()}),document.body.appendChild(y);let X=y.getBoundingClientRect();X.right>window.innerWidth&&(y.style.left=window.innerWidth-X.width-8+"px"),X.bottom>window.innerHeight&&(y.style.top=window.innerHeight-X.height-8+"px")};document.addEventListener("click",e=>{y&&!y.contains(e.target)&&k()},!0),document.addEventListener("contextmenu",e=>{let t=e.target?.closest?.(".platform-drag-handle"),n=e.target?.closest?.(".platform-header");if(!t&&!n)return;let i=e.target?.closest?.(".platform-card"),h=e.target?.closest?.(".platform-grid"),g=V(h);!i||!h||!g||g!=="explore"&&(e.preventDefault(),at(e,i,h,g))},!0)}};T.platformReorder=et;U(()=>{et.attach()});export{et as platformReorder};
