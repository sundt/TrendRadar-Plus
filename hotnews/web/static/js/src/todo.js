/**
 * Todo Module - 用户待办事项管理
 * 需要登录才能使用
 */

import { authState } from './auth-state.js';
import { openLoginModal } from './login-modal.js';
import { preferences } from './preferences.js';

// ============ 状态 ============
let todos = [];
let todoShowAll = false;
let todoSidebarOpen = false;
let todoPanelOpen = false;
let currentPanelGroupId = null;

// ============ 登录检查 ============
function requireLogin() {
    const user = authState.getUser();
    if (!user) {
        openLoginModal();
        return false;
    }
    return true;
}

// ============ 后端 API 交互 ============
async function fetchTodos(groupId = null) {
    let url = '/api/user/todos';
    if (groupId) {
        url += `?group_id=${encodeURIComponent(groupId)}`;
    }
    const res = await fetch(url);
    if (!res.ok) {
        if (res.status === 401) return [];
        throw new Error('获取 Todo 失败');
    }
    const data = await res.json();
    return data.todos || [];
}

async function createTodoApi(todo) {
    const res = await fetch('/api/user/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(todo)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '添加失败');
    }
    return await res.json();
}

async function updateTodoApi(id, data) {
    const res = await fetch(`/api/user/todos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '更新失败');
    }
    return await res.json();
}

async function deleteTodoApi(id) {
    const res = await fetch(`/api/user/todos/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '删除失败');
    }
    return await res.json();
}

async function batchCreateTodosApi(todosData) {
    const res = await fetch('/api/user/todos/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todos: todosData })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || '批量添加失败');
    }
    return await res.json();
}

// ============ 公共数据管理接口 ============
async function loadTodos() {
    if (!requireLogin()) return [];
    try {
        todos = await fetchTodos();
        updateTodoBadge();
        return todos;
    } catch (e) {
        console.error('[Todo] Load error:', e);
        return [];
    }
}

async function addTodo(text, source) {
    if (!requireLogin()) return null;
    try {
        const result = await createTodoApi({
            text,
            group_id: source.groupId,
            group_title: source.groupTitle,
            group_url: source.groupUrl || '',
            is_custom_group: source.isCustom || false
        });
        if (result.ok && result.todo) {
            todos.unshift(result.todo);
            updateTodoBadge();
            showTodoToast('已添加到 Todo');
            return result.todo;
        }
    } catch (e) {
        if (e.message.includes('已存在')) {
            showTodoToast('该 Todo 已存在');
        } else {
            showTodoToast('添加失败: ' + e.message);
        }
        console.error('[Todo] Add error:', e);
    }
    return null;
}

async function toggleTodo(id) {
    if (!requireLogin()) return;
    const todo = todos.find(t => t.id === id);
    if (!todo) return;
    
    const newDone = !todo.done;
    try {
        await updateTodoApi(id, { done: newDone });
        todo.done = newDone;
        renderTodoSidebar();
        renderTodoPanel();
        updateTodoBadge();
    } catch (e) {
        console.error('[Todo] Toggle error:', e);
        showTodoToast('更新失败');
    }
}

async function deleteTodo(id) {
    if (!requireLogin()) return;
    try {
        await deleteTodoApi(id);
        todos = todos.filter(t => t.id !== id);
        renderTodoSidebar();
        renderTodoPanel();
        updateTodoBadge();
        showTodoToast('已删除');
    } catch (e) {
        console.error('[Todo] Delete error:', e);
        showTodoToast('删除失败');
    }
}

async function batchAddTodos(items, source) {
    if (!requireLogin()) return null;
    const todosData = items.map(text => ({
        text,
        group_id: source.groupId,
        group_title: source.groupTitle,
        group_url: source.groupUrl || '',
        is_custom_group: source.isCustom || false
    }));
    
    try {
        const result = await batchCreateTodosApi(todosData);
        if (result.ok) {
            // Add new todos to local state
            if (result.added && result.added.length > 0) {
                todos = [...result.added, ...todos];
                updateTodoBadge();
            }
            const msg = result.skipped_count > 0 
                ? `已添加 ${result.added_count} 项，${result.skipped_count} 项已存在`
                : `已添加 ${result.added_count} 项到 Todo`;
            showTodoToast(msg);
            return result;
        }
    } catch (e) {
        console.error('[Todo] Batch add error:', e);
        showTodoToast('批量添加失败');
    }
    return null;
}

