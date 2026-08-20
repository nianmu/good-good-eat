// babel-preset-taro 更多选项和默认值：
// https://docs.taro.zone/docs/next/babel-config
module.exports = {
  presets: [
    ['taro', {
      framework: 'react',
      ts: true,
      compiler: 'vite',
      // 两端都关闭 core-js polyfill 注入：
      // H5 端现代浏览器原生支持所需 ES API，无需 core-js-pure；
      // 也规避 core-js-pure/features 在 Vite 的 CJS/ESM default 互操作报错。
      useBuiltIns: false
    }]
  ]
}
