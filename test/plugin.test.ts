import { readFileSync } from "node:fs";

import { runCommand, validatePlugin } from "@better-tg/plugin-sdk/test";
import { describe, expect, it } from "vitest";

import type { CollectPage } from "../src/plugin.js";
import { failure, manifest, pluginDir, probeDir } from "./helpers.js";

const dir = pluginDir();
const mock = { mock: true } as const;
const both = ["private", "group"];
const CURSOR = /^[\w-]{22}$/u;

const MOCK_STATS = {
  messages: 5,
  chars: 105,
  words: 17,
  multiline: 0,
  length: { short: 3, medium: 2, long: 0, veryLong: 0 },
  emoji: { messages: 0, total: 0, counts: [] },
  scripts: { cyrillic: 0, latin: 5, mixed: 0, other: 0, none: 0 },
  greetings: [],
  signOffs: [],
  punctuation: {
    endsWithPeriod: 0,
    endsWithExclamation: 0,
    endsWithQuestion: 0,
    endsWithEllipsis: 0,
    endsWithEmoji: 0,
    endsWithoutPunctuation: 5,
    bracketSmiley: 0,
    startsLowercase: 0,
    startsUppercase: 5,
  },
};

function outcome(folder: string): string {
  try {
    validatePlugin(folder);
    return "ok";
  } catch (error) {
    return (error as { code: string }).code;
  }
}

async function collect(input: unknown) {
  return await runCommand<CollectPage>(dir, "collect", input, mock);
}

async function flooded(spec: string, input: unknown) {
  process.env.TG_MOCK_FLOOD_HISTORY = spec;
  try {
    return await collect(input);
  } finally {
    delete process.env.TG_MOCK_FLOOD_HISTORY;
  }
}

describe("the manifest", () => {
  it("asks only for the user's own messages", () => {
    expect(manifest.permissions).toEqual(["messages:read-own"]);
    expect(manifest.network).toEqual([]);
    expect(manifest.secrets).toEqual([]);
    expect(manifest.commands).toEqual([
      expect.objectContaining({ name: "collect", effects: [] }),
    ]);
  });

  it("needs Better-TG-CLI 0.41.0, the first release with plugins", () => {
    expect(manifest.engines).toEqual({ "better-tg-cli": ">=0.41.0" });
  });

  it("is checked against engines by the CLI the SDK carries", () => {
    const result = outcome(".");
    expect(["ok", "plugin_unsupported"]).toContain(result);
    expect(dir === ".").toBe(result === "ok");
  });

  it("is a valid plugin with its five files", () => {
    expect(validatePlugin(dir)).toMatchObject({
      ok: true,
      name: "tone-of-voice",
      version: "1.0.0",
      files: 5,
    });
  });
});