function getTodosByGroupId(groupId) {
    return todos.filter(t => t.source.groupId === groupId);
}

function getUnfinishedCount() {
    return todos.filter(t => !t.done).length;
}

function groupTodosByGroup() {
    const groups = {};
    for (const todo of todos) {
        const gid = todo.source.groupId;
        if (!groups[gid]) {
            groups[gid] = {
                groupId: gid,
                groupTitle: todo.source.groupTitle,
                groupUrl: todo.source.groupUrl,
                isCustom: todo.source.isCustom,
                todos: []
            };
        }
        groups[gid].todos.push(todo);
    }
    return Object.values(groups);
}

// ============ UI 工具函数 ============
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showTodoToast(message) {
    // 使用全局 toast 或创建简单提示
    if (window.showToast) {
        window.showToast(message);
    } else {
        const toast = document.createElement('div');
        toast.className = 'todo-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
}

function updateTodoBadge() {
    const badge = document.getElementById('todoBadge');
    if (!badge) return;
    
    const count = getUnfinishedCount();
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.add('show');
    } else {
        badge.classList.remove('show');
    }
}


// ============ 首页侧边栏 ============
const TODO_SIDEBAR_WIDTH_KEY = 'todo_sidebar_width';
const TODO_SIDEBAR_MIN_WIDTH = 320;
const TODO_SIDEBAR_MAX_WIDTH = 800;
const TODO_SIDEBAR_DEFAULT_WIDTH = 420;

