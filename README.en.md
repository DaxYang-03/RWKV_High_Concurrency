# RWKV Concurrency Demo

[Simplified Chinese](./README.md) | [English](./README.en.md)

A frontend project for high-concurrency streaming generation benchmarking and visualization. It currently keeps three themes: `minimal`, `matrix`, and `digital rain`.

## Quick Start

1. Install dependencies: `npm install`
2. Start the development server: `npm run dev`
3. Open: `http://localhost:3000`

## API Configuration

This repository does not ship with any default API URL, `API key`, or `API password`.

After launch, fill in your own configuration from the settings panel:

- `API URL`: you can enter a host, a base URL, or a full endpoint; the UI auto-completes common paths when needed
- `API key`: optional
- `API password`: optional
- `Model`: can be auto-detected or manually specified

If `API URL` is left blank, the frontend will not send requests.

## Optional Local Proxy

If you want the frontend to call `/api/...`, you must explicitly configure the proxy target:

- Dev mode: `API_PROXY_TARGET="<YOUR_API_BASE_URL>" npm run dev`
- Serve the build locally: `API_PROXY_TARGET="<YOUR_API_BASE_URL>" npm run serve`
- Standalone static distribution: `API_PROXY_TARGET="<YOUR_API_BASE_URL>" node serve-dist.mjs`

When `API_PROXY_TARGET` is not set, the `/api` proxy does not point to any default upstream. In that case, fill in the API URL directly in the UI.

## Build

- Build: `npm run build`
- Serve the built app locally: `npm run serve`

## Run on Another Computer

If the other computer cannot conveniently pull the repository, you can do this instead:

1. Run `npm run build` on the current machine
2. Copy `dist/` and `serve-dist.mjs` to the other computer
3. Make sure Node.js 18+ is installed there
4. Run `node serve-dist.mjs`
5. Open `http://localhost:3000`

If you also want that machine to use the `/api` proxy, set `API_PROXY_TARGET` there as well; otherwise, just fill in the API URL from the web UI.
