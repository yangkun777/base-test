import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5273,
    proxy: {
      '/api': 'http://localhost:3100'
    }
  },
  build: {
    outDir: 'dist',
    // 沙箱环境不支持 trash 删除，关闭预清空，靠 hash 文件名天然覆盖
    emptyOutDir: false,
    // 本机环境会间歇性破坏 esbuild 原生进程的文件读取，构建完全绕开 esbuild：
    // esnext 免转译 + 不压缩（配合 package.json 的 --configLoader runner）
    target: 'esnext',
    minify: false
  }
})
