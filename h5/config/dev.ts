import type { UserConfigExport } from "@tarojs/cli"

export default {
  
  mini: {},
  h5: {
    // 修复 H5 dev：core-js-pure 的 ESM/CJS 互操作导致 "does not provide an export named 'default'"
    // 排除预构建，让 Vite 按源码 CJS 处理
    vite: {
      optimizeDeps: {
        exclude: ['core-js-pure', '@babel/runtime']
      }
    }
  }
} satisfies UserConfigExport<'vite'>
