import{a as Y,b as J}from"./chunk-N3WOZHU5.js";var D=!1,m=null,h=null,x=null,X=null,Z=null,B=null,q=null,de=!1,G=null,z=5e3,ee=1e4,te=15e3,F=null,M=5,O=null;window.addEventListener("hotnews-summarizer-sidepanel-ack",()=>{de=!0,G&&(clearTimeout(G),G=null)});function V(){if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent))return!0;let e=navigator.maxTouchPoints>0,n=window.innerWidth<=768;return e&&n}function ue(){return document.documentElement.getAttribute("data-hotnews-summarizer")==="installed"}function me(){return document.documentElement.getAttribute("data-hotnews-summarizer-version")||null}function ye(){B&&(clearTimeout(B),B=null)}function fe(){q&&(clearTimeout(q),q=null)}function P(){F&&(clearInterval(F),F=null),O&&(clearTimeout(O),O=null),M=5}function b(){ye(),fe(),P()}async function ne(t,e,n){try{await fetch("/api/summary/failures/record",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:t,reason:"client_timeout",error_detail:"\u5BA2\u6237\u7AEF 10 \u79D2\u8D85\u65F6",source_id:e||null,source_name:n||null})}),console.log("[Summary] Recorded client timeout for:",t)}catch(o){console.error("[Summary] Failed to record client timeout:",o)}}var pe={news:"\u{1F4F0}",policy:"\u26A0\uFE0F",business:"\u{1F4CA}",tutorial:"\u2705",research:"\u{1F4DA}",product:"\u{1F680}",opinion:"\u{1F4AD}",interview:"\u{1F4AC}",listicle:"\u{1F4D1}",lifestyle:"\u2705",general:"\u{1F4DD}","tech-tutorial":"\u2705",trend:"\u{1F4CA}",other:"\u{1F4DD}"};function we(t){let e=t||0;return e>=1e3?(e/1e3).toFixed(1).replace(/\.0$/,"")+"K":e.toString()}function W(t){if(!t)return t;let e=t.replace(/\[TAGS_?START\][\s\S]*?\[TAGS_?END\]/gi,"");return e=e.replace(/\n*-{3,}\s*$/g,""),e.trim()}function I(t){if(!t)return"";let e=t.replace(/<br\s*\/?>/gi,`
`).replace(/<\/br>/gi,`
`);e=e.replace(/- \[ \]/g,"-"),e=e.replace(/- \[\]/g,"-"),e=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"),e=e.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code class="language-$1">$2</code></pre>'),e=e.replace(/`([^`]+)`/g,"<code>$1</code>"),e=e.replace(/^#{4}\s+(.+)$/gm,"<h4>$1</h4>"),e=e.replace(/^#{3}\s+(.+)$/gm,"<h3>$1</h3>"),e=e.replace(/^#{2}\s+(.+)$/gm,"<h2>$1</h2>"),e=e.replace(/^#{1}\s+(.+)$/gm,"<h1>$1</h1>"),e=e.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>"),e=e.replace(/\*([^*]+)\*/g,"<em>$1</em>"),e=e.replace(/__([^_]+)__/g,"<strong>$1</strong>"),e=e.replace(/_([^_]+)_/g,"<em>$1</em>"),e=e.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'),e=e.replace(/^&gt;\s*(.*)$/gm,"<blockquote>$1</blockquote>"),e=e.replace(/<\/blockquote>\n<blockquote>/g,`
`),e=e.replace(/^[-]{3,}\s*$/gm,"<hr>"),e=e.replace(/^[*]{3,}\s*$/gm,"<hr>"),e=e.replace(/^[_]{3,}\s*$/gm,"<hr>");let n=e.split(`
`),o=[],i=!1,c=[],u=!1,d=[];for(let l=0;l<n.length;l++){let s=n[l],r=s.trim(),y=/^\|(.+)\|$/.test(r),v=/^\|[\s\-:|]+\|$/.test(r),w=r.match(/^[-*]\s+(.+)$/),T=r.match(/^\d+\.\s+(.+)$/),$=w||T;if(y){if(u&&d.length>0&&(o.push("<ul>"+d.join("")+"</ul>"),d=[],u=!1),i||(i=!0,c=[]),!v){let k=r.slice(1,-1).split("|").map(L=>L.trim()),g=c.length===0?"th":"td",S="<tr>"+k.map(L=>`<${g}>${L}</${g}>`).join("")+"</tr>";c.push(S)}continue}else i&&c.length>0&&(o.push("<table>"+c.join("")+"</table>"),c=[],i=!1);if($){let k=w?w[1]:T[1];u=!0,d.push("<li>"+k+"</li>");continue}else u&&d.length>0&&(o.push("<ul>"+d.join("")+"</ul>"),d=[],u=!1);o.push(s)}return i&&c.length>0&&o.push("<table>"+c.join("")+"</table>"),u&&d.length>0&&o.push("<ul>"+d.join("")+"</ul>"),e=o.join(`
`),e=e.split(/\n{2,}/).map(l=>(l=l.trim(),l?/^<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(l)||/<\/(h[1-6]|ul|ol|table|pre|blockquote)>$/.test(l)?l:"<p>"+l.replace(/\n/g,"<br>")+"</p>":"")).join(`
`),e=e.replace(/<p>\s*<\/p>/g,""),e=e.replace(/<p><hr><\/p>/g,"<hr>"),e=e.replace(/<p>(<table>)/g,"$1"),e=e.replace(/(<\/table>)<\/p>/g,"$1"),e=e.replace(/<p>(<ul>)/g,"$1"),e=e.replace(/(<\/ul>)<\/p>/g,"$1"),e=e.replace(/<p>(<blockquote>)/g,"$1"),e=e.replace(/(<\/blockquote>)<\/p>/g,"$1"),e=e.replace(/(<h[1-3]>(?:✅\s*|📋\s*)?行动清单\s*<\/h[1-3]>)/gi,'<div class="action-list-header">$1<button class="action-list-add-btn" onclick="addActionListToTodo()">+ Todo</button></div>'),e}function oe(){if(document.getElementById("summaryModal"))return;document.body.insertAdjacentHTML("beforeend",`
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
    `)}async function K(t,e,n,o,i){if(!J())return;oe();let c=document.getElementById("summaryModal"),u=document.getElementById("summaryModalTitle"),d=document.getElementById("summaryModalBody"),l=document.getElementById("summaryModalFooter");if(m=t,h=e,x=n,X=o,Z=i,D=!0,window._currentSummaryNewsId=t,window._currentSummaryNewsTitle=e,window._currentSummaryNewsUrl=n,typeof window.initSelectionTodo=="function"&&window.initSelectionTodo(),u){let s=e&&e.length>50?e.substring(0,50)+"...":e||"AI \u603B\u7ED3";u.textContent=`\u2728 ${s}`}c.classList.add("open"),document.body.style.overflow="hidden",d.innerHTML=`
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
    `,l.style.display="none",b(),B=setTimeout(()=>{console.log("[Summary] 5s timeout, starting countdown");let s=document.getElementById("summarySlowHint"),r=document.getElementById("summaryCountdownText");s&&(s.style.display="block"),M=5;let y=()=>{r&&(r.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${M} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};y(),F=setInterval(()=>{M--,M>0?y():P()},1e3),O=setTimeout(()=>{console.log("[Summary] 10s timeout, showing click hint"),P();let v=document.getElementById("summarySlowHint");v&&(v.innerHTML='\u52A0\u8F7D\u8F83\u6162\uFF0C\u8BF7 <a href="'+n+'" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">\u70B9\u51FB\u9605\u8BFB\u539F\u6587</a>')},ee-z)},z),q=setTimeout(()=>{ne(n,o,i),b();let s=document.getElementById("summaryModal");s&&(s.classList.remove("open"),document.body.style.overflow=""),D=!1,m=null,n&&window.open(n,"_blank","noopener,noreferrer")},te);try{let s=await fetch(`/api/summary/failures/check?url=${encodeURIComponent(n)}`);if(s.ok){let g=await s.json();if(console.log("[Summary] Check result:",g),g.summarizable)g.warning&&console.log("[Summary] Warning:",g.warning);else{console.log("[Summary] URL blocked, showing blocked UI:",n),b();let S=!V()&&ue(),L=S?me():null;!V()&&!S?d.innerHTML=`
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
                                <a href="${n}" target="_blank" rel="noopener noreferrer" class="fallback-link">
                                    \u{1F4D6} \u76F4\u63A5\u9605\u8BFB\u539F\u6587
                                </a>
                                <div class="fallback-actions">
                                    <button class="fallback-btn" onclick="addCurrentToTodo()">\u{1F4CB} Todo</button>
                                    <button class="fallback-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                                </div>
                            </div>
                        </div>
                    `:!V()&&S?d.innerHTML=`
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
                                <a href="${n}${n.includes("?")?"&":"?"}hotnews_auto_summarize=1" target="_blank" rel="noopener noreferrer" class="ready-open-btn">
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
                    `:d.innerHTML=`
                        <div class="summary-blocked-v2">
                            <div class="blocked-header">
                                <div class="blocked-icon-badge">
                                    <span class="icon-main">\u{1F512}</span>
                                </div>
                                <div class="blocked-title">\u8BE5\u7F51\u7AD9\u6682\u4E0D\u652F\u6301 AI \u603B\u7ED3</div>
                                <div class="blocked-subtitle">\u8BE5\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
                            </div>
                            
                            <div class="blocked-fallback">
                                <a href="${n}" target="_blank" rel="noopener noreferrer" class="fallback-link">
                                    \u{1F4D6} \u9605\u8BFB\u539F\u6587
                                </a>
                                <div class="fallback-actions">
                                    <button class="fallback-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                                    <button class="fallback-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                                </div>
                            </div>
                        </div>
                    `,l.style.display="none";return}}let r=await fetch("/api/summary/stream",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:n,title:e,news_id:t,source_id:o,source_name:i})});if(!r.ok){let g=await r.json();throw new Error(g.detail||"\u751F\u6210\u5931\u8D25")}let y=r.body.getReader(),v=new TextDecoder,w="",T="other",$="\u5176\u4ED6",k=!1,C=null;for(;;){let{done:g,value:S}=await y.read();if(g)break;let f=v.decode(S,{stream:!0}).split(`
