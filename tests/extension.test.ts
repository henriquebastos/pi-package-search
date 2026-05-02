import { describe, expect, it, vi } from "vitest";

import extension from "../extensions/index.ts";

describe("extension", () => {
  it("registers the pi package search and install tools", () => {
    const registeredTools: Array<{ name: string }> = [];

    extension({
      registerTool(tool: { name: string }) {
        registeredTools.push(tool);
      },
      registerCommand() {},
    } as never);

    expect(registeredTools).toHaveLength(2);
    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "search_pi_packages",
      "install_pi_package",
    ]);
  });

  it("registers a reload command bridge", async () => {
    const registeredCommands: Array<{
      name: string;
      handler: (
        args: string,
        ctx: { reload: () => Promise<void> },
      ) => Promise<void>;
    }> = [];

    extension({
      registerTool() {},
      registerCommand(
        name: string,
        options: {
          handler: (
            args: string,
            ctx: { reload: () => Promise<void> },
          ) => Promise<void>;
        },
      ) {
        registeredCommands.push({ name, handler: options.handler });
      },
    } as never);

    const command = registeredCommands.find(
      (command) => command.name === "pi-package-search-reload",
    );
    const reload = vi.fn().mockResolvedValue(undefined);

    expect(command).toBeDefined();
    await command?.handler("", { reload });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("queues the reload bridge command after install", async () => {
    const registeredTools: Array<{
      name: string;
      execute: (
        toolCallId: string,
        params: { packageName: string },
        signal?: AbortSignal,
      ) => Promise<{ details?: unknown }>;
    }> = [];
    const sendUserMessage = vi.fn();

    extension({
      registerTool(tool: (typeof registeredTools)[number]) {
        registeredTools.push(tool);
      },
      registerCommand() {},
      sendUserMessage,
      exec: vi.fn().mockResolvedValue({
        stdout: "installed",
        stderr: "",
        code: 0,
        killed: false,
      }),
    } as never);

    const installTool = registeredTools.find(
      (tool) => tool.name === "install_pi_package",
    );

    expect(installTool).toBeDefined();
    const result = await installTool?.execute("tool-call-1", {
      packageName: "@acme/pi-toolkit",
    });

    expect(sendUserMessage).toHaveBeenCalledWith("/pi-package-search-reload", {
      deliverAs: "followUp",
    });
    expect(result?.details).toMatchObject({ reloadQueued: true });
  });
});
