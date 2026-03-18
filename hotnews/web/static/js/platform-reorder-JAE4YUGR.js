import{a as v,b as U}from"./chunk-I35K533E.js";import{b as H}from"./chunk-N3WOZHU5.js";var T=null,q=!1,z=null,dt=`
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
`;function ft(){if(document.getElementById("tr-export-styles"))return;let o=document.createElement("style");o.id="tr-export-styles",o.textContent=dt,document.head.appendChild(o)}function pt(){return j(),ft(),T=document.createElement("div"),T.className="tr-export-widget",document.body.appendChild(T),T}function j(){T&&(T.remove(),T=null)}function J(o){if(!T)return;let{status:a,progress:l,done:s,error:c,htmlResult:r}=o,d="";s&&!c&&r?d=`
            <div class="tr-export-actions">
                <button class="tr-export-action primary" data-act="open">\u{1F4C4} \u6253\u5F00\u5408\u96C6</button>
                <button class="tr-export-action secondary" data-act="close">\u5173\u95ED</button>
            </div>`:s&&c&&(d=`
            <div class="tr-export-actions">
                <button class="tr-export-action secondary" data-act="close">\u5173\u95ED</button>
            </div>`);let u=s||l>0?"":"indeterminate",y=s?"100%":l>0?`${l}%`:"40%";T.innerHTML=`
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
                <div class="tr-export-bar-fill ${u}" style="width: ${y}"></div>
            </div>
            ${d}
        </div>`,T.querySelectorAll("[data-act]").forEach(_=>{_.addEventListener("click",C=>{let b=C.currentTarget.dataset.act;b==="minimize"?(q=!0,K(o)):b==="cancel"?(z&&z.abort(),j()):b==="open"&&r?ut(r):b==="close"&&j()})})}function K(o){if(!T)return;let{done:a,error:l}=o,s;a&&l?s='<span class="fail-icon">\u274C</span>':a?s='<span class="done-icon">\u2705</span>':s='<span class="spinner"></span>',T.innerHTML=`<div class="tr-export-mini">${s}</div>`,T.querySelector(".tr-export-mini").addEventListener("click",()=>{q=!1,J(o)})}function Y(o){T&&(q?K(o):J(o))}function ut(o){let a=window.open("","_blank");if(a)a.document.open(),a.document.write(o),a.document.close();else{let l=new Blob([o],{type:"text/html; charset=utf-8"}),s=URL.createObjectURL(l);window.open(s,"_blank"),setTimeout(()=>URL.revokeObjectURL(s),5e3)}}function Q(o){let a=Array.from(o.querySelectorAll(".news-list .news-item")),l=[];for(let r of a){let d=r.querySelector(".news-title");!d||!d.href||l.push({title:d.textContent?.trim()||"",url:d.href})}if(!l.length){window.TR?.toast?.show&&window.TR.toast.show("\u8BE5\u5361\u7247\u6682\u65E0\u6587\u7AE0",{variant:"warning",durationMs:1500});return}let s=o.querySelector(".platform-name")?.textContent?.trim()||"\u6587\u7AE0\u5408\u96C6";pt(),q=!1,z=new AbortController;let c={status:`\u6B63\u5728\u83B7\u53D6 ${l.length} \u7BC7\u6587\u7AE0\u5185\u5BB9...`,progress:0,done:!1,error:null,htmlResult:null};Y(c),fetch("/api/articles/export",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({articles:l,card_title:s}),signal:z.signal}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text()}).then(r=>{c.done=!0,c.progress=100,c.htmlResult=r;let d=r.match(/成功获取 (\d+) 篇/),u=r.match(/共 (\d+) 篇文章/),y=d?d[1]:"?",_=u?u[1]:l.length;c.status=`${_} \u7BC7\u6587\u7AE0\u5DF2\u5904\u7406\uFF0C${y} \u7BC7\u83B7\u53D6\u6210\u529F`,Y(c)}).catch(r=>{if(r.name==="AbortError"){j();return}c.done=!0,c.error=r.message,c.status=`\u5BFC\u51FA\u5931\u8D25: ${r.message}`,Y(c)})}function tt(o){return new Promise(a=>{let l=document.createElement("div");l.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10010;display:flex;align-items:center;justify-content:center;";let s=document.createElement("div");s.style.cssText="background:#fff;border-radius:12px;padding:24px;max-width:320px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;",s.innerHTML=`
            <div style="font-size:15px;color:#1f2937;line-height:1.6;margin-bottom:20px;">${o}</div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button class="confirm-cancel" style="flex:1;padding:8px 0;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#6b7280;font-size:14px;cursor:pointer;">\u53D6\u6D88</button>
                <button class="confirm-ok" style="flex:1;padding:8px 0;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:14px;cursor:pointer;">\u786E\u8BA4\u5220\u9664</button>
            </div>
        `,l.appendChild(s),document.body.appendChild(l);let c=r=>{l.remove(),a(r)};s.querySelector(".confirm-cancel").onclick=()=>c(!1),s.querySelector(".confirm-ok").onclick=()=>c(!0),l.addEventListener("click",r=>{r.target===l&&c(!1)})})}function V(o){let l=o?.closest?.(".tab-pane")?.id||"";return l.startsWith("tab-")?l.slice(4):null}function ht(o,a,l){let s=Array.from(o.querySelectorAll(".platform-card:not(.dragging):not(.platform-card-placeholder)")),c=null,r=1/0;for(let d of s){let u=d.getBoundingClientRect(),y=u.left+u.width/2,_=u.top+u.height/2,C=a-y,b=l-_,R=C*C+b*b;R<r&&(r=R,c={card:d,rect:u,cx:y,cy:_})}return c}function Z(o,a){if(!o||!Array.isArray(a))return;let l=v.settings.getCategoryConfig()||v.settings.getDefaultCategoryConfig(),s=v.settings.normalizeCategoryConfig(l);if((v.settings.getMergedCategoryConfig().customCategories||[]).find(d=>d.id===o)){let d=(s.customCategories||[]).findIndex(u=>u.id===o);d>=0&&(s.customCategories[d]={...s.customCategories[d],platforms:a})}else(!s.platformOrder||typeof s.platformOrder!="object")&&(s.platformOrder={}),s.platformOrder[o]=a;v.settings.saveCategoryConfig(s)}function gt(o,a,l){if(!a)return;let s=o?.querySelector(".platform-name")?.textContent?.replace(/📱\s*/,"").replace(/NEW$/,"").trim()||a,c=v.settings.getCategoryConfig()||v.settings.getDefaultCategoryConfig(),r=v.settings.normalizeCategoryConfig(c);r.hiddenPlatforms.includes(a)||r.hiddenPlatforms.push(a),v.settings.saveCategoryConfig(r),o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u9690\u85CF\u300C${s}\u300D\uFF0C\u53EF\u5728\u680F\u76EE\u8BBE\u7F6E\u4E2D\u6062\u590D`,{variant:"success",durationMs:2500})}async function mt(o,a,l){if(!(!a||!l||!await tt(`\u786E\u5B9A\u8981\u4ECE\u4E3B\u9898\u4E2D\u5220\u9664\u6570\u636E\u6E90\u300C${a}\u300D\u5417\uFF1F`)))try{let c=await fetch(`/api/topics/${l}`,{credentials:"include"});if(!c.ok)throw new Error("\u83B7\u53D6\u4E3B\u9898\u4FE1\u606F\u5931\u8D25");let r=await c.json();if(!r.ok||!r.topic)throw new Error("\u4E3B\u9898\u4E0D\u5B58\u5728");let u=r.topic.rss_source_ids||[],y=o?.dataset?.sourceId;if(!y){console.warn("Source ID not found in card, cannot remove"),window.TR?.toast?.show&&window.TR.toast.show("\u65E0\u6CD5\u5220\u9664\u6B64\u6570\u636E\u6E90\uFF0C\u8BF7\u901A\u8FC7\u7F16\u8F91\u4E3B\u9898\u79FB\u9664",{variant:"warning",durationMs:3e3});return}let _=u.filter(R=>R!==y);if(_.length===u.length){console.warn("Source not found in topic sources:",y),o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u79FB\u9664\u300C${a}\u300D`,{variant:"success",durationMs:2e3});return}let C=await fetch(`/api/topics/${l}`,{method:"PUT",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({rss_source_ids:_})});if(!C.ok)throw new Error("\u66F4\u65B0\u4E3B\u9898\u5931\u8D25");let b=await C.json();if(!b.ok)throw new Error(b.error||"\u66F4\u65B0\u4E3B\u9898\u5931\u8D25");o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u4ECE\u4E3B\u9898\u4E2D\u79FB\u9664\u300C${a}\u300D`,{variant:"success",durationMs:2500})}catch(c){console.error("Remove topic source failed:",c),window.TR?.toast?.show&&window.TR.toast.show("\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3})}}async function wt(o,a,l){if(!(!a||!l||!await tt(`\u786E\u5B9A\u8981\u4ECE\u4E3B\u9898\u4E2D\u5220\u9664\u5173\u952E\u8BCD\u300C${a}\u300D\u5417\uFF1F`)))try{let c=await fetch(`/api/topics/${l}`,{credentials:"include"});if(!c.ok)throw new Error("\u83B7\u53D6\u4E3B\u9898\u4FE1\u606F\u5931\u8D25");let r=await c.json();if(!r.ok||!r.topic)throw new Error("\u4E3B\u9898\u4E0D\u5B58\u5728");let u=r.topic.keywords||[],y=u.filter(b=>b!==a);if(y.length===0){window.TR?.toast?.show&&window.TR.toast.show("\u81F3\u5C11\u9700\u8981\u4FDD\u7559\u4E00\u4E2A\u5173\u952E\u8BCD",{variant:"warning",durationMs:2500});return}if(y.length===u.length){console.warn("Keyword not found in topic:",a),o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u79FB\u9664\u5173\u952E\u8BCD\u300C${a}\u300D`,{variant:"success",durationMs:2e3});return}let _=await fetch(`/api/topics/${l}`,{method:"PUT",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({keywords:y})});if(!_.ok)throw new Error("\u66F4\u65B0\u4E3B\u9898\u5931\u8D25");let C=await _.json();if(!C.ok)throw new Error(C.error||"\u66F4\u65B0\u4E3B\u9898\u5931\u8D25");o&&(o.style.transition="opacity 0.3s, transform 0.3s",o.style.opacity="0",o.style.transform="scale(0.95)",setTimeout(()=>o.remove(),300)),window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u4ECE\u4E3B\u9898\u4E2D\u79FB\u9664\u5173\u952E\u8BCD\u300C${a}\u300D`,{variant:"success",durationMs:2500})}catch(c){console.error("Remove topic keyword failed:",c),window.TR?.toast?.show&&window.TR.toast.show("\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3})}}var et={_draggingCard:null,_draggingPlatformId:null,_originGrid:null,_originCategoryId:null,_pointerId:null,_ghostEl:null,_placeholderEl:null,_ghostRaf:null,_ghostClientX:0,_ghostClientY:0,_ghostOffsetX:0,_ghostOffsetY:0,_prevUserSelect:null,_autoScrollRaf:null,_autoScrollGrid:null,_autoScrollDir:0,_autoScrollSpeed:0,_reorderRaf:null,_reorderGrid:null,_reorderX:0,_reorderY:0,_reorderOverCard:null,attach(){if(this._attached)return;this._attached=!0;let o=80,a=35,l=1400,s=5200,c=5200,r=null,d=null,u=null,y=()=>{r||d||(r=document.createElement("div"),r.className="tr-drag-edge-arrow tr-drag-edge-arrow-left",r.innerHTML="\u25C0",r.style.cssText=`
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
            `,d.style.opacity="0.25",document.body.appendChild(r),document.body.appendChild(d))},_=()=>{r&&(r.remove(),r=null),d&&(d.remove(),d=null),u&&(cancelAnimationFrame(u),u=null)},C=(e,t)=>{u&&cancelAnimationFrame(u);let i=0,n=0,h=g=>{if(!t)return;i||(i=g),n||(n=g);let p=Math.max(0,g-n);n=g;let f=Math.max(0,g-i),m=Math.min(s,l+f/1e3*c),A=Math.max(0,(t.scrollWidth||0)-(t.clientWidth||0)),O=e*m*(p/1e3),k=Math.max(0,Math.min(A,(t.scrollLeft||0)+O));t.scrollLeft=k,u=requestAnimationFrame(h)};u=requestAnimationFrame(h)},b=()=>{u&&(cancelAnimationFrame(u),u=null)},R=(e,t)=>{r&&(r.style.opacity=e?"1":"0.25"),d&&(d.style.opacity=t?"1":"0.25")},$=()=>{this._autoScrollRaf&&cancelAnimationFrame(this._autoScrollRaf),this._autoScrollRaf=null,this._autoScrollGrid=null,this._autoScrollDir=0,this._autoScrollSpeed=0},ot=()=>{this._ghostRaf&&cancelAnimationFrame(this._ghostRaf),this._ghostRaf=null},F=(e,t)=>{this._ghostClientX=e,this._ghostClientY=t,!this._ghostRaf&&(this._ghostRaf=requestAnimationFrame(()=>{if(this._ghostRaf=null,!this._ghostEl)return;let i=this._ghostClientX-this._ghostOffsetX,n=this._ghostClientY-this._ghostOffsetY;this._ghostEl.style.transform=`translate3d(${i}px, ${n}px, 0)`}))},rt=()=>{if(this._autoScrollRaf)return;let e=0,t=()=>{if(!this._autoScrollGrid||!this._autoScrollDir||!this._autoScrollSpeed){$();return}let i=this._autoScrollGrid,n=Math.max(0,(i.scrollWidth||0)-(i.clientWidth||0));if(n<=0){$();return}let h=performance.now();e||(e=h);let g=Math.max(0,h-e);e=h;let p=this._autoScrollSpeed*(g/16.6667),f=Math.max(0,Math.min(n,(i.scrollLeft||0)+this._autoScrollDir*p));i.scrollLeft=f,this._autoScrollRaf=requestAnimationFrame(t)};this._autoScrollRaf=requestAnimationFrame(t)},nt=(e,t)=>{if(!this._draggingCard||!t)return $(),R(!1,!1),b(),"none";let i=e.clientX;if(r&&d){let k=r.getBoundingClientRect(),D=d.getBoundingClientRect();if(i>=k.left&&i<=k.right)return R(!0,!1),$(),C(-1,t),"arrow";if(i>=D.left&&i<=D.right)return R(!1,!0),$(),C(1,t),"arrow";b()}if(Math.max(0,(t.scrollWidth||0)-(t.clientWidth||0))<=0)return $(),R(!1,!1),"none";let h=t.getBoundingClientRect(),g=i-h.left,p=h.right-i,f=0,m=0;if(g>=0&&g<=o)f=-1,m=g;else if(p>=0&&p<=o)f=1,m=p;else return R(!1,!1),$(),"none";R(f===-1,f===1);let A=Math.max(0,Math.min(1,(o-m)/o)),O=Math.max(1,Math.round(A*A*a));return this._autoScrollGrid=t,this._autoScrollDir=f,this._autoScrollSpeed=O,rt(),"edge"},N=()=>{this._reorderRaf&&cancelAnimationFrame(this._reorderRaf),this._reorderRaf=null,this._reorderGrid=null,this._reorderOverCard=null},it=()=>{if(this._reorderRaf)return;let e=()=>{this._reorderRaf=null;let t=this._reorderGrid,i=this._placeholderEl||this._draggingCard;if(!t||!i)return;let n=this._reorderOverCard;if((!n||n===i||!t.contains(n)||n.classList?.contains?.("platform-card-placeholder"))&&(n=ht(t,this._reorderX,this._reorderY)?.card||null),!n||n===i)return;let h=n.getBoundingClientRect(),p=this._reorderX<h.left+h.width/2?n:n.nextSibling;p===i||p===i.nextSibling||t.insertBefore(i,p)};this._reorderRaf=requestAnimationFrame(e)},W=(e,t,i)=>{!this._draggingCard||!t||(this._reorderGrid=t,this._reorderX=e.clientX,this._reorderY=e.clientY,this._reorderOverCard=i,it())},st=()=>{this._ghostEl&&(this._ghostEl.remove(),this._ghostEl=null),ot(),this._prevUserSelect!=null&&(document.body.style.userSelect=this._prevUserSelect,this._prevUserSelect=null),this._draggingCard&&this._draggingCard.classList.remove("dragging"),this._draggingCard=null,this._draggingPlatformId=null,this._originGrid=null,this._originCategoryId=null,this._pointerId=null,this._placeholderEl=null,$(),b(),N(),R(!1,!1),_()},G=()=>{let e=this._originGrid,t=this._originCategoryId,i=this._draggingCard,n=this._placeholderEl;if(i&&n&&n.parentNode&&n.replaceWith(i),e&&t){let h=Array.from(e.querySelectorAll(".platform-card")).map(g=>g.dataset.platform).filter(Boolean);Z(t,h)}st()};document.addEventListener("pointerdown",e=>{if(e.button!==0)return;let t=e.target?.closest?.(".platform-drag-handle");if(!t)return;let i=t.closest(".platform-card"),n=t.closest(".platform-grid"),h=V(n),g=i?.dataset?.platform||null;if(!i||!n||!h||!g)return;e.preventDefault(),this._prevUserSelect=document.body.style.userSelect,document.body.style.userSelect="none",t.style.touchAction="none";try{t.setPointerCapture(e.pointerId)}catch{}this._pointerId=e.pointerId,this._draggingCard=i,this._draggingPlatformId=g,this._originGrid=n,this._originCategoryId=h;let p=i.getBoundingClientRect();this._ghostOffsetX=e.clientX-p.left,this._ghostOffsetY=e.clientY-p.top;let f=document.createElement("div");f.className="platform-card platform-card-placeholder",f.style.width=p.width+"px",f.style.height=p.height+"px",f.style.boxSizing="border-box",f.style.border="2px dashed rgba(99, 102, 241, 0.6)",f.style.borderRadius="12px",f.style.background="rgba(99, 102, 241, 0.06)",this._placeholderEl=f,i.parentNode&&i.parentNode.replaceChild(f,i);let m=i.cloneNode(!0);m.classList.add("dragging"),m.style.position="fixed",m.style.left="0",m.style.top="0",m.style.width=p.width+"px",m.style.height=p.height+"px",m.style.margin="0",m.style.zIndex="10001",m.style.pointerEvents="none",m.style.opacity="0.92",m.style.willChange="transform",m.style.transform=`translate3d(${p.left}px, ${p.top}px, 0)`,this._ghostEl=m,document.body.appendChild(m),y(),R(!1,!1),i.classList.add("dragging"),F(e.clientX,e.clientY)},!0),document.addEventListener("pointermove",e=>{if(!this._draggingCard||this._pointerId==null||e.pointerId!==this._pointerId)return;e.preventDefault(),F(e.clientX,e.clientY);let t=this._originGrid;if(!t)return;if(nt(e,t)!=="none"){N();return}let n=t.getBoundingClientRect();if(!(e.clientX>=n.left&&e.clientX<=n.right&&e.clientY>=n.top&&e.clientY<=n.bottom)){N();return}let p=document.elementFromPoint(e.clientX,e.clientY)?.closest?.(".platform-card");if(p&&p.classList?.contains?.("platform-card-placeholder")){W(e,t,null);return}W(e,t,p)},!0),document.addEventListener("pointerup",e=>{this._pointerId!=null&&e.pointerId===this._pointerId&&(e.preventDefault(),G())},!0),document.addEventListener("pointercancel",e=>{this._pointerId!=null&&e.pointerId===this._pointerId&&(e.preventDefault(),G())},!0),document.addEventListener("dragstart",e=>{e.target?.closest?.(".platform-drag-handle")&&e.preventDefault()},!0);let x=null,S=()=>{x&&x.parentNode&&x.parentNode.removeChild(x),x=null},at=(e,t,i,n)=>{S();let h=n==="my-tags",g=n==="discovery",p=n.startsWith("topic-"),f=t.dataset?.tagId,m=t.dataset?.platform,A=t.dataset?.keyword,O=t.dataset?.source;x=document.createElement("div"),x.className="tr-platform-context-menu";let k="";g&&f?k=`
                    <div class="tr-ctx-item" data-action="follow">\u2795 \u4E00\u952E\u5173\u6CE8</div>
                `:p?A?k=`
                        <div class="tr-ctx-item" data-action="remove-keyword">\u{1F5D1}\uFE0F \u5220\u9664\u6B64\u5173\u952E\u8BCD</div>
                    `:O&&(k=`
                        <div class="tr-ctx-item" data-action="remove-source">\u{1F5D1}\uFE0F \u5220\u9664\u6B64\u6570\u636E\u6E90</div>
                    `):(k=`
                    <div class="tr-ctx-item" data-action="top">\u2B06\uFE0F \u7F6E\u9876</div>
                    <div class="tr-ctx-item" data-action="bottom">\u2B07\uFE0F \u7F6E\u5E95</div>
                    <div class="tr-ctx-item" data-action="hide" style="border-top:1px solid #e5e7eb;">\u{1F441}\uFE0F\u200D\u{1F5E8}\uFE0F \u9690\u85CF\u5361\u7247</div>
                    <div class="tr-ctx-item" data-action="edit" style="border-top:1px solid #e5e7eb;">\u2699\uFE0F \u7F16\u8F91\u987A\u5E8F</div>
                `,h&&f&&(k+='<div class="tr-ctx-item" data-action="unfollow" style="border-top:1px solid #e5e7eb;color:#ef4444;">\u{1F6AB} \u53D6\u6D88\u5173\u6CE8</div>')),k+='<div class="tr-ctx-item" data-action="copy-all-links" style="border-top:1px solid #e5e7eb;">\u{1F4CB} \u590D\u5236\u6240\u6709\u94FE\u63A5</div>',k+='<div class="tr-ctx-item" data-action="export-pdf">\u{1F4C4} \u751F\u6210\u6587\u7AE0\u5408\u96C6</div>',x.innerHTML=k,x.style.cssText=`
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
            `;x.querySelectorAll(".tr-ctx-item").forEach(I=>{I.style.cssText=D,I.addEventListener("mouseenter",()=>I.style.background="#f3f4f6"),I.addEventListener("mouseleave",()=>I.style.background="white")}),x.addEventListener("click",I=>{let M=I.target?.dataset?.action;if(!M)return;if(M==="copy-all-links"){S();let w=Array.from(t.querySelectorAll(".news-list .news-title")).map(E=>E.href).filter(Boolean);w.length?navigator.clipboard.writeText(w.join(`
`)).then(()=>{window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u590D\u5236 ${w.length} \u6761\u94FE\u63A5`,{variant:"success",durationMs:2e3})}).catch(()=>{window.TR?.toast?.show&&window.TR.toast.show("\u590D\u5236\u5931\u8D25",{variant:"error",durationMs:2e3})}):window.TR?.toast?.show&&window.TR.toast.show("\u8BE5\u5361\u7247\u6682\u65E0\u94FE\u63A5",{variant:"warning",durationMs:1500});return}if(M==="export-pdf"){S(),Q(t);return}if(M==="edit"){S(),window.openCategorySettings&&(window.openCategorySettings(),setTimeout(()=>{try{v.settings&&typeof v.settings.editCategory=="function"&&v.settings.editCategory(n)}catch(w){console.error("Failed to edit category:",w)}},100));return}if(M==="edit-topic"&&p){S();let w=n.replace("topic-","");window.TopicTracker&&typeof window.TopicTracker.editTopic=="function"&&window.TopicTracker.editTopic(w);return}if(M==="delete-topic"&&p){S();let w=n.replace("topic-","");window.TopicTracker&&typeof window.TopicTracker.deleteTopic=="function"&&window.TopicTracker.deleteTopic(w);return}if(M==="remove-keyword"&&p&&A){S();let w=n.replace("topic-","");wt(t,A,w);return}if(M==="remove-source"&&p&&O){S();let w=n.replace("topic-","");mt(t,O,w);return}if(M==="hide"&&m){S(),gt(t,m,n);return}if(M==="follow"&&g&&f){if(S(),!H())return;let w=t.querySelector(".platform-name")?.textContent?.replace(/NEW.*$/,"").replace(/发现于.*$/,"").replace(/\(.*\)/,"").trim()||f;fetch("/api/user/preferences/tag-settings",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({tag_id:f,preference:"follow"})}).then(E=>{if(!E.ok)throw new Error("\u5173\u6CE8\u5931\u8D25");return E.json()}).then(E=>{if(!E.ok)throw new Error(E.error||"\u5173\u6CE8\u5931\u8D25");try{localStorage.removeItem("hotnews_my_tags_cache")}catch{}window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u5173\u6CE8\u300C${w}\u300D`,{variant:"success",durationMs:2e3})}).catch(E=>{console.error("Follow failed:",E),window.TR?.toast?.show&&window.TR.toast.show("\u5173\u6CE8\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3})});return}if(M==="unfollow"&&h&&f){S();let w=t.querySelector(".platform-name")?.textContent?.replace(/\(.*\)/,"").trim()||f,E=t.dataset?.itemType||"tag",P;if(E==="source"){let L=f.startsWith("custom-")||f.startsWith("custom_")?"custom":"rss";P=fetch("/api/sources/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({source_id:f,source_type:L})})}else if(E==="keyword"){let L=t.dataset?.keywordId;if(L)P=fetch(`/api/user/keywords/${encodeURIComponent(L)}`,{method:"DELETE",credentials:"include"});else{let B=f.match(/^keyword_(\d+)$/);B&&(P=fetch(`/api/user/keywords/${B[1]}`,{method:"DELETE",credentials:"include"}))}}else if(E==="wechat"){let L=t.dataset?.fakeid||f.replace(/^mp-/,"");P=fetch("/api/wechat/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({fakeid:L})})}else P=fetch("/api/user/preferences/tag-settings",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({tag_id:f,preference:"neutral"})});if(!P){window.TR?.toast?.show&&window.TR.toast.show("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3});return}P.then(L=>{if(!L.ok)throw new Error("\u53D6\u6D88\u5173\u6CE8\u5931\u8D25");t.style.transition="opacity 0.3s, transform 0.3s",t.style.opacity="0",t.style.transform="scale(0.95)",setTimeout(()=>t.remove(),300);try{localStorage.removeItem("hotnews_my_tags_cache")}catch{}window.TR?.toast?.show&&window.TR.toast.show(`\u5DF2\u53D6\u6D88\u5173\u6CE8\u300C${w}\u300D`,{variant:"success",durationMs:2e3})}).catch(L=>{console.error("Unfollow failed:",L),window.TR?.toast?.show&&window.TR.toast.show("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5",{variant:"error",durationMs:2e3})});return}let lt=Array.from(i.querySelectorAll(".platform-card"));M==="top"?i.insertBefore(t,lt[0]):M==="bottom"&&i.appendChild(t);let ct=Array.from(i.querySelectorAll(".platform-card")).map(w=>w.dataset.platform).filter(Boolean);Z(n,ct),S()}),document.body.appendChild(x);let X=x.getBoundingClientRect();X.right>window.innerWidth&&(x.style.left=window.innerWidth-X.width-8+"px"),X.bottom>window.innerHeight&&(x.style.top=window.innerHeight-X.height-8+"px")};document.addEventListener("click",e=>{x&&!x.contains(e.target)&&S()},!0),document.addEventListener("contextmenu",e=>{let t=e.target?.closest?.(".platform-drag-handle"),i=e.target?.closest?.(".platform-header");if(!t&&!i)return;let n=e.target?.closest?.(".platform-card"),h=e.target?.closest?.(".platform-grid"),g=V(h);!n||!h||!g||g!=="explore"&&(e.preventDefault(),at(e,n,h,g))},!0)}};v.platformReorder=et;U(()=>{et.attach()});export{et as platformReorder};
