import { describe, expect, it, vi } from "vitest";

import {
  createInstallPiPackageTool,
  normalizePackageSource,
} from "../src/install-pi-package.js";

describe("normalizePackageSource", () => {
  it("adds the npm prefix when the user gives a bare package name", () => {
    expect(normalizePackageSource("@acme/pi-toolkit")).toBe(
      "npm:@acme/pi-toolkit",
    );
  });

  it("keeps an existing npm source intact", () => {
    expect(normalizePackageSource("npm:@acme/pi-toolkit@1.2.3")).toBe(
      "npm:@acme/pi-toolkit@1.2.3",
    );
  });

  it("accepts a full pi install command", () => {
    expect(normalizePackageSource("pi install npm:@acme/pi-toolkit")).toBe(
      "npm:@acme/pi-toolkit",
    );
  });

  it("accepts a project-scope pi install command", () => {
    expect(normalizePackageSource("pi install -l @acme/pi-toolkit")).toBe(
      "npm:@acme/pi-toolkit",
    );
  });

  it("rejects an empty package name", () => {
    expect(() => normalizePackageSource("   ")).toThrow(
      "Package name is required",
    );
  });
});

describe("createInstallPiPackageTool", () => {
  it("installs a package in global scope by default", async () => {
    const execMock = vi.fn().mockResolvedValue({
      stdout: "installed",
      stderr: "",
      code: 0,
      killed: false,
    });
    const tool = createInstallPiPackageTool({ execImpl: execMock });

    const result = await tool.execute(
      "tool-call-1",
      { packageName: "@acme/pi-toolkit" },
      undefined,
      undefined,
      {} as never,
    );
    const firstContent = result.content[0];

    expect(execMock).toHaveBeenCalledWith(
      "pi",
      ["install", "npm:@acme/pi-toolkit"],
      { signal: undefined },
    );
    expect(firstContent?.type).toBe("text");

    if (!firstContent || firstContent.type !== "text") {
      throw new Error("Expected text content");
    }

    expect(firstContent.text).toContain("Installed npm:@acme/pi-toolkit");
    expect(result.details).toMatchObject({
      source: "npm:@acme/pi-toolkit",
      project: false,
      command: "pi install npm:@acme/pi-toolkit",
      code: 0,
    });
  });

  it("installs a package in project scope when requested", async () => {
    const execMock = vi.fn().mockResolvedValue({
      stdout: "installed",
      stderr: "",
      code: 0,
      killed: false,
    });
    const tool = createInstallPiPackageTool({ execImpl: execMock });

    await tool.execute(
      "tool-call-1",
      { packageName: "npm:@acme/pi-toolkit", project: true },
      undefined,
      undefined,
      {} as never,
    );

    expect(execMock).toHaveBeenCalledWith(
      "pi",
      ["install", "-l", "npm:@acme/pi-toolkit"],
      { signal: undefined },
    );
  });

  it("queues reload after a successful install by default", async () => {
    const execMock = vi.fn().mockResolvedValue({
      stdout: "installed",
      stderr: "",
      code: 0,
      killed: false,
    });
    const queueReloadFollowUp = vi.fn();
    const tool = createInstallPiPackageTool({
      execImpl: execMock,
      queueReloadFollowUp,
    });

    const result = await tool.execute(
      "tool-call-1",
      { packageName: "@acme/pi-toolkit" },
      undefined,
      undefined,
      {} as never,
    );
    const firstContent = result.content[0];

    expect(queueReloadFollowUp).toHaveBeenCalledOnce();
    expect(result.details).toMatchObject({ reloadQueued: true });
    expect(firstContent?.type).toBe("text");

    if (!firstContent || firstContent.type !== "text") {
      throw new Error("Expected text content");
    }

    expect(firstContent.text).toContain("Queued Pi reload");
  });

  it("skips reload queueing when reloadAfterInstall is false", async () => {
    const execMock = vi.fn().mockResolvedValue({
      stdout: "installed",
      stderr: "",
      code: 0,
      killed: false,
    });
    const queueReloadFollowUp = vi.fn();
    const tool = createInstallPiPackageTool({
      execImpl: execMock,
      queueReloadFollowUp,
    });

    const result = await tool.execute(
      "tool-call-1",
      { packageName: "@acme/pi-toolkit", reloadAfterInstall: false },
      undefined,
      undefined,
      {} as never,
    );
    const firstContent = result.content[0];

    expect(queueReloadFollowUp).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ reloadQueued: false });
    expect(firstContent?.type).toBe("text");

    if (!firstContent || firstContent.type !== "text") {
      throw new Error("Expected text content");
    }

    expect(firstContent.text).toContain("Run /reload to activate it.");
  });

  it("keeps install success when reload queueing fails", async () => {
    const execMock = vi.fn().mockResolvedValue({
      stdout: "installed",
      stderr: "",
      code: 0,
      killed: false,
    });
    const tool = createInstallPiPackageTool({
      execImpl: execMock,
      queueReloadFollowUp() {
        throw new Error("queue unavailable");
      },
    });

    const result = await tool.execute(
      "tool-call-1",
      { packageName: "@acme/pi-toolkit" },
      undefined,
      undefined,
      {} as never,
    );
    const firstContent = result.content[0];

    expect(result.details).toMatchObject({ reloadQueued: false });
    expect(firstContent?.type).toBe("text");

    if (!firstContent || firstContent.type !== "text") {
      throw new Error("Expected text content");
    }

    expect(firstContent.text).toContain("Installed npm:@acme/pi-toolkit");
    expect(firstContent.text).toContain("Run /reload to activate it.");
  });

  it("throws when pi install fails", async () => {
    const execMock = vi.fn().mockResolvedValue({
      stdout: "",
      stderr: "boom",
      code: 1,
      killed: false,
    });
    const queueReloadFollowUp = vi.fn();
    const tool = createInstallPiPackageTool({
      execImpl: execMock,
      queueReloadFollowUp,
    });

    await expect(
      tool.execute(
        "tool-call-1",
        { packageName: "@acme/pi-toolkit" },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("pi install failed: boom");
    expect(queueReloadFollowUp).not.toHaveBeenCalled();
  });
});
