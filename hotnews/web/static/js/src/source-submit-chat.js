/**
 * source-submit-chat.js
 * 用户投稿 URL 聊天窗口组件
 *
 * 使用方式：在页面底部引入此脚本即可，无需其他依赖。
 * 它会自动在右下角注入「💡 推荐网站」悬浮按钮 + 聊天面板。
 */
(function () {
  'use strict';

  // ─── 状态机 ──────────────────────────────────────────────────────────────
  const STATE = {
    IDLE: 'idle',
    SUBMITTING: 'submitting',
    DONE: 'done',
  };

  let _state = STATE.IDLE;
  let _panel = null;
  let _inputEl = null;
  let _messagesEl = null;
  let _submitBtn = null;

  // ─── 样式注入 ─────────────────────────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('hn-submit-styles')) return;
    const style = document.createElement('style');
    style.id = 'hn-submit-styles';
    style.textContent = `
      #hn-submit-fab {
        position: fixed; bottom: 24px; right: 24px; z-index: 9999;
        height: 52px; padding: 0 20px; border-radius: 26px;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: #fff; border: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 15px; font-weight: 600; letter-spacing: 0.5px;
        cursor: pointer; box-shadow: 0 4px 15px rgba(99,102,241,.35);
        display: flex; align-items: center; justify-content: center; gap: 8px;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        -webkit-tap-highlight-color: transparent;
      }
      #hn-submit-fab:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 25px rgba(99,102,241,.5);
        background: linear-gradient(135deg, #2563eb, #7c3aed);
      }
      #hn-submit-fab:active { transform: translateY(0) scale(0.96); }
      #hn-submit-fab svg { width: 22px; height: 22px; }
      @media (max-width: 480px) {
        #hn-submit-fab { padding: 0; width: 52px; border-radius: 50%; }
        #hn-submit-fab .hn-fab-text { display: none; }
      }
      #hn-submit-panel {
        position: fixed; bottom: 88px; right: 24px; z-index: 9998;
        width: 340px; max-height: 480px;
        background: #fff; border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,.15);
        display: flex; flex-direction: column; overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px; color: #1f2937;
        transform: translateY(12px) scale(.97); opacity: 0;
        pointer-events: none;
        transition: transform .22s cubic-bezier(.34,1.56,.64,1), opacity .18s;
      }
      #hn-submit-panel.open {
        transform: translateY(0) scale(1); opacity: 1; pointer-events: auto;
      }
      .hn-panel-header {
        padding: 14px 16px 10px; font-weight: 600; font-size: 15px;
        border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; gap: 8px;
      }
      .hn-panel-header span { flex: 1; }
      .hn-close-btn {
        background: none; border: none; cursor: pointer; color: #9ca3af;
        font-size: 18px; padding: 0 2px; line-height: 1;
      }
      .hn-close-btn:hover { color: #374151; }
      .hn-messages {
        flex: 1; overflow-y: auto; padding: 12px 14px; display: flex;
        flex-direction: column; gap: 10px; min-height: 160px; max-height: 280px;
      }
      .hn-bubble {
        padding: 10px 13px; border-radius: 12px; line-height: 1.55;
        max-width: 92%; word-break: break-word;
      }
      .hn-bubble.bot {
        background: #f3f4f6; align-self: flex-start; border-bottom-left-radius: 4px;
      }
      .hn-bubble.user {
        background: #2563eb; color: #fff; align-self: flex-end;
        border-bottom-right-radius: 4px;
      }
      .hn-bubble .hn-step { display: block; margin-bottom: 3px; }
      .hn-bubble .hn-step.ok::before { content: '✅ '; }
      .hn-bubble .hn-step.fail::before { content: '❌ '; }
      .hn-bubble .hn-step.loading::before { content: '🔍 '; }
      .hn-bubble .hn-result { margin-top: 8px; padding: 8px 10px; background: #fff;
        border-radius: 8px; border: 1px solid #e5e7eb; font-size: 13px; }
      .hn-bubble .hn-result strong { display: block; margin-bottom: 2px; color: #1f2937; }
      .hn-bubble .hn-result small { color: #6b7280; }
      .hn-bubble .hn-actions { margin-top: 10px; display: flex; gap: 8px; }
      .hn-bubble .hn-actions button {
        padding: 5px 12px; border-radius: 8px; border: 1px solid #e5e7eb;
        background: #fff; cursor: pointer; font-size: 12px; color: #374151;
        transition: background .15s;
      }
      .hn-bubble .hn-actions button:hover { background: #f9fafb; }
      .hn-input-row {
        padding: 10px 12px; border-top: 1px solid #f3f4f6;
        display: flex; gap: 8px; align-items: center;
      }
      .hn-input-row input {
        flex: 1; border: 1px solid #d1d5db; border-radius: 8px;
        padding: 8px 10px; font-size: 13px; outline: none;
        transition: border-color .15s;
      }
      .hn-input-row input:focus { border-color: #2563eb; }
      .hn-input-row input:disabled { background: #f9fafb; color: #9ca3af; }
      .hn-input-row button {
        padding: 8px 14px; border-radius: 8px; background: #2563eb;
        color: #fff; border: none; cursor: pointer; font-size: 13px;
        font-weight: 500; transition: background .15s; white-space: nowrap;
      }
      .hn-input-row button:hover:not(:disabled) { background: #1d4ed8; }
      .hn-input-row button:disabled { background: #93c5fd; cursor: default; }
      @media (max-width: 480px) {
        #hn-submit-panel { width: calc(100vw - 24px); right: 12px; bottom: 80px; }
        #hn-submit-fab { bottom: 16px; right: 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  // ─── DOM 构建 ─────────────────────────────────────────────────────────────
  function _buildUI() {
    // FAB 按钮
    const fab = document.createElement('button');
    fab.id = 'hn-submit-fab';
    fab.title = '推荐网站';
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      <span class="hn-fab-text">推荐内容</span>
    `;
    fab.addEventListener('click', _togglePanel);
    document.body.appendChild(fab);

    // 聊天面板
    const panel = document.createElement('div');
    panel.id = 'hn-submit-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', '推荐网站');
    panel.innerHTML = `
      <div class="hn-panel-header">
        <span>💡 推荐新内容源</span>
        <button class="hn-close-btn" aria-label="关闭" title="关闭">×</button>
      </div>
      <div class="hn-messages" aria-live="polite"></div>
      <div class="hn-input-row">
        <input type="url" placeholder="粘贴网站地址，如 https://example.com" autocomplete="off" />
        <button>提交</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('.hn-close-btn').addEventListener('click', _closePanel);
    _inputEl = panel.querySelector('input');
    _submitBtn = panel.querySelector('.hn-input-row button');
    _messagesEl = panel.querySelector('.hn-messages');
    _panel = panel;

    _inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) _handleSubmit();
    });
    _submitBtn.addEventListener('click', _handleSubmit);

    // 粘贴自动 trim
    _inputEl.addEventListener('paste', (e) => {
      setTimeout(() => { _inputEl.value = _inputEl.value.trim(); }, 0);
    });

    // 初始欢迎消息
    _addBotBubble(
      '把你发现的好网站分享给大家吧！<br>支持任何有 RSS 的新闻或博客网站 📰'
    );
  }

  // ─── 面板控制 ─────────────────────────────────────────────────────────────
  function _togglePanel() {
    _panel.classList.toggle('open');
    if (_panel.classList.contains('open')) {
      _inputEl.focus();
    }
  }
  function _closePanel() { _panel.classList.remove('open'); }

  // ─── 消息气泡 ─────────────────────────────────────────────────────────────
  function _addBubble(html, type) {
    const el = document.createElement('div');
    el.className = `hn-bubble ${type}`;
    el.innerHTML = html;
    _messagesEl.appendChild(el);
    _messagesEl.scrollTop = _messagesEl.scrollHeight;
    return el;
  }
  function _addBotBubble(html) { return _addBubble(html, 'bot'); }
  function _addUserBubble(text) { return _addBubble(_esc(text), 'user'); }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─── 提交逻辑 ─────────────────────────────────────────────────────────────
  async function _handleSubmit() {
    if (_state === STATE.SUBMITTING) return;

    let url = (_inputEl.value || '').trim();
    if (!url) { _inputEl.focus(); return; }

    // 自动补全 https://
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    _addUserBubble(url);
    _inputEl.value = '';
    _setState(STATE.SUBMITTING);

    // 进度气泡（逐步更新）
    const progressBubble = _addBotBubble(
      '<span class="hn-step loading">正在检测…</span>'
    );

    function _appendStep(cls, text) {
      const span = document.createElement('span');
      span.className = `hn-step ${cls}`;
      span.textContent = text;
      progressBubble.appendChild(span);
      _messagesEl.scrollTop = _messagesEl.scrollHeight;
    }

    // 超时保护
    const timeoutId = setTimeout(() => {
      if (_state !== STATE.SUBMITTING) return;
      progressBubble.innerHTML += `<span class="hn-step fail">检测超时</span>`;
      const bubble = _addBotBubble(
        '检测超时了 😅 网站响应较慢，请稍后再试。' +
        '<div class="hn-actions"><button class="hn-retry-btn">重试</button><button class="hn-close-action-btn">关闭</button></div>'
      );
      _bindActions(bubble, url);
      _setState(STATE.DONE);
    }, 30000);

    try {
      // 前端简单格式校验
      new URL(url); // 会抛出异常如果格式不对
      _appendStep('ok', '地址格式正确');

      const resp = await fetch('/api/submit/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      clearTimeout(timeoutId);

      const data = await resp.json();
      _renderResult(data, progressBubble);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof TypeError && err.message.includes('URL')) {
        progressBubble.innerHTML = '<span class="hn-step fail">地址格式不正确，请检查后重试</span>';
      } else {
        progressBubble.innerHTML += `<span class="hn-step fail">网络错误，请重试</span>`;
      }
      const errBubble = _addBotBubble(
        '出错了，请检查网络后重试。' +
        '<div class="hn-actions"><button class="hn-retry-btn">重试</button><button class="hn-close-action-btn">关闭</button></div>'
      );
      _bindActions(errBubble, url);
      _setState(STATE.DONE);
    }
  }

  function _renderResult(data, progressBubble) {
    const { ok, status, result, message } = data;

    if (ok && status === 'detecting') {
      progressBubble.innerHTML =
        '<span class="hn-step ok">格式校验通过</span>' +
        '<span class="hn-step ok">提交请求成功</span>';

      const resultBubble = _addBotBubble(
        `您的提交已收录，审核后会显示在订阅列表中，感谢您的推荐！👏
        <div class="hn-actions">
          <button class="hn-again-btn">再推荐一个</button>
          <button class="hn-close-action-btn">关闭</button>
        </div>`
      );
      _bindActions(resultBubble, null);

    } else if (ok && status === 'submitted') {
      // Legacy support just in case
      progressBubble.innerHTML =
        '<span class="hn-step ok">安全检测通过</span>' +
        '<span class="hn-step ok">订阅源发现成功</span>' +
        (result.needs_proxy ? '<span class="hn-step ok">（服务器需走代理，已自动配置）</span>' : '');

      const resultBubble = _addBotBubble(
        `发现了！📡<br>
        <div class="hn-result">
          <strong>📡 ${_esc(result.feed_title || result.host)}</strong>
          <small>${_esc(result.feed_url)}</small><br>
          <small>包含 ${result.item_count} 条内容</small>
        </div>
        已成功提交审核 ✓<br>我们将评估该站点是否符合高质量资讯标准，感谢你的推荐。👏
        <div class="hn-actions">
          <button class="hn-again-btn">再推荐一个</button>
          <button class="hn-close-action-btn">关闭</button>
        </div>`
      );
      _bindActions(resultBubble, null);

    } else if (status === 'already_exists') {
      progressBubble.innerHTML = '<span class="hn-step ok">安全检测通过</span>';
      const b = _addBotBubble(
        `${_esc(message)} 🎉<br>
        <div class="hn-actions"><button class="hn-again-btn">换一个试试</button><button class="hn-close-action-btn">关闭</button></div>`
      );
      _bindActions(b, null);

    } else if (status === 'no_rss') {
      progressBubble.innerHTML = '<span class="hn-step ok">安全检测通过</span><span class="hn-step fail">未找到订阅源</span>';
      const b = _addBotBubble(
        `抱歉，这个网站暂时无法收录。<br><small>${_esc(message)}</small>
        <div class="hn-actions"><button class="hn-again-btn">换一个试试</button><button class="hn-close-action-btn">关闭</button></div>`
      );
      _bindActions(b, null);

    } else if (status === 'rejected') {
      progressBubble.innerHTML = `<span class="hn-step fail">${_esc(message)}</span>`;
      const b = _addBotBubble(
        `这个网站无法提交。<br><small>${_esc(message)}</small>
        <div class="hn-actions"><button class="hn-again-btn">换一个试试</button><button class="hn-close-action-btn">关闭</button></div>`
      );
      _bindActions(b, null);

    } else if (status === 'rate_limited' || status === 'pending_duplicate') {
      progressBubble.innerHTML = `<span class="hn-step fail">${_esc(message)}</span>`;
      const b = _addBotBubble(
        `${_esc(message)}
        <div class="hn-actions"><button class="hn-close-action-btn">关闭</button></div>`
      );
      _bindActions(b, null);

    } else {
      progressBubble.innerHTML += `<span class="hn-step fail">${_esc(message || '未知错误')}</span>`;
      const b = _addBotBubble(
        `出了点问题：${_esc(message || '请稍后重试')}
        <div class="hn-actions"><button class="hn-again-btn">重试</button><button class="hn-close-action-btn">关闭</button></div>`
      );
      _bindActions(b, null);
    }

    _setState(STATE.DONE);
  }

  function _bindActions(bubble, retryUrl) {
    const againBtn = bubble.querySelector('.hn-again-btn');
    const retryBtn = bubble.querySelector('.hn-retry-btn');
    const closeBtn = bubble.querySelector('.hn-close-action-btn');

    if (againBtn) againBtn.addEventListener('click', () => {
      _setState(STATE.IDLE);
      _inputEl.focus();
    });
    if (retryBtn) retryBtn.addEventListener('click', () => {
      _setState(STATE.IDLE);
      if (retryUrl) _inputEl.value = retryUrl;
      _inputEl.focus();
    });
    if (closeBtn) closeBtn.addEventListener('click', _closePanel);
  }

  function _setState(s) {
    _state = s;
    const busy = s === STATE.SUBMITTING;
    _inputEl.disabled = busy;
    _submitBtn.disabled = busy;
    _submitBtn.textContent = busy ? '检测中…' : '提交';
  }

  // ─── 初始化 ───────────────────────────────────────────────────────────────
  function init() {
    _injectStyles();
    _buildUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
