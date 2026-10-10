import { appTools, defineConfig } from '@modern-js/app-tools';
import { readFileSync } from 'node:fs';
import { bffPlugin } from '@modern-js/plugin-bff';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
export default defineConfig({
  plugins: [appTools(), bffPlugin()],
  server: { port: 4174, ssr: false, tsconfigPath: "./tsconfig.server.json" },
  source: { define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME || new Date().toISOString()),
  } },
  html: { title: '正经报价 · 报价工作台', meta: { viewport: 'width=device-width, initial-scale=1.0, viewport-fit=cover' } },
});
