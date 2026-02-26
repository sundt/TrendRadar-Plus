import{a as V}from"./chunk-JPTUFB3N.js";import{a as R}from"./chunk-YRL7WKAS.js";var j=!1,m=null,k=null,x=null,Z=null,ee=null,B=null,q=null,ue=!1,W=null,J=5e3,te=1e4,oe=15e3,F=null,C=5,O=null;window.addEventListener("hotnews-summarizer-sidepanel-ack",()=>{ue=!0,W&&(clearTimeout(W),W=null)});function Q(){if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))return!0;let e=navigator.maxTouchPoints>0,o=window.innerWidth<=768;return e&&o}function me(){return document.documentElement.getAttribute("data-hotnews-summarizer")==="installed"}function ye(){return document.documentElement.getAttribute("data-hotnews-summarizer-version")||null}function fe(){B&&(clearTimeout(B),B=null)}function pe(){q&&(clearTimeout(q),q=null)}function P(){F&&(clearInterval(F),F=null),O&&(clearTimeout(O),O=null),C=5}function T(){fe(),pe(),P()}async function ne(t,e,o){try{await fetch("/api/summary/failures/record",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:t,reason:"client_timeout",error_detail:"\u5BA2\u6237\u7AEF 10 \u79D2\u8D85\u65F6",source_id:e||null,source_name:o||null})}),console.log("[Summary] Recorded client timeout for:",t)}catch(n){console.error("[Summary] Failed to record client timeout:",n)}}var we={news:"\u{1F4F0}",policy:"\u26A0\uFE0F",business:"\u{1F4CA}",tutorial:"\u2705",research:"\u{1F4DA}",product:"\u{1F680}",opinion:"\u{1F4AD}",interview:"\u{1F4AC}",listicle:"\u{1F4D1}",lifestyle:"\u2705",general:"\u{1F4DD}","tech-tutorial":"\u2705",trend:"\u{1F4CA}",other:"\u{1F4DD}"};function ge(t){let e=t||0;return e>=1e3?(e/1e3).toFixed(1).replace(/\.0$/,"")+"K":e.toString()}function K(t){if(!t)return t;let e=t.replace(/\[TAGS_?START\][\s\S]*?\[TAGS_?END\]/gi,"");return e=e.replace(/\n*-{3,}\s*$/g,""),e.trim()}function I(t){if(!t)return"";let e=t.replace(/<br\s*\/?>/gi,`
`).replace(/<\/br>/gi,`
`);e=e.replace(/- \[ \]/g,"-"),e=e.replace(/- \[\]/g,"-"),e=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),e=e.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code class="language-$1">$2</code></pre>'),e=e.replace(/`([^`]+)`/g,"<code>$1</code>"),e=e.replace(/^#{4}\s+(.+)$/gm,"<h4>$1</h4>"),e=e.replace(/^#{3}\s+(.+)$/gm,"<h3>$1</h3>"),e=e.replace(/^#{2}\s+(.+)$/gm,"<h2>$1</h2>"),e=e.replace(/^#{1}\s+(.+)$/gm,"<h1>$1</h1>"),e=e.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),e=e.replace(/\*([^*]+)\*/g,"<em>$1</em>"),e=e.replace(/__([^_]+)__/g,"<strong>$1</strong>"),e=e.replace(/_([^_]+)_/g,"<em>$1</em>"),e=e.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'),e=e.replace(/^&gt;\s*(.*)$/gm,"<blockquote>$1</blockquote>"),e=e.replace(/<\/blockquote>\n<blockquote>/g,`
`),e=e.replace(/^[-]{3,}\s*$/gm,"<hr>"),e=e.replace(/^[*]{3,}\s*$/gm,"<hr>"),e=e.replace(/^[_]{3,}\s*$/gm,"<hr>");let o=e.split(`
`),n=[],r=!1,l=[],f=!1,d=[];for(let c=0;c<o.length;c++){let u=o[c],s=u.trim(),i=/^\|(.+)\|$/.test(s),y=/^\|[\s\-:|]+\|$/.test(s),g=s.match(/^[-*]\s+(.+)$/),b=s.match(/^\d+\.\s+(.+)$/),$=g||b;if(i){if(f&&d.length>0&&(n.push("<ul>"+d.join("")+"</ul>"),d=[],f=!1),r||(r=!0,l=[]),!y){let S=s.slice(1,-1).split("|").map(h=>h.trim()),M=l.length===0?"th":"td",v="<tr>"+S.map(h=>`<${M}>${h}</${M}>`).join("")+"</tr>";l.push(v)}continue}else r&&l.length>0&&(n.push("<table>"+l.join("")+"</table>"),l=[],r=!1);if($){let S=g?g[1]:b[1];f=!0,d.push("<li>"+S+"</li>");continue}else f&&d.length>0&&(n.push("<ul>"+d.join("")+"</ul>"),d=[],f=!1);n.push(u)}return r&&l.length>0&&n.push("<table>"+l.join("")+"</table>"),f&&d.length>0&&n.push("<ul>"+d.join("")+"</ul>"),e=n.join(`
`),e=e.split(/\n{2,}/).map(c=>(c=c.trim(),c?/^<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(c)||/<\/(h[1-6]|ul|ol|table|pre|blockquote)>$/.test(c)?c:"<p>"+c.replace(/\n/g,"<br>")+"</p>":"")).join(`
`),e=e.replace(/<p>\s*<\/p>/g,""),e=e.replace(/<p><hr><\/p>/g,"<hr>"),e=e.replace(/<p>(<table>)/g,"$1"),e=e.replace(/(<\/table>)<\/p>/g,"$1"),e=e.replace(/<p>(<ul>)/g,"$1"),e=e.replace(/(<\/ul>)<\/p>/g,"$1"),e=e.replace(/<p>(<blockquote>)/g,"$1"),e=e.replace(/(<\/blockquote>)<\/p>/g,"$1"),e=e.replace(/(<h[1-3]>(?:✅\s*|📋\s*)?行动清单\s*<\/h[1-3]>)/gi,'<div class="action-list-header">$1<button class="action-list-add-btn" onclick="addActionListToTodo()">+ Todo</button></div>'),e}function se(){if(document.getElementById("summaryModal"))return;document.body.insertAdjacentHTML("beforeend",`
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
    `)}async function X(t,e,o,n,r){if(!R.getUser()){V();return}se();let f=document.getElementById("summaryModal"),d=document.getElementById("summaryModalTitle"),c=document.getElementById("summaryModalBody"),u=document.getElementById("summaryModalFooter");if(m=t,k=e,x=o,Z=n,ee=r,j=!0,window._currentSummaryNewsId=t,window._currentSummaryNewsTitle=e,window._currentSummaryNewsUrl=o,typeof window.initSelectionTodo=="function"&&window.initSelectionTodo(),d){let s=e&&e.length>50?e.substring(0,50)+"...":e||"AI \u603B\u7ED3";d.textContent=`\u2728 ${s}`}f.classList.add("open"),document.body.style.overflow="hidden",c.innerHTML=`
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
    `,u.style.display="none",T(),B=setTimeout(()=>{console.log("[Summary] 5s timeout, starting countdown");let s=document.getElementById("summarySlowHint"),i=document.getElementById("summaryCountdownText");s&&(s.style.display="block"),C=5;let y=()=>{i&&(i.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${C} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};y(),F=setInterval(()=>{C--,C>0?y():P()},1e3),O=setTimeout(()=>{console.log("[Summary] 10s timeout, showing click hint"),P();let g=document.getElementById("summarySlowHint");g&&(g.innerHTML='\u52A0\u8F7D\u8F83\u6162\uFF0C\u8BF7 <a href="'+o+'" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">\u70B9\u51FB\u9605\u8BFB\u539F\u6587</a>')},te-J)},J),q=setTimeout(()=>{ne(o,n,r),T();let s=document.getElementById("summaryModal");s&&(s.classList.remove("open"),document.body.style.overflow=""),j=!1,m=null,o&&window.open(o,"_blank","noopener,noreferrer")},oe);try{let s=await fetch(`/api/summary/failures/check?url=${encodeURIComponent(o)}`);if(s.ok){let v=await s.json();if(console.log("[Summary] Check result:",v),v.summarizable)v.warning&&console.log("[Summary] Warning:",v.warning);else{console.log("[Summary] URL blocked, showing blocked UI:",o),T();let h=!Q()&&me(),N=h?ye():null;!Q()&&!h?c.innerHTML=`
                        <div class="summary-blocked-v2">
                            <div class="blocked-header">
                                <div class="blocked-icon-badge">
                                    <span class="icon-main">\u{1F512}</span>
                                </div>
                                <div class="blocked-title">\u8BE5\u7F51\u7AD9\u9700\u8981\u63D2\u4EF6\u652F\u6301</div>
                                <div class="blocked-subtitle">\u90E8\u5206\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u9700\u8981\u901A\u8FC7\u6D4F\u89C8\u5668\u63D2\u4EF6\u5728\u539F\u6587\u9875\u9762\u8FDB\u884C\u603B\u7ED3</div>
                            </div>
                            
                            <div class="blocked-extension-promo">
                                <div class="promo-header">
                                    <span class="promo-badge">\u63A8\u8350</span>
                                    <span class="promo-title">\u5B89\u88C5 uihash \u603B\u7ED3\u52A9\u624B</span>
                                </div>
                                <div class="promo-features">
                                    <div class="promo-feature">
                                        <span class="feature-icon">\u2728</span>
                                        <span>\u6253\u5F00\u539F\u6587\u81EA\u52A8\u5F39\u51FA\u603B\u7ED3</span>
                                    </div>
                                    <div class="promo-feature">
                                        <span class="feature-icon">\u{1F504}</span>
                                        <span>\u4E0E\u7F51\u7AD9\u8D26\u53F7\u81EA\u52A8\u540C\u6B65</span>
                                    </div>
                                    <div class="promo-feature">
                                        <span class="feature-icon">\u{1F4AC}</span>
                                        <span>\u652F\u6301\u667A\u80FD\u95EE\u7B54\u5BF9\u8BDD</span>
                                    </div>
                                </div>
                                <a href="/extension/install" target="_blank" class="promo-install-btn">
                                    <span class="btn-icon">\u{1F4E5}</span>
                                    <span class="btn-text">\u514D\u8D39\u5B89\u88C5\u63D2\u4EF6</span>
                                    <span class="btn-arrow">\u2192</span>
                                </a>
                                <div class="promo-browsers">
                                    \u652F\u6301 Chrome / Edge / Arc / Brave
                                </div>
                            </div>
                            
                            <div class="blocked-divider">
                                <span>\u6216\u8005</span>
                            </div>
                            
                            <div class="blocked-fallback">
                                <a href="${o}" target="_blank" rel="noopener noreferrer" class="fallback-link">
                                    \u{1F4D6} \u76F4\u63A5\u9605\u8BFB\u539F\u6587
                                </a>
                                <div class="fallback-actions">
                                    <button class="fallback-btn" onclick="addCurrentToTodo()">\u{1F4CB} Todo</button>
                                    <button class="fallback-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                                </div>
                            </div>
                        </div>
                    `:!Q()&&h?c.innerHTML=`
                        <div class="summary-blocked-v2">
                            <div class="blocked-header">
                                <div class="blocked-icon-badge">
                                    <span class="icon-main">\u{1F512}</span>
                                </div>
                                <div class="blocked-title">\u8BE5\u7F51\u7AD9\u9700\u8981\u5728\u539F\u6587\u9875\u9762\u603B\u7ED3</div>
                                <div class="blocked-subtitle">\u90E8\u5206\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u8BF7\u6253\u5F00\u539F\u6587\u540E\u4F7F\u7528\u63D2\u4EF6\u603B\u7ED3</div>
                            </div>
                            
                            <div class="blocked-extension-ready">
                                <div class="ready-badge">
                                    <span class="ready-icon">\u2705</span>
                                    <span class="ready-text">\u63D2\u4EF6\u5DF2\u5C31\u7EEA</span>
                                </div>
                                <a href="${o}${o.includes("?")?"&":"?"}hotnews_auto_summarize=1" target="_blank" rel="noopener noreferrer" class="ready-open-btn">
                                    <span class="btn-icon">\u{1F4D6}</span>
                                    <span class="btn-text">\u6253\u5F00\u539F\u6587\u5E76\u603B\u7ED3</span>
                                    <span class="btn-arrow">\u2192</span>
                                </a>
                                <div class="ready-hint">\u6253\u5F00\u540E\u4F1A\u81EA\u52A8\u63D0\u793A\u5F00\u59CB\u603B\u7ED3</div>
                            </div>
                            
                            <div class="blocked-fallback" style="margin-top: 20px;">
                                <div class="fallback-actions">
                                    <button class="fallback-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                                    <button class="fallback-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                                </div>
                            </div>
                        </div>
                    `:c.innerHTML=`
                        <div class="summary-blocked-v2">
                            <div class="blocked-header">
                                <div class="blocked-icon-badge">
                                    <span class="icon-main">\u{1F512}</span>
                                </div>
                                <div class="blocked-title">\u8BE5\u7F51\u7AD9\u6682\u4E0D\u652F\u6301 AI \u603B\u7ED3</div>
                                <div class="blocked-subtitle">\u8BE5\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
                            </div>
                            
                            <div class="blocked-fallback">
                                <a href="${o}" target="_blank" rel="noopener noreferrer" class="fallback-link">
                                    \u{1F4D6} \u9605\u8BFB\u539F\u6587
                                </a>
                                <div class="fallback-actions">
                                    <button class="fallback-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                                    <button class="fallback-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                                </div>
                            </div>
                        </div>
                    `,u.style.display="none";return}}let i=await fetch("/api/summary/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:e,news_id:t,source_id:n,source_name:r})});if(!i.ok){let v=await i.json();throw new Error(v.detail||"\u751F\u6210\u5931\u8D25")}let y=i.body.getReader(),g=new TextDecoder,b="",$="other",S="\u5176\u4ED6",L=!1,M=null;for(;;){let{done:v,value:h}=await y.read();if(v)break;let p=g.decode(h,{stream:!0}).split(`
`);for(let H of p)if(H.startsWith("data: "))try{let a=JSON.parse(H.slice(6));switch(a.type){case"status":let U=document.getElementById("summaryStatusText");U&&(U.textContent=a.message);break;case"type":$=a.article_type,S=a.article_type_name,window._currentTypeConfidence=a.confidence||0;break;case"chunk":L||(L=!0,T(),c.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),b+=a.content;let E=document.getElementById("summaryStreamContent");if(E){let w=b;w=w.replace(/\[TAGS_?START\][\s\S]*$/gi,""),E.innerHTML=I(w)+'<span class="summary-cursor">\u258C</span>',E.scrollTop=E.scrollHeight}break;case"cached":T(),b=a.summary,$=a.article_type,S=a.article_type_name,M=a.token_usage||null;let _=a.feedback||null,ie=a.token_balance!==void 0?{token_balance:a.token_balance,tokens_used:a.tokens_used,default_tokens:1e5}:null,le=K(b);if(c.innerHTML=`
                                <div class="summary-content">
                                    ${I(le)}
                                </div>
                            `,D(o,$,S,!0,M,_,ie),z(t,!0),a.tags&&window.ArticleTags){console.log("[Summary] Applying cached tags for newsId:",t,"tags:",a.tags);let w=document.querySelector(`.news-item[data-news-id="${t}"]`);w||(w=document.querySelector(`.news-item[data-url="${o}"]`)),w&&(console.log("[Summary] Found news item for cached, applying tags"),window.ArticleTags.applyTags(w,a.tags),w.dataset.tagsLoaded="true")}return;case"done":M=a.token_usage||null;let ce=a.token_balance!==void 0?{token_balance:a.token_balance,tokens_used:a.tokens_used,default_tokens:1e5}:null,G=document.getElementById("summaryStreamContent");if(G){G.classList.remove("summary-streaming");let w=K(b);G.innerHTML=I(w)}let de=window._currentTypeConfidence||0;if(D(o,$,S,!1,M,null,ce,de),z(t,!0),a.tags&&window.ArticleTags){console.log("[Summary] Applying tags for newsId:",t,"tags:",a.tags);let w=document.querySelector(`.news-item[data-news-id="${t}"]`);w||(w=document.querySelector(`.news-item[data-url="${o}"]`)),w?(console.log("[Summary] Found news item, applying tags"),window.ArticleTags.applyTags(w,a.tags),w.dataset.tagsLoaded="true"):console.log("[Summary] News item not found in DOM")}break;case"short_content":T(),c.innerHTML=`
                                <div class="summary-short-content">
                                    <div class="short-content-icon">\u{1F4C4}</div>
                                    <div class="short-content-message">${a.message}</div>
                                    <div class="short-content-length">\u6587\u7AE0\u957F\u5EA6\uFF1A${a.content_length} \u5B57</div>
                                    ${a.preview?`<div class="short-content-preview">${a.preview}</div>`:""}
                                    <div class="short-content-actions">
                                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="short-content-btn primary">
                                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                                        </a>
                                        <button class="short-content-btn secondary" onclick="forceSummary('${t}', '${encodeURIComponent(e)}', '${encodeURIComponent(o)}', '${n||""}', '${encodeURIComponent(r||"")}')">
                                            \u2728 \u4ECD\u8981\u603B\u7ED3
                                        </button>
                                    </div>
                                </div>
                            `,u.style.display="none";return;case"error":throw new Error(a.message)}}catch(a){if(a.message&&!a.message.includes("JSON"))throw a}}if(L&&b&&!document.querySelector('.summary-modal-footer[style*="flex"]')){console.log("[Summary] Stream ended without done event, showing fallback footer");let v=document.getElementById("summaryStreamContent");if(v){v.classList.remove("summary-streaming");let h=K(b);v.innerHTML=I(h)}D(o,$,S,!1,M,null,null,0),z(t,!0)}}catch(s){console.error("[Summary] Error:",s),T();let i=s.message||"\u672A\u77E5\u9519\u8BEF",y=i.includes("\u7528\u5B8C")||i.includes("\u914D\u989D")||i.includes("\u6B21\u6570")||i.includes("\u989D\u5EA6")||i.includes("\u5347\u7EA7")||i.includes("\u4F1A\u5458"),g=i.includes("\u8BBF\u95EE\u9650\u5236")||i.includes("\u65E0\u6CD5\u83B7\u53D6")||i.includes("\u65E0\u6CD5\u8BBF\u95EE")||i.includes("\u8BF7\u6C42\u5931\u8D25");y?c.innerHTML=`
                <div class="summary-quota-error">
                    <div class="quota-error-icon">\u2728</div>
                    <div class="quota-error-title">\u989D\u5EA6\u5DF2\u7528\u5B8C</div>
                    <div class="quota-error-text">\u5145\u503C\u540E\u5373\u53EF\u7EE7\u7EED\u4F7F\u7528</div>
                    <div class="quota-error-actions">
                        <button class="quota-upgrade-btn" onclick="openPaymentModal()">
                            \u7ACB\u5373\u5145\u503C
                        </button>
                    </div>
                    <div class="quota-fallback-actions">
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="quota-read-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="quota-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} Todo</button>
                        <button class="quota-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `:g?c.innerHTML=`
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
            `:c.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u274C</div>
                    <div class="summary-access-error-title">\u603B\u7ED3\u5931\u8D25</div>
                    <div class="summary-access-error-text">${i}</div>
                    <div class="summary-access-error-actions">
                        <button class="summary-retry-btn" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                    </div>
                </div>
            `}}function D(t,e,o,n,r,l=null,f=null,d=null){let c=document.getElementById("summaryModalFooter"),u=we[e]||"\u{1F4DD}",s="",i=r?.total_tokens||0;i>0&&(s=`<span class="summary-token-tag" title="\u672C\u6B21\u6D88\u8017">\u{1FA99} ${ge(i)}</span>`);let y=l==="up"?"active":"",g=l==="down"?"active":"";c.innerHTML=`
        <div class="summary-footer-left">
            ${s}
            <span class="summary-type-tag">${u} ${o}</span>
            <div class="summary-feedback">
                <button class="summary-feedback-btn ${y}" data-vote="up" onclick="handleSummaryFeedback('up')" title="\u6709\u5E2E\u52A9">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                    </svg>
                </button>
                <span class="summary-feedback-divider"></span>
                <button class="summary-feedback-btn ${g}" data-vote="down" onclick="handleSummaryFeedback('down')" title="\u9700\u6539\u8FDB">
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
            <a href="${t}" target="_blank" rel="noopener noreferrer" class="summary-link-btn">
                \u{1F517} \u67E5\u770B\u539F\u6587
            </a>
            <button class="summary-regenerate-btn" onclick="regenerateSummaryModal()">
                \u{1F504} \u91CD\u65B0\u751F\u6210
            </button>
        </div>
    `,c.style.display="flex"}async function ve(t){if(!m)return;let e=document.querySelectorAll(".summary-feedback-btn"),o=document.querySelector(`.summary-feedback-btn[data-vote="${t}"]`),r=o?.classList.contains("active")?"none":t;e.forEach(l=>l.classList.remove("active")),r!=="none"&&o?.classList.add("active");try{let l=await fetch(`/api/summary/${encodeURIComponent(m)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vote:r})});l.ok||console.error("[Summary] Feedback failed:",await l.text())}catch(l){console.error("[Summary] Feedback error:",l)}}function be(){let t=document.getElementById("summaryModal");t&&(t.classList.remove("open"),document.body.style.overflow=""),T(),j=!1,m=null}function ae(){let t=document.querySelector(`.news-summary-btn[data-news-id="${m}"]`);if(t){let e=t.dataset.title,o=t.dataset.url,n=t.dataset.sourceId,r=t.dataset.sourceName;X(m,e,o,n,r)}}async function he(){if(m){try{await fetch(`/api/summary/${encodeURIComponent(m)}`,{method:"DELETE"})}catch(t){console.error("[Summary] Delete error:",t)}ae()}}async function Te(t,e,o,n,r){let l=decodeURIComponent(e),f=decodeURIComponent(o),d=decodeURIComponent(r);ke(t,l,f,n,d)}async function ke(t,e,o,n,r){if(!R.getUser()){V();return}se();let f=document.getElementById("summaryModal"),d=document.getElementById("summaryModalBody"),c=document.getElementById("summaryModalFooter");m=t,k=e,x=o,Z=n,ee=r,d.innerHTML=`
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">\u6B63\u5728\u751F\u6210\u603B\u7ED3...</div>
                <div class="summary-loading-hint">\u9996\u6B21\u603B\u7ED3\u9700\u8981 10-30 \u79D2</div>
                <div id="summarySlowHint" class="summary-slow-hint" style="display:none;">
                    <span id="summaryCountdownText">\u52A0\u8F7D\u8F83\u6162\uFF0C\u5373\u5C06\u4E3A\u60A8\u6253\u5F00\u539F\u6587...</span>
                </div>
            </div>
        </div>
    `,c.style.display="none",T(),B=setTimeout(()=>{console.log("[Summary Force] 5s timeout, starting countdown");let u=document.getElementById("summarySlowHint"),s=document.getElementById("summaryCountdownText");u&&(u.style.display="block"),C=5;let i=()=>{s&&(s.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${C} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};i(),F=setInterval(()=>{C--,C>0?i():P()},1e3),O=setTimeout(()=>{console.log("[Summary Force] 10s timeout, showing click hint"),P();let y=document.getElementById("summarySlowHint");y&&(y.innerHTML='\u52A0\u8F7D\u8F83\u6162\uFF0C\u8BF7 <a href="'+o+'" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">\u70B9\u51FB\u9605\u8BFB\u539F\u6587</a>')},te-J)},J),q=setTimeout(()=>{ne(o,n,r),T();let u=document.getElementById("summaryModal");u&&(u.classList.remove("open"),document.body.style.overflow=""),j=!1,m=null,o&&window.open(o,"_blank","noopener,noreferrer")},oe);try{let u=await fetch("/api/summary/stream?force=1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:o,title:e,news_id:t,source_id:n,source_name:r})});if(!u.ok){let L=await u.json();throw new Error(L.detail||"\u751F\u6210\u5931\u8D25")}let s=u.body.getReader(),i=new TextDecoder,y="",g="other",b="\u5176\u4ED6",$=!1,S=null;for(;;){let{done:L,value:M}=await s.read();if(L)break;let h=i.decode(M,{stream:!0}).split(`
`);for(let N of h)if(N.startsWith("data: "))try{let p=JSON.parse(N.slice(6));switch(p.type){case"status":let H=document.getElementById("summaryStatusText");H&&(H.textContent=p.message);break;case"type":g=p.article_type,b=p.article_type_name;break;case"chunk":$||($=!0,T(),d.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),y+=p.content;let a=document.getElementById("summaryStreamContent");if(a){let _=y;_=_.replace(/\[TAGS_?START\][\s\S]*$/gi,""),a.innerHTML=I(_)+'<span class="summary-cursor">\u258C</span>',a.scrollTop=a.scrollHeight}break;case"done":T(),S=p.token_usage||null;let U=p.token_balance!==void 0?{token_balance:p.token_balance,tokens_used:p.tokens_used,default_tokens:1e5}:null,E=document.getElementById("summaryStreamContent");if(E&&(E.classList.remove("summary-streaming"),E.innerHTML=I(y)),D(o,g,b,!1,S,null,U),z(t,!0),p.tags&&window.ArticleTags){let _=document.querySelector(`.news-item[data-news-id="${t}"]`);_||(_=document.querySelector(`.news-item[data-url="${o}"]`)),_&&(window.ArticleTags.applyTags(_,p.tags),_.dataset.tagsLoaded="true")}break;case"error":throw new Error(p.message)}}catch(p){if(p.message&&!p.message.includes("JSON"))throw p}}}catch(u){console.error("[Summary] Force error:",u),T();let s=u.message||"\u672A\u77E5\u9519\u8BEF",i=s.includes("\u7528\u5B8C")||s.includes("\u914D\u989D")||s.includes("\u6B21\u6570")||s.includes("\u989D\u5EA6")||s.includes("\u5347\u7EA7")||s.includes("\u4F1A\u5458"),y=s.includes("\u8BBF\u95EE\u9650\u5236")||s.includes("\u65E0\u6CD5\u83B7\u53D6")||s.includes("\u65E0\u6CD5\u8BBF\u95EE")||s.includes("\u8BF7\u6C42\u5931\u8D25");i?d.innerHTML=`
                <div class="summary-quota-error">
                    <div class="quota-error-icon">\u2728</div>
                    <div class="quota-error-title">\u989D\u5EA6\u5DF2\u7528\u5B8C</div>
                    <div class="quota-error-text">\u5145\u503C\u540E\u5373\u53EF\u7EE7\u7EED\u4F7F\u7528</div>
                    <div class="quota-error-actions">
                        <button class="quota-upgrade-btn" onclick="openPaymentModal()">
                            \u7ACB\u5373\u5145\u503C
                        </button>
                    </div>
                    <div class="quota-fallback-actions">
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="quota-read-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="quota-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} Todo</button>
                        <button class="quota-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `:y?d.innerHTML=`
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
            `:d.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u274C</div>
                    <div class="summary-access-error-title">\u603B\u7ED3\u5931\u8D25</div>
                    <div class="summary-access-error-text">${s}</div>
                    <div class="summary-access-error-actions">
                        <button class="summary-retry-btn" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                        <a href="${o}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                    </div>
                </div>
            `}}function z(t,e){let o=document.querySelector(`.news-summary-btn[data-news-id="${t}"]`);o&&(o.classList.toggle("has-summary",e),o.title=e?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3");let n=document.querySelector(`.news-item[data-news-id="${t}"]`);n&&n.classList.toggle("has-summary",e)}function re(t,e,o,n,r,l){t.preventDefault(),t.stopPropagation(),X(e,o,n,r,l)}async function A(){try{if(!R.isLoggedIn())return;let t=await fetch("/api/summary/list");if(!t.ok)return;let e=await t.json();if(!e.ok||!e.news_ids)return;let o=new Set(e.news_ids);if(o.size===0)return;document.querySelectorAll(".news-item[data-news-id]").forEach(n=>{let r=n.getAttribute("data-news-id");o.has(r)&&n.classList.add("has-summary")}),document.querySelectorAll(".news-summary-btn[data-news-id]").forEach(n=>{let r=n.getAttribute("data-news-id");o.has(r)&&(n.classList.add("has-summary"),n.title="\u67E5\u770B\u603B\u7ED3")}),console.log(`[Summary] Marked ${o.size} summarized items`)}catch(t){console.error("[Summary] Failed to load summarized list:",t)}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{setTimeout(A,500)}):setTimeout(A,500);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){let t=window._lastSummarizedListLoad||0;Date.now()-t>3e4&&(console.log("[Summary] Page visible, reloading summarized list"),A())}});var Se=A;A=async function(){return window._lastSummarizedListLoad=Date.now(),Se()};function _e(){!m||!k||(typeof window.openTodoPanel=="function"&&window.openTodoPanel(m,k,x),Y(!0))}function $e(){if(!m||!k)return;let t=document.getElementById("summaryTodoPanel");t&&t.classList.contains("open")?(typeof window.closeTodoPanel=="function"&&window.closeTodoPanel(),Y(!1)):(typeof window.openTodoPanel=="function"&&window.openTodoPanel(m,k,x),Y(!0))}function Y(t){let e=document.getElementById("summaryTodoToggleBtn");e&&e.classList.toggle("active",t)}async function Me(){if(!m||!k)return;let t=document.getElementById("summaryModalBody");if(!t)return;let o=t.innerHTML.match(/✅\s*行动清单[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);if(!o){window.showToast&&window.showToast("\u672A\u627E\u5230\u884C\u52A8\u6E05\u5355");return}let l=(o[1].match(/<li>([\s\S]*?)<\/li>/gi)||[]).map(f=>f.replace(/<\/?li>/gi,"").replace(/<[^>]+>/g,"").trim()).filter(f=>f.length>0);if(l.length===0){window.showToast&&window.showToast("\u884C\u52A8\u6E05\u5355\u4E3A\u7A7A");return}typeof window.batchAddTodos=="function"&&await window.batchAddTodos(l,{groupId:m,groupTitle:k,groupUrl:x||"",isCustom:!1})}async function Ce(){if(!m||!k){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{typeof window.addTodo=="function"&&await window.addTodo(k,{groupId:m,groupTitle:k,groupUrl:x||"",isCustom:!1})}catch(t){console.error("[Summary] Add to todo error:",t),window.showToast&&window.showToast("\u6DFB\u52A0\u5931\u8D25")}}async function Le(){if(!m||!k){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let{addFavorite:t}=await import("./favorites-UBYHC5FL.js"),e=await t({news_id:m,title:k,url:x||""});e.ok?window.showToast&&window.showToast("\u5DF2\u6536\u85CF"):e.error&&window.showToast&&window.showToast(e.error)}catch(t){console.error("[Summary] Add to favorites error:",t),window.showToast&&window.showToast("\u6536\u85CF\u5931\u8D25")}}document.addEventListener("click",t=>{let e=t.target.closest(".news-summary-btn");if(!e||e.hasAttribute("onclick"))return;t.preventDefault(),t.stopPropagation();let o=e.dataset.newsId,n=e.dataset.title||"",r=e.dataset.url||"",l=e.dataset.sourceId||"",f=e.dataset.sourceName||"";o&&re(t,o,n,r,l,f)});window.openSummaryModal=X;window.closeSummaryModal=be;window.retrySummaryModal=ae;window.regenerateSummaryModal=he;window.handleSummaryClick=re;window.loadSummarizedList=A;window.handleSummaryFeedback=ve;window.openCurrentTodoPanel=_e;window.toggleCurrentTodoPanel=$e;window.addActionListToTodo=Me;window.forceSummary=Te;window.addCurrentToTodo=Ce;window.addCurrentToFavorites=Le;window.renderMarkdown=I;export{be as closeSummaryModal,re as handleSummaryClick,A as loadSummarizedList,X as openSummaryModal,I as renderMarkdown};
