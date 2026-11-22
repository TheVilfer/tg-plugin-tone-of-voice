import { definePlugin } from "@better-tg/plugin-sdk";
import type {
  Host,
  HostError,
  MineType,
  OwnMessage,
} from "@better-tg/plugin-sdk";

import { styleStats } from "./stats.js";
import type { StyleStats } from "./stats.js";

/** The input of `collect`, as its schema in tg-plugin.json allows it: `cursor` never comes with `types`, as a cursor keeps the types of its walk. */
export interface CollectInput {
  limit: number;
  types?: MineType[];
  cursor?: string;
}

/**
 * One page of `collect`: the user's own messages and their statistics. While `done` is false and
 * `remaining` is above 0, the next page is `collect` with this `cursor` and `limit = remaining`.
 * `retryAfterSeconds` is a number when Telegram asked to slow down: the page holds what was read
 * before that, and the agent stops and asks the user before any next run; otherwise it is `null`.
 */
export interface CollectPage {
  messages: OwnMessage[];
  count: number;
  cursor: string | null;
  remaining: number;
  done: boolean;
  retryAfterSeconds: number | null;
  stats: StyleStats;
}

interface FloodPage {
  messages: OwnMessage[];
  cursor: string;
  wait: number;
}

function floodPage(error: unknown): FloodPage | undefined {
  const e = error as Partial<HostError> | undefined;
  if (e?.code !== "flood_wait" || !e.partial || !e.cursor) {
    return undefined;
  }
  return {
    messages: e.partial.messages,
    cursor: e.cursor,
    wait: e.retryAfterSeconds ?? 0,
  };
}

/** Builds the page `collect` returns from the messages the host gave: each message cut down to `text`, `date` and `chatType`, with its statistics. */
export function page(
  input: Pick<CollectInput, "limit">,
  messages: OwnMessage[],
  rest: Pick<CollectPage, "cursor" | "done" | "retryAfterSeconds">
): CollectPage {
  const own = messages.map(({ text, date, chatType }) => ({
    text,
    date,
    chatType,
  }));
  return {
    messages: own,
    count: own.length,
    cursor: rest.cursor,
    remaining: Math.max(0, input.limit - own.length),
    done: rest.done,
    retryAfterSeconds: rest.retryAfterSeconds,
    stats: styleStats(own.map((m) => m.text)),
  };
}

export const { commands } = definePlugin({
  commands: {
    async collect(input: CollectInput, host: Host): Promise<CollectPage> {
      const mine = host.messages?.mine;
      if (!mine) {
        throw new Error("Tone of Voice needs the messages:read-own permission");
      }
      try {
        const result = await mine({
          limit: input.limit,
          types: input.types,
          cursor: input.cursor,
        });
        return page(input, result.messages, {
          cursor: result.cursor,
          done: result.done,
          retryAfterSeconds: null,
        });
      } catch (error) {
        const flood = floodPage(error);
        if (!flood) {
          throw error;
        }
        return page(input, flood.messages, {
          cursor: flood.cursor,
          done: false,
          retryAfterSeconds: flood.wait,
        });
      }
    },
  },
});