function ensureTodoSidebarExists() {
    if (document.getElementById('todoSidebar')) return;
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'todoSidebarBackdrop';
    backdrop.className = 'todo-sidebar-backdrop';
    document.body.appendChild(backdrop);
    
    // Create sidebar
    const html = `
        <div id="todoSidebar" class="todo-sidebar">
            <div class="todo-resize-handle" id="todoResizeHandle"></div>
            <div class="todo-sidebar-header">
                <span class="todo-sidebar-title">📋 我的 Todo</span>
                <div class="todo-sidebar-actions">
                    <button class="todo-filter-btn" id="todoFilterBtn">只看未完成</button>
                    <button class="todo-close-btn" title="关闭">✕</button>
                </div>
            </div>
            <div class="todo-new-group">
                <button class="todo-new-group-btn" id="todoNewGroupBtn">+ 新建标题</button>
            </div>
            <div class="todo-sidebar-body" id="todoSidebarBody">
                <div class="todo-empty">暂无 Todo</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    
    // Restore saved width
    const savedWidth = localStorage.getItem(TODO_SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
        const sidebar = document.getElementById('todoSidebar');
        sidebar.style.width = savedWidth + 'px';
    }
    
    // Bind events
    const sidebar = document.getElementById('todoSidebar');
    const closeBtn = sidebar.querySelector('.todo-close-btn');
    const filterBtn = document.getElementById('todoFilterBtn');
    const newGroupBtn = document.getElementById('todoNewGroupBtn');
    
    backdrop.addEventListener('click', closeTodoSidebar);
    closeBtn.addEventListener('click', closeTodoSidebar);
    filterBtn.addEventListener('click', toggleTodoFilter);
    newGroupBtn.addEventListener('click', showNewGroupInput);
    
    // Setup resize
    setupTodoResize();
}

function setupTodoResize() {
    const sidebar = document.getElementById('todoSidebar');
    const handle = document.getElementById('todoResizeHandle');
    if (!sidebar || !handle) return;
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        sidebar.classList.add('resizing');
        handle.classList.add('active');
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const delta = startX - e.clientX;
        let newWidth = startWidth + delta;
        newWidth = Math.max(TODO_SIDEBAR_MIN_WIDTH, Math.min(TODO_SIDEBAR_MAX_WIDTH, newWidth));
        sidebar.style.width = newWidth + 'px';
    });
    
    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        sidebar.classList.remove('resizing');
        handle.classList.remove('active');
        // Save to localStorage and server (if logged in)
        localStorage.setItem(TODO_SIDEBAR_WIDTH_KEY, sidebar.offsetWidth);
        preferences.saveSidebarWidths({ todo_width: sidebar.offsetWidth });
    });
}

function openTodoSidebar() {
    if (!requireLogin()) return;
    
    ensureTodoSidebarExists();
    const sidebar = document.getElementById('todoSidebar');
    const backdrop = document.getElementById('todoSidebarBackdrop');
    
    sidebar.classList.add('open');
    backdrop.classList.add('show');
    todoSidebarOpen = true;
    
    // Load and render
    loadTodos().then(() => renderTodoSidebar());
}

function closeTodoSidebar() {
    const sidebar = document.getElementById('todoSidebar');
    const backdrop = document.getElementById('todoSidebarBackdrop');
    
    if (sidebar) {
        sidebar.classList.remove('open');
    }
    if (backdrop) {
        backdrop.classList.remove('show');
    }
    todoSidebarOpen = false;
}

function toggleTodoFilter() {
    todoShowAll = !todoShowAll;
    const btn = document.getElementById('todoFilterBtn');
    if (btn) {
        btn.textContent = todoShowAll ? '只看未完成' : '显示全部';
    }
    renderTodoSidebar();
}

function showNewGroupInput() {
    const container = document.getElementById('todoSidebarBody');
    if (!container) return;
    
    // Check if input already exists
    if (container.querySelector('.todo-new-group-input')) return;
    
    const inputHtml = `
        <div class="todo-new-group-input">
            <input type="text" placeholder="输入新标题名称..." class="todo-group-name-input" autofocus>
            <button class="todo-group-create-btn">创建</button>
            <button class="todo-group-cancel-btn">取消</button>
        </div>
    `;
    container.insertAdjacentHTML('afterbegin', inputHtml);
    
    const inputEl = container.querySelector('.todo-group-name-input');
    const createBtn = container.querySelector('.todo-group-create-btn');
    const cancelBtn = container.querySelector('.todo-group-cancel-btn');
    
    inputEl.focus();
    
    const createGroup = () => {
        const title = inputEl.value.trim();
        if (!title) {
            showTodoToast('请输入标题名称');
            return;
        }
        // Create custom group with a placeholder todo
        const groupId = `custom_${Date.now()}`;
        showAddTodoInput(groupId, title, '', true);
        container.querySelector('.todo-new-group-input')?.remove();
    };
    
    createBtn.addEventListener('click', createGroup);
    cancelBtn.addEventListener('click', () => {
        container.querySelector('.todo-new-group-input')?.remove();
    });
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createGroup();
        if (e.key === 'Escape') container.querySelector('.todo-new-group-input')?.remove();
    });
}

function showAddTodoInput(groupId, groupTitle, groupUrl, isCustom) {
    const container = document.getElementById('todoSidebarBody');
    if (!container) return;
    
    // Find or create group section
    let groupEl = container.querySelector(`.todo-group[data-group-id="${groupId}"]`);
    if (!groupEl) {
        // Create new group section - 展开新创建的组
        const collapsed = getCollapsedGroups();
        collapsed[groupId] = false;
        saveCollapsedGroups(collapsed);
        
        const groupHtml = `
            <div class="todo-group" data-group-id="${escapeHtml(groupId)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">▼</span>
                    <span class="todo-group-title" title="${escapeHtml(groupTitle)}">${escapeHtml(groupTitle)}</span>
                    <span class="todo-group-count">0/0</span>
                    <button class="todo-group-add-btn" title="添加 Todo">+</button>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner"></div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('afterbegin', groupHtml);
        groupEl = container.querySelector(`.todo-group[data-group-id="${groupId}"]`);
        
        // Bind events for new group
        const addBtn = groupEl.querySelector('.todo-group-add-btn');
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showAddTodoInput(groupId, groupTitle, groupUrl, isCustom);
        });
        
        const header = groupEl.querySelector('.todo-group-header');
        header?.addEventListener('click', (e) => {
            if (e.target.closest('.todo-group-add-btn')) return;
            toggleGroupCollapse(groupId);
        });
    } else {
        // 展开已有的组
        groupEl.classList.remove('collapsed');
        const collapsed = getCollapsedGroups();
        collapsed[groupId] = false;
        saveCollapsedGroups(collapsed);
    }
    
    const itemsEl = groupEl.querySelector('.todo-group-items-inner');
    if (!itemsEl) return;
    
    // Check if input already exists
    if (itemsEl.querySelector('.todo-add-input')) return;
    
    const inputHtml = `
        <div class="todo-add-input">
            <input type="text" placeholder="输入 Todo 内容..." class="todo-text-input" autofocus>
            <button class="todo-add-confirm-btn">添加</button>
        </div>
    `;
    itemsEl.insertAdjacentHTML('afterbegin', inputHtml);
    
    const inputEl = itemsEl.querySelector('.todo-text-input');
    const confirmBtn = itemsEl.querySelector('.todo-add-confirm-btn');
    
    inputEl.focus();
    
    const doAdd = async () => {
        const text = inputEl.value.trim();
        if (!text) {
            showTodoToast('请输入 Todo 内容');
            return;
        }
        const result = await addTodo(text, {
            groupId,
            groupTitle,
            groupUrl: groupUrl || '',
            isCustom: isCustom || false
        });
        if (result) {
            inputEl.value = '';
            renderTodoSidebar();
        }
    };
    
    confirmBtn.addEventListener('click', doAdd);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doAdd();
        if (e.key === 'Escape') itemsEl.querySelector('.todo-add-input')?.remove();
    });
}

