/**
 * HotNews Article Editor
 * 
 * Multi-platform publishing editor based on Tiptap
 */

import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { BubbleMenu } from '@tiptap/extension-bubble-menu'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Highlight } from '@tiptap/extension-highlight'
import { TextAlign } from '@tiptap/extension-text-align'
import { Typography } from '@tiptap/extension-typography'
import { Dropcursor } from '@tiptap/extension-dropcursor'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import SlashCommands from './slash-commands.js'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

// 创建 lowlight 实例，加载常用语言
const lowlight = createLowlight(common)

// ==================== Constants ====================

const AUTO_SAVE_INTERVAL = 30000 // 30 seconds
const LOCAL_STORAGE_KEY = 'hotnews_draft_backup'

// ==================== Error Messages ====================

const ERROR_MESSAGES = {
    // Auth errors
    'Unauthorized': '请先登录后再操作',
    'Forbidden': '没有权限执行此操作',
    'not authenticated': '请先登录',
    '需要会员权限': '此功能需要会员权限',
    
    // Network errors
    'Failed to fetch': '网络连接失败，请检查网络后重试',
    'NetworkError': '网络错误，请稍后重试',
    'timeout': '请求超时，请稍后重试',
    
    // Draft errors
    '草稿不存在': '草稿不存在或已被删除',
    '草稿已被修改': '草稿已被其他设备修改，请刷新页面',
    '无权访问': '您没有权限访问此草稿',
    
    // Upload errors
    '文件过大': '文件大小超出限制',
    'Invalid file type': '不支持的文件格式',
    
    // Plugin errors
    'Plugin not installed': '请先安装 HotNews 浏览器插件',
    'Plugin not responding': '插件无响应，请刷新页面重试',
}

/**
 * Get user-friendly error message
 */
function getFriendlyError(error) {
    const msg = error?.message || String(error)
    
    // Check for known error patterns
    for (const [pattern, friendly] of Object.entries(ERROR_MESSAGES)) {
        if (msg.includes(pattern)) {
            return friendly
        }
    }
    
    // Return original message if no match
    return msg
}

// ==================== API Helpers ====================

async function apiRequest(url, options = {}) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout
    
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            credentials: 'include',
            signal: controller.signal,
        })
        
        clearTimeout(timeoutId)
        
        const data = await response.json()
        
        if (!response.ok) {
            throw new Error(data.detail || data.message || 'Request failed')
        }
        
        return data
    } catch (error) {
        clearTimeout(timeoutId)
        if (error.name === 'AbortError') {
            throw new Error('请求超时，请稍后重试')
        }
        throw error
    }
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

/**
 * Show error toast with friendly message
 */
function showError(error, prefix = '') {
    const msg = getFriendlyError(error)
    showToast(prefix ? `${prefix}: ${msg}` : msg, 'error')
}

// ==================== Article Editor Class ====================

class ArticleEditor {
    constructor() {
        this.draftId = null
        this.draftVersion = null
        this.editor = null
        this.autoSaveTimer = null
        this.isDirty = false
        this.coverUrl = ''
        this.isAuthenticated = false
        this.isMember = false
        this.cropper = null
        this.cropperFile = null
    }
    
    async init() {
        try {
            // 1. Check auth
            await this.checkAuth()
            
            // 2. Initialize Tiptap editor
            this.initEditor()
            
            // 3. Load draft if ID in URL
            await this.loadDraftFromUrl()
            
            // 4. Restore from localStorage if no draft
            if (!this.draftId) {
                this.restoreFromLocal()
            }
            
            // 5. Start auto-save
            this.startAutoSave()
            
            // 6. Bind events
            this.bindEvents()
            
            console.log('Editor initialized')
        } catch (error) {
            console.error('Editor init failed:', error)
            showToast(error.message, 'error')
        }
    }
    
    async checkAuth() {
        // 检查登录状态，未登录则跳转到首页登录
        try {
            const res = await apiRequest('/api/auth/me')
            if (res.ok && res.user) {
                this.isAuthenticated = true
                this.isMember = res.user.is_member || false
            } else {
                // 未登录，跳转到首页并带上 redirect 参数
                window.location.href = '/?need_login=1&redirect=' + encodeURIComponent(window.location.pathname + window.location.search)
                throw new Error('请先登录')
            }
        } catch (error) {
            if (error.message === '请先登录') {
                throw error
            }
            // API 错误也视为未登录
            window.location.href = '/?need_login=1&redirect=' + encodeURIComponent(window.location.pathname + window.location.search)
            throw new Error('请先登录')
        }
    }
    
