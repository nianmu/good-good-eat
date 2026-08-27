import type { UserConfigExport } from "@tarojs/cli"
import type { IH5Config } from "@tarojs/taro/types/compile/config/h5"

// 修复 H5 dev：core-js-pure 的 ESM/CJS 互操作导致 "does not provide an export named 'default'"
// 排除预构建，让 Vite 按源码 CJS 处理。
// 说明：vite 字段由 @tarojs/vite-runner 在运行时消化，但官方类型未声明，这里做一次收窄断言。
const h5DevConfig = {
  vite: {
    optimizeDeps: {
      exclude: ['core-js-pure', '@babel/runtime']
    }
  }
} as unknown as IH5Config<'vite'>

export default {
  mini: {},
  h5: h5DevConfig
} satisfies UserConfigExport<'vite'>