function renderTodoSidebar() {
    const container = document.getElementById('todoSidebarBody');
    if (!container) return;
    
    const filtered = todoShowAll ? todos : todos.filter(t => !t.done);
    
    if (filtered.length === 0) {
        container.innerHTML = '<div class="todo-empty">暂无 Todo</div>';
        return;
    }
    
    const groups = groupTodosByGroup();
    
    let html = '';
    for (const group of groups) {
        const groupTodos = todoShowAll ? group.todos : group.todos.filter(t => !t.done);
        if (groupTodos.length === 0 && !todoShowAll) continue;
        
        const unfinishedCount = group.todos.filter(t => !t.done).length;
        const totalCount = group.todos.length;
        const isCollapsed = isGroupCollapsed(group.groupId);
        const isCustomGroup = group.isCustom;
        
        // 只有非自定义分组才显示查看总结按钮
        const summaryBtn = !isCustomGroup ? `
            <button class="todo-group-summary-btn" title="查看总结" data-group-id="${escapeHtml(group.groupId)}" data-group-title="${escapeHtml(group.groupTitle)}" data-group-url="${escapeHtml(group.groupUrl || '')}">✨</button>
        ` : '';
        
        // 链接按钮 - 有 URL 时显示
        const linkBtn = group.groupUrl ? `
            <a href="${escapeHtml(group.groupUrl)}" target="_blank" rel="noopener noreferrer" class="todo-group-link-btn" title="查看原文" onclick="event.stopPropagation()">🔗</a>
        ` : '';
        
        html += `
            <div class="todo-group ${isCollapsed ? 'collapsed' : ''}" data-group-id="${escapeHtml(group.groupId)}">
                <div class="todo-group-header">
                    <span class="todo-group-toggle">▼</span>
                    <span class="todo-group-title" title="${escapeHtml(group.groupTitle)}">${escapeHtml(group.groupTitle)}</span>
                    <span class="todo-group-count">${unfinishedCount}/${totalCount}</span>
                    <div class="todo-group-actions">
                        ${linkBtn}
                        ${summaryBtn}
                        <button class="todo-group-add-btn" title="添加 Todo">+</button>
                    </div>
                </div>
                <div class="todo-group-items">
                    <div class="todo-group-items-inner">
                        ${groupTodos.map(todo => renderTodoItem(todo)).join('')}
                    </div>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // Bind events
    container.querySelectorAll('.todo-group').forEach(groupEl => {
        const groupId = groupEl.dataset.groupId;
        const group = groups.find(g => g.groupId === groupId);
        if (!group) return;
        
        const addBtn = groupEl.querySelector('.todo-group-add-btn');
        addBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            showAddTodoInput(groupId, group.groupTitle, group.groupUrl, group.isCustom);
        });
        
        // Summary button - open summary modal
        const summaryBtn = groupEl.querySelector('.todo-group-summary-btn');
        summaryBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            openSummaryFromTodo(group.groupId, group.groupTitle, group.groupUrl);
        });
        
        // Toggle collapse on header click
        const header = groupEl.querySelector('.todo-group-header');
        header?.addEventListener('click', (e) => {
            if (e.target.closest('.todo-group-add-btn')) return;
            if (e.target.closest('.todo-group-summary-btn')) return;
            toggleGroupCollapse(groupId);
        });
        
        // Restore collapsed state
        if (isGroupCollapsed(groupId)) {
            groupEl.classList.add('collapsed');
        }
    });
    
    bindTodoItemEvents(container);
}

// ============ 从 Todo 打开总结 ============
function openSummaryFromTodo(newsId, title, url) {
    // 调用全局的 openSummaryModal 函数
    if (window.openSummaryModal) {
        window.openSummaryModal(newsId, title, url, '', '');
    }
}

// ============ 折叠状态管理 ============
const TODO_COLLAPSED_KEY = 'todo_collapsed_groups';

function getCollapsedGroups() {
    try {
        const data = localStorage.getItem(TODO_COLLAPSED_KEY);
        return data ? JSON.parse(data) : {};
    } catch {
        return {};
    }
}

function saveCollapsedGroups(collapsed) {
    try {
        localStorage.setItem(TODO_COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch { /* ignore */ }
}

function isGroupCollapsed(groupId) {
    const collapsed = getCollapsedGroups();
    // 默认折叠
    return collapsed[groupId] !== false;
}

function toggleGroupCollapse(groupId) {
    const collapsed = getCollapsedGroups();
    const isCurrentlyCollapsed = collapsed[groupId] !== false;
    collapsed[groupId] = !isCurrentlyCollapsed;
    saveCollapsedGroups(collapsed);
    
    // Update UI
    const groupEl = document.querySelector(`.todo-group[data-group-id="${groupId}"]`);
    if (groupEl) {
        groupEl.classList.toggle('collapsed', !isCurrentlyCollapsed);
    }
}

function renderTodoItem(todo) {
    return `
        <div class="todo-item ${todo.done ? 'done' : ''}" data-id="${todo.id}">
            <input type="checkbox" class="todo-checkbox" ${todo.done ? 'checked' : ''}>
            <span class="todo-text">${escapeHtml(todo.text)}</span>
            <button class="todo-delete-btn" title="删除">×</button>
        </div>
    `;
}

function bindTodoItemEvents(container) {
    container.querySelectorAll('.todo-item').forEach(item => {
        const id = parseInt(item.dataset.id);
        const checkbox = item.querySelector('.todo-checkbox');
        const deleteBtn = item.querySelector('.todo-delete-btn');
        
        checkbox?.addEventListener('change', () => toggleTodo(id));
        deleteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTodo(id);
        });
    });
}


// ============ 总结弹窗 Todo 面板 ============
function ensureTodoPanelExists() {
    if (document.getElementById('summaryTodoPanel')) return;
    
    const html = `
        <div id="summaryTodoPanel" class="summary-todo-panel">
            <div class="summary-todo-header">
                <span>📋 当前文章 Todo</span>
                <button class="summary-todo-close-btn" title="关闭">✕</button>
            </div>
            <div class="summary-todo-input-area">
                <input type="text" class="summary-todo-input" placeholder="输入新的 Todo..." id="summaryTodoInput">
                <button class="summary-todo-add-btn">添加</button>
            </div>
            <div class="summary-todo-body" id="summaryTodoBody">
                <div class="todo-empty">暂无 Todo</div>
            </div>
        </div>
    `;
    
    // Insert into modal footer area
    const footer = document.getElementById('summaryModalFooter');
    if (footer) {
        footer.insertAdjacentHTML('beforebegin', html);
    } else {
        document.body.insertAdjacentHTML('beforeend', html);
    }
    
    // Bind events
    const panel = document.getElementById('summaryTodoPanel');
    const closeBtn = panel.querySelector('.summary-todo-close-btn');
    const addBtn = panel.querySelector('.summary-todo-add-btn');
    const input = document.getElementById('summaryTodoInput');
    
    closeBtn.addEventListener('click', closeTodoPanel);
    addBtn.addEventListener('click', addTodoInPanel);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addTodoInPanel();
    });
}

function openTodoPanel(groupId, groupTitle, groupUrl) {
    if (!requireLogin()) return;
    
    ensureTodoPanelExists();
    currentPanelGroupId = groupId;
    
    const panel = document.getElementById('summaryTodoPanel');
    panel.classList.add('open');
    panel.dataset.groupId = groupId;
    panel.dataset.groupTitle = groupTitle;
    panel.dataset.groupUrl = groupUrl || '';
    todoPanelOpen = true;
    
    renderTodoPanel();
}

function closeTodoPanel() {
    const panel = document.getElementById('summaryTodoPanel');
    if (panel) {
        panel.classList.remove('open');
    }
    todoPanelOpen = false;
    currentPanelGroupId = null;
}

async function addTodoInPanel() {
    const panel = document.getElementById('summaryTodoPanel');
    const input = document.getElementById('summaryTodoInput');
    if (!panel || !input) return;
    
    const text = input.value.trim();
    if (!text) {
        showTodoToast('请输入 Todo 内容');
        return;
    }
    
    const groupId = panel.dataset.groupId;
    const groupTitle = panel.dataset.groupTitle;
    const groupUrl = panel.dataset.groupUrl;
    
    const result = await addTodo(text, {
        groupId,
        groupTitle,
        groupUrl,
        isCustom: false
    });
    
    if (result) {
        input.value = '';
        renderTodoPanel();
    }
}

function renderTodoPanel() {
    const panel = document.getElementById('summaryTodoPanel');
    const body = document.getElementById('summaryTodoBody');
    if (!panel || !body) return;
    
    const groupId = panel.dataset.groupId;
    if (!groupId) {
        body.innerHTML = '<div class="todo-empty">暂无 Todo</div>';
        return;
    }
    
    const groupTodos = getTodosByGroupId(groupId);
    
    if (groupTodos.length === 0) {
        body.innerHTML = '<div class="todo-empty">暂无 Todo，可在上方输入添加</div>';
        return;
    }
    
    body.innerHTML = groupTodos.map(todo => renderTodoItem(todo)).join('');
    bindTodoItemEvents(body);
}

function getCurrentTodoCount(groupId) {
    return getTodosByGroupId(groupId).filter(t => !t.done).length;
}

// ============ 选中文字添加 Todo ============
let selectionTodoBtn = null;
let selectionTodoInitialized = false;

function initSelectionTodo() {
    // Only initialize once
    if (selectionTodoInitialized) return;
    selectionTodoInitialized = true;
    
    // Create floating button
    selectionTodoBtn = document.createElement('button');
    selectionTodoBtn.className = 'selection-todo-btn';
    selectionTodoBtn.type = 'button';
    selectionTodoBtn.textContent = '+Todo';
    selectionTodoBtn.style.display = 'none';
    document.body.appendChild(selectionTodoBtn);
    
    const hide = () => {
        selectionTodoBtn.style.display = 'none';
        selectionTodoBtn.dataset.selectionText = '';
        selectionTodoBtn._source = null;
    };
    
    const getSelectionData = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return null;
        
        const text = sel.toString();
        if (!String(text || '').trim()) return null;
        
        const range = sel.rangeCount ? sel.getRangeAt(0) : null;
        if (!range) return null;
        
        const containerNode = range.commonAncestorContainer;
        const containerEl = containerNode?.nodeType === Node.ELEMENT_NODE 
            ? containerNode 
            : containerNode?.parentElement;
        if (!containerEl) return null;
        
        // Only allow selection within summary modal body
        const modalBody = document.getElementById('summaryModalBody');
        if (!modalBody || !modalBody.contains(containerEl)) return null;
        
        // Don't show button if selecting within todo panel
        if (containerEl.closest && containerEl.closest('.summary-todo-panel')) return null;
        
        return { text: text.trim(), range };
    };
    
    const showForCurrentSelection = () => {
        const data = getSelectionData();
        if (!data) {
            hide();
            return;
        }
        
        const rect = data.range.getBoundingClientRect();
        if (!rect || (!rect.width && !rect.height)) {
            hide();
            return;
        }
        
        const btnWidth = 64;
        const btnHeight = 32;
        const margin = 8;
        const left = Math.min(window.innerWidth - btnWidth - margin, Math.max(margin, rect.right - btnWidth));
        const top = Math.min(window.innerHeight - btnHeight - margin, Math.max(margin, rect.bottom + margin));
        
        selectionTodoBtn.style.left = `${left}px`;
        selectionTodoBtn.style.top = `${top}px`;
        selectionTodoBtn.style.display = 'block';
        selectionTodoBtn.dataset.selectionText = data.text;
    };
    
    selectionTodoBtn.addEventListener('click', async () => {
        const text = selectionTodoBtn.dataset.selectionText || '';
        if (!text) return;
        
        // Get current news info from summary modal
        const groupId = window._currentSummaryNewsId;
        const groupTitle = window._currentSummaryNewsTitle;
        const groupUrl = window._currentSummaryNewsUrl;
        
        if (!groupId || !groupTitle) {
            showTodoToast('无法获取文章信息');
            return;
        }
        
        await addTodo(text, {
            groupId,
            groupTitle,
            groupUrl: groupUrl || '',
            isCustom: false
        });
        
        try {
            window.getSelection()?.removeAllRanges();
        } catch (e) { /* ignore */ }
        hide();
    });
    
    // Event listeners - 支持桌面和移动端
    document.addEventListener('mouseup', () => setTimeout(showForCurrentSelection, 0));
    document.addEventListener('keyup', () => setTimeout(showForCurrentSelection, 0));
    
    // 移动端触摸选择支持
    document.addEventListener('touchend', () => setTimeout(showForCurrentSelection, 100));
    document.addEventListener('selectionchange', () => {
        // 延迟检查，等待选择完成
        setTimeout(showForCurrentSelection, 50);
    });
    
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.addEventListener('mousedown', (e) => {
        if (selectionTodoBtn.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.selection-todo-btn')) return;
        // Don't hide immediately on mousedown, let mouseup handle it
    });
    document.addEventListener('touchstart', (e) => {
        if (selectionTodoBtn.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.selection-todo-btn')) return;
        // Don't hide immediately, let touchend handle it
    });
}

// ============ 首页按钮初始化 ============
function createTodoButton() {
    const btn = document.createElement('button');
    btn.className = 'icon-btn todo-btn';
    btn.id = 'todoBtn';
    btn.title = '我的 Todo';
    btn.innerHTML = `📋<span class="todo-badge" id="todoBadge"></span>`;
    btn.addEventListener('click', openTodoSidebar);
    return btn;
}

function createCategorySettingsButton() {
    const btn = document.createElement('button');
    btn.className = 'icon-btn category-settings-header-btn';
    btn.id = 'categorySettingsHeaderBtn';
    btn.title = '栏目设置';
    btn.innerHTML = `⚙️`;
    btn.addEventListener('click', () => {
        if (window.openCategorySettings) {
            window.openCategorySettings();
        }
    });
    return btn;
}

function initTodoButton() {
    // Find favorites button and insert todo button before it
    const favBtn = document.getElementById('favoritesBtn');
    if (favBtn && favBtn.parentNode) {
        const todoBtn = createTodoButton();
        favBtn.parentNode.insertBefore(todoBtn, favBtn);
    }
    
    // Load todos if logged in
    const user = authState.getUser();
    if (user) {
        loadTodos();
    }
}

// ============ 导出 ============
window.openTodoSidebar = openTodoSidebar;
window.closeTodoSidebar = closeTodoSidebar;
window.openTodoPanel = openTodoPanel;
window.closeTodoPanel = closeTodoPanel;
window.addTodo = addTodo;
window.batchAddTodos = batchAddTodos;
window.loadTodos = loadTodos;
window.getTodosByGroupId = getTodosByGroupId;
window.getCurrentTodoCount = getCurrentTodoCount;
window.initTodoButton = initTodoButton;
window.initSelectionTodo = initSelectionTodo;

export {
    loadTodos,
    addTodo,
    batchAddTodos,
    toggleTodo,
    deleteTodo,
    getTodosByGroupId,
    getUnfinishedCount,
    getCurrentTodoCount,
    openTodoSidebar,
    closeTodoSidebar,
    openTodoPanel,
    closeTodoPanel,
    initTodoButton,
    updateTodoBadge,
    initSelectionTodo
};
