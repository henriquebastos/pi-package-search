import { AgentSession, type ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createInstallPiPackageTool } from "../src/install-pi-package.js";
import { createSearchPiPackagesTool } from "../src/search-pi-packages.js";

type SendUserMessageOptions = {
  deliverAs?: "steer" | "followUp";
  expandPromptTemplates?: boolean;
};

type UserMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image"; data: string; mimeType: string }
    >;

const sendUserMessagePatchMarker = Symbol.for(
  "pi-package-search.sendUserMessage.expandPromptTemplates",
);

export function patchAgentSessionSendUserMessageForCommandExpansion() {
  const prototype = AgentSession.prototype as typeof AgentSession.prototype & {
    [sendUserMessagePatchMarker]?: boolean;
    sendUserMessage: (
      content: UserMessageContent,
      options?: SendUserMessageOptions,
    ) => Promise<void>;
  };

  if (prototype[sendUserMessagePatchMarker]) {
    return;
  }

  const originalSendUserMessage = prototype.sendUserMessage;

  prototype.sendUserMessage = async function patchedSendUserMessage(
    this: AgentSession & {
      prompt: (
        text: string,
        options?: {
          expandPromptTemplates?: boolean;
          images?: Array<{ type: "image"; data: string; mimeType: string }>;
          source?: "extension";
        },
      ) => Promise<void>;
      agent: { waitForIdle: () => Promise<void> };
      isStreaming: boolean;
    },
    content: UserMessageContent,
    options?: SendUserMessageOptions,
  ) {
    if (!options?.expandPromptTemplates) {
      return originalSendUserMessage.call(this, content, options);
    }

    const { text, images } = normalizeUserMessageContent(content);

    if (this.isStreaming) {
      await this.agent.waitForIdle();
    }

    await this.prompt(text, {
      expandPromptTemplates: true,
      images,
      source: "extension",
    });
  };
  prototype[sendUserMessagePatchMarker] = true;
}

function normalizeUserMessageContent(content: UserMessageContent): {
  text: string;
  images?: Array<{ type: "image"; data: string; mimeType: string }>;
} {
  if (typeof content === "string") {
    return { text: content };
  }

  const textParts: string[] = [];
  const images: Array<{ type: "image"; data: string; mimeType: string }> = [];

  for (const part of content) {
    if (part.type === "text") {
      textParts.push(part.text);
    } else {
      images.push(part);
    }
  }

  return {
    text: textParts.join("\n"),
    images: images.length > 0 ? images : undefined,
  };
}

export default function extension(pi: ExtensionAPI) {
  patchAgentSessionSendUserMessageForCommandExpansion();
  pi.registerCommand("pi-package-search-reload", {
    description: "Reload Pi after package installation",
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
      await ctx.reload();
      return;
    },
  });

  pi.registerTool(createSearchPiPackagesTool());
  pi.registerTool(
    createInstallPiPackageTool({
      execImpl(command, args, options) {
        return pi.exec(command, args, options);
      },
      queueReloadFollowUp() {
        pi.sendUserMessage("/pi-package-search-reload", {
          deliverAs: "followUp",
          expandPromptTemplates: true,
        } as SendUserMessageOptions);
      },
    }),
  );
}