`);for(let H of f)if(H.startsWith("data: "))try{let a=JSON.parse(H.slice(6));switch(a.type){case"status":let N=document.getElementById("summaryStatusText");N&&(N.textContent=a.message);break;case"type":T=a.article_type,$=a.article_type_name,window._currentTypeConfidence=a.confidence||0;break;case"chunk":k||(k=!0,b(),d.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),w+=a.content;let E=document.getElementById("summaryStreamContent");if(E){let p=w;p=p.replace(/\[TAGS_?START\][\s\S]*$/gi,""),E.innerHTML=I(p)+'<span class="summary-cursor">\u258C</span>',E.scrollTop=E.scrollHeight}break;case"cached":b(),w=a.summary,T=a.article_type,$=a.article_type_name,C=a.token_usage||null;let _=a.feedback||null,re=a.token_balance!==void 0?{token_balance:a.token_balance,tokens_used:a.tokens_used,default_tokens:1e5}:null,ie=W(w);if(d.innerHTML=`
                                <div class="summary-content">
                                    ${I(ie)}
                                </div>
                            `,R(n,T,$,!0,C,_,re),U(t,!0),a.tags&&window.ArticleTags){console.log("[Summary] Applying cached tags for newsId:",t,"tags:",a.tags);let p=document.querySelector(`.news-item[data-news-id="${t}"]`);p||(p=document.querySelector(`.news-item[data-url="${n}"]`)),p&&(console.log("[Summary] Found news item for cached, applying tags"),window.ArticleTags.applyTags(p,a.tags),p.dataset.tagsLoaded="true")}return;case"done":C=a.token_usage||null;let le=a.token_balance!==void 0?{token_balance:a.token_balance,tokens_used:a.tokens_used,default_tokens:1e5}:null,j=document.getElementById("summaryStreamContent");if(j){j.classList.remove("summary-streaming");let p=W(w);j.innerHTML=I(p)}let ce=window._currentTypeConfidence||0;if(R(n,T,$,!1,C,null,le,ce),U(t,!0),a.tags&&window.ArticleTags){console.log("[Summary] Applying tags for newsId:",t,"tags:",a.tags);let p=document.querySelector(`.news-item[data-news-id="${t}"]`);p||(p=document.querySelector(`.news-item[data-url="${n}"]`)),p?(console.log("[Summary] Found news item, applying tags"),window.ArticleTags.applyTags(p,a.tags),p.dataset.tagsLoaded="true"):console.log("[Summary] News item not found in DOM")}break;case"short_content":b(),d.innerHTML=`
                                <div class="summary-short-content">
                                    <div class="short-content-icon">\u{1F4C4}</div>
                                    <div class="short-content-message">${a.message}</div>
                                    <div class="short-content-length">\u6587\u7AE0\u957F\u5EA6\uFF1A${a.content_length} \u5B57</div>
                                    ${a.preview?`<div class="short-content-preview">${a.preview}</div>`:""}
                                    <div class="short-content-actions">
                                        <a href="${n}" target="_blank" rel="noopener noreferrer" class="short-content-btn primary">
                                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                                        </a>
                                        <button class="short-content-btn secondary" onclick="forceSummary('${t}', '${encodeURIComponent(e)}', '${encodeURIComponent(n)}', '${o||""}', '${encodeURIComponent(i||"")}')">
                                            \u2728 \u4ECD\u8981\u603B\u7ED3
                                        </button>
                                    </div>
                                </div>
                            `,l.style.display="none";return;case"error":throw new Error(a.message)}}catch(a){if(a.message&&!a.message.includes("JSON"))throw a}}if(k&&w&&!document.querySelector('.summary-modal-footer[style*="flex"]')){console.log("[Summary] Stream ended without done event, showing fallback footer");let g=document.getElementById("summaryStreamContent");if(g){g.classList.remove("summary-streaming");let S=W(w);g.innerHTML=I(S)}R(n,T,$,!1,C,null,null,0),U(t,!0)}}catch(s){console.error("[Summary] Error:",s),b();let r=s.message||"\u672A\u77E5\u9519\u8BEF",y=r.includes("\u7528\u5B8C")||r.includes("\u914D\u989D")||r.includes("\u6B21\u6570")||r.includes("\u989D\u5EA6")||r.includes("\u5347\u7EA7")||r.includes("\u4F1A\u5458"),v=r.includes("\u8BBF\u95EE\u9650\u5236")||r.includes("\u65E0\u6CD5\u83B7\u53D6")||r.includes("\u65E0\u6CD5\u8BBF\u95EE")||r.includes("\u8BF7\u6C42\u5931\u8D25");y?d.innerHTML=`
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
                        <a href="${n}" target="_blank" rel="noopener noreferrer" class="quota-read-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="quota-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} Todo</button>
                        <button class="quota-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `:v?d.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u{1F512}</div>
                    <div class="summary-access-error-title">\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u5185\u5BB9</div>
                    <div class="summary-access-error-text">\u8BE5\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
                    <div class="summary-access-error-actions">
                        <a href="${n}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
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
                    <div class="summary-access-error-text">${r}</div>
                    <div class="summary-access-error-actions">
                        <button class="summary-retry-btn" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                        <a href="${n}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                    </div>
                </div>
            `}}function R(t,e,n,o,i,c=null,u=null,d=null){let l=document.getElementById("summaryModalFooter"),s=pe[e]||"\u{1F4DD}",r="",y=i?.total_tokens||0;y>0&&(r=`<span class="summary-token-tag" title="\u672C\u6B21\u6D88\u8017">\u{1FA99} ${we(y)}</span>`);let v=c==="up"?"active":"",w=c==="down"?"active":"";l.innerHTML=`
        <div class="summary-footer-left">
            ${r}
            <span class="summary-type-tag">${s} ${n}</span>
            <div class="summary-feedback">
                <button class="summary-feedback-btn ${v}" data-vote="up" onclick="handleSummaryFeedback('up')" title="\u6709\u5E2E\u52A9">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                    </svg>
                </button>
                <span class="summary-feedback-divider"></span>
                <button class="summary-feedback-btn ${w}" data-vote="down" onclick="handleSummaryFeedback('down')" title="\u9700\u6539\u8FDB">
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
    `,l.style.display="flex"}async function ge(t){if(!m)return;let e=document.querySelectorAll(".summary-feedback-btn"),n=document.querySelector(`.summary-feedback-btn[data-vote="${t}"]`),i=n?.classList.contains("active")?"none":t;e.forEach(c=>c.classList.remove("active")),i!=="none"&&n?.classList.add("active");try{let c=await fetch(`/api/summary/${encodeURIComponent(m)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({vote:i})});c.ok||console.error("[Summary] Feedback failed:",await c.text())}catch(c){console.error("[Summary] Feedback error:",c)}}function ve(){let t=document.getElementById("summaryModal");t&&(t.classList.remove("open"),document.body.style.overflow=""),b(),D=!1,m=null}function ae(){let t=document.querySelector(`.news-summary-btn[data-news-id="${m}"]`);if(t){let e=t.dataset.title,n=t.dataset.url,o=t.dataset.sourceId,i=t.dataset.sourceName;K(m,e,n,o,i)}}async function be(){if(m){try{await fetch(`/api/summary/${encodeURIComponent(m)}`,{method:"DELETE"})}catch(t){console.error("[Summary] Delete error:",t)}ae()}}async function he(t,e,n,o,i){let c=decodeURIComponent(e),u=decodeURIComponent(n),d=decodeURIComponent(i);Te(t,c,u,o,d)}async function Te(t,e,n,o,i){if(!J())return;oe();let c=document.getElementById("summaryModal"),u=document.getElementById("summaryModalBody"),d=document.getElementById("summaryModalFooter");m=t,h=e,x=n,X=o,Z=i,u.innerHTML=`
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
    `,d.style.display="none",b(),B=setTimeout(()=>{console.log("[Summary Force] 5s timeout, starting countdown");let l=document.getElementById("summarySlowHint"),s=document.getElementById("summaryCountdownText");l&&(l.style.display="block"),M=5;let r=()=>{s&&(s.textContent=`\u52A0\u8F7D\u8F83\u6162\uFF0C${M} \u79D2\u540E\u4E3A\u60A8\u6253\u5F00\u539F\u6587...`)};r(),F=setInterval(()=>{M--,M>0?r():P()},1e3),O=setTimeout(()=>{console.log("[Summary Force] 10s timeout, showing click hint"),P();let y=document.getElementById("summarySlowHint");y&&(y.innerHTML='\u52A0\u8F7D\u8F83\u6162\uFF0C\u8BF7 <a href="'+n+'" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">\u70B9\u51FB\u9605\u8BFB\u539F\u6587</a>')},ee-z)},z),q=setTimeout(()=>{ne(n,o,i),b();let l=document.getElementById("summaryModal");l&&(l.classList.remove("open"),document.body.style.overflow=""),D=!1,m=null,n&&window.open(n,"_blank","noopener,noreferrer")},te);try{let l=await fetch("/api/summary/stream?force=1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:n,title:e,news_id:t,source_id:o,source_name:i})});if(!l.ok){let k=await l.json();throw new Error(k.detail||"\u751F\u6210\u5931\u8D25")}let s=l.body.getReader(),r=new TextDecoder,y="",v="other",w="\u5176\u4ED6",T=!1,$=null;for(;;){let{done:k,value:C}=await s.read();if(k)break;let S=r.decode(C,{stream:!0}).split(`
`);for(let L of S)if(L.startsWith("data: "))try{let f=JSON.parse(L.slice(6));switch(f.type){case"status":let H=document.getElementById("summaryStatusText");H&&(H.textContent=f.message);break;case"type":v=f.article_type,w=f.article_type_name;break;case"chunk":T||(T=!0,b(),u.innerHTML=`
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `),y+=f.content;let a=document.getElementById("summaryStreamContent");if(a){let _=y;_=_.replace(/\[TAGS_?START\][\s\S]*$/gi,""),a.innerHTML=I(_)+'<span class="summary-cursor">\u258C</span>',a.scrollTop=a.scrollHeight}break;case"done":b(),$=f.token_usage||null;let N=f.token_balance!==void 0?{token_balance:f.token_balance,tokens_used:f.tokens_used,default_tokens:1e5}:null,E=document.getElementById("summaryStreamContent");if(E&&(E.classList.remove("summary-streaming"),E.innerHTML=I(y)),R(n,v,w,!1,$,null,N),U(t,!0),f.tags&&window.ArticleTags){let _=document.querySelector(`.news-item[data-news-id="${t}"]`);_||(_=document.querySelector(`.news-item[data-url="${n}"]`)),_&&(window.ArticleTags.applyTags(_,f.tags),_.dataset.tagsLoaded="true")}break;case"error":throw new Error(f.message)}}catch(f){if(f.message&&!f.message.includes("JSON"))throw f}}}catch(l){console.error("[Summary] Force error:",l),b();let s=l.message||"\u672A\u77E5\u9519\u8BEF",r=s.includes("\u7528\u5B8C")||s.includes("\u914D\u989D")||s.includes("\u6B21\u6570")||s.includes("\u989D\u5EA6")||s.includes("\u5347\u7EA7")||s.includes("\u4F1A\u5458"),y=s.includes("\u8BBF\u95EE\u9650\u5236")||s.includes("\u65E0\u6CD5\u83B7\u53D6")||s.includes("\u65E0\u6CD5\u8BBF\u95EE")||s.includes("\u8BF7\u6C42\u5931\u8D25");r?u.innerHTML=`
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
                        <a href="${n}" target="_blank" rel="noopener noreferrer" class="quota-read-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="quota-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} Todo</button>
                        <button class="quota-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `:y?u.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u{1F512}</div>
                    <div class="summary-access-error-title">\u6682\u65F6\u65E0\u6CD5\u83B7\u53D6\u5185\u5BB9</div>
                    <div class="summary-access-error-text">\u8BE5\u7F51\u7AD9\u8BBE\u7F6E\u4E86\u8BBF\u95EE\u4FDD\u62A4\uFF0C\u5EFA\u8BAE\u76F4\u63A5\u9605\u8BFB\u539F\u6587</div>
                    <div class="summary-access-error-actions">
                        <a href="${n}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                        <button class="summary-retry-btn-secondary" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                    </div>
                    <div class="summary-timeout-actions">
                        <button class="summary-action-btn" onclick="addCurrentToTodo()">\u{1F4CB} \u52A0\u5165 Todo</button>
                        <button class="summary-action-btn" onclick="addCurrentToFavorites()">\u2B50 \u6536\u85CF</button>
                    </div>
                </div>
            `:u.innerHTML=`
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">\u274C</div>
                    <div class="summary-access-error-title">\u603B\u7ED3\u5931\u8D25</div>
                    <div class="summary-access-error-text">${s}</div>
                    <div class="summary-access-error-actions">
                        <button class="summary-retry-btn" onclick="retrySummaryModal()">\u91CD\u8BD5</button>
                        <a href="${n}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            \u{1F4D6} \u9605\u8BFB\u539F\u6587
                        </a>
                    </div>
                </div>
            `}}function U(t,e){let n=document.querySelector(`.news-summary-btn[data-news-id="${t}"]`);n&&(n.classList.toggle("has-summary",e),n.title=e?"\u67E5\u770B\u603B\u7ED3":"AI \u603B\u7ED3");let o=document.querySelector(`.news-item[data-news-id="${t}"]`);o&&o.classList.toggle("has-summary",e)}function se(t,e,n,o,i,c){t.preventDefault(),t.stopPropagation(),K(e,n,o,i,c)}async function A(){try{if(!Y.isLoggedIn())return;let t=await fetch("/api/summary/list");if(!t.ok)return;let e=await t.json();if(!e.ok||!e.news_ids)return;let n=new Set(e.news_ids);if(n.size===0)return;document.querySelectorAll(".news-item[data-news-id]").forEach(o=>{let i=o.getAttribute("data-news-id");n.has(i)&&o.classList.add("has-summary")}),document.querySelectorAll(".news-summary-btn[data-news-id]").forEach(o=>{let i=o.getAttribute("data-news-id");n.has(i)&&(o.classList.add("has-summary"),o.title="\u67E5\u770B\u603B\u7ED3")}),console.log(`[Summary] Marked ${n.size} summarized items`)}catch(t){console.error("[Summary] Failed to load summarized list:",t)}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{setTimeout(A,500)}):setTimeout(A,500);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){let t=window._lastSummarizedListLoad||0;Date.now()-t>3e4&&(console.log("[Summary] Page visible, reloading summarized list"),A())}});var ke=A;A=async function(){return window._lastSummarizedListLoad=Date.now(),ke()};function Se(){!m||!h||(typeof window.openTodoPanel=="function"&&window.openTodoPanel(m,h,x),Q(!0))}function _e(){if(!m||!h)return;let t=document.getElementById("summaryTodoPanel");t&&t.classList.contains("open")?(typeof window.closeTodoPanel=="function"&&window.closeTodoPanel(),Q(!1)):(typeof window.openTodoPanel=="function"&&window.openTodoPanel(m,h,x),Q(!0))}function Q(t){let e=document.getElementById("summaryTodoToggleBtn");e&&e.classList.toggle("active",t)}async function $e(){if(!m||!h)return;let t=document.getElementById("summaryModalBody");if(!t)return;let n=t.innerHTML.match(/✅\s*行动清单[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);if(!n){window.showToast&&window.showToast("\u672A\u627E\u5230\u884C\u52A8\u6E05\u5355");return}let c=(n[1].match(/<li>([\s\S]*?)<\/li>/gi)||[]).map(u=>u.replace(/<\/?li>/gi,"").replace(/<[^>]+>/g,"").trim()).filter(u=>u.length>0);if(c.length===0){window.showToast&&window.showToast("\u884C\u52A8\u6E05\u5355\u4E3A\u7A7A");return}typeof window.batchAddTodos=="function"&&await window.batchAddTodos(c,{groupId:m,groupTitle:h,groupUrl:x||"",isCustom:!1})}async function Me(){if(!m||!h){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{typeof window.addTodo=="function"&&await window.addTodo(h,{groupId:m,groupTitle:h,groupUrl:x||"",isCustom:!1})}catch(t){console.error("[Summary] Add to todo error:",t),window.showToast&&window.showToast("\u6DFB\u52A0\u5931\u8D25")}}async function Ce(){if(!m||!h){window.showToast&&window.showToast("\u65E0\u6CD5\u83B7\u53D6\u6587\u7AE0\u4FE1\u606F");return}try{let{addFavorite:t}=await import("./favorites-MN3UGDAQ.js"),e=await t({news_id:m,title:h,url:x||""});e.ok?window.showToast&&window.showToast("\u5DF2\u6536\u85CF"):e.error&&window.showToast&&window.showToast(e.error)}catch(t){console.error("[Summary] Add to favorites error:",t),window.showToast&&window.showToast("\u6536\u85CF\u5931\u8D25")}}document.addEventListener("click",t=>{let e=t.target.closest(".news-summary-btn");if(!e||e.hasAttribute("onclick"))return;t.preventDefault(),t.stopPropagation();let n=e.dataset.newsId,o=e.dataset.title||"",i=e.dataset.url||"",c=e.dataset.sourceId||"",u=e.dataset.sourceName||"";n&&se(t,n,o,i,c,u)});window.openSummaryModal=K;window.closeSummaryModal=ve;window.retrySummaryModal=ae;window.regenerateSummaryModal=be;window.handleSummaryClick=se;window.loadSummarizedList=A;window.handleSummaryFeedback=ge;window.openCurrentTodoPanel=Se;window.toggleCurrentTodoPanel=_e;window.addActionListToTodo=$e;window.forceSummary=he;window.addCurrentToTodo=Me;window.addCurrentToFavorites=Ce;window.renderMarkdown=I;export{ve as closeSummaryModal,se as handleSummaryClick,A as loadSummarizedList,K as openSummaryModal,I as renderMarkdown};