describe("the collect command", () => {
  it("reads to the end: done, a null cursor and what is left of the limit", async () => {
    const r = await collect({ limit: 300, types: both });
    expect(r.data).toMatchObject({
      count: 5,
      cursor: null,
      remaining: 295,
      done: true,
      retryAfterSeconds: null,
    });
    expect(r.data.messages).toHaveLength(5);
    expect(r.proposals).toEqual([]);
  });

  it("stops at the limit with a cursor and remaining 0", async () => {
    const r = await collect({ limit: 2, types: both });
    expect(r.data).toMatchObject({ count: 2, remaining: 0, done: false });
    expect(r.data.cursor).toMatch(CURSOR);
    const four = await collect({ limit: 4, types: both });
    expect(four.data).toMatchObject({ count: 4, remaining: 0, done: false });
    expect(four.data.messages.slice(0, 2).map((m) => m.text)).toEqual(
      r.data.messages.map((m) => m.text)
    );
  });

  it("takes a cursor only with limit: the types of a walk stay those of its cursor", async () => {
    const e = await failure(
      collect({ limit: 5, cursor: "AAAAAAAAAAAAAAAAAAAAAA", types: ["group"] })
    );
    expect(e).toMatchObject({ code: "invalid_argument", exitCode: 2 });
    expect(e.message).toContain("not allowed");
  });

  it("passes the cursor on: one the host never gave out is refused", async () => {
    const e = await failure(
      collect({ limit: 5, cursor: "AAAAAAAAAAAAAAAAAAAAAA" })
    );
    expect(e).toMatchObject({ code: "invalid_cursor", exitCode: 1 });
    expect(e.message).toContain("cursor is unknown or expired");
  });

  it("reads private chats by default and filters by type", async () => {
    const own = await collect({ limit: 100 });
    expect(own.data.count).toBe(3);
    expect(own.data.messages.every((m) => m.chatType === "private")).toBe(true);
    const groups = await collect({ limit: 100, types: ["group"] });
    expect(groups.data.count).toBe(2);
    expect(groups.data.messages.every((m) => m.chatType === "group")).toBe(
      true
    );
    const all = await collect({ limit: 100, types: both });
    expect(all.data.count).toBe(own.data.count + groups.data.count);
  });

  it("returns only text, date and chat type of each message", async () => {
    const r = await collect({ limit: 100, types: both });
    for (const m of r.data.messages) {
      expect(Object.keys(m)).toEqual(["text", "date", "chatType"]);
    }
  });

  it("counts the statistics of the mock account's messages", async () => {
    const r = await collect({ limit: 100, types: both });
    expect(r.data.stats).toEqual(MOCK_STATS);
  });

  it("keeps the page read before a flood_wait, with its cursor and the wait", async () => {
    const r = await flooded("1:7", { limit: 100, types: both });
    expect(r.data.retryAfterSeconds).toBe(7);
    expect(r.data.done).toBe(false);
    expect(r.data.cursor).toMatch(CURSOR);
    expect(r.data.count).toBeGreaterThan(0);
    expect(r.data.count).toBeLessThan(5);
    expect(r.data.messages).toHaveLength(r.data.count);
    expect(r.data.remaining).toBe(100 - r.data.count);
    expect(r.data.stats.messages).toBe(r.data.count);
  });

  it("turns a flood_wait before any message into an empty page to resume from", async () => {
    const r = await flooded("0:5", { limit: 300 });
    expect(r.data).toMatchObject({
      messages: [],
      count: 0,
      remaining: 300,
      done: false,
      retryAfterSeconds: 5,
    });
    expect(r.data.cursor).toMatch(CURSOR);
  });

  it("prints null fields instead of dropping them", async () => {
    const r = await collect({ limit: 100, types: both });
    expect(r.json).toContain('"cursor":null,');
    expect(r.json).toContain('"retryAfterSeconds":null,');
    expect(Object.keys(JSON.parse(r.json).data)).toEqual([
      "messages",
      "count",
      "cursor",
      "remaining",
      "done",
      "retryAfterSeconds",
      "stats",
    ]);
  });

  it("refuses an input that breaks the schema before the plugin runs", async () => {
    for (const input of [
      {},
      { limit: 0 },
      { limit: 2001 },
      { limit: 10, types: ["channel"] },
      { limit: 10, types: [] },
      { limit: 10, types: ["private", "private"] },
      { limit: 10, cursor: "" },
      { limit: 10, since: "2026-01-01" },
      { limit: 10, cursor: "AAAAAAAAAAAAAAAAAAAAAA", types: ["group"] },
      { limit: 10, cursor: "AAAAAAAAAAAAAAAAAAAAAA", types: both },
    ]) {
      const e = await failure(collect(input));
      expect(e).toMatchObject({ code: "invalid_argument", exitCode: 2 });
    }
  });
});

describe("permissions", () => {
  it("are the same in the probe as in the plugin", () => {
    const probe = JSON.parse(
      readFileSync(`${probeDir}/tg-plugin.json`, "utf-8")
    ) as { permissions: string[] };
    expect(probe.permissions).toEqual(manifest.permissions);
  });

  it("check the probe's pages against the plugin's own output schema", () => {
    const outputOf = (file: string) =>
      (
        JSON.parse(readFileSync(file, "utf-8")) as {
          commands: { name: string; output: unknown }[];
        }
      ).commands.find((c) => c.name === "collect" || c.name === "page")?.output;
    expect(outputOf(`${probeDir}/tg-plugin.json`)).toEqual(
      outputOf("tg-plugin.json")
    );
  });

  it("give the sandbox no network, actions, writes or other people's messages", async () => {
    const r = await runCommand<{ apis: string[] }>(probeDir, "host", {}, mock);
    expect(r.data.apis).toEqual(["log", "messages.mine", "now", "random"]);
  });
});
