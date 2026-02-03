import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    root: 'src/write',
    base: '/static/write/',
    build: {
        outDir: '../../hotnews/web/static/write',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'src/write/index.html'),
                drafts: resolve(__dirname, 'src/write/drafts.html'),
            },
        },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
        },
    },
})
