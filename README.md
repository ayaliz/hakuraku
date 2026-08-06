# Hakuraku

This repository contains the frontend for [hakuraku.moe](https://hakuraku.moe/), a site focused on Uma Musume race replay viewing, analysis, and related tools for the global version of the game.

## Origin

This project began as a detached fork of the original Hakuraku project by SSHZ.ORG:

[https://github.com/SSHZ-ORG/hakuraku/](https://github.com/SSHZ-ORG/hakuraku/)

## License

This repository is distributed under the MIT License. See [LICENSE](./LICENSE) for the full license text.

## Local API Proxy

To run the local Vite frontend against the live Worker API while keeping frontend requests same-origin, run:

```powershell
yarn start:live-api
```

Or set a custom target manually:

```powershell
$env:VITE_DEV_API_PROXY_TARGET="https://hakuraku.moe"
yarn start
```

This proxies `/api/*` and `/healthz` from the Vite dev server to the target origin.
