import { definePlugin } from "@better-tg/plugin-sdk";
import type { Host, OwnMessage } from "@better-tg/plugin-sdk";

import { page } from "../../../../src/plugin.js";
import type { CollectPage } from "../../../../src/plugin.js";
import { styleStats } from "../../../../src/stats.js";
import type { StyleStats } from "../../../../src/stats.js";

function paths(value: unknown, prefix: string): string[] {
  if (typeof value === "function") {
    return [prefix];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.keys(value)
    .toSorted()
    .flatMap((key) =>
      paths(
        (value as Record<string, unknown>)[key],
        prefix ? `${prefix}.${key}` : key
      )
    );
}

export const { commands } = definePlugin({
  commands: {
    stats(input: { texts: string[] }): StyleStats {
      return styleStats(input.texts);
    },
    page(input: { limit: number; messages: OwnMessage[] }): CollectPage {
      return page(input, input.messages, {
        cursor: "AAAAAAAAAAAAAAAAAAAAAA",
        done: false,
        retryAfterSeconds: null,
      });
    },
    host(_input: Record<string, never>, host: Host): { apis: string[] } {
      return { apis: paths(host, "") };
    },
  },
});
