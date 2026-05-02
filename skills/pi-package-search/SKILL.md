---
name: pi-package-search
description: Search npm for installable pi packages tagged with pi-package. Use when the user wants to find pi extensions, skills, prompts, themes, or other pi packages to install.
---

# Pi Package Search

Use the `search_pi_packages` tool when the user wants to discover pi packages to install.

Use the `install_pi_package` tool only when the user explicitly asks to install one of the packages. Successful installs queue Pi's reload flow as a follow-up by default so the package becomes available after the current turn.

## Workflow

1. Start with the user's words as the search query.
2. If the first search is weak, try one or two broader or narrower follow-up queries.
3. Return the most relevant packages, each with:
   - package name
   - one-line description
   - `pi install npm:<package-name>`
4. If the user clearly chooses a package and asks to install it, use `install_pi_package`.
5. After install, mention whether the tool queued reload or told the user to run `/reload` manually.
6. Keep the answer short unless the user asks for a deeper comparison.

## Notes

- This package only searches npm packages tagged with `pi-package`.
- Prefer exact install commands so the user can copy-paste them.
- Leave `reloadAfterInstall` at its default unless the user explicitly wants to batch installs before reloading.
- If the user still is not sure which package to pick, suggest the top 2 or 3 options and explain the difference.
