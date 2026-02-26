/**
 * 备用加载机制：确保 my-tags 和 discovery 在微信浏览器中能正常加载
 * 从 viewer.html 内联脚本提取为外部文件，减少 HTML 体积约 22KB
 */
(function() {

    // 格式化日期的辅助函数
    function formatNewsDate(timestamp) {
        if (!timestamp) return '';
        var date = new Date(timestamp * 1000);
        var now = new Date();
        var diffMs = now - date;
        var diffMins = Math.floor(diffMs / 60000);
        var diffHours = Math.floor(diffMs / 3600000);
        var diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return diffMins + '分钟前';
        if (diffHours < 24) return diffHours + '小时前';
        if (diffDays < 7) return diffDays + '天前';
        
        var month = date.getMonth() + 1;
        var day = date.getDate();
        if (date.getFullYear() === now.getFullYear()) {
            return month + '-' + day;
        }
        return date.getFullYear() + '-' + month + '-' + day;
    }
    
    // 转义 HTML 属性的辅助函数
    function escapeHtml(str) {
        return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeJs(str) {
        return (str || '').replace(/'/g, "\\'");
    }
    
    // 直接加载 my-tags 数据的备用函数
    async function fallbackLoadMyTags() {
        var container = document.getElementById('myTagsGrid');
        if (!container) return;
        
        // 检查是否已经有内容（模块已加载则跳过）
        if (container.querySelector('.platform-card')) return;
        // 如果模块的 load 函数可用，优先用模块（避免重复请求）
        if (window.HotNews && window.HotNews.myTags && window.HotNews.myTags.load) {
            console.log('[Fallback] my-tags module available, delegating to module');
            window.HotNews.myTags.load();
            return;
        }
        
        console.log('[Fallback] Loading my-tags directly...');
        
        try {
            // 先检查登录状态
            var authRes = await fetch('/api/auth/me');
            var authData = await authRes.json();
            
            if (!authData.ok || !authData.user) {
                // 未登录，显示登录提示
                container.innerHTML = '<div class="platform-card" style="min-height:500px;"><div style="text-align:center;padding:80px 20px 40px;"><div style="font-size:56px;margin-bottom:16px;">🔒</div><div style="font-size:17px;color:#374151;margin-bottom:10px;font-weight:600;">请先登录</div><div style="font-size:13px;color:#6b7280;margin-bottom:20px;line-height:1.5;">登录后即可查看您关注的标签新闻</div><button onclick="openLoginModal()" style="display:inline-block;padding:10px 22px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:white;border:none;cursor:pointer;border-radius:8px;font-weight:500;font-size:14px;">立即登录</button></div></div>';
                return;
            }
            
            // 已登录，获取数据
            var res = await fetch('/api/user/preferences/followed-news?limit=50', { credentials: 'include' });
            var data = await res.json();
            
            if (!data.ok || !data.tags || data.tags.length === 0) {
                // 没有关注的标签
                container.innerHTML = '<div style="text-align:center;padding:60px 20px;width:100%;"><div style="font-size:64px;margin-bottom:20px;">🏷️</div><div style="font-size:18px;color:#374151;margin-bottom:12px;font-weight:600;">您还未关注任何标签</div><div style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">点击下方按钮添加感兴趣的标签、订阅源或公众号，<br>这里将为您聚合相关新闻</div><button onclick="typeof openSubscribeSidebar === \'function\' && openSubscribeSidebar()" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;border:none;cursor:pointer;border-radius:8px;font-weight:500;font-size:15px;">➕ 添加关注</button></div>';
                return;
            }
            
            // 渲染数据
            var html = data.tags.map(function(tagData) {
                var tag = tagData.tag;
                var news = tagData.news || [];
                var count = tagData.count || news.length;
                var tagIcon = tag.icon || '🏷️';
                var tagName = tag.name || tag.id;
                
                var newsHtml = news.length > 0 ? news.map(function(item, idx) {
                    var safeTitle = escapeHtml(item.title);
                    var escapedTitle = escapeJs(item.title);
                    var escapedUrl = escapeJs(item.url);
                    var escapedTagName = escapeJs(tagName);
                    var dateStr = formatNewsDate(item.published_at);
                    
                    var aiDotHtml = '<span class="news-ai-indicator" data-news-id="' + item.id + '" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, \'' + item.id + '\', \'' + escapedTitle + '\', \'' + escapedUrl + '\', \'' + tag.id + '\', \'' + escapedTagName + '\')"></span>';
                    var dateHtml = dateStr ? '<span class="tr-news-date">' + dateStr + '</span>' : '';
                    var summaryBtnHtml = '<button class="news-summary-btn" data-news-id="' + item.id + '" data-title="' + safeTitle + '" data-url="' + (item.url || '') + '" data-source-id="' + tag.id + '" data-source-name="' + (tagName || '') + '" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, \'' + item.id + '\', \'' + escapedTitle + '\', \'' + escapedUrl + '\', \'' + tag.id + '\', \'' + escapedTagName + '\')"></button>';
                    var actionsHtml = '<div class="news-actions">' + dateHtml + '<div class="news-hover-btns">' + summaryBtnHtml + '<button class="news-comment-btn" data-url="' + (item.url || '') + '" data-title="' + safeTitle + '"></button></div></div>';
                    
                    return '<li class="news-item" data-news-id="' + (item.id || '') + '" data-news-title="' + safeTitle + '" data-news-url="' + (item.url || '') + '"><div class="news-item-content"><span class="news-index">' + (idx + 1) + '</span><a class="news-title" href="' + (item.url || '#') + '" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)">' + (item.title || '') + '</a>' + aiDotHtml + actionsHtml + '</div></li>';
                }).join('') : '<li class="news-placeholder" style="color:#9ca3af;padding:20px;text-align:center;">暂无相关新闻</li>';
                
                return '<div class="platform-card" data-tag-id="' + tag.id + '" draggable="false"><div class="platform-header"><div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">' + tagIcon + ' ' + tagName + '<span style="font-size:12px;color:#9ca3af;margin-left:8px;">(' + count + '条)</span></div><div class="platform-header-actions"></div></div><ul class="news-list">' + newsHtml + '</ul></div>';
            }).join('');
            
            container.innerHTML = html;
            console.log('[Fallback] my-tags loaded successfully');
        } catch (e) {
            console.error('[Fallback] my-tags load error:', e);
            container.innerHTML = '<div style="text-align:center;padding:60px 20px;width:100%;color:#6b7280;"><div style="font-size:48px;margin-bottom:16px;">😕</div><div style="font-size:16px;">加载失败，请刷新重试</div></div>';
        }
    }
    
    // 直接加载 discovery 数据的备用函数
    var discoveryLoading = false;
    async function fallbackLoadDiscovery() {
        var container = document.getElementById('discoveryGrid');
        if (!container) {
            console.log('[Fallback] discoveryGrid not found');
            return;
        }
        
        // 检查是否已经有内容（platform-card 或者非 loading 的内容）
        var hasContent = container.querySelector('.platform-card');
        var hasEmptyState = container.querySelector('[style*="暂无新发现"]');
        if (hasContent || hasEmptyState) {
            console.log('[Fallback] Discovery already has content');
            return;
        }
        
        // 如果模块的 load 函数可用，优先用模块（避免重复请求）
        if (window.HotNews && window.HotNews.discovery && window.HotNews.discovery.load) {
            console.log('[Fallback] discovery module available, delegating to module');
            window.HotNews.discovery.load();
            return;
        }
        
        // 防止重复加载，但设置超时自动重置
        if (discoveryLoading) {
            console.log('[Fallback] Discovery already loading, skipping');
            return;
        }
        discoveryLoading = true;
        
        // 5秒后自动重置 loading 状态，防止卡死
        setTimeout(function() { discoveryLoading = false; }, 5000);
        
        console.log('[Fallback] Loading discovery directly...');
        
        // 清除可能有问题的缓存
        try {
            localStorage.removeItem('hotnews_discovery_cache');
            console.log('[Fallback] Cleared discovery cache');
        } catch (e) {}
        
        // 显示加载中
        container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;"><div style="font-size:48px;margin-bottom:16px;">✨</div><div style="font-size:16px;">发现中...</div></div>';
        
        try {
            var res = await fetch('/api/user/preferences/discovery-news?news_limit=50&tag_limit=30', { credentials: 'include' });
            var data = await res.json();
            
            console.log('[Fallback] Discovery API response:', data.ok, 'tags:', data.tags ? data.tags.length : 0);
            
            if (!data.ok || !data.tags || data.tags.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:60px 20px;width:100%;"><div style="font-size:64px;margin-bottom:20px;">✨</div><div style="font-size:18px;color:#374151;margin-bottom:12px;font-weight:600;">暂无新发现</div><div style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">AI 正在持续发现热门话题，<br>稍后再来看看吧</div></div>';
                discoveryLoading = false;
                return;
            }
            
            var html = data.tags.map(function(tagData) {
                var tag = tagData.tag;
                var news = tagData.news || [];
                var tagIcon = tag.icon || '🏷️';
                var tagName = tag.name || tag.id;
                var firstSeenDate = tag.first_seen_date || '';
                
                var newsHtml = news.length > 0 ? news.map(function(item, idx) {
                    var safeTitle = escapeHtml(item.title);
                    var escapedTitle = escapeJs(item.title);
                    var escapedUrl = escapeJs(item.url);
                    var escapedTagName = escapeJs(tagName);
                    var dateStr = formatNewsDate(item.published_at);
                    
                    var aiDotHtml = '<span class="news-ai-indicator" data-news-id="' + item.id + '" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, \'' + item.id + '\', \'' + escapedTitle + '\', \'' + escapedUrl + '\', \'' + tag.id + '\', \'' + escapedTagName + '\')"></span>';
                    var dateHtml = dateStr ? '<span class="tr-news-date">' + dateStr + '</span>' : '';
                    var summaryBtnHtml = '<button class="news-summary-btn" data-news-id="' + item.id + '" data-title="' + safeTitle + '" data-url="' + (item.url || '') + '" data-source-id="' + tag.id + '" data-source-name="' + (tagName || '') + '" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, \'' + item.id + '\', \'' + escapedTitle + '\', \'' + escapedUrl + '\', \'' + tag.id + '\', \'' + escapedTagName + '\')"></button>';
                    var actionsHtml = '<div class="news-actions">' + dateHtml + '<div class="news-hover-btns">' + summaryBtnHtml + '<button class="news-comment-btn" data-url="' + (item.url || '') + '" data-title="' + safeTitle + '"></button></div></div>';
                    
                    return '<li class="news-item" data-news-id="' + (item.id || '') + '" data-news-title="' + safeTitle + '" data-news-url="' + (item.url || '') + '"><div class="news-item-content"><span class="news-index">' + (idx + 1) + '</span><a class="news-title" href="' + (item.url || '#') + '" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)">' + (item.title || '') + '</a>' + aiDotHtml + actionsHtml + '</div></li>';
                }).join('') : '<li class="news-placeholder" style="color:#9ca3af;padding:20px;text-align:center;">暂无相关新闻</li>';
                
                return '<div class="platform-card discovery-card" data-tag-id="' + tag.id + '" data-candidate="true" draggable="false"><div class="platform-header"><div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">' + tagIcon + ' ' + tagName + '<span class="discovery-badge">NEW</span><span class="discovery-date">发现于 ' + firstSeenDate + '</span></div><div class="platform-header-actions"></div></div><ul class="news-list">' + newsHtml + '</ul></div>';
            }).join('');
            
            container.innerHTML = html;
            console.log('[Fallback] discovery loaded successfully, cards:', data.tags.length);
        } catch (e) {
            console.error('[Fallback] discovery load error:', e);
            container.innerHTML = '<div style="text-align:center;padding:60px 20px;width:100%;color:#6b7280;"><div style="font-size:48px;margin-bottom:16px;">😕</div><div style="font-size:16px;">加载失败: ' + (e.message || '未知错误') + '</div><button onclick="window._fallbackLoadDiscovery && window._fallbackLoadDiscovery()" style="margin-top:16px;padding:8px 16px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;">重试</button></div>';
        }
        discoveryLoading = false;
    }
    
    // 暴露到全局，供 tab 点击时调用
    window._fallbackLoadMyTags = fallbackLoadMyTags;
    window._fallbackLoadDiscovery = fallbackLoadDiscovery;
    
    // 检查是否需要触发加载的函数
    function checkAndTriggerLoad() {
        try {
            // 检查 my-tags
            var myTagsPane = document.getElementById('tab-my-tags');
            var myTagsGrid = document.getElementById('myTagsGrid');
            if (myTagsPane && myTagsPane.classList.contains('active') && myTagsGrid) {
                var hasContent = myTagsGrid.querySelector('.platform-card');
                if (!hasContent) {
                    fallbackLoadMyTags();
                }
            }
            
            // 检查 discovery
            var discoveryPane = document.getElementById('tab-discovery');
            var discoveryGrid = document.getElementById('discoveryGrid');
            if (discoveryPane && discoveryPane.classList.contains('active') && discoveryGrid) {
                var hasDiscoveryContent = discoveryGrid.querySelector('.platform-card');
                if (!hasDiscoveryContent) {
                    fallbackLoadDiscovery();
                }
            }
        } catch (e) {
            console.error('[Fallback] Error:', e);
        }
    }
    
    // 监听 tab 切换事件
    window.addEventListener('tr_tab_switched', function(event) {
        var categoryId = event && event.detail && event.detail.categoryId;
        console.log('[Fallback] Tab switched to:', categoryId);
        if (categoryId === 'discovery') {
            setTimeout(function() {
                var container = document.getElementById('discoveryGrid');
                if (container && !container.querySelector('.platform-card')) {
                    fallbackLoadDiscovery();
                }
            }, 300);
        } else if (categoryId === 'my-tags') {
            setTimeout(function() {
                var container = document.getElementById('myTagsGrid');
                if (container && !container.querySelector('.platform-card')) {
                    fallbackLoadMyTags();
                }
            }, 300);
        }
    });
    
    // 重写 switchTab 函数，添加 fallback 逻辑
    var originalSwitchTab = window.switchTab;
    window.switchTab = function(categoryId) {
        console.log('[Fallback] switchTab called:', categoryId);
        // 调用原始函数
        if (typeof originalSwitchTab === 'function') {
            originalSwitchTab(categoryId);
        }
        // 添加 fallback 逻辑
        if (categoryId === 'discovery') {
            setTimeout(function() {
                var container = document.getElementById('discoveryGrid');
                if (container && !container.querySelector('.platform-card')) {
                    console.log('[Fallback] Triggering discovery load from switchTab override');
                    fallbackLoadDiscovery();
                }
            }, 800);
        } else if (categoryId === 'my-tags') {
            setTimeout(function() {
                var container = document.getElementById('myTagsGrid');
                if (container && !container.querySelector('.platform-card')) {
                    console.log('[Fallback] Triggering my-tags load from switchTab override');
                    fallbackLoadMyTags();
                }
            }, 800);
        }
    };
    
    // 直接给 discovery tab 按钮添加点击监听（微信浏览器兼容）
    // 使用事件委托，监听整个 sub-tabs 容器
    function attachTabClickListeners() {
        var tabsContainer = document.getElementById('homeSubTabs');
        if (!tabsContainer) {
            console.log('[Fallback] homeSubTabs container not found, retrying...');
            setTimeout(attachTabClickListeners, 500);
            return;
        }
        
        console.log('[Fallback] Attaching event delegation to homeSubTabs');
        
        // 使用事件委托
        tabsContainer.addEventListener('click', function(e) {
            var tab = e.target.closest('.sub-tab');
            if (!tab) return;
            
            var categoryId = tab.getAttribute('data-category');
            console.log('[Fallback] Tab clicked via delegation:', categoryId);
            
            if (categoryId === 'discovery') {
                setTimeout(function() {
                    var container = document.getElementById('discoveryGrid');
                    if (container && !container.querySelector('.platform-card')) {
                        console.log('[Fallback] Triggering discovery load from delegation');
                        fallbackLoadDiscovery();
                    }
                }, 500);
            } else if (categoryId === 'my-tags') {
                setTimeout(function() {
                    var container = document.getElementById('myTagsGrid');
                    if (container && !container.querySelector('.platform-card')) {
                        console.log('[Fallback] Triggering my-tags load from delegation');
                        fallbackLoadMyTags();
                    }
                }, 500);
            }
        });
        
        // 触摸事件（移动端）
        tabsContainer.addEventListener('touchend', function(e) {
            var tab = e.target.closest('.sub-tab');
            if (!tab) return;
            
            var categoryId = tab.getAttribute('data-category');
            console.log('[Fallback] Tab touched via delegation:', categoryId);
            
            if (categoryId === 'discovery') {
                setTimeout(function() {
                    var container = document.getElementById('discoveryGrid');
                    if (container && !container.querySelector('.platform-card')) {
                        console.log('[Fallback] Triggering discovery load from touch delegation');
                        fallbackLoadDiscovery();
                    }
                }, 500);
            } else if (categoryId === 'my-tags') {
                setTimeout(function() {
                    var container = document.getElementById('myTagsGrid');
                    if (container && !container.querySelector('.platform-card')) {
                        console.log('[Fallback] Triggering my-tags load from touch delegation');
                        fallbackLoadMyTags();
                    }
                }, 500);
            }
        }, { passive: true });
        
        console.log('[Fallback] Event delegation attached');
    }
    
    // DOM 加载完成后绑定事件
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachTabClickListeners);
    } else {
        attachTabClickListeners();
    }
    
    // 延迟检查，给 JS 模块足够的初始化时间
    setTimeout(checkAndTriggerLoad, 500);
    setTimeout(checkAndTriggerLoad, 1000);
    setTimeout(checkAndTriggerLoad, 2000);
    setTimeout(checkAndTriggerLoad, 4000);
    setTimeout(checkAndTriggerLoad, 8000);
    
    // DOMContentLoaded 时也检查一次
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(checkAndTriggerLoad, 100);
        });
    }
})();
