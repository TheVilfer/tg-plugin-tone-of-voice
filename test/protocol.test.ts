import type { Host, MineOptions, OwnMessage } from "@better-tg/plugin-sdk";
import { describe, expect, it } from "vitest";

import { commands } from "../src/plugin.js";
import type { CollectInput, CollectPage } from "../src/plugin.js";

const PAGE = 3;

function messages(n: number): OwnMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    text: `message ${i}`,
    date: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    chatType: "private",
  }));
}

function flood(seconds: number, cursor: string | null, partial: OwnMessage[]) {
  return Object.assign(new Error(`retry after ${seconds} s`), {
    code: "flood_wait",
    retryAfterSeconds: seconds,
    cursor,
    partial: { messages: partial, count: partial.length },
  });
}

interface FakeHost {
  host: Host;
  calls: MineOptions[];
}

function fakeHost(all: OwnMessage[], floodAtCall?: number): FakeHost {
  const calls: MineOptions[] = [];
  const mine = async (options: MineOptions = {}) => {
    calls.push(options);
    const start = options.cursor ? Number(options.cursor.slice(1)) : 0;
    const want = Math.min(options.limit ?? 100, PAGE);
    if (calls.length === floodAtCall) {
      const partial = all.slice(start, start + 1);
      throw flood(4, `c${start + partial.length}`, partial);
    }
    const page = all.slice(start, start + want);
    const next = start + page.length;
    const done = next >= all.length;
    return {
      messages: page,
      count: page.length,
      cursor: done ? null : `c${next}`,
      done,
    };
  };
  return { host: { messages: { mine } } as Host, calls };
}

async function collectAll(host: Host, limit: number) {
  const pages: CollectPage[] = [];
  let input: CollectInput = { limit };
  for (;;) {
    const page = await commands.collect(input, host);
    pages.push(page);
    if (page.done || page.remaining === 0 || page.cursor === null) {
      return pages;
    }
    input = { limit: page.remaining, cursor: page.cursor };
  }
}

describe("the onboarding loop over collect", () => {
  it("pages with cursor and limit = remaining until done", async () => {
    const all = messages(7);
    const { host, calls } = fakeHost(all);
    const pages = await collectAll(host, 300);
    expect(pages.flatMap((p) => p.messages)).toEqual(all);
    expect(calls).toEqual([
      { limit: 300, types: undefined, cursor: undefined },
      { limit: 297, types: undefined, cursor: "c3" },
      { limit: 294, types: undefined, cursor: "c6" },
    ]);
    expect(pages.at(-1)).toMatchObject({
      done: true,
      cursor: null,
      remaining: 293,
    });
  });

  it("stops when remaining reaches 0", async () => {
    const { host, calls } = fakeHost(messages(20));
    const pages = await collectAll(host, 5);
    expect(pages.map((p) => p.count)).toEqual([3, 2]);
    expect(calls.map((c) => c.limit)).toEqual([5, 2]);
    expect(pages.at(-1)).toMatchObject({ remaining: 0, done: false });
  });

  it("loses and repeats nothing across a flood_wait", async () => {
    const all = messages(7);
    const { host, calls } = fakeHost(all, 2);
    const pages = await collectAll(host, 300);
    expect(pages.flatMap((p) => p.messages)).toEqual(all);
    expect(pages[1]).toMatchObject({
      count: 1,
      remaining: 296,
      done: false,
      retryAfterSeconds: 4,
      cursor: "c4",
    });
    expect(calls[2]).toEqual({ limit: 296, types: undefined, cursor: "c4" });
    expect(pages.filter((p) => p.retryAfterSeconds !== null)).toHaveLength(1);
  });

  it("passes a flood_wait without a cursor on, as nothing was read", async () => {
    const mine = () => Promise.reject(flood(9, null, []));
    const host = { messages: { mine } } as unknown as Host;
    await expect(commands.collect({ limit: 10 }, host)).rejects.toMatchObject({
      code: "flood_wait",
      retryAfterSeconds: 9,
    });
  });

  it("passes any other host error on", async () => {
    const mine = () =>
      Promise.reject(
        Object.assign(new Error("boom"), { code: "invalid_cursor" })
      );
    const host = { messages: { mine } } as unknown as Host;
    await expect(
      commands.collect({ limit: 10, cursor: "x" }, host)
    ).rejects.toMatchObject({ code: "invalid_cursor" });
  });

  it("fails clearly without the messages:read-own permission", async () => {
    await expect(commands.collect({ limit: 10 }, {} as Host)).rejects.toThrow(
      "messages:read-own"
    );
  });
});
