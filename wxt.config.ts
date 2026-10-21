import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: 'src',
    modules: ['@wxt-dev/auto-icons'],
    manifest: {
        permissions: ['storage', 'activeTab', 'unlimitedStorage'],
        host_permissions: ['https://www.udemy.com/*', 'https://*.udemycdn.com/*'],
        action: {
            default_popup: 'entrypoints/popup/index.html',
     },
  },
});
