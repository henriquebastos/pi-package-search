import {
  defineTool,
  type ExecOptions,
  type ExecResult,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export interface InstallPiPackageDetails {
  source: string;
  command: string;
  project: boolean;
  stdout: string;
  stderr: string;
  code: number;
  reloadQueued: boolean;
}

export interface InstallPiPackageOptions {
  execImpl?: ExecLike;
  queueReloadFollowUp?: () => void;
}

type ExecLike = (
  command: string,
  args: string[],
  options?: ExecOptions,
) => Promise<ExecResult>;

export function normalizePackageSource(packageName: string): string {
  const trimmedPackageName = packageName.trim();

  if (!trimmedPackageName) {
    throw new Error("Package name is required");
  }

  const normalizedInput = trimmedPackageName
    .replace(/^pi\s+install\s+(?:-l\s+)?/i, "")
    .trim();

  if (normalizedInput.startsWith("npm:")) {
    return normalizedInput;
  }

  return `npm:${normalizedInput}`;
}

export function createInstallPiPackageTool(
  options: InstallPiPackageOptions = {},
) {
  return defineTool({
    name: "install_pi_package",
    label: "Install Pi Package",
    description:
      "Install a pi package from npm using pi install. Use this only when the user explicitly wants to install a package.",
    promptSnippet:
      "Install a pi package from npm with pi install after the user has chosen a package.",
    promptGuidelines: [
      "Use this tool only when the user explicitly asks to install a pi package.",
      "Prefer search_pi_packages first when the user still needs help choosing a package.",
    ],
    parameters: Type.Object({
      packageName: Type.String({
        description:
          "npm package name or npm specifier, for example @scope/pkg or npm:@scope/pkg@1.2.3.",
      }),
      project: Type.Optional(
        Type.Boolean({
          description:
            "Install into project settings with pi install -l instead of global settings.",
        }),
      ),
      reloadAfterInstall: Type.Optional(
        Type.Boolean({
          description:
            "Queue Pi reload after a successful install. Defaults to true.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const execImpl = options.execImpl;

      if (!execImpl) {
        throw new Error("exec is not available in this runtime");
      }

      const source = normalizePackageSource(params.packageName);
      const args = params.project
        ? ["install", "-l", source]
        : ["install", source];
      const command = `pi ${args.join(" ")}`;
      const result = await execImpl("pi", args, { signal });

      if (result.killed) {
        throw new Error("pi install was killed");
      }

      if (result.code !== 0) {
        throw new Error(`pi install failed: ${getFailureReason(result)}`);
      }

      const shouldQueueReload = params.reloadAfterInstall !== false;
      let reloadQueued = false;

      if (shouldQueueReload && options.queueReloadFollowUp) {
        try {
          options.queueReloadFollowUp();
          reloadQueued = true;
        } catch {
          reloadQueued = false;
        }
      }

      const scopeLabel = params.project ? "project" : "global";
      let text = `Installed ${source} (${scopeLabel} scope).\nCommand: ${command}`;
      const stdout = result.stdout.trim();

      if (stdout) {
        text += `\n\n${stdout}`;
      }

      if (reloadQueued) {
        text +=
          "\n\nQueued Pi reload as a follow-up so the package becomes available after this turn.";
      } else {
        text += "\n\nRun /reload to activate it.";
      }

      return {
        content: [{ type: "text", text }],
        details: {
          source,
          command,
          project: Boolean(params.project),
          stdout: result.stdout,
          stderr: result.stderr,
          code: result.code,
          reloadQueued,
        } satisfies InstallPiPackageDetails,
      };
    },
  });
}

function getFailureReason(result: ExecResult): string {
  const stderr = result.stderr.trim();

  if (stderr) {
    return stderr;
  }

  const stdout = result.stdout.trim();

  if (stdout) {
    return stdout;
  }

  return `exit code ${result.code}`;
}