    initEditor() {
        const self = this
        
        this.editor = new Editor({
            element: document.querySelector('#editor'),
            extensions: [
                StarterKit.configure({
                    heading: {
                        levels: [1, 2, 3],
                    },
                    dropcursor: false, // 使用单独的 Dropcursor 扩展
                    codeBlock: false, // 使用 CodeBlockLowlight 替代
                }),
                Image.configure({
                    inline: false,
                    allowBase64: false,
                }),
                Link.configure({
                    openOnClick: false,
                    HTMLAttributes: {
                        target: '_blank',
                        rel: 'noopener noreferrer',
                    },
                }),
                Placeholder.configure({
                    placeholder: '开始写作，输入 / 查看命令...',
                }),
                // 新增扩展
                BubbleMenu.configure({
                    element: document.querySelector('#bubble-menu'),
                    shouldShow: ({ editor, state }) => {
                        // 只在有选中文字时显示
                        const { from, to } = state.selection
                        return from !== to && !editor.isActive('image')
                    },
                    tippyOptions: {
                        duration: 100,
                        placement: 'top',
                    },
                }),
                Table.configure({
                    resizable: true,
                }),
                TableRow,
                TableHeader,
                TableCell,
                Highlight.configure({
                    multicolor: true,
                }),
                TextAlign.configure({
                    types: ['heading', 'paragraph'],
                }),
                Typography,
                Dropcursor.configure({
                    color: '#1a73e8',
                    width: 2,
                }),
                CodeBlockLowlight.configure({
                    lowlight,
                }),
                SlashCommands,
            ],
            content: '',
            onUpdate: () => {
                this.isDirty = true
                this.saveToLocal()
                this.updateTOC()
            },
            // 粘贴处理：支持图文混合粘贴
            editorProps: {
                handlePaste(view, event) {
                    const clipboardData = event.clipboardData
                    if (!clipboardData) return false
                    
                    const types = [...clipboardData.types]
                    const hasHtml = types.includes('text/html')
                    const hasText = types.includes('text/plain')
                    const items = clipboardData.items
                    
                    // 收集所有图片 file items
                    const imageFiles = []
                    if (items) {
                        for (const item of items) {
                            if (item.kind === 'file' && item.type.startsWith('image/')) {
                                const f = item.getAsFile()
                                if (f) imageFiles.push(f)
                            }
                        }
                    }
                    
                    console.log('[paste]', { types, hasHtml, hasText, imageFiles: imageFiles.length })
                    
                    // 场景1：有 HTML 内容（从网页/文档复制的图文混合）
                    if (hasHtml) {
                        const html = clipboardData.getData('text/html')
                        
                        // 预处理 HTML：修复 data-src（微信等懒加载图片）
                        const fixedHtml = html
                            .replace(/<img([^>]*)\sdata-src="([^"]+)"([^>]*)>/gi, (match, before, dataSrc, after) => {
                                // 如果已有 src 且不是占位图，保留原 src
                                if (/\ssrc="https?:\/\/[^"]+"/i.test(before + after)) {
                                    return match
                                }
                                // 用 data-src 替换 src
                                const cleaned = (before + after).replace(/\ssrc="[^"]*"/gi, '')
                                return `<img${cleaned} src="${dataSrc}">`
                            })
                        
                        console.log('[paste] html length:', html.length, 'fixed:', fixedHtml !== html)
                        
                        // 手动插入处理后的 HTML
                        event.preventDefault()
                        self.editor.commands.insertContent(fixedHtml, {
                            parseOptions: { preserveWhitespace: false }
                        })
                        
                        // 异步转存外部图片
                        setTimeout(() => self.uploadExternalImages(), 300)
                        return true
                    }
                    
                    // 场景2：有文本 + 图片（某些应用只给 text/plain + image）
                    if (hasText && imageFiles.length > 0) {
                        setTimeout(async () => {
                            for (const file of imageFiles) {
                                await self.handleImageUpload(file)
                            }
                        }, 100)
                        return false
                    }
                    
                    // 场景3：纯图片粘贴（截图）
                    if (imageFiles.length > 0) {
                        event.preventDefault()
                        ;(async () => {
                            for (const file of imageFiles) {
                                await self.handleImageUpload(file)
                            }
                        })()
                        return true
                    }
                    
                    return false
                },
                // 拖拽图片处理
                handleDrop(view, event, slice, moved) {
                    if (moved) return false
                    
                    const files = event.dataTransfer?.files
                    if (!files?.length) return false
                    
                    for (const file of files) {
                        if (file.type.startsWith('image/')) {
                            event.preventDefault()
                            self.handleImageUpload(file)
                            return true
                        }
                    }
                    return false
                },
            },
        })
    }
    
    // 处理图片上传（粘贴/拖拽）
    async handleImageUpload(file) {
        showToast('正在上传图片...')
        const url = await this.uploadImage(file, 'content')
        if (url) {
            this.editor.chain().focus().setImage({ src: url }).run()
            showToast('图片已插入', 'success')
        }
    }
    
    // 扫描编辑器中的外部图片，下载上传到自己服务器
    async uploadExternalImages() {
        const editorEl = document.querySelector('#editor .ProseMirror')
        if (!editorEl) return
        
        // 第一步：收集所有外部图片 src
        const externalSrcs = new Set()
        this.editor.state.doc.descendants((node) => {
            if (node.type.name === 'image') {
                const src = node.attrs.src || ''
                if (src && !src.startsWith('/api/') && !src.startsWith('data:') && !src.startsWith('blob:')
                    && (src.startsWith('http://') || src.startsWith('https://'))) {
                    externalSrcs.add(src)
                }
            }
        })
        
        if (externalSrcs.size === 0) return
        
        showToast(`正在上传 ${externalSrcs.size} 张图片...`)
        
        // 第二步：并行上传所有外部图片，建立 oldSrc -> newSrc 映射
        const srcMap = new Map() // oldSrc -> newSrc
        let failed = 0
        
        const uploadPromises = [...externalSrcs].map(async (originalSrc) => {
            try {
                const response = await fetch('/api/publisher/upload/from-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ url: originalSrc })
                })
                const data = await response.json()
                if (response.ok && data.ok && data.data?.url) {
                    srcMap.set(originalSrc, data.data.url)
                } else {
                    failed++
                    console.warn('Failed to upload external image:', originalSrc, data)
                }
            } catch (error) {
                failed++
                console.warn('Failed to upload external image:', originalSrc, error)
            }
        })
        
        await Promise.all(uploadPromises)
        
        if (srcMap.size === 0) {
            if (failed > 0) showToast(`${failed} 张图片上传失败，保留原始链接`, 'error')
            return
        }
        
        // 第三步：一次 transaction 批量替换所有图片 src
        const { tr } = this.editor.state
        this.editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && srcMap.has(node.attrs.src)) {
                tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    src: srcMap.get(node.attrs.src),
                })
            }
        })
        this.editor.view.dispatch(tr)
        
        const uploaded = srcMap.size
        showToast(`已上传 ${uploaded} 张图片${failed > 0 ? `，${failed} 张失败` : ''}`, 'success')
    }
    
    // 更新目录
    updateTOC() {
        const tocContainer = document.getElementById('toc-list')
        if (!tocContainer) return
        
        const headings = []
        this.editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'heading') {
                headings.push({
                    level: node.attrs.level,
                    text: node.textContent,
                    pos: pos,
                })
            }
        })
        
        if (headings.length === 0) {
            tocContainer.innerHTML = '<div class="toc-empty">暂无目录</div>'
            return
        }
        
        tocContainer.innerHTML = headings.map((h, i) => `
            <div class="toc-item toc-level-${h.level}" data-pos="${h.pos}">
                ${h.text || '无标题'}
            </div>
        `).join('')
        
        // 点击跳转
        tocContainer.querySelectorAll('.toc-item').forEach(item => {
            item.addEventListener('click', () => {
                const pos = parseInt(item.dataset.pos)
                this.editor.chain().focus().setTextSelection(pos).run()
                // 滚动到视图
                const editorEl = document.querySelector('#editor')
                const node = editorEl.querySelector('.ProseMirror')?.childNodes
                // 简单滚动到顶部附近
                editorEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
        })
    }
    
    async loadDraftFromUrl() {
        // Check URL for draft ID: /write/xxx or ?draft=xxx
        const pathMatch = window.location.pathname.match(/\/write\/([^/]+)/)
        const urlParams = new URLSearchParams(window.location.search)
        const draftId = pathMatch?.[1] || urlParams.get('draft')
        
        if (draftId) {
            await this.loadDraft(draftId)
        }
        
        // Check for import params
        const importType = urlParams.get('import')
        const importId = urlParams.get('id')
        if (importType && importId) {
            await this.importContent(importType, importId)
        }
        
        // Check for URL import
        const importUrl = urlParams.get('url')
        if (importType === 'url' && importUrl) {
            await this.importFromUrl(importUrl)
        }
    }
    
    async loadDraft(draftId) {
        try {
            const res = await apiRequest(`/api/publisher/drafts/${draftId}`)
            if (res.ok && res.data) {
                const draft = res.data
                this.draftId = draft.id
                this.draftVersion = draft.version
                
                document.getElementById('title').value = draft.title || ''
                document.getElementById('digest').value = draft.digest || ''
                this.updateDigestCount()
                
                if (draft.cover_url) {
                    this.setCover(draft.cover_url)
                }
                
                this.editor.commands.setContent(draft.html_content || '')
                this.isDirty = false
                this.updateSaveStatus('已加载')
            }
        } catch (error) {
            console.error('Load draft failed:', error)
            showError(error, '加载草稿失败')
        }
    }
    
    async importContent(type, id) {
        try {
            const res = await apiRequest(`/api/publisher/import/${type}/${id}`)
            if (res.ok && res.data) {
                const content = res.data
                document.getElementById('title').value = content.title || ''
                document.getElementById('digest').value = content.digest || ''
                this.updateDigestCount()
                
                if (content.cover_url) {
                    this.setCover(content.cover_url)
                }
                
                this.editor.commands.setContent(content.html_content || '')
                this.isDirty = true
                showToast('内容已导入')
            }
        } catch (error) {
            console.error('Import failed:', error)
            showError(error, '导入失败')
        }
    }
    
    async importFromUrl(url) {
        try {
            showToast('正在导入网页内容...')
            const res = await apiRequest('/api/publisher/import/url', {
                method: 'POST',
                body: JSON.stringify({ url })
            })
            if (res.ok && res.data) {
                const content = res.data
                document.getElementById('title').value = content.title || ''
                document.getElementById('digest').value = content.digest || ''
                this.updateDigestCount()
                
                if (content.cover_url) {
                    this.setCover(content.cover_url)
                }
                
                this.editor.commands.setContent(content.html_content || '')
                this.isDirty = true
                
                // Auto-save the imported content
                await this.saveDraft()
                
                showToast('网页内容已导入')
            }
        } catch (error) {
            console.error('Import from URL failed:', error)
            showError(error, '导入失败')
        }
    }
    
    // ==================== Document Import Methods ====================
    
    showImportModal() {
        document.getElementById('import-modal').classList.remove('hidden')
        document.getElementById('import-progress').classList.add('hidden')
        document.getElementById('import-dropzone').classList.remove('hidden')
    }
    
    hideImportModal() {
        document.getElementById('import-modal').classList.add('hidden')
    }
    
    async importDocument(file) {
        // Validate file type
        const validTypes = ['.md', '.markdown', '.pdf', '.docx']
        const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0]
        if (!ext || !validTypes.includes(ext)) {
            showToast('不支持的文件格式，请上传 Markdown、PDF 或 Word 文档', 'error')
            return
        }
        
        // Validate file size (10MB)
        if (file.size > 10 * 1024 * 1024) {
            showToast('文件大小不能超过 10MB', 'error')
            return
        }
        
        // Show progress
        document.getElementById('import-dropzone').classList.add('hidden')
        document.getElementById('import-progress').classList.remove('hidden')
        
        try {
            const formData = new FormData()
            formData.append('file', file)
            
            const response = await fetch('/api/publisher/import/document', {
                method: 'POST',
                body: formData,
                credentials: 'include',
            })
            
            const data = await response.json()
            
            if (!response.ok) {
                throw new Error(data.detail || '导入失败')
            }
            
            if (data.ok && data.data) {
                const content = data.data
                document.getElementById('title').value = content.title || ''
                document.getElementById('digest').value = content.digest || ''
                this.updateDigestCount()
                
                if (content.cover_url) {
                    this.setCover(content.cover_url)
                }
                
                this.editor.commands.setContent(content.html_content || '')
                this.isDirty = true
                
                this.hideImportModal()
                showToast(`已导入: ${file.name}`, 'success')
            }
        } catch (error) {
            console.error('Document import failed:', error)
            showError(error, '导入失败')
            // Reset dropzone
            document.getElementById('import-dropzone').classList.remove('hidden')
            document.getElementById('import-progress').classList.add('hidden')
        }
    }
    
    // ==================== AI Polish Methods ====================
    
    updatePolishMenuPosition() {
        const menu = document.getElementById('ai-polish-menu')
        const selection = window.getSelection()
        
        // Check if selection is within editor
        if (!selection || selection.isCollapsed) {
            menu.classList.add('hidden')
            return
        }
        
        const editorEl = document.getElementById('editor')
        const range = selection.getRangeAt(0)
        
        // Check if selection is inside editor
        if (!editorEl.contains(range.commonAncestorContainer)) {
            menu.classList.add('hidden')
            return
        }
        
        const selectedText = selection.toString().trim()
        if (!selectedText || selectedText.length < 2) {
            menu.classList.add('hidden')
            return
        }
        
        // Position menu above selection
        const rect = range.getBoundingClientRect()
        const editorRect = editorEl.getBoundingClientRect()
        
        menu.classList.remove('hidden')
        
        // Calculate position
        const menuWidth = menu.offsetWidth
        let left = rect.left + (rect.width / 2) - (menuWidth / 2)
        let top = rect.top - menu.offsetHeight - 8
        
        // Keep within viewport
        if (left < 10) left = 10
        if (left + menuWidth > window.innerWidth - 10) {
            left = window.innerWidth - menuWidth - 10
        }
        if (top < 10) {
            top = rect.bottom + 8
        }
        
        menu.style.left = `${left}px`
        menu.style.top = `${top}px`
        
        // Store selected text for later use
        this.selectedText = selectedText
        this.selectedRange = range.cloneRange()
    }
    
    async handleAiPolish(action) {
        if (!this.selectedText) {
            showToast('请先选择要处理的文本', 'error')
            return
        }
        
        const menu = document.getElementById('ai-polish-menu')
        const buttons = menu.querySelectorAll('button')
        
        // Disable buttons and show loading
        buttons.forEach(btn => {
            btn.disabled = true
            if (btn.dataset.action === action) {
                btn.classList.add('loading')
            }
        })
        
        try {
            // Handle translate action - ask for target language
            let targetLang = null
            if (action === 'translate') {
                targetLang = prompt('请输入目标语言（如：英文、日文、韩文）', '英文')
                if (!targetLang) {
                    return
                }
            }
            
            const response = await fetch('/api/publisher/ai/polish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    text: this.selectedText,
                    action: action,
                    target_lang: targetLang
                })
            })
            
            const data = await response.json()
            
            if (!response.ok) {
                throw new Error(data.detail || '处理失败')
            }
            
            if (data.ok && data.data?.result) {
                // Show result and ask user to confirm replacement
                const result = data.data.result
                const actionNames = {
                    rewrite: '改写',
                    expand: '扩写',
                    summarize: '缩写',
                    translate: '翻译'
                }
                
                const confirmed = confirm(
                    `${actionNames[action]}结果：\n\n${result}\n\n是否替换原文？`
                )
                
                if (confirmed) {
                    // Replace selected text with result
                    this.replaceSelectedText(result)
                    showToast(`${actionNames[action]}完成`, 'success')
                }
            }
        } catch (error) {
            console.error('AI polish failed:', error)
            showError(error, 'AI 处理失败')
        } finally {
            // Re-enable buttons
            buttons.forEach(btn => {
                btn.disabled = false
                btn.classList.remove('loading')
            })
            menu.classList.add('hidden')
        }
    }
    
    replaceSelectedText(newText) {
        if (!this.selectedRange) return
        
        // Use Tiptap's command to replace
        const { from, to } = this.editor.state.selection
        
        this.editor.chain()
            .focus()
            .deleteRange({ from, to })
            .insertContent(newText)
            .run()
        
        this.isDirty = true
        this.selectedText = null
        this.selectedRange = null
    }
    
    restoreFromLocal() {
        try {
            const backup = localStorage.getItem(LOCAL_STORAGE_KEY)
            if (!backup) return
            
            const data = JSON.parse(backup)
            // Only restore if less than 24 hours old
            if (Date.now() - data.savedAt > 24 * 60 * 60 * 1000) {
                localStorage.removeItem(LOCAL_STORAGE_KEY)
                return
            }
            
            if (data.title) document.getElementById('title').value = data.title
            if (data.digest) {
                document.getElementById('digest').value = data.digest
                this.updateDigestCount()
            }
            if (data.content) this.editor.commands.setContent(data.content)
            if (data.coverUrl) this.setCover(data.coverUrl)
            if (data.draftId) this.draftId = data.draftId
            
            this.isDirty = true
            showToast('已恢复本地备份')
        } catch (error) {
            console.warn('Restore from local failed:', error)
        }
    }
    
    saveToLocal() {
        try {
            const backup = {
                draftId: this.draftId,
                title: document.getElementById('title').value,
                digest: document.getElementById('digest').value,
                content: this.editor.getHTML(),
                coverUrl: this.coverUrl,
                savedAt: Date.now(),
            }
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(backup))
        } catch (error) {
            console.warn('Save to local failed:', error)
        }
    }
    
    startAutoSave() {
        this.autoSaveTimer = setInterval(() => {
            if (this.isDirty) {
                this.saveDraft().catch(err => {
                    // Auto-save errors are already logged in saveDraft
                    console.debug('Auto-save failed:', err.message)
                })
            }
        }, AUTO_SAVE_INTERVAL)
    }
    
    async saveDraft() {
        const title = document.getElementById('title').value.trim()
        const digest = document.getElementById('digest').value.trim()
        const htmlContent = this.editor.getHTML()
        
        // Don't save empty drafts
        if (!title && !htmlContent.replace(/<[^>]*>/g, '').trim()) {
            return
        }
        
        this.updateSaveStatus('保存中...', 'saving')
        
        try {
            const data = {
                title,
                digest,
                cover_url: this.coverUrl,
                html_content: htmlContent,
            }
            
            let res
            if (this.draftId) {
                data.expected_version = this.draftVersion
                res = await apiRequest(`/api/publisher/drafts/${this.draftId}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                })
            } else {
                res = await apiRequest('/api/publisher/drafts', {
                    method: 'POST',
                    body: JSON.stringify(data),
                })
            }
            
            if (res.ok && res.data) {
                this.draftId = res.data.id
                this.draftVersion = res.data.version
                this.isDirty = false
                this.updateSaveStatus('已保存', 'saved')
                
                // Update URL without reload
                const newUrl = `/write/${this.draftId}`
                if (window.location.pathname !== newUrl) {
                    history.replaceState(null, '', newUrl)
                }
            }
        } catch (error) {
            console.error('Save failed:', error)
            this.updateSaveStatus('保存失败', 'error')
            
            if (error.message.includes('已被修改')) {
                showToast('草稿已被修改，请刷新页面', 'error')
            }
            
            // Re-throw to allow callers to handle the error
            throw error
        }
    }
    
    updateSaveStatus(text, className = '') {
        const status = document.getElementById('save-status')
        status.textContent = text
        status.className = `save-status ${className}`
    }
    
    updateDigestCount() {
        const digest = document.getElementById('digest')
        const count = document.getElementById('digest-count')
        count.textContent = digest.value.length
    }
    
    setCover(url) {
        this.coverUrl = url
        const preview = document.getElementById('cover-preview')
        const placeholder = document.getElementById('cover-placeholder')
        const image = document.getElementById('cover-image')
        const removeBtn = document.getElementById('btn-remove-cover')
        
        if (url) {
            image.src = url
            image.classList.remove('hidden')
            placeholder.classList.add('hidden')
            removeBtn.classList.remove('hidden')
            preview.classList.add('has-image')
        } else {
            image.classList.add('hidden')
            placeholder.classList.remove('hidden')
            removeBtn.classList.add('hidden')
            preview.classList.remove('has-image')
        }
    }
    
    async uploadImage(file, type = 'content') {
        const formData = new FormData()
        formData.append('file', file)
        
        try {
            const response = await fetch(`/api/publisher/upload/image?type=${type}`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
            })
            
            const data = await response.json()
            
            if (!response.ok) {
                throw new Error(data.detail || 'Upload failed')
            }
            
            return data.data.url
        } catch (error) {
            console.error('Upload failed:', error)
            showError(error, '图片上传失败')
            return null
        }
    }
    
    bindEvents() {
        // Title input
        document.getElementById('title').addEventListener('input', () => {
            this.isDirty = true
            this.saveToLocal()
        })
        
        // Digest input
        document.getElementById('digest').addEventListener('input', () => {
            this.isDirty = true
            this.updateDigestCount()
            this.saveToLocal()
        })
        
        // TOC toggle
        const tocToggle = document.getElementById('toc-toggle')
        const tocSidebar = document.getElementById('toc-sidebar')
        if (tocToggle && tocSidebar) {
            tocToggle.addEventListener('click', () => {
                tocSidebar.classList.toggle('collapsed')
            })
        }
        
        // BubbleMenu buttons
        const bubbleMenu = document.getElementById('bubble-menu')
        if (bubbleMenu) {
            bubbleMenu.addEventListener('click', (e) => {
                const button = e.target.closest('button')
                if (!button) return
                
                const action = button.dataset.action
                this.executeToolbarAction(action)
            })
        }
        
        // Cover upload
        const coverPreview = document.getElementById('cover-preview')
        const coverInput = document.getElementById('cover-input')
        
        coverPreview.addEventListener('click', (e) => {
            if (e.target.id !== 'btn-remove-cover') {
                coverInput.click()
            }
        })
        
        coverInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0]
            if (file) {
                this.showCropModal(file)
            }
            coverInput.value = ''
        })
        
        document.getElementById('btn-remove-cover').addEventListener('click', (e) => {
            e.stopPropagation()
            this.setCover('')
            this.isDirty = true
        })
        
        // Toolbar buttons
        document.getElementById('editor-toolbar').addEventListener('click', (e) => {
            const button = e.target.closest('button')
            if (!button) return
            
            const action = button.dataset.action
            this.executeToolbarAction(action)
        })
        
        // Image upload in editor
        const imageInput = document.getElementById('image-input')
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0]
            if (file) {
                const url = await this.uploadImage(file, 'content')
                if (url) {
                    this.editor.chain().focus().setImage({ src: url }).run()
                }
            }
            imageInput.value = ''
        })
        
        // Drafts button
        document.getElementById('btn-drafts').addEventListener('click', () => {
            window.location.href = '/drafts'
        })
        

        
        // Import document button
        document.getElementById('btn-import-doc').addEventListener('click', () => {
            this.showImportModal()
        })
        document.getElementById('btn-close-import').addEventListener('click', () => {
            this.hideImportModal()
        })
        document.querySelector('#import-modal .modal-overlay').addEventListener('click', () => {
            this.hideImportModal()
        })
        
        // Document dropzone
        const dropzone = document.getElementById('import-dropzone')
        const docInput = document.getElementById('doc-input')
        
        dropzone.addEventListener('click', () => {
            docInput.click()
        })
        
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault()
            dropzone.classList.add('dragover')
        })
        
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover')
        })
        
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault()
            dropzone.classList.remove('dragover')
            const file = e.dataTransfer.files?.[0]
            if (file) {
                this.importDocument(file)
            }
        })
        
        docInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0]
            if (file) {
                this.importDocument(file)
            }
            docInput.value = ''
        })
        
        // Preview button
        document.getElementById('btn-preview').addEventListener('click', () => {
            this.showPreview()
        })
        document.getElementById('btn-close-preview').addEventListener('click', () => {
            this.hidePreview()
        })
        
        // Publish button
        document.getElementById('btn-publish').addEventListener('click', () => {
            this.showPublishModal()
        })
        
        // Modal events
        document.getElementById('btn-close-modal').addEventListener('click', () => {
            this.hidePublishModal()
        })
        document.getElementById('btn-cancel-publish').addEventListener('click', () => {
            this.hidePublishModal()
        })
        document.querySelector('.modal-overlay').addEventListener('click', () => {
            this.hidePublishModal()
        })
        document.getElementById('btn-confirm-publish').addEventListener('click', () => {
            this.confirmPublish()
        })
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                this.saveDraft()
            }
        })
        
        // Before unload warning
        window.addEventListener('beforeunload', (e) => {
            if (this.isDirty) {
                e.preventDefault()
                e.returnValue = ''
            }
        })
        
        // Crop modal events
        document.getElementById('btn-close-crop').addEventListener('click', () => {
            this.hideCropModal()
        })
        document.getElementById('btn-cancel-crop').addEventListener('click', () => {
            this.hideCropModal()
        })
        document.getElementById('btn-confirm-crop').addEventListener('click', () => {
            this.confirmCrop()
        })
        document.querySelector('#crop-modal .modal-overlay').addEventListener('click', () => {
            this.hideCropModal()
        })
    }
    
    // ==================== Cover Crop Methods ====================
    
    showCropModal(file) {
        this.cropperFile = file
        const modal = document.getElementById('crop-modal')
        const image = document.getElementById('crop-image')
        
        // Create object URL for preview
        const url = URL.createObjectURL(file)
        image.src = url
        
        modal.classList.remove('hidden')
        
        // Initialize cropper after image loads
        image.onload = () => {
            if (this.cropper) {
                this.cropper.destroy()
            }
            
            this.cropper = new Cropper(image, {
                aspectRatio: 2.35, // 微信公众号封面比例 2.35:1
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 1,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
            })
        }
    }
    
    hideCropModal() {
        const modal = document.getElementById('crop-modal')
        modal.classList.add('hidden')
        
        if (this.cropper) {
            this.cropper.destroy()
            this.cropper = null
        }
        
        // Revoke object URL
        const image = document.getElementById('crop-image')
        if (image.src.startsWith('blob:')) {
            URL.revokeObjectURL(image.src)
        }
        image.src = ''
        this.cropperFile = null
    }
    
    async confirmCrop() {
        if (!this.cropper || !this.cropperFile) return
        
        const confirmBtn = document.getElementById('btn-confirm-crop')
        confirmBtn.disabled = true
        confirmBtn.textContent = '上传中...'
        
        try {
            // Get cropped canvas
            const canvas = this.cropper.getCroppedCanvas({
                width: 900,  // 微信公众号推荐宽度
                height: 383, // 2.35:1 比例
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high',
            })
            
            // Convert to blob
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/jpeg', 0.9)
            })
            
            // Create file from blob
            const croppedFile = new File([blob], this.cropperFile.name, {
                type: 'image/jpeg',
            })
            
            // Upload
            const url = await this.uploadImage(croppedFile, 'cover')
            if (url) {
                this.setCover(url)
                this.isDirty = true
                showToast('封面已更新')
            }
            
            this.hideCropModal()
        } catch (error) {
            console.error('Crop failed:', error)
            showError(error, '裁剪失败')
        } finally {
            confirmBtn.disabled = false
            confirmBtn.textContent = '确定'
        }
    }
    
    executeToolbarAction(action) {
        const chain = this.editor.chain().focus()
        
        switch (action) {
            case 'bold':
                chain.toggleBold().run()
                break
            case 'italic':
                chain.toggleItalic().run()
                break
            case 'strike':
                chain.toggleStrike().run()
                break
            case 'heading1':
                chain.toggleHeading({ level: 1 }).run()
                break
            case 'heading2':
                chain.toggleHeading({ level: 2 }).run()
                break
            case 'heading3':
                chain.toggleHeading({ level: 3 }).run()
                break
            case 'bulletList':
                chain.toggleBulletList().run()
                break
            case 'orderedList':
                chain.toggleOrderedList().run()
                break
            case 'blockquote':
                chain.toggleBlockquote().run()
                break
            case 'code':
                chain.toggleCode().run()
                break
            case 'codeBlock':
                chain.toggleCodeBlock().run()
                break
            case 'link':
                this.insertLink()
                break
            case 'image':
                document.getElementById('image-input').click()
                break
            case 'undo':
                chain.undo().run()
                break
            case 'redo':
                chain.redo().run()
                break
            // 新增操作
            case 'table':
                chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                break
            case 'highlight':
                chain.toggleHighlight().run()
                break
            case 'alignLeft':
                chain.setTextAlign('left').run()
                break
            case 'alignCenter':
                chain.setTextAlign('center').run()
                break
            case 'alignRight':
                chain.setTextAlign('right').run()
                break
            // BubbleMenu AI 操作
            case 'ai-rewrite':
                this.handleAiPolish('rewrite')
                break
            case 'ai-expand':
                this.handleAiPolish('expand')
                break
            case 'ai-image':
                this.handleAiGenerateImage()
                break
        }
        
        this.updateToolbarState()
    }
    
    // AI 生成配图
    async handleAiGenerateImage() {
        const { from, to } = this.editor.state.selection
        const selectedText = this.editor.state.doc.textBetween(from, to, ' ')
        
        if (!selectedText || selectedText.length < 5) {
            showToast('请选择至少 5 个字符的文本', 'error')
            return
        }
        
        showToast('正在生成配图...（功能开发中）')
        // TODO: 调用 AI 图像生成 API
        // const res = await apiRequest('/api/publisher/ai/generate-image', {
        //     method: 'POST',
        //     body: JSON.stringify({ text: selectedText })
        // })
    }
    
    insertLink() {
        const previousUrl = this.editor.getAttributes('link').href
        const url = window.prompt('输入链接地址', previousUrl || 'https://')
        
        if (url === null) return
        
        if (url === '') {
            this.editor.chain().focus().extendMarkRange('link').unsetLink().run()
        } else {
            this.editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        }
    }
    
    updateToolbarState() {
        const toolbar = document.getElementById('editor-toolbar')
        const buttons = toolbar.querySelectorAll('button[data-action]')
        
        buttons.forEach(button => {
            const action = button.dataset.action
            let isActive = false
            
            switch (action) {
                case 'bold':
                    isActive = this.editor.isActive('bold')
                    break
                case 'italic':
                    isActive = this.editor.isActive('italic')
                    break
                case 'strike':
                    isActive = this.editor.isActive('strike')
                    break
                case 'heading1':
                    isActive = this.editor.isActive('heading', { level: 1 })
                    break
                case 'heading2':
                    isActive = this.editor.isActive('heading', { level: 2 })
                    break
                case 'heading3':
                    isActive = this.editor.isActive('heading', { level: 3 })
                    break
                case 'bulletList':
                    isActive = this.editor.isActive('bulletList')
                    break
                case 'orderedList':
                    isActive = this.editor.isActive('orderedList')
                    break
                case 'blockquote':
                    isActive = this.editor.isActive('blockquote')
                    break
                case 'code':
                    isActive = this.editor.isActive('code')
                    break
                case 'codeBlock':
                    isActive = this.editor.isActive('codeBlock')
                    break
                case 'link':
                    isActive = this.editor.isActive('link')
                    break
            }
            
            button.classList.toggle('is-active', isActive)
        })
    }
    
    showPreview() {
        const title = document.getElementById('title').value.trim()
        const digest = document.getElementById('digest').value.trim()
        const content = this.editor.getHTML()
        
        document.getElementById('preview-title').textContent = title || '无标题'
        document.getElementById('preview-digest').textContent = digest
        document.getElementById('preview-content').innerHTML = content
        
        const coverImg = document.getElementById('preview-cover')
        if (this.coverUrl) {
            coverImg.src = this.coverUrl
            coverImg.classList.remove('hidden')
        } else {
            coverImg.classList.add('hidden')
        }
        
        document.getElementById('preview-modal').classList.remove('hidden')
    }
    
    hidePreview() {
        document.getElementById('preview-modal').classList.add('hidden')
    }
    
    showPublishModal() {
        // Save before publish
        if (this.isDirty) {
            this.saveDraft()
        }
        
        const title = document.getElementById('title')?.value?.trim() || ''
        
        if (!title) {
            showToast('请输入标题', 'error')
            document.getElementById('title').focus()
            return
        }
        
        // 更新预览内容
        document.getElementById('publish-preview-title').textContent = title
        document.getElementById('publish-preview-digest').textContent = 
            document.getElementById('digest')?.value?.trim() || ''
        
        document.getElementById('publish-modal').classList.remove('hidden')
    }
    
    hidePublishModal() {
        document.getElementById('publish-modal').classList.add('hidden')
    }
    
    async confirmPublish() {
        const title = document.getElementById('title').value.trim()
        const digest = document.getElementById('digest').value.trim()
        const htmlContent = this.editor.getHTML()
        
        // Disable button
        const confirmBtn = document.getElementById('btn-confirm-publish')
        confirmBtn.disabled = true
        confirmBtn.textContent = '发布中...'
        
        try {
            // 先保存草稿
            if (this.isDirty || !this.draftId) {
                await this.saveDraft()
            }
            
            // 确保草稿已保存
            if (!this.draftId) {
                throw new Error('草稿保存失败，请重试')
            }
            
            // 调用发布 API
            const res = await apiRequest(`/api/publisher/drafts/${this.draftId}/publish`, {
                method: 'POST',
            })
            
            if (res.ok && res.data) {
                this.hidePublishModal()
                showToast('发布成功！', 'success')
                
                // 跳转到文章页面
                if (res.data.article_url) {
                    setTimeout(() => {
                        window.location.href = res.data.article_url
                    }, 1000)
                }
            }
        } catch (error) {
            console.error('Publish failed:', error)
            showError(error, '发布失败')
        } finally {
            confirmBtn.disabled = false
            confirmBtn.textContent = '确认发布'
        }
    }
    
}

// ==================== Initialize ====================

document.addEventListener('DOMContentLoaded', () => {
    const editor = new ArticleEditor()
    editor.init()
    
    // Expose for debugging
    window.articleEditor = editor
})
