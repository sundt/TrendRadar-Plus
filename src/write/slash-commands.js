/**
 * Slash Commands Extension for Tiptap
 * 
 * 输入 / 弹出命令菜单，类似 Notion
 */

import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import tippy from 'tippy.js'

// 命令列表
const COMMANDS = [
    {
        title: '标题 1',
        description: '大标题',
        icon: 'H1',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
        },
    },
    {
        title: '标题 2',
        description: '中标题',
        icon: 'H2',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
        },
    },
    {
        title: '标题 3',
        description: '小标题',
        icon: 'H3',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
        },
    },
    {
        title: '无序列表',
        description: '创建无序列表',
        icon: '•',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleBulletList().run()
        },
    },
    {
        title: '有序列表',
        description: '创建有序列表',
        icon: '1.',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleOrderedList().run()
        },
    },
    {
        title: '引用',
        description: '插入引用块',
        icon: '"',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleBlockquote().run()
        },
    },
    {
        title: '代码块',
        description: '插入代码块',
        icon: '</>',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
        },
    },
    {
        title: '分割线',
        description: '插入水平分割线',
        icon: '—',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).setHorizontalRule().run()
        },
    },
    {
        title: '表格',
        description: '插入 3x3 表格',
        icon: '▦',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        },
    },
    {
        title: '图片',
        description: '上传图片',
        icon: '🖼',
        command: ({ editor, range }) => {
            editor.chain().focus().deleteRange(range).run()
            document.getElementById('image-input')?.click()
        },
    },
]

// 创建 Slash Commands 扩展
export const SlashCommands = Extension.create({
    name: 'slashCommands',

    addOptions() {
        return {
            suggestion: {
                char: '/',
                command: ({ editor, range, props }) => {
                    props.command({ editor, range })
                },
            },
        }
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
                items: ({ query }) => {
                    return COMMANDS.filter(item =>
                        item.title.toLowerCase().includes(query.toLowerCase()) ||
                        item.description.toLowerCase().includes(query.toLowerCase())
                    ).slice(0, 10)
                },
                render: () => {
                    let component
                    let popup

                    return {
                        onStart: props => {
                            component = new CommandList(props)
                            
                            if (!props.clientRect) return

                            popup = tippy('body', {
                                getReferenceClientRect: props.clientRect,
                                appendTo: () => document.body,
                                content: component.element,
                                showOnCreate: true,
                                interactive: true,
                                trigger: 'manual',
                                placement: 'bottom-start',
                            })
                        },

                        onUpdate(props) {
                            component?.updateProps(props)

                            if (!props.clientRect) return

                            popup?.[0]?.setProps({
                                getReferenceClientRect: props.clientRect,
                            })
                        },

                        onKeyDown(props) {
                            if (props.event.key === 'Escape') {
                                popup?.[0]?.hide()
                                return true
                            }

                            return component?.onKeyDown(props)
                        },

                        onExit() {
                            popup?.[0]?.destroy()
                            component?.destroy()
                        },
                    }
                },
            }),
        ]
    },
})

// 命令列表 UI 组件
class CommandList {
    constructor(props) {
        this.props = props
        this.selectedIndex = 0
        this.element = this.createElement()
        this.render()
    }

    createElement() {
        const el = document.createElement('div')
        el.className = 'slash-command-list'
        return el
    }

    updateProps(props) {
        this.props = props
        this.selectedIndex = 0
        this.render()
    }

    onKeyDown({ event }) {
        if (event.key === 'ArrowUp') {
            this.selectedIndex = (this.selectedIndex - 1 + this.props.items.length) % this.props.items.length
            this.render()
            return true
        }

        if (event.key === 'ArrowDown') {
            this.selectedIndex = (this.selectedIndex + 1) % this.props.items.length
            this.render()
            return true
        }

        if (event.key === 'Enter') {
            this.selectItem(this.selectedIndex)
            return true
        }

        return false
    }

    selectItem(index) {
        const item = this.props.items[index]
        if (item) {
            this.props.command(item)
        }
    }

    render() {
        const { items } = this.props

        if (items.length === 0) {
            this.element.innerHTML = '<div class="slash-command-empty">没有匹配的命令</div>'
            return
        }

        this.element.innerHTML = items.map((item, index) => `
            <button
                class="slash-command-item ${index === this.selectedIndex ? 'is-selected' : ''}"
                data-index="${index}"
            >
                <span class="slash-command-icon">${item.icon}</span>
                <div class="slash-command-content">
                    <span class="slash-command-title">${item.title}</span>
                    <span class="slash-command-description">${item.description}</span>
                </div>
            </button>
        `).join('')

        // 绑定点击事件
        this.element.querySelectorAll('.slash-command-item').forEach(button => {
            button.addEventListener('click', () => {
                this.selectItem(parseInt(button.dataset.index))
            })
        })
    }

    destroy() {
        this.element.remove()
    }
}

export default SlashCommands
