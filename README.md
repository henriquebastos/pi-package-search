<div align="center">

# pi-package-search

**Search npm for installable Pi packages, then install the right one without leaving Pi.**

<p>
  <a href="https://github.com/forjd/pi-package-search/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/forjd/pi-package-search/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/forjd/pi-package-search/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/forjd/pi-package-search"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="package.json"><img alt="Node >= 20.6" src="https://img.shields.io/badge/node-%3E%3D20.6-339933?logo=node.js&logoColor=white"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white"></a>
</p>

<p>
  <a href="https://biomejs.dev/"><img alt="Biome" src="https://img.shields.io/badge/Biome-60A5FA?logo=biome&logoColor=white"></a>
  <a href="https://vitest.dev/"><img alt="Vitest" src="https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white"></a>
  <a href="https://www.npmjs.com/package/pi-package-search"><img alt="npm version" src="https://img.shields.io/npm/v/pi-package-search"></a>
  <a href="https://github.com/forjd/pi-package-search/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/forjd/pi-package-search"></a>
  <a href="https://github.com/forjd/pi-package-search/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/forjd/pi-package-search"></a>
</p>

</div>

`pi-package-search` adds package discovery to Pi with two tools and a matching skill:

- `search_pi_packages` searches npm for packages tagged with `pi-package`
- `install_pi_package` installs the package the user chooses and queues a Pi reload follow-up after success
- `/skill:pi-package-search` guides Pi to use the right workflow

It uses the same npm registry search endpoint behind the Pi package gallery, then formats results as ready-to-run `pi install` commands.

## Why this exists

Discovering Pi packages is easier when Pi can do the searching for you.

This package helps Pi:

- find relevant packages from npm
- stay focused on packages intended for Pi
- return short descriptions with copy-pasteable install commands
- install a selected package in global or project scope
- activate newly installed packages by queueing Pi's reload flow after install

## What's included

| Component | Name | Purpose |
| --- | --- | --- |
| Tool | `search_pi_packages` | Search npm for packages tagged with `pi-package` |
| Tool | `install_pi_package` | Run `pi install` for a chosen package and queue reload |
| Skill | `/skill:pi-package-search` | Prompt Pi to use the package discovery workflow |

## Install

### From a local checkout

```bash
pi install /absolute/path/to/pi-package-search
```

### From npm

```bash
pi install npm:pi-package-search
```


## Usage

### Ask Pi naturally

- `Find pi packages for session search`
- `Search for pi packages related to browser automation`
- `Show me pi packages for git workflows`

### Or invoke the skill directly

```text
/skill:pi-package-search browser automation
```

### Example result

```text
Found 3 pi packages for "browser automation"

1. @scope/package-name@1.2.3
   Short description here.
   Install: pi install npm:@scope/package-name
   npm: https://www.npmjs.com/package/@scope/package-name
```

If the user already knows what they want, `install_pi_package` can install it directly:

- global scope: `pi install npm:@scope/package-name`
- project scope: `pi install -l npm:@scope/package-name`
- it also tolerates the user or model passing the full command back in, like `pi install npm:@scope/package-name`
- successful installs queue Pi's reload flow as a follow-up so the package becomes available after the current turn
- set `reloadAfterInstall: false` only when intentionally batching installs; then run `/reload` manually

## How it works

`search_pi_packages` calls the npm registry search API and automatically adds the `keywords:pi-package` filter.

Each result is normalized into:

- package name and version
- short description
- npm package URL
- homepage URL when available
- a copy-pasteable `pi install` command

`install_pi_package` accepts either:

- a bare package name like `@scope/pkg`
- a full npm source like `npm:@scope/pkg@1.2.3`
- a full command like `pi install npm:@scope/pkg` or `pi install -l @scope/pkg`

After a successful install, the extension queues its internal reload command with Pi's follow-up delivery. If reload queueing is unavailable or disabled with `reloadAfterInstall: false`, the tool result tells the user to run `/reload` manually.

## Development

```bash
npm install
npm run check
```

Useful commands:

```bash
npm run test
npm run lint
npm run format
npm run typecheck
npm run e2e
npm run publish:dry-run
```

## Project structure

```text
extensions/index.ts          # Registers the tools with Pi
src/search-pi-packages.ts    # npm search client + result formatting
src/install-pi-package.ts    # pi install wrapper
skills/pi-package-search/    # matching discovery skill
tests/                       # Vitest coverage for tools and extension wiring
```

## E2E smoke test

Run the real Pi flow locally with your configured Pi model credentials:

```bash
npm run e2e
```

What it does:

1. creates a temporary git repo
2. installs this package into that repo
3. runs `/skill:pi-package-search session search`
4. verifies `search_pi_packages` was called
5. runs `Install @kaiserlich-dev/pi-session-search in this project.`
6. verifies `install_pi_package` was called and updated `.pi/settings.json`

Useful environment variables:

- `PI_PACKAGE_SEARCH_SOURCE` — override the package source, for example `npm:pi-package-search`
- `PI_E2E_TEST_INSTALL_PACKAGE` — package installed during the smoke test
- `PI_E2E_MODEL` — override the Pi model used during the run
- `PI_E2E_KEEP_TMPDIR=1` — keep the temp directory for debugging
- `PI_E2E_ISOLATE_AGENT_DIR=1` — use a clean Pi config directory instead of your current auth/config

## Publishing

Local publish sanity check:

```bash
npm run publish:dry-run
```

One-time npm setup after the first manual publish:

1. open the `pi-package-search` package settings on npmjs.com
2. add a trusted publisher for the GitHub repo `forjd/pi-package-search`
3. select the workflow file `.github/workflows/release.yml`

GitHub Actions workflows included in this repo:

- `CI` — lint, typecheck, unit tests, and `npm pack --dry-run`
- `Conventional Commits` — enforces a semantic pull request title
- `E2E` — installs the package into a temp repo and exercises the real Pi flow
- `Release Please` — opens release PRs, bumps semver versions, and publishes to npm with trusted publishing when a release is created

> [!NOTE]
> npm publishing now uses npm trusted publishing via GitHub Actions OIDC, so the release workflow does not need `NPM_TOKEN` or any model provider key.

## Conventional commits and releases

This repository uses Conventional Commits for release automation.

Local enforcement:

- `simple-git-hooks` runs `commitlint` in the `commit-msg` hook
- `pre-commit` still runs lint + typecheck
- `pre-push` still runs tests

GitHub enforcement:

- the `Conventional Commits` workflow checks pull request titles
- `Release Please` reads conventional commit history to decide whether the next release is a patch, minor, or major bump
- when Release Please creates a release, the same workflow publishes the package to npm automatically with trusted publishing
- model-backed Pi smoke tests stay in the separate `E2E` workflow, not in the release path

## Quality checks

- Vitest covers URL building, result mapping, formatting, install behavior, and extension registration
- Biome handles formatting and linting
- GitHub Actions runs CI plus a real Pi E2E smoke test workflow
- commitlint and semantic PR checks enforce conventional commits
- release-please is bootstrapped from the manually published `0.1.0` release via `.release-please-manifest.json`

## License

MIT © Dan
