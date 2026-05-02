import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("assert-pi-json", () => {
  it("accepts expected tool result details", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-package-search-json-"));
    const jsonlPath = join(dir, "events.jsonl");

    try {
      await writeFile(
        jsonlPath,
        [
          JSON.stringify({ type: "session", version: 3 }),
          JSON.stringify({
            type: "tool_execution_start",
            toolName: "install_pi_package",
            args: { packageName: "@acme/pi-toolkit" },
          }),
          JSON.stringify({
            type: "tool_execution_end",
            toolName: "install_pi_package",
            isError: false,
            result: { details: { reloadQueued: true } },
          }),
          JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Installed" }],
            },
          }),
        ].join("\n"),
      );

      const { stdout } = await execFileAsync("python3", [
        "scripts/assert-pi-json.py",
        jsonlPath,
        "install_pi_package",
        "details.reloadQueued=true",
      ]);

      expect(JSON.parse(stdout)).toMatchObject({
        tool: "install_pi_package",
        starts: 1,
        ends: 1,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("accepts expected follow-up queue entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-package-search-json-"));
    const jsonlPath = join(dir, "events.jsonl");

    try {
      await writeFile(
        jsonlPath,
        [
          JSON.stringify({ type: "session", version: 3 }),
          JSON.stringify({
            type: "tool_execution_start",
            toolName: "install_pi_package",
            args: { packageName: "@acme/pi-toolkit" },
          }),
          JSON.stringify({
            type: "queue_update",
            steering: [],
            followUp: ["/pi-package-search-reload"],
          }),
          JSON.stringify({
            type: "tool_execution_end",
            toolName: "install_pi_package",
            isError: false,
            result: { details: { reloadQueued: true } },
          }),
          JSON.stringify({
            type: "message_end",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Installed" }],
            },
          }),
        ].join("\n"),
      );

      const { stdout } = await execFileAsync("python3", [
        "scripts/assert-pi-json.py",
        jsonlPath,
        "install_pi_package",
        "queue.followUp=/pi-package-search-reload",
      ]);

      expect(JSON.parse(stdout)).toMatchObject({
        tool: "install_pi_package",
        starts: 1,
        ends: 1,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
