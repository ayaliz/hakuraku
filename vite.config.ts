import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

export default defineConfig(async ({ mode, command }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const devApiProxyTarget = env.VITE_DEV_API_PROXY_TARGET?.trim().replace(/\/$/, "");
    const umaMoeApiKey = env.UMAMOE_V3_API_KEY?.trim();
    const skillPreviewHandler = resolve('tools/local-cm16-skills.mjs');
    const skillPreview = command === 'serve' && env.LOCAL_CM16_SKILL_PREVIEW === '1' && existsSync(skillPreviewHandler) ? (await import(pathToFileURL(skillPreviewHandler).href)).default(process.cwd(), env.LOCAL_SIMDATA_PREVIEW === '1') : undefined;
    const previewHandler = resolve('tools/local-simdata-preview.mjs');
    const localPreview = command === 'serve' && env.LOCAL_SIMDATA_PREVIEW === '1' && existsSync(previewHandler)
        ? (await import(pathToFileURL(previewHandler).href)).default({ root: process.cwd(), apiKey: umaMoeApiKey, previewRoot: env.LOCAL_SIMDATA_PREVIEW_ROOT })
        : undefined;

    const apiProxy = devApiProxyTarget
        ? {
            "/api": {
                target: devApiProxyTarget,
                changeOrigin: true,
                secure: true,
            },
            "/healthz": {
                target: devApiProxyTarget,
                changeOrigin: true,
                secure: true,
            },
        }
        : undefined;

    return {
        plugins: [react(), serveGzRaw(), ...(skillPreview ? [skillPreview] : []), ...(localPreview ? [localPreview] : [])],
        base: env.VITE_BASE_PATH ?? '/',
        server: {
            proxy: apiProxy,
            watch: {
                ignored: [
                    '**/.git/**',
                    '**/.wrangler/**',
                    '**/dist/**',
                    '**/logs/**',
                    '**/assets/races/**',
                    '**/umdb/**',
                    '**/__pycache__/**',
                ],
            },
        },
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
    };
});

