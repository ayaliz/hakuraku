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
    optimizeDeps: {
        // 'events' polyfill for react-bootstrap-table-next (not auto-provided by Vite 5)
        include: ['events', 'react-bootstrap-table-next'],
    },
});

