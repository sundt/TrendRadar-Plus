import"./modulepreload-polyfill-B5Qt9EMX.js";async function o(d,e={}){const t=await fetch(d,{...e,headers:{"Content-Type":"application/json",...e.headers},credentials:"include"}),s=await t.json();if(!t.ok)throw new Error(s.detail||s.message||"Request failed");return s}function n(d,e="info"){const t=document.getElementById("toast");t.textContent=d,t.className=`toast ${e}`,t.classList.remove("hidden"),setTimeout(()=>{t.classList.add("hidden")},3e3)}function l(d){const e=new Date(d*1e3),s=new Date-e;return s<6e4?"刚刚":s<36e5?`${Math.floor(s/6e4)} 分钟前`:s<864e5?`${Math.floor(s/36e5)} 小时前`:s<6048e5?`${Math.floor(s/864e5)} 天前`:`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`}class r{constructor(){this.drafts=[],this.total=0,this.page=1,this.pageSize=10,this.deleteTargetId=null}async init(){this.bindEvents(),await this.loadDrafts()}async loadDrafts(){const e=document.getElementById("loading"),t=document.getElementById("empty-state"),s=document.getElementById("draft-list"),i=document.getElementById("pagination");e.classList.remove("hidden"),t.classList.add("hidden"),s.classList.add("hidden"),i.classList.add("hidden");try{const a=await o(`/api/publisher/drafts?page=${this.page}&page_size=${this.pageSize}`);e.classList.add("hidden"),a.ok&&a.data&&(this.drafts=a.data.items,this.total=a.data.total,this.drafts.length===0?t.classList.remove("hidden"):(this.renderDrafts(),s.classList.remove("hidden"),this.total>this.pageSize&&(this.updatePagination(),i.classList.remove("hidden"))))}catch(a){e.classList.add("hidden"),console.error("Load drafts failed:",a),a.message.includes("登录")||a.message.includes("401")?n("请先登录","error"):a.message.includes("会员")||a.message.includes("403")?n("需要会员权限","error"):n("加载失败: "+a.message,"error"),t.classList.remove("hidden")}}renderDrafts(){const e=document.getElementById("draft-list");e.innerHTML=this.drafts.map(t=>`
            <div class="draft-item" data-id="${t.id}">
                <div class="draft-cover">
                    ${t.cover_url?`<img src="${t.cover_url}" alt="封面">`:`<div class="draft-cover-placeholder">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <path d="M21 15l-5-5L5 21"/>
                            </svg>
                           </div>`}
                </div>
                <div class="draft-content">
                    <h3 class="draft-title">
                        <a href="/write/${t.id}">${t.title||"无标题"}</a>
                    </h3>
                    <p class="draft-digest">${t.digest||"暂无摘要"}</p>
                    <div class="draft-meta">
                        <span class="draft-status status-${t.status}">${t.status==="draft"?"草稿":"已发布"}</span>
                        <span>更新于 ${l(t.updated_at)}</span>
                    </div>
                </div>
                <div class="draft-actions">
                    <button class="btn-icon btn-edit" title="编辑" data-id="${t.id}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon btn-delete" title="删除" data-id="${t.id}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join("")}updatePagination(){const e=Math.ceil(this.total/this.pageSize),t=document.getElementById("page-info"),s=document.getElementById("btn-prev"),i=document.getElementById("btn-next");t.textContent=`第 ${this.page} / ${e} 页`,s.disabled=this.page<=1,i.disabled=this.page>=e}bindEvents(){document.getElementById("draft-list").addEventListener("click",e=>{const t=e.target.closest(".btn-edit"),s=e.target.closest(".btn-delete");if(t){const i=t.dataset.id;window.location.href=`/write/${i}`}if(s){const i=s.dataset.id;this.showDeleteModal(i)}}),document.getElementById("btn-prev").addEventListener("click",()=>{this.page>1&&(this.page--,this.loadDrafts())}),document.getElementById("btn-next").addEventListener("click",()=>{const e=Math.ceil(this.total/this.pageSize);this.page<e&&(this.page++,this.loadDrafts())}),document.getElementById("btn-close-delete").addEventListener("click",()=>{this.hideDeleteModal()}),document.getElementById("btn-cancel-delete").addEventListener("click",()=>{this.hideDeleteModal()}),document.getElementById("btn-confirm-delete").addEventListener("click",()=>{this.confirmDelete()}),document.querySelector("#delete-modal .modal-overlay").addEventListener("click",()=>{this.hideDeleteModal()})}showDeleteModal(e){this.deleteTargetId=e,document.getElementById("delete-modal").classList.remove("hidden")}hideDeleteModal(){this.deleteTargetId=null,document.getElementById("delete-modal").classList.add("hidden")}async confirmDelete(){if(this.deleteTargetId)try{await o(`/api/publisher/drafts/${this.deleteTargetId}`,{method:"DELETE"}),n("草稿已删除","success"),this.hideDeleteModal(),await this.loadDrafts()}catch(e){console.error("Delete failed:",e),n("删除失败: "+e.message,"error")}}}document.addEventListener("DOMContentLoaded",()=>{new r().init()});
