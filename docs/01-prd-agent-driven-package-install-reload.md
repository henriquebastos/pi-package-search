# PRD: Agent-driven Pi package discovery, install, and follow-up reload

## 1. Summary

`pi-package-search` already lets Pi discover npm packages tagged with `pi-package` and install a selected package via `pi install`. The missing product behavior is completing the loop: after a successful install, Pi should trigger its existing reload flow as a follow-up so newly installed extensions, skills, prompts, and themes become available without asking the user to remember `/reload`.

This should not create a new reload system. The feature should schedule Pi's existing reload behavior after installation, using Pi's follow-up message queue so the reload happens after the current agent turn has completed.

## 2. Problem

Today the workflow is:

1. User asks Pi to find a package.
2. Pi calls `search_pi_packages`.
3. User chooses one and asks Pi to install it.
4. Pi calls `install_pi_package`.
5. Install succeeds.
6. User still has to manually run `/reload` before the newly installed package is active.

This breaks the user's goal: “allow Pi to find, install, and auto-reload its own extensions.”

## 3. Background and research notes

### 3.1 Pi package discovery

Pi packages are identifiable on npm by the `pi-package` keyword:

```json
{
  "keywords": ["pi-package"]
}
```

The npm registry search endpoint is:

```text
https://registry.npmjs.org/-/v1/search?text=keywords:pi-package%20<query>&size=<n>&from=<offset>
```

Relevant response shape:

```ts
interface NpmSearchResponse {
  total?: number;
  objects?: Array<{
    package?: {
      name?: string;
      version?: string;
      description?: string;
      keywords?: string[];
      date?: string;
      links?: {
        npm?: string;
        homepage?: string;
        repository?: string;
        bugs?: string;
      };
    };
    downloads?: {
      monthly?: number;
      weekly?: number;
    };
    score?: { final?: number };
    searchScore?: number;
  }>;
}
```

`pi.dev/packages` appears to be server-rendered. The shipped browser JavaScript only handles copy buttons, logo menu behavior, analytics, and package media modals. Search/filter/sort are handled via query params, not client-side JS:

```text
/packages?name=<query>&type=<extension|skill|prompt|theme>&sort=<downloads|recent|name>&page=<n>
```

For this package, npm registry search remains the right protocol.

### 3.2 Pi package manifest

Package authors declare Pi resources in `package.json`:

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"],
    "image": "https://example.com/screenshot.png",
    "video": "https://example.com/demo.mp4"
  }
}
```

### 3.3 Existing packages

Closest existing packages:

- `pi-package-search`: LLM-callable tools for search and install. Missing follow-up reload.
- `pi-extmgr` / `pi-extension-manager`: interactive TUI package managers. They install/remove/update and call `ctx.reload()` from command context.
- `lazy-pi`: package manager UI with reload after mutations, but it uses its own loader workspace rather than Pi's normal `packages` settings.

This PRD targets `pi-package-search` because it already has the agent-facing search/install flow.

## 4. Goals

1. Pi can search npm for Pi packages through `search_pi_packages`.
2. Pi can install a chosen Pi package through `install_pi_package`.
3. After successful install, Pi automatically schedules a reload using follow-up delivery.
4. The reload must run only after the current agent turn finishes.
5. The user-facing behavior should refer to Pi's existing reload, not a separate reload concept.
6. The feature must remain safe: installation only happens when the user explicitly asks for it.

## 5. Non-goals

1. Do not build a full TUI package manager.
2. Do not replace `pi install` or reimplement Pi's package manager.
3. Do not create a new reload mechanism independent of Pi's reload flow.
4. Do not auto-install packages from search results without explicit user intent.
5. Do not attempt to fully mirror `pi.dev/packages` server-side ranking/filtering in this package.

## 6. User stories

1. As a user, I can ask “find Pi packages for browser automation” and get relevant installable packages.
2. As a user, I can say “install package X” and Pi installs it.
3. As a user, after install succeeds, I do not need to manually remember `/reload`.
4. As a user, if install fails, Pi does not reload.
5. As a user, I can opt out of auto-reload if I want to batch installs.

## 7. Proposed UX

### 7.1 Default install flow

User:

```text
Install pi-package-search globally.
```

Tool result:

```text
Installed npm:pi-package-search (global scope).
Command: pi install npm:pi-package-search

