# RWKV Concurrency Demo

一个用于并发流式生成压测与可视化展示的前端项目，当前保留三套皮肤：`minimal`、`matrix`、`digital rain`。

## 快速开始

1. 安装依赖：`npm install`
2. 启动开发环境：`npm run dev`
3. 打开：`http://localhost:3000`

## API 配置

本仓库不内置任何默认 API 地址，也不内置默认 `API key` 或 `API password`。

运行后请在设置面板中手动填写你自己的配置：

- `API URL`：请填写完整的 endpoint 地址
- `API key`：可选
- `API password`：可选
- `Model`：可自动检测，也可手动自定义

如果你没有填写完整 endpoint，前端不会再自动补全默认路径。

## 可选本地代理

如果你希望前端请求 `/api/...`，需要显式配置代理目标：

- 开发模式：`API_PROXY_TARGET="<YOUR_API_BASE_URL>" npm run dev`
- 构建后本地服务：`API_PROXY_TARGET="<YOUR_API_BASE_URL>" npm run serve`
- 分发版静态服务：`API_PROXY_TARGET="<YOUR_API_BASE_URL>" node serve-dist.mjs`

未设置 `API_PROXY_TARGET` 时，`/api` 代理不会指向任何默认上游；此时请直接在界面里填写完整 API URL。

## 构建

- 构建：`npm run build`
- 本地启动构建产物：`npm run serve`

## 在另一台电脑运行

如果另一台电脑不方便拉代码库，可以这样做：

1. 在当前机器执行 `npm run build`
2. 复制 `dist/` 和 `serve-dist.mjs` 到另一台电脑
3. 确保另一台电脑安装了 Node.js 18+
4. 运行 `node serve-dist.mjs`
5. 打开 `http://localhost:3000`

如果你希望那台电脑也走 `/api` 代理，再额外设置 `API_PROXY_TARGET`；否则直接在网页设置里填写完整 API URL 即可。
