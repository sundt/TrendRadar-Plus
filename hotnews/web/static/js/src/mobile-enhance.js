/**
 * Mobile Enhancement Module (移动端增强)
 *
 * 独立 ES module，在 index.js 之后加载。
 * 仅在移动端（≤640px）生效，通过 _isMobileNarrowScreen() 守卫。
 * 不修改任何现有文件，通过 CSS 覆盖和 JS 运行时拦截实现所有增强。
 *
 * 功能清单：
 *  - BottomNav（底部导航栏）
 *  - SettingsMenu（更多设置菜单）
 *  - TitleClick Override（标题单击直接跳转）
 *  - PullToRefresh（下拉刷新）
 *  - BoundarySwipe（边界滑动切换分类）
 *  - BackToTop（回到顶部）
 *  - ActionSheet（底部操作面板）
 *  - SearchOverlay（全屏搜索）
 *  - CategoryPanel（分类选择面板）
 */

// @ts-nocheck

const MobileEnhance = {

  // ========== 状态 ==========
  _bookmarkCycleState: 0, // 0=关闭, 1=收藏面板, 2=todo面板
  _pullState: { startY: 0, startX: 0, pulling: false, refreshing: false },
  _swipeState: { startX: 0, startY: 0, tracking: false },
  _longPressTimer: null,
  _longPressData: null,
  _settingsOverlay: null,
  _settingsMenu: null,
  _actionSheetOverlay: null,
  _actionSheet: null,
  _searchOverlay: null,
  _categoryOverlay: null,
  _categoryPanel: null,
  _pullIndicator: null,
  _backToTopBtn: null,
  _bottomNav: null,

  // ========== 工具函数 ==========

  /** 判断是否为移动端窄屏（≤640px） */
  _isMobileNarrowScreen() {
    try {
      return !!window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    } catch (e) {
      return false;
    }
  },

  /** 判断是否为 hover 设备（桌面端） */
  _isHoverDevice() {
    try {
      return !!window.matchMedia && window.matchMedia('(hover: hover)').matches;
    } catch (e) {
      return false;
    }
  },


  // ========== 1. BottomNav（底部导航栏） ==========

  _createBottomNav() {
    if (document.querySelector('.me-bottom-nav')) return;

    const nav = document.createElement('nav');
    nav.className = 'me-bottom-nav';
    nav.setAttribute('aria-label', '底部导航');

    // 5 个导航按钮配置：action, label, svgContent
    const buttons = [
      {
        action: 'list',
        label: '分类',
        svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      },
      {
        action: 'bookmark',
        label: '收藏',
        svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
        dot: true // 书签循环状态指示点
      },
      {
        action: 'rss',
        label: '订阅',
        svg: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="5" cy="19" r="2" fill="currentColor"/></svg>'
      },
      {
        action: 'search',
        label: '搜索',
        svg: '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
      },
      {
        action: 'more',
        label: '更多',
        svg: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>'
      }
    ];

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.className = 'me-nav-btn';
      button.setAttribute('aria-label', btn.label);
      button.dataset.action = btn.action;
      button.innerHTML = btn.svg + (btn.dot ? '<span class="me-dot"></span>' : '');
      button.addEventListener('click', () => this._handleNavClick(btn.action));
      nav.appendChild(button);
    });

    document.body.appendChild(nav);
    this._bottomNav = nav;
  },

  /** 处理导航项点击 */
  _handleNavClick(action) {
    switch (action) {
      case 'list':
        this._openCategoryPanel();
        break;

      case 'bookmark':
        this._handleBookmarkCycle();
        break;

      case 'rss':
        if (typeof window.goToSettings === 'function') {
          window.goToSettings();
        }
        break;

      case 'search':
        this._openSearch();
        break;

      case 'more':
        this._openSettingsMenu();
        break;
    }
  },

  /** 收藏面板开关（仅收藏，不含 todo） */
  _handleBookmarkCycle() {
    // 简单开关：0=关闭, 1=打开收藏
    this._bookmarkCycleState = this._bookmarkCycleState === 0 ? 1 : 0;

    if (this._bookmarkCycleState === 1) {
      if (typeof window.toggleFavoritesPanel === 'function') {
        window.toggleFavoritesPanel();
      }
    } else {
      if (typeof window.closeFavoritesPanel === 'function') {
        window.closeFavoritesPanel();
      }
    }

    this._updateActiveNav(this._bookmarkCycleState > 0 ? 'bookmark' : null);
  },

  /** 更新导航项高亮状态 */
  _updateActiveNav(action) {
    if (!this._bottomNav) return;
    this._bottomNav.querySelectorAll('.me-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.action === action);
    });
  },


  // ========== 2. SettingsMenu（更多设置菜单） ==========

  _createSettingsMenu() {
    if (document.querySelector('.me-action-sheet-overlay.me-settings-overlay')) return;

    // 遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'me-action-sheet-overlay me-settings-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeSettingsMenu();
    });

    // 菜单面板
    const menu = document.createElement('div');
    menu.className = 'me-settings-menu';

    // 判断当前是否为暗色模式
    const isDark = document.body.classList.contains('dark-mode');

    menu.innerHTML = `
      <div class="me-settings-item" data-action="theme">
        <div class="me-settings-item-left">
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>护眼模式</span>
        </div>
        <button class="me-settings-toggle ${isDark ? 'on' : ''}" aria-label="切换护眼模式"></button>
      </div>
      <div class="me-settings-divider"></div>
      <div class="me-settings-item" data-action="todo">
        <div class="me-settings-item-left">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>待办清单</span>
        </div>
      </div>
      <div class="me-settings-divider"></div>
      <div class="me-settings-item" data-action="login">
        <div class="me-settings-item-left">
          <svg viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>登录 / 注册</span>
        </div>
      </div>
    `;

    // 事件委托
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-action]');
      if (!item) return;
      const action = item.dataset.action;

      switch (action) {
        case 'theme':
          if (typeof window.toggleTheme === 'function') {
            window.toggleTheme();
          }
          // 更新 toggle 状态
          const toggle = menu.querySelector('.me-settings-toggle');
          if (toggle) toggle.classList.toggle('on');
          return; // 不关闭菜单

        case 'todo':
          this._closeSettingsMenu();
          if (typeof window.openTodoSidebar === 'function') {
            window.openTodoSidebar();
          }
          break;

        case 'login':
          this._closeSettingsMenu();
          // 检查登录状态
          try {
            const user = window.authState?.getUser?.();
            if (user) {
              // 已登录 — 弹出用户操作面板
              this._showUserActionSheet(user);
              break;
            }
          } catch (e) { /* ignore */ }
          if (typeof window.openLoginModal === 'function') {
            window.openLoginModal();
          }
          break;

        case 'cancel':
          this._closeSettingsMenu();
          break;
      }
    });

    overlay.appendChild(menu);
    document.body.appendChild(overlay);
    this._settingsOverlay = overlay;
    this._settingsMenu = menu;
  },

  _openSettingsMenu() {
    if (!this._settingsOverlay) this._createSettingsMenu();

    // 刷新暗色模式状态
    const isDark = document.body.classList.contains('dark-mode');
    const toggle = this._settingsMenu.querySelector('.me-settings-toggle');
    if (toggle) toggle.classList.toggle('on', isDark);

    // 刷新登录状态显示
    const loginItem = this._settingsMenu.querySelector('[data-action="login"] .me-settings-item-left span');
    if (loginItem) {
      try {
        const user = window.authState?.getUser?.();
        loginItem.textContent = user ? (user.nickname || user.email || '我的账户') : '登录 / 注册';
      } catch (e) {
        loginItem.textContent = '登录 / 注册';
      }
    }

    this._settingsOverlay.classList.add('open');
    this._settingsMenu.classList.add('open');
  },

  _closeSettingsMenu() {
    if (this._settingsOverlay) this._settingsOverlay.classList.remove('open');
    if (this._settingsMenu) this._settingsMenu.classList.remove('open');
  },

  /** 已登录用户操作面板 */
  _showUserActionSheet(user) {
    // 复用 ActionSheet 样式
    let overlay = document.querySelector('.me-user-sheet-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'me-action-sheet-overlay me-user-sheet-overlay';
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('open');
          overlay.querySelector('.me-action-sheet')?.classList.remove('open');
        }
      });
      const sheet = document.createElement('div');
      sheet.className = 'me-action-sheet';
      overlay.appendChild(sheet);
      document.body.appendChild(overlay);
    }

    const sheet = overlay.querySelector('.me-action-sheet');
    sheet.innerHTML = `
      <button class="me-action-sheet-item" data-action="membership">
        <svg viewBox="0 0 24 24" fill="none" style="width:18px;height:18px;margin-right:8px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        会员
      </button>
      <div class="me-action-sheet-divider"></div>
      <button class="me-action-sheet-item me-action-sheet-danger" data-action="logout">
        <svg viewBox="0 0 24 24" fill="none" style="width:18px;height:18px;margin-right:8px;"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        退出登录
      </button>
    `;

    sheet.onclick = async (e) => {
      const item = e.target.closest('[data-action]');
      if (!item) return;
      const action = item.dataset.action;

      overlay.classList.remove('open');
      sheet.classList.remove('open');

      if (action === 'logout') {
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
          window.location.reload();
        } catch (e) {
          console.error('[MobileEnhance] 退出登录失败:', e);
        }
      } else if (action === 'membership') {
        if (typeof window.openSubscriptionModal === 'function') {
          window.openSubscriptionModal();
        }
      }
    };

    overlay.classList.add('open');
    sheet.classList.add('open');
  },


  // ========== 3. TitleClick Override（标题单击直接跳转） ==========

  _overrideTitleClick() {
    // 保存原始函数引用
    const originalHandleTitleClickV2 = window.handleTitleClickV2;

    const self = this;

    /** 关闭所有已展开的 news-item（除了 exceptItem） */
    function closeAllExpanded(exceptItem) {
      document.querySelectorAll('.news-item.expanded').forEach(it => {
        if (exceptItem && it === exceptItem) return;
        it.classList.remove('expanded');
      });
    }

    // 点击空白区域时收起展开的卡片
    document.addEventListener('click', (e) => {
      if (!self._isMobileNarrowScreen()) return;
      if (!e.target.closest('.news-item')) {
        closeAllExpanded(null);
      }
    });

    document.addEventListener('touchstart', (e) => {
      if (!self._isMobileNarrowScreen()) return;
      if (!e.target.closest('.news-item')) {
        closeAllExpanded(null);
      }
    }, { passive: true });

    window.handleTitleClickV2 = function (el, evt) {
      // 桌面端（hover 设备）：走原有逻辑
      if (self._isHoverDevice()) {
        if (typeof originalHandleTitleClickV2 === 'function') {
          originalHandleTitleClickV2(el, evt);
        }
        return;
      }

      // 移动端：第一次点击展开按钮，第二次点击跳转
      evt.stopPropagation();
      evt.preventDefault();

      const item = el.closest('.news-item');
      if (!item) return;

      const isExpanded = item.classList.contains('expanded');

      if (isExpanded) {
        // 第二次点击 → 跳转
        item.classList.remove('expanded');

        // 标记已读
        try {
          const checkbox = item.querySelector('.news-checkbox');
          if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            if (typeof window.markAsRead === 'function') {
              window.markAsRead(checkbox);
            } else if (window.TR?.readState?.markAsRead) {
              window.TR.readState.markAsRead(checkbox);
            }
          } else if (window.TR?.readState?.markItemAsRead) {
            window.TR.readState.markItemAsRead(item);
          }
        } catch (e) { /* ignore */ }

        // 保存导航状态
        try {
          if (window.TR?.scroll?.saveNavigationState) {
            window.TR.scroll.saveNavigationState();
          }
        } catch (e) { /* ignore */ }

        // 打开链接
        const url = el.href || el.dataset?.url;
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      // 第一次点击 → 展开，显示操作按钮
      closeAllExpanded(item);
      item.classList.add('expanded');
    };
  },


  // ========== 4. PullToRefresh（下拉刷新） ==========

  _initPullToRefresh() {
    this._createPullIndicator();

    const self = this;

    document.addEventListener('touchstart', (e) => {
      if (self._pullState.refreshing) return;
      if (window.scrollY > 5) return;

      const touch = e.touches[0];
      self._pullState.startY = touch.clientY;
      self._pullState.startX = touch.clientX;
      self._pullState.pulling = false;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (self._pullState.refreshing) return;
      if (self._pullState.startY === 0) return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - self._pullState.startY;
      const deltaX = Math.abs(touch.clientX - self._pullState.startX);

      // 水平滑动优先 → 取消下拉刷新
      if (deltaX > Math.abs(deltaY)) {
        self._pullState.startY = 0;
        self._resetPullIndicator();
        return;
      }

      // 只处理向下拉
      if (deltaY <= 0) return;

      // 页面不在顶部时忽略
      if (window.scrollY > 5) return;

      self._pullState.pulling = true;

      // 阻尼位移
      const displacement = Math.min(deltaY * 0.4, 120);
      if (self._pullIndicator) {
        self._pullIndicator.style.transform = `translateX(-50%) translateY(${displacement - 60}px)`;
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (!self._pullState.pulling) {
        self._pullState.startY = 0;
        return;
      }

      // 计算最终位移来判断是否触发刷新
      const indicator = self._pullIndicator;
      if (!indicator) {
        self._pullState.pulling = false;
        self._pullState.startY = 0;
        return;
      }

      // 从 transform 中提取当前 translateY 值
      const style = indicator.style.transform;
      const match = style.match(/translateY\(([^)]+)px\)/);
      const currentY = match ? parseFloat(match[1]) : -60;
      // displacement = currentY + 60, 阈值 60px → currentY >= 0
      const displacement = currentY + 60;

      if (displacement >= 60) {
        // 触发刷新
        self._pullState.refreshing = true;
        indicator.classList.add('refreshing');
        indicator.style.transform = 'translateX(-50%) translateY(10px)';

        try {
          if (window.TR?.data?.refreshViewerData) {
            const result = window.TR.data.refreshViewerData();
            // refreshViewerData 可能返回 Promise
            if (result && typeof result.then === 'function') {
              result.then(() => self._finishRefresh()).catch(() => self._finishRefresh());
            } else {
              // 非 Promise，延迟收起
              setTimeout(() => self._finishRefresh(), 1500);
            }
          } else {
            setTimeout(() => self._finishRefresh(), 1500);
          }
        } catch (e) {
          self._finishRefresh();
        }
      } else {
        // 未达阈值，回弹
        self._resetPullIndicator();
      }

      self._pullState.pulling = false;
      self._pullState.startY = 0;
    }, { passive: true });
  },

  _createPullIndicator() {
    if (document.querySelector('.me-pull-indicator')) return;

    const indicator = document.createElement('div');
    indicator.className = 'me-pull-indicator';
    indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    document.body.appendChild(indicator);
    this._pullIndicator = indicator;
  },

  _resetPullIndicator() {
    if (this._pullIndicator) {
      this._pullIndicator.style.transform = 'translateX(-50%) translateY(-60px)';
      this._pullIndicator.classList.remove('refreshing');
    }
  },

  _finishRefresh() {
    this._pullState.refreshing = false;
    this._resetPullIndicator();
  },


  // ========== 5. BoundarySwipe（边界滑动切换分类） ==========

  _initBoundarySwipe() {
    const self = this;

    // 监听 .platform-grid 上的 touch 事件
    document.addEventListener('touchstart', (e) => {
      const grid = e.target.closest('.platform-grid');
      if (!grid) return;

      const touch = e.touches[0];
      self._swipeState.startX = touch.clientX;
      self._swipeState.startY = touch.clientY;
      self._swipeState.tracking = true;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!self._swipeState.tracking) return;
      self._swipeState.tracking = false;

      const grid = document.querySelector('.tab-pane.active .platform-grid');
      if (!grid) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - self._swipeState.startX;
      const deltaY = Math.abs(touch.clientY - self._swipeState.startY);
      const absDeltaX = Math.abs(deltaX);

      // 垂直位移 > 水平位移 → 不触发
      if (deltaY > absDeltaX) return;

      // 水平滑动不足 50px → 不触发
      if (absDeltaX < 50) return;

      const scrollLeft = grid.scrollLeft;
      const clientWidth = grid.clientWidth;
      const scrollWidth = grid.scrollWidth;

      const atLeftBoundary = scrollLeft <= 10;
      const atRightBoundary = scrollLeft + clientWidth >= scrollWidth - 10;

      let direction = null;
      if (deltaX < 0 && atRightBoundary) {
        direction = 'next'; // 向左滑 → 下一个分类
      } else if (deltaX > 0 && atLeftBoundary) {
        direction = 'prev'; // 向右滑 → 上一个分类
      }

      if (!direction) return;

      // 查找相邻可见分类 tab
      const adjacentId = self._findAdjacentTab(direction);
      if (adjacentId) {
        try {
          if (typeof window.switchTab === 'function') {
            window.switchTab(adjacentId);
          } else if (window.TR?.tabs?.switchTab) {
            window.TR.tabs.switchTab(adjacentId);
          }
        } catch (e) {
          console.error('[MobileEnhance] BoundarySwipe switchTab 失败:', e);
        }
      }
    }, { passive: true });
  },

  /**
   * 从 _columnConfig 构建扁平导航顺序：
   * 每个一级栏目展开为其所有叶子节点 id（二级或三级）。
   * 降级：_columnConfig 未就绪时从 DOM 读取。
   */
  _buildNavOrder() {
    const columns = Array.isArray(window._columnConfig) ? window._columnConfig : [];
    if (!columns.length) {
      // 降级：从 DOM 读取可见 sub-tab
      return Array.from(
        document.querySelectorAll('.sub-tab[data-category]:not(.sub-tab-new)')
      ).filter(t => !this._isTabHiddenByUser(t))
        .map(t => t.dataset.category);
    }

    const ids = [];
    function collectLeaves(nodes) {
      for (const n of nodes) {
        const children = Array.isArray(n.children) ? n.children : [];
        if (!children.length) {
          ids.push(String(n.id));
        } else {
          collectLeaves(children);
        }
      }
    }
    collectLeaves(columns);
    return ids;
  },

  /** 查找当前激活 tab 的前/后一个 tab */
  _findAdjacentTab(direction) {
    const activeId = window.TR?.tabs?.getActiveTabId?.() ||
      document.querySelector('.sub-tab.active')?.dataset?.category || '';

    const navOrder = this._buildNavOrder();
    const idx = navOrder.indexOf(activeId);
    if (idx === -1) return null;

    const targetIdx = direction === 'next' ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= navOrder.length) return null;
    return navOrder[targetIdx];
  },


  // ========== 6. BackToTop（回到顶部） ==========

  _createBackToTop() {
    if (document.querySelector('.me-back-to-top')) return;

    const btn = document.createElement('button');
    btn.className = 'me-back-to-top';
    btn.setAttribute('aria-label', '回到顶部');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.body.appendChild(btn);
    this._backToTopBtn = btn;

    // 监听滚动
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        this._toggleBackToTop();
      });
    }, { passive: true });
  },

  _toggleBackToTop() {
    if (!this._backToTopBtn) return;
    const visible = window.scrollY > 300;
    this._backToTopBtn.classList.toggle('visible', visible);
  },


  // ========== 7. ActionSheet（底部操作面板） ==========

  _createActionSheet() {
    if (document.querySelector('.me-action-sheet-overlay.me-news-action-overlay')) return;

    // 遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'me-action-sheet-overlay me-news-action-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._hideActionSheet();
    });

    // 面板
    const sheet = document.createElement('div');
    sheet.className = 'me-action-sheet';

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    this._actionSheetOverlay = overlay;
    this._actionSheet = sheet;
  },

  _showActionSheet(newsData) {
    if (!this._actionSheetOverlay) this._createActionSheet();
    if (!newsData) return;

    this._longPressData = newsData;

    const hasSummary = newsData.hasSummary;
    const summaryLabel = hasSummary ? '查看总结' : 'AI 智能总结';

    this._actionSheet.innerHTML = `
      <button class="me-action-sheet-item" data-action="summary">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>✨ ${summaryLabel}</span>
      </button>
      <div class="me-action-sheet-divider"></div>
      <button class="me-action-sheet-item" data-action="open">
        <svg viewBox="0 0 24 24" fill="none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>打开原文</span>
      </button>
      <button class="me-action-sheet-item" data-action="copy">
        <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
        <span>复制链接</span>
      </button>
      <div class="me-action-sheet-divider"></div>
      <button class="me-action-sheet-cancel" data-action="cancel">取消</button>
    `;

    // 事件委托
    this._actionSheet.onclick = (e) => {
      const item = e.target.closest('[data-action]');
      if (!item) return;
      const action = item.dataset.action;
      this._hideActionSheet();

      switch (action) {
        case 'summary':
          if (typeof window.openSummaryModal === 'function') {
            window.openSummaryModal(
              newsData.newsId, newsData.title, newsData.url,
              newsData.sourceId, newsData.sourceName
            );
          }
          break;
        case 'open':
          if (newsData.url) window.open(newsData.url, '_blank', 'noopener,noreferrer');
          break;
        case 'copy':
          if (newsData.url && navigator.clipboard) {
            navigator.clipboard.writeText(newsData.url).then(() => {
              if (window.TR?.toast?.show) {
                window.TR.toast.show('链接已复制', { variant: 'success', durationMs: 1500 });
              }
            }).catch(() => {});
          }
          break;
      }
    };

    this._actionSheetOverlay.classList.add('open');
    this._actionSheet.classList.add('open');
  },

  _hideActionSheet() {
    if (this._actionSheetOverlay) this._actionSheetOverlay.classList.remove('open');
    if (this._actionSheet) this._actionSheet.classList.remove('open');
    this._longPressData = null;
  },

  /**
   * 拦截上下文菜单（长按）
   * 在 document 上以捕获阶段注册 touchstart，优先于 context-menu.js 的冒泡阶段监听器
   */
  _interceptContextMenu() {
    const self = this;
    let longPressTimer = null;
    let startX = 0;
    let startY = 0;

    // 捕获阶段拦截 touchstart
    document.addEventListener('touchstart', function (e) {
      // 只在移动端拦截
      if (!self._isMobileNarrowScreen()) return;

      const target = e.target;
      if (!target) return;

      // 只拦截 .news-item 内的触摸
      const newsItem = target.closest('.news-item');
      if (!newsItem) return;

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;

      // 启动 500ms 长按计时器
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        // 获取新闻数据
        const data = self._getNewsDataFromElement(newsItem);
        if (data) {
          // 触觉反馈
          if (navigator.vibrate) {
            navigator.vibrate(10);
          }
          self._showActionSheet(data);
        }
        longPressTimer = null;
      }, 500);
    }, true); // 捕获阶段

    // 移动或抬起时取消长按
    const cancelLongPress = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    document.addEventListener('touchmove', (e) => {
      if (!longPressTimer) return;
      const touch = e.touches[0];
      if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
        cancelLongPress();
      }
    }, { passive: true });

    document.addEventListener('touchend', cancelLongPress, { passive: true });
    document.addEventListener('touchcancel', cancelLongPress, { passive: true });

    // 阻止移动端默认的 contextmenu 事件
    document.addEventListener('contextmenu', (e) => {
      if (!self._isMobileNarrowScreen()) return;
      const newsItem = e.target.closest('.news-item');
      if (newsItem) {
        e.preventDefault();
      }
    });
  },

  /** 从 DOM 元素中提取新闻数据 */
  _getNewsDataFromElement(el) {
    const newsItem = el.closest('.news-item');
    if (!newsItem) return null;

    const titleEl = newsItem.querySelector('.news-title');
    const summaryBtn = newsItem.querySelector('.news-summary-btn');

    return {
      newsId: newsItem.dataset.newsId || '',
      title: newsItem.dataset.newsTitle || titleEl?.textContent?.trim() || '',
      url: titleEl?.href || '',
      sourceId: summaryBtn?.dataset.sourceId || '',
      sourceName: summaryBtn?.dataset.sourceName || '',
      hasSummary: summaryBtn?.classList.contains('has-summary') || false
    };
  },


  // ========== 8. SearchOverlay（全屏搜索覆盖层） ==========

  _createSearchOverlay() {
    if (document.querySelector('.me-search-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'me-search-overlay';

    overlay.innerHTML = `
      <div class="me-search-bar">
        <input type="search" class="me-search-input" placeholder="搜索新闻..." enterkeyhint="search" />
        <button class="me-search-cancel">取消</button>
      </div>
    `;

    const input = overlay.querySelector('.me-search-input');
    const cancelBtn = overlay.querySelector('.me-search-cancel');

    // 回车搜索
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = input.value.trim();
        if (!query) return;
        this._handleSearchSubmit(query);
      }
      if (e.key === 'Escape') {
        this._closeSearch();
      }
    });

    // 取消按钮
    cancelBtn.addEventListener('click', () => this._closeSearch());

    document.body.appendChild(overlay);
    this._searchOverlay = overlay;
  },

  _openSearch() {
    if (!this._searchOverlay) this._createSearchOverlay();
    this._searchOverlay.classList.add('open');

    // 自动聚焦
    const input = this._searchOverlay.querySelector('.me-search-input');
    if (input) {
      setTimeout(() => input.focus(), 100);
    }
  },

  _closeSearch() {
    if (this._searchOverlay) {
      this._searchOverlay.classList.remove('open');
      const input = this._searchOverlay.querySelector('.me-search-input');
      if (input) {
        input.value = '';
        input.blur();
      }
    }
  },

  /** 处理搜索提交 */
  _handleSearchSubmit(query) {
    this._closeSearch();

    // 如果页面上存在 #searchInput，同步关键词并触发搜索
    const existingInput = document.getElementById('searchInput');
    if (existingInput) {
      existingInput.value = query;
      // 触发 input 事件让现有搜索逻辑生效
      existingInput.dispatchEvent(new Event('input', { bubbles: true }));
      existingInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return;
    }

    // 否则跳转到搜索页面
    window.location.href = '/search?q=' + encodeURIComponent(query);
  },


  // ========== 9. CategoryPanel（分类选择面板） ==========

  _createCategoryPanel() {
    if (document.querySelector('.me-category-overlay')) return;

    // 遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'me-category-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeCategoryPanel();
    });

    // 面板
    const panel = document.createElement('div');
    panel.className = 'me-category-panel';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._categoryOverlay = overlay;
    this._categoryPanel = panel;
  },

  _openCategoryPanel() {
    if (!this._categoryOverlay) this._createCategoryPanel();

    // 渲染分类内容
    this._renderCategoryItems();

    this._categoryOverlay.classList.add('open');
    this._categoryPanel.classList.add('open');

    // 如果没有 topic tabs 但用户已登录，topic-tracker 可能还在异步加载
    // 监听 DOM 变化，topic tab 出现后自动刷新
    const topicTabs = document.querySelectorAll('.sub-tab.topic-tab');
    if (topicTabs.length === 0) {
      const categoryTabsEl = document.getElementById('topicSubTabs');
      if (categoryTabsEl) {
        const obs = new MutationObserver(() => {
          const newTopicTabs = document.querySelectorAll('.sub-tab.topic-tab');
          if (newTopicTabs.length > 0) {
            obs.disconnect();
            // 面板仍然打开时才刷新
            if (this._categoryOverlay?.classList.contains('open')) {
              this._renderCategoryItems();
            }
          }
        });
        obs.observe(categoryTabsEl, { childList: true });
        // 面板关闭时断开
        const origClose = this._closeCategoryPanel.bind(this);
        const self = this;
        this._closeCategoryPanel = function () {
          obs.disconnect();
          self._closeCategoryPanel = origClose;
          origClose();
        };
      }
    }
  },

  _closeCategoryPanel() {
    if (this._categoryOverlay) this._categoryOverlay.classList.remove('open');
    if (this._categoryPanel) this._categoryPanel.classList.remove('open');
  },

  /**
   * 渲染分类面板内容（三级同屏模式）
   *
   * 交互逻辑：
   *  - 顶部：一级分类横向滚动 pill 行
   *  - 中间：选中一级后，下方显示二级列表
   *  - 底部：选中二级（有三级）后，下方显示三级 pill
   *  - 只有叶子节点点击才跳转
   */
  _renderCategoryItems() {
    if (!this._categoryPanel) return;

    const activeId = window.TR?.tabs?.getActiveTabId?.() ||
      document.querySelector('.sub-tab.active')?.dataset?.category || '';

    const columns = Array.isArray(window._columnConfig) ? window._columnConfig : [];

    if (!columns.length) {
      this._renderCategoryItemsFallback(activeId);
      return;
    }

    // 找到 activeId 所属的一级和二级
    let selL1 = null;
    let selL2 = null;
    for (const col of columns) {
      if (col.id === activeId) { selL1 = col.id; break; }
      for (const ch of (col.children || [])) {
        if (ch.id === activeId) { selL1 = col.id; selL2 = ch.id; break; }
        for (const gc of (ch.children || [])) {
          if (gc.id === activeId) { selL1 = col.id; selL2 = ch.id; break; }
        }
        if (selL2) break;
      }
      if (selL1) break;
    }

    // 默认选中第一个有子项的一级
    if (!selL1) {
      const firstWithChildren = columns.find(c => c.children?.length > 0);
      if (firstWithChildren) selL1 = firstWithChildren.id;
    }

    this._catState = { columns, activeId, selL1, selL2 };
    this._renderAllLevels();
  },

  /** 渲染三级同屏面板 */
  _renderAllLevels() {
    if (!this._categoryPanel || !this._catState) return;
    const { columns, activeId, selL1, selL2 } = this._catState;
    console.log('[MobileEnhance] _renderAllLevels selL1:', selL1, 'selL2:', selL2, 'activeId:', activeId);
    const self = this;

    const selL1Col = columns.find(c => c.id === selL1);
    const l2Children = selL1Col?.children || [];
    console.log('[MobileEnhance] selL1Col:', selL1Col?.name, 'l2Children count:', l2Children.length);
    const selL2Col = l2Children.find(c => c.id === selL2);
    const l3Children = selL2Col?.children || [];

    // 如果选中的 L2 没有三级子项，不显示 L3
    const showL3 = l3Children.length > 0;

    // 如果没有选中 L2，默认选中第一个有子项的 L2
    let effectiveL2 = selL2;
    if (!effectiveL2 && l2Children.length > 0) {
      const firstL2WithChildren = l2Children.find(c => c.children?.length > 0);
      if (firstL2WithChildren) {
        effectiveL2 = firstL2WithChildren.id;
        this._catState.selL2 = effectiveL2;
      }
    }
    const effectiveL2Col = l2Children.find(c => c.id === effectiveL2);
    const effectiveL3 = effectiveL2Col?.children || [];

    let html = `
      <div class="me-category-header">
        <span class="me-category-header-title">选择分类</span>
        <button class="me-category-close" aria-label="关闭">✕</button>
      </div>
    `;

    // ── L1: 横向滚动 pill 行 ──
    html += '<div class="me-cat-l1-row">';
    for (const col of columns) {
      const colId = col.id || '';
      const colName = col.name || colId;
      const colIcon = col.icon || '';
      const isActive = colId === selL1;
      const hasChildren = (col.children || []).length > 0;
      html += `<button class="me-cat-l1-pill${isActive ? ' active' : ''}" data-id="${this._escapeHtml(colId)}" data-has-children="${hasChildren}" data-require-login="${!!col.require_login}">${colIcon ? colIcon + ' ' : ''}${this._escapeHtml(colName)}</button>`;
    }
    html += '</div>';

    // ── L2: 二级列表（仅当选中的 L1 有子项时显示） ──
    if (l2Children.length > 0) {
      html += '<div class="me-cat-l2-section">';
      html += `<div class="me-cat-section-label">${selL1Col.icon || ''} ${this._escapeHtml(selL1Col.name || '')}</div>`;
      html += '<div class="me-cat-l2-list">';
      for (const ch of l2Children) {
        const chId = ch.id || '';
        const chName = ch.name || chId;
        const hasGrandchildren = (ch.children || []).length > 0;
        const isActive = chId === effectiveL2;
        html += `<button class="me-cat-l2-item${isActive ? ' active' : ''}" data-id="${this._escapeHtml(chId)}" data-has-children="${hasGrandchildren}">${this._escapeHtml(chName)}${hasGrandchildren ? ' <span class="me-cat-l2-arrow">›</span>' : ''}</button>`;
      }
      html += '</div>';
      html += '</div>';
    }

    // ── L3: 三级 pill（仅当选中的 L2 有子项时显示） ──
    if (effectiveL3.length > 0) {
      html += '<div class="me-cat-l3-section">';
      html += `<div class="me-cat-section-label">${this._escapeHtml(effectiveL2Col?.name || '')}</div>`;
      html += '<div class="me-cat-l3-pills">';
      for (const gc of effectiveL3) {
        const gcId = gc.id || '';
        const gcName = gc.name || gcId;
        const isActive = gcId === activeId;
        html += `<button class="me-cat-l3-pill${isActive ? ' active' : ''}" data-id="${this._escapeHtml(gcId)}">${this._escapeHtml(gcName)}</button>`;
      }
      html += '</div>';
      html += '</div>';
    }

    // ── 用户主题 ──
    const topicTabs = Array.from(
      document.querySelectorAll('#topicSubTabs .sub-tab.topic-tab')
    ).filter(tab => !this._isTabHiddenByUser(tab));

    html += '<div class="me-cat-section-label" style="margin-top:4px;">我的主题</div>';
    if (topicTabs.length > 0) {
      html += '<div class="me-cat-l3-pills">';
      topicTabs.forEach(tab => {
        const id = tab.dataset.category || '';
        const name = tab.textContent?.replace(/[☰]/g, '').replace(/NEW/g, '').trim() || id;
        const isActive = id === activeId;
        html += `<button class="me-cat-l3-pill${isActive ? ' active' : ''}" data-id="${this._escapeHtml(id)}">${this._escapeHtml(name)}</button>`;
      });
      html += '</div>';
    } else {
      html += '<div class="me-category-empty">暂无自建主题</div>';
    }
    html += '<div class="me-category-new-topic" data-action="new-topic">+ 新建主题</div>';

    this._categoryPanel.innerHTML = html;

    // ── 事件绑定 ──

    // 关闭
    this._categoryPanel.querySelector('.me-category-close')
      ?.addEventListener('click', () => this._closeCategoryPanel());

    // L1 pill 点击
    this._categoryPanel.querySelectorAll('.me-cat-l1-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const colId = pill.dataset.id;
        const hasChildren = pill.dataset.hasChildren === 'true';
        console.log('[MobileEnhance] L1 click:', colId, 'hasChildren:', hasChildren, 'raw:', pill.dataset.hasChildren);

        // 登录检查
        if (pill.dataset.requireLogin === 'true') {
          try {
            const isLoggedIn = window.TR?.authState?.isLoggedIn?.() || window.authState?.isLoggedIn?.();
            if (!isLoggedIn) {
              self._closeCategoryPanel();
              if (typeof window.openLoginModal === 'function') window.openLoginModal();
              return;
            }
          } catch (e) { /* ignore */ }
        }

        if (!hasChildren) {
          // 叶子节点 → 直接跳转
          self._navTo(colId);
          return;
        }

        // 有子项 → 更新选中的 L1，重置 L2
        self._catState.selL1 = colId;
        self._catState.selL2 = null;
        self._renderAllLevels();

        // 滚动 L1 行让选中项可见
        requestAnimationFrame(() => {
          const activeL1 = self._categoryPanel.querySelector('.me-cat-l1-pill.active');
          if (activeL1) activeL1.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
        });
      });
    });

    // L2 item 点击
    this._categoryPanel.querySelectorAll('.me-cat-l2-item').forEach(item => {
      item.addEventListener('click', () => {
        const chId = item.dataset.id;
        const hasChildren = item.dataset.hasChildren === 'true';

        if (!hasChildren) {
          // 叶子节点 → 直接跳转
          self._navTo(chId);
          return;
        }

        // 有三级 → 更新选中的 L2，重新渲染
        self._catState.selL2 = chId;
        self._renderAllLevels();
      });
    });

    // L3 pill 点击 → 直接跳转
    this._categoryPanel.querySelectorAll('.me-cat-l3-pill').forEach(pill => {
      pill.addEventListener('click', () => self._navTo(pill.dataset.id));
    });

    // 新建主题
    this._categoryPanel.querySelector('.me-category-new-topic')
      ?.addEventListener('click', () => {
        this._closeCategoryPanel();
        if (window.TopicTracker && typeof window.TopicTracker.openModal === 'function') {
          window.TopicTracker.openModal();
        }
      });

    // 滚动 L1 行让选中项可见
    requestAnimationFrame(() => {
      const activeL1 = this._categoryPanel.querySelector('.me-cat-l1-pill.active');
      if (activeL1) activeL1.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
  },

  /** 跳转到指定 tab 并关闭面板 */
  _navTo(categoryId) {
    console.log('[MobileEnhance] _navTo called with:', categoryId);
    if (!categoryId) return;
    this._closeCategoryPanel();
    try {
      if (typeof window.switchTab === 'function') {
        window.switchTab(categoryId);
      } else if (window.TR?.tabs?.switchTab) {
        window.TR.tabs.switchTab(categoryId);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      console.error('[MobileEnhance] switchTab 失败:', e);
    }
  },

  /** 降级渲染：_columnConfig 未就绪时从 DOM 读取 */
  _renderCategoryItemsFallback(activeId) {
    const systemTabs = Array.from(
      document.querySelectorAll('#homeSubTabs .sub-tab[data-category]')
    ).filter(tab => !this._isTabHiddenByUser(tab));

    const activeTab = document.querySelector(`.sub-tab[data-category="${activeId}"]`);
    const activeName = activeTab?.textContent?.replace(/[☰]/g, '').replace(/NEW/g, '').trim() || activeId;

    let html = `
      <div class="me-category-header">
        <span class="me-category-header-title">当前：${this._escapeHtml(activeName)}</span>
        <button class="me-category-close" aria-label="关闭">✕</button>
      </div>
      <div class="me-category-section-title">分类</div>
      <div class="me-category-grid">
    `;
    systemTabs.forEach(tab => {
      const id = tab.dataset.category || '';
      const name = tab.textContent?.replace(/[☰]/g, '').replace(/NEW/g, '').trim() || id;
      html += `<div class="me-category-item${id === activeId ? ' active' : ''}" data-category="${this._escapeHtml(id)}">${this._escapeHtml(name)}</div>`;
    });
    html += '</div>';
    this._categoryPanel.innerHTML = html;

    this._categoryPanel.querySelector('.me-category-close')
      ?.addEventListener('click', () => this._closeCategoryPanel());
    this._categoryPanel.querySelectorAll('.me-category-item').forEach(item => {
      item.addEventListener('click', () => this._navTo(item.dataset.category));
    });
  },

  /** 判断 tab 是否被用户隐藏（而非被移动端 CSS 隐藏） */
  _isTabHiddenByUser(tab) {
    // 检查 inline style
    if (tab.style.display === 'none') return true;
    // 检查 early-hide-categories 样式表中是否隐藏了该分类
    const earlyHideStyle = document.getElementById('early-hide-categories');
    if (earlyHideStyle && earlyHideStyle.textContent) {
      const catId = tab.dataset.category || '';
      if (earlyHideStyle.textContent.includes(`[data-category="${catId}"]`)) return true;
    }
    return false;
  },

  /** HTML 转义 */
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },


  // ========== 10. 初始化入口 ==========

  init() {
    // 守卫：非移动端不初始化
    if (!this._isMobileNarrowScreen()) {
      console.log('[MobileEnhance] 非移动端，跳过初始化');
      return;
    }

    console.log('[MobileEnhance] 初始化移动端增强...');

    try { this._createBottomNav(); } catch (e) { console.error('[MobileEnhance] BottomNav 初始化失败:', e); }
    try { this._createSettingsMenu(); } catch (e) { console.error('[MobileEnhance] SettingsMenu 初始化失败:', e); }
    try { this._overrideTitleClick(); } catch (e) { console.error('[MobileEnhance] TitleClick 覆盖失败:', e); }
    try { this._initPullToRefresh(); } catch (e) { console.error('[MobileEnhance] PullToRefresh 初始化失败:', e); }
    // BoundarySwipe — 边界滑动切换分类（使用 _columnConfig 叶子节点顺序）
    try { this._initBoundarySwipe(); } catch (e) { console.error('[MobileEnhance] BoundarySwipe 初始化失败:', e); }
    try { this._createBackToTop(); } catch (e) { console.error('[MobileEnhance] BackToTop 初始化失败:', e); }
    try { this._createActionSheet(); } catch (e) { console.error('[MobileEnhance] ActionSheet 初始化失败:', e); }
    try { this._interceptContextMenu(); } catch (e) { console.error('[MobileEnhance] ContextMenu 拦截失败:', e); }
    try { this._createSearchOverlay(); } catch (e) { console.error('[MobileEnhance] SearchOverlay 初始化失败:', e); }
    try { this._createCategoryPanel(); } catch (e) { console.error('[MobileEnhance] CategoryPanel 初始化失败:', e); }

    console.log('[MobileEnhance] 初始化完成');
  }
};

// ========== 自动初始化 ==========
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => MobileEnhance.init());
} else {
  // DOM 已就绪
  MobileEnhance.init();
}

// 暴露到全局（方便调试）
window.MobileEnhance = MobileEnhance;