Queued Pi reload as a follow-up so the package becomes available after this turn.
```

Then Pi schedules a follow-up message that triggers reload.

### 7.2 Opt-out flow

`install_pi_package` should accept an optional reload control:

```ts
reloadAfterInstall?: boolean // default true
```

If `false`, the tool result should say:

```text
Installed npm:<package>. Run /reload to activate it.
```

## 8. Functional requirements

### 8.1 Search tool

Keep current behavior:

- Tool name: `search_pi_packages`
- Search npm with `keywords:pi-package <query>`
- Return concise package list with install commands
- Limit results to a safe maximum

### 8.2 Install tool

Extend current behavior:

- Tool name: `install_pi_package`
- Accept package name, `npm:` source, or full `pi install ...` command.
- Preserve project/global install support.
- Add `reloadAfterInstall?: boolean`, default `true`.
- Run `pi install` through `pi.exec` as today.
- If install succeeds and `reloadAfterInstall !== false`, queue a follow-up reload.
- If install fails, do not queue reload.

### 8.3 Follow-up reload

Core requirement:

```ts
pi.sendUserMessage(<reload command>, { deliverAs: "followUp" });
```

The queued reload must use follow-up delivery, not steering delivery, because reload should happen after install and after the current agent turn is complete.

Implementation should prefer using Pi's existing `/reload` command if it is executable through `sendUserMessage`. If built-in interactive slash commands are not routed from follow-up messages, add the smallest possible internal command bridge that calls `ctx.reload()` and queue that bridge command instead.

The product behavior remains: “queue Pi reload after install.”

## 9. Technical design

### 9.1 Extension setup

Register the existing tools as today.

Add a reload follow-up capability in the extension closure so the install tool can call `pi.sendUserMessage` after success.

Pseudo-shape:

```ts
export default function extension(pi: ExtensionAPI) {
  pi.registerTool(createSearchPiPackagesTool());

  pi.registerTool(
    createInstallPiPackageTool({
      execImpl: (command, args, options) => pi.exec(command, args, options),
      queueReloadFollowUp: () => {
        pi.sendUserMessage("/reload", { deliverAs: "followUp" });
      },
    }),
  );
}
```

If tests show that queued built-in `/reload` is not executed, use a command bridge:

```ts
pi.registerCommand("pi-package-search-reload", {
  description: "Reload Pi after package installation",
  handler: async (_args, ctx) => {
    await ctx.reload();
  },
});

// In the install tool after successful install:
pi.sendUserMessage("/pi-package-search-reload", { deliverAs: "followUp" });
```

The bridge is an implementation detail, not a user-facing replacement for `/reload`.

### 9.2 Install tool options

```ts
interface InstallPiPackageOptions {
  execImpl?: ExecLike;
  queueReloadFollowUp?: () => void;
}
```

Tool schema addition:

```ts
reloadAfterInstall: Type.Optional(
  Type.Boolean({
    description: "Queue Pi reload after a successful install. Defaults to true.",
  }),
)
```

### 9.3 Tool result details

Extend details:

```ts
interface InstallPiPackageDetails {
  source: string;
  command: string;
  project: boolean;
  stdout: string;
  stderr: string;
  code: number;
  reloadQueued: boolean;
}
```

## 10. Safety requirements

1. `install_pi_package` must remain explicitly install-only:
   - Search should not install.
   - The install tool prompt guidance must say to use it only when the user explicitly asks to install.
2. Package install security warning should stay visible in docs:
   - Pi packages can execute arbitrary code.
3. The tool should not reload if `pi install` exits non-zero or is killed.
4. The tool should not hide install output; failures must include useful stderr/stdout.
5. Consider adding UI confirmation later, but do not block this MVP on a new confirmation flow.

## 11. Edge cases

1. **Install succeeds but follow-up queue fails**
   - Tool result should still report install success and tell user to run `/reload` manually.

2. **No UI / print mode**
   - If follow-up reload is not meaningful in the run mode, return manual reload instructions.

3. **Project installs**
   - Reload should still run; project `.pi/settings.json` packages should become available in the current project session.

4. **Multiple installs in one turn**
   - MVP can queue multiple reloads, but should ideally coalesce to one reload per turn/session if simple.
   - Coalescing is optional for v1.

5. **Already installed package**
   - If `pi install` reports success/no-op, still queue reload by default because settings may have changed or resources may need refresh.

## 12. Acceptance criteria

1. Unit test: `install_pi_package` queues reload follow-up after successful `pi install`.
2. Unit test: `install_pi_package` does not queue reload when `pi install` fails.
3. Unit test: `reloadAfterInstall: false` suppresses reload queueing and returns manual reload text.
4. Unit test: tool details include `reloadQueued`.
5. E2E smoke: install a small Pi package in a temp project and verify reload is queued or executed.
6. README documents that successful installs auto-queue reload by default.
7. Skill instructions mention that install will activate the package via follow-up reload.

## 13. Open questions

1. Does `pi.sendUserMessage("/reload", { deliverAs: "followUp" })` execute Pi's built-in `/reload` in interactive mode?
   - Recommended answer: test this first.
   - If yes, use it directly.
   - If no, register a tiny internal command bridge and queue that.

2. Should auto-reload be default-on?
   - Recommended answer: yes, because it fulfills the product promise and matches user expectation after install.

3. Should installs require an extra UI confirmation?
   - Recommended answer: not for MVP; keep tool prompt guidance strict and rely on explicit user request. Consider confirmation as a follow-up security enhancement.

4. Should search results include package resource types from the `pi` manifest?
   - Recommended answer: later. Current npm search response does not include full manifest data; this requires extra registry manifest fetches per result.

## 14. Rollout plan

1. Add follow-up reload queue option to the install tool.
2. Add tests around queueing and failure behavior.
3. Test whether queued `/reload` works directly.
4. If not, add the internal command bridge.
5. Update README and skill docs.
6. Run existing checks and E2E smoke test.
