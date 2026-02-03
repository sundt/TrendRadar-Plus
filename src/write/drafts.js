/**
 * HotNews Drafts Page
 * 
 * Draft list management
 */

// ==================== API Helpers ====================

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        credentials: 'include',
    })
    
    const data = await response.json()
    
    if (!response.ok) {
        throw new Error(data.detail || data.message || 'Request failed')
    }
    
    return data
}

// ==================== Toast ====================

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast')
    toast.textContent = message
    toast.className = `toast ${type}`
    toast.classList.remove('hidden')
    
    setTimeout(() => {
        toast.classList.add('hidden')
    }, 3000)
}

// ==================== Time Formatting ====================

function formatTime(timestamp) {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diff = now - date
    
    // Less than 1 minute
    if (diff < 60000) {
        return '刚刚'
    }
    
    // Less than 1 hour
    if (diff < 3600000) {
        return `${Math.floor(diff / 60000)} 分钟前`
    }
    
    // Less than 24 hours
    if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)} 小时前`
    }
    
    // Less than 7 days
    if (diff < 604800000) {
        return `${Math.floor(diff / 86400000)} 天前`
    }
    
    // Format as date
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// ==================== Drafts Manager ====================

class DraftsManager {
    constructor() {
        this.drafts = []
        this.total = 0
        this.page = 1
        this.pageSize = 10
        this.deleteTargetId = null
    }
    
    async init() {
        this.bindEvents()
        await this.loadDrafts()
    }
    
    async loadDrafts() {
        const loading = document.getElementById('loading')
        const emptyState = document.getElementById('empty-state')
        const draftList = document.getElementById('draft-list')
        const pagination = document.getElementById('pagination')
        
        loading.classList.remove('hidden')
        emptyState.classList.add('hidden')
        draftList.classList.add('hidden')
        pagination.classList.add('hidden')
        
        try {
            const res = await apiRequest(`/api/publisher/drafts?page=${this.page}&page_size=${this.pageSize}`)
            
            loading.classList.add('hidden')
            
            if (res.ok && res.data) {
                this.drafts = res.data.items
                this.total = res.data.total
                
                if (this.drafts.length === 0) {
                    emptyState.classList.remove('hidden')
                } else {
                    this.renderDrafts()
                    draftList.classList.remove('hidden')
                    
                    if (this.total > this.pageSize) {
                        this.updatePagination()
                        pagination.classList.remove('hidden')
                    }
                }
            }
        } catch (error) {
            loading.classList.add('hidden')
            console.error('Load drafts failed:', error)
            
            if (error.message.includes('登录') || error.message.includes('401')) {
                showToast('请先登录', 'error')
            } else if (error.message.includes('会员') || error.message.includes('403')) {
                showToast('需要会员权限', 'error')
            } else {
                showToast('加载失败: ' + error.message, 'error')
            }
            
            emptyState.classList.remove('hidden')
        }
    }
    
    renderDrafts() {
        const draftList = document.getElementById('draft-list')
        
        draftList.innerHTML = this.drafts.map(draft => `
            <div class="draft-item" data-id="${draft.id}">
                <div class="draft-cover">
                    ${draft.cover_url 
                        ? `<img src="${draft.cover_url}" alt="封面">`
                        : `<div class="draft-cover-placeholder">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <path d="M21 15l-5-5L5 21"/>
                            </svg>
                           </div>`
                    }
                </div>
                <div class="draft-content">
                    <h3 class="draft-title">
                        <a href="/write/${draft.id}">${draft.title || '无标题'}</a>
                    </h3>
                    <p class="draft-digest">${draft.digest || '暂无摘要'}</p>
                    <div class="draft-meta">
                        <span class="draft-status status-${draft.status}">${draft.status === 'draft' ? '草稿' : '已发布'}</span>
                        <span>更新于 ${formatTime(draft.updated_at)}</span>
                    </div>
                </div>
                <div class="draft-actions">
                    <button class="btn-icon btn-edit" title="编辑" data-id="${draft.id}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon btn-delete" title="删除" data-id="${draft.id}">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('')
    }
    
    updatePagination() {
        const totalPages = Math.ceil(this.total / this.pageSize)
        const pageInfo = document.getElementById('page-info')
        const btnPrev = document.getElementById('btn-prev')
        const btnNext = document.getElementById('btn-next')
        
        pageInfo.textContent = `第 ${this.page} / ${totalPages} 页`
        btnPrev.disabled = this.page <= 1
        btnNext.disabled = this.page >= totalPages
    }
    
    bindEvents() {
        // Draft list click events (delegation)
        document.getElementById('draft-list').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.btn-edit')
            const deleteBtn = e.target.closest('.btn-delete')
            
            if (editBtn) {
                const id = editBtn.dataset.id
                window.location.href = `/write/${id}`
            }
            
            if (deleteBtn) {
                const id = deleteBtn.dataset.id
                this.showDeleteModal(id)
            }
        })
        
        // Pagination
        document.getElementById('btn-prev').addEventListener('click', () => {
            if (this.page > 1) {
                this.page--
                this.loadDrafts()
            }
        })
        
        document.getElementById('btn-next').addEventListener('click', () => {
            const totalPages = Math.ceil(this.total / this.pageSize)
            if (this.page < totalPages) {
                this.page++
                this.loadDrafts()
            }
        })
        
        // Delete modal
        document.getElementById('btn-close-delete').addEventListener('click', () => {
            this.hideDeleteModal()
        })
        document.getElementById('btn-cancel-delete').addEventListener('click', () => {
            this.hideDeleteModal()
        })
        document.getElementById('btn-confirm-delete').addEventListener('click', () => {
            this.confirmDelete()
        })
        document.querySelector('#delete-modal .modal-overlay').addEventListener('click', () => {
            this.hideDeleteModal()
        })
    }
    
    showDeleteModal(id) {
        this.deleteTargetId = id
        document.getElementById('delete-modal').classList.remove('hidden')
    }
    
    hideDeleteModal() {
        this.deleteTargetId = null
        document.getElementById('delete-modal').classList.add('hidden')
    }
    
    async confirmDelete() {
        if (!this.deleteTargetId) return
        
        try {
            await apiRequest(`/api/publisher/drafts/${this.deleteTargetId}`, {
                method: 'DELETE',
            })
            
            showToast('草稿已删除', 'success')
            this.hideDeleteModal()
            await this.loadDrafts()
        } catch (error) {
            console.error('Delete failed:', error)
            showToast('删除失败: ' + error.message, 'error')
        }
    }
}

// ==================== Initialize ====================

document.addEventListener('DOMContentLoaded', () => {
    const manager = new DraftsManager()
    manager.init()
})
