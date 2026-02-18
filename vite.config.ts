import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev server adds Content-Encoding: gzip to .gz files, breaking pako.
// Block that header so .gz files are served as raw binary.
const serveGzRaw = (): Plugin => ({
    name: 'serve-gz-raw',
    configureServer(server) {
        server.middlewares.use((req, res, next) => {
            if (req.url?.match(/\.gz(\?|$)/)) {
                const orig = res.setHeader.bind(res);
                (res as any).setHeader = (name: string, value: unknown) => {
                    if (name.toLowerCase() === 'content-encoding') return res;
                    return orig(name, value as any);
                };
            }
            next();
        });
    },
});

export default defineConfig({
    plugins: [react(), serveGzRaw()],
    base: '/hakuraku/',
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    echarts: ['echarts', 'echarts-for-react'],
                    sqljs: ['sql.js'],
                    codemirror: ['@uiw/react-codemirror', '@codemirror/lang-sql', '@codemirror/theme-one-dark'],
                    markdown: ['react-markdown', 'rehype-katex', 'remark-gfm', 'remark-math', 'katex'],
                },
            },
        },
    },
});

