import type { OwnMessage } from "@better-tg/plugin-sdk";
import { runCommand } from "@better-tg/plugin-sdk/test";
import { describe, expect, it } from "vitest";

import type { CollectPage } from "../src/plugin.js";
import {
  DISTINCT_VALUES,
  LONG_VALUE,
  OTHER_VALUES,
  VALUE_UNITS,
  styleStats,
} from "../src/stats.js";
import type { StyleStats, Tally } from "../src/stats.js";
import { probeDir } from "./helpers.js";

const SAMPLES = [
  "Привет! Как дела?)",
  "ок",
  "Спасибо большое, до встречи 🙌",
  "Hello!\nSee you at 7. Cheers",
  "😂😂",
  "ну ладно...",
  "Good morning! Готово 👍🏽",
  "@alex check this",
  "Ок, см. https://example.com/a?b=1",
  "ПРИВЕТ!!! 🇷🇺",
];

const EXPECTED: StyleStats = {
  messages: 10,
  chars: 173,
  words: 30,
  multiline: 1,
  length: { short: 6, medium: 4, long: 0, veryLong: 0 },
  emoji: {
    messages: 4,
    total: 5,
    counts: [
      { value: "😂", count: 2 },
      { value: "🇷🇺", count: 1 },
      { value: "👍🏽", count: 1 },
      { value: "🙌", count: 1 },
    ],
  },
  scripts: { cyrillic: 6, latin: 2, mixed: 1, other: 0, none: 1 },
  greetings: [
    { value: "привет", count: 2 },
    { value: "good morning", count: 1 },
    { value: "hello", count: 1 },
  ],
  signOffs: [
    { value: "cheers", count: 1 },
    { value: "до встречи", count: 1 },
  ],
  punctuation: {
    endsWithPeriod: 0,
    endsWithExclamation: 0,
    endsWithQuestion: 0,
    endsWithEllipsis: 1,
    endsWithEmoji: 4,
    endsWithoutPunctuation: 4,
    bracketSmiley: 1,
    startsLowercase: 3,
    startsUppercase: 6,
  },
};

const UNICODE_SAMPLES = [
  "1️⃣",
  "🙂‍↔️",
  "ok 🙂‍↔️ 1️⃣ #️⃣",
  "كيف حالك؟",
  "؟",
  "Τι κάνεις\u037E",
  "Что?\u2E2E",
  "ምን\u1367",
  "x;",
  "नमस्ते",
  "👨‍👩‍👧 и 🇩🇪 ❤️ ❤ 👍🏿 🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "© 2026",
];

const UNICODE_EXPECTED: StyleStats = {
  messages: 12,
  chars: 90,
  words: 24,
  multiline: 0,
  length: { short: 11, medium: 1, long: 0, veryLong: 0 },
  emoji: {
    messages: 4,
    total: 11,
    counts: [
      { value: "1️⃣", count: 2 },
      { value: "❤️", count: 2 },
      { value: "🙂‍↔️", count: 2 },
      { value: "#️⃣", count: 1 },
      { value: "🇩🇪", count: 1 },
      { value: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", count: 1 },
      { value: "👍🏿", count: 1 },
      { value: "👨‍👩‍👧", count: 1 },
    ],
  },
  scripts: { cyrillic: 2, latin: 2, mixed: 0, other: 4, none: 4 },
  greetings: [],
  signOffs: [],
  punctuation: {
    endsWithPeriod: 0,
    endsWithExclamation: 0,
    endsWithQuestion: 5,
    endsWithEllipsis: 0,
    endsWithEmoji: 4,
    endsWithoutPunctuation: 2,
    bracketSmiley: 0,
    startsLowercase: 3,
    startsUppercase: 2,
  },
};

const ENVELOPE_CHARS = 60_000;
const PAGE_CHARS = 40_000;
const DATE = "2026-11-21T10:00:00.000Z";

function merge(lists: Tally[][]): Tally[] {
  const sums = new Map<string, number>();
  for (const t of lists.flat()) {
    sums.set(t.value, (sums.get(t.value) ?? 0) + t.count);
  }
  return [...sums]
    .map(([value, n]) => ({ value, count: n }))
    .toSorted(
      (a, b) =>
        b.count - a.count ||
        (a.value < b.value ? -1 : Number(a.value > b.value))
    );
}

function addUp(a: StyleStats, b: StyleStats): StyleStats {
  const sum = <T extends Record<string, number>>(x: T, y: T): T =>
    Object.fromEntries(
      Object.entries(x).map(([k, v]) => [k, v + (y[k] ?? 0)])
    ) as T;
  return {
    messages: a.messages + b.messages,
    chars: a.chars + b.chars,
    words: a.words + b.words,
    multiline: a.multiline + b.multiline,
    length: sum(a.length, b.length),
    emoji: {
      messages: a.emoji.messages + b.emoji.messages,
      total: a.emoji.total + b.emoji.total,
      counts: merge([a.emoji.counts, b.emoji.counts]),
    },
    scripts: sum(a.scripts, b.scripts),
    greetings: merge([a.greetings, b.greetings]),
    signOffs: merge([a.signOffs, b.signOffs]),
    punctuation: sum(a.punctuation, b.punctuation),
  };
}

function emojiAt(i: number): string {
  return String.fromCodePoint(0x1_f6_00 + i);
}

function chain(seed: number, parts: number): string {
  return Array.from({ length: parts }, (_, i) =>
    emojiAt((seed * 7 + i * 13) % 80)
  ).join("‍");
}

function longestDistinct(n: number): string[] {
  const parts = (VALUE_UNITS + 1) / 3;
  return Array.from({ length: n }, (_, seed) =>
    [
      emojiAt(seed % 80),
      emojiAt(Math.floor(seed / 80) % 80),
      ...Array.from({ length: parts - 2 }, (_unused, i) =>
        emojiAt((seed + i) % 80)
      ),
    ].join("\u200D")
  );
}

function messageSize(m: OwnMessage): number {
  return JSON.stringify(m).length + 1;
}

function worstPage(): OwnMessage[] {
  const out: OwnMessage[] = [];
  let size = 2;
  const push = (text: string): boolean => {
    const m: OwnMessage = { text, date: DATE, chatType: "private" };
    if (size + messageSize(m) > PAGE_CHARS) {
      return false;
    }
    size += messageSize(m);
    out.push(m);
    return true;
  };
  const greetings = [
    "привет",
    "приветик",
    "приветы",
    "здравствуйте",
    "здравствуй",
    "здрасте",
    "добрый день",
    "добрый вечер",
    "доброе утро",
    "доброго утра",
    "хай",
    "салют",
    "хеллоу",
    "ку",
    "йо",
    "hi",
    "hello",
    "hey",
    "hiya",
    "good morning",
    "good afternoon",
    "good evening",
    "morning",
    "yo",
  ];
  const signOffs = [
    "спасибо",
    "спасибо большое",
    "спс",
    "пока",
    "до встречи",
    "до связи",
    "до завтра",
    "хорошего дня",
    "хорошего вечера",
    "всего доброго",
    "с уважением",
    "обнимаю",
    "целую",
    "удачи",
    "спокойной ночи",
    "доброй ночи",
    "thanks",
    "thank you",
    "thx",
    "cheers",
    "bye",
    "see you",
    "see ya",
    "regards",
    "best regards",
    "take care",
    "good night",
  ];
  for (let i = 0; i < Math.max(greetings.length, signOffs.length); i += 1) {
    push(
      `${greetings[i % greetings.length]} x ${signOffs[i % signOffs.length]}`
    );
  }
  const keys = longestDistinct(DISTINCT_VALUES + 50);
  for (let i = 0; i < keys.length; i += 4) {
    push(keys.slice(i, i + 4).join(" "));
  }
  while (push("ok ".repeat(300))) {
    continue;
  }
  while (push("ok")) {
    continue;
  }
  return out;
}

const mock = { mock: true } as const;

async function inSandbox(texts: string[]): Promise<StyleStats> {
  const r = await runCommand<StyleStats>(
    probeDir,
    "stats",
    { texts },
    {
      mock: true,
    }
  );
  return r.data;
}

describe("the style statistics", () => {
  it("counts known samples", () => {
    expect(styleStats(SAMPLES)).toEqual(EXPECTED);
  });

  it("gives the same numbers in the plugin sandbox", async () => {
    await expect(inSandbox(SAMPLES)).resolves.toEqual(EXPECTED);
  });

  it("reads full emoji sequences, letters of any script and question marks of other scripts", () => {
    expect(styleStats(UNICODE_SAMPLES)).toEqual(UNICODE_EXPECTED);
  });

  it("reads them the same way in the plugin sandbox", async () => {
    await expect(inSandbox(UNICODE_SAMPLES)).resolves.toEqual(UNICODE_EXPECTED);
  });

  it("counts a keycap and a ZWJ sequence as one emoji that ends the message", async () => {
    for (const s of [styleStats(["1️⃣", "🙂‍↔️"]), await inSandbox(["1️⃣", "🙂‍↔️"])]) {
      expect(s.emoji.total).toBe(2);
      expect(s.emoji.counts).toEqual([
        { value: "1️⃣", count: 1 },
        { value: "🙂‍↔️", count: 1 },
      ]);
      expect(s.punctuation.endsWithEmoji).toBe(2);
      expect(s.punctuation.endsWithoutPunctuation).toBe(0);
    }
  });

  it("counts Arabic and other scripts' question marks, and a semicolon only after Greek", async () => {
    const texts = [
      "Πού είσαι;",
      "كيف حالك؟",
      "؟",
      "Τι κάνεις\u037E",
      "Что\u2E2E",
      "ምን\u1367",
      "x;",
    ];
    for (const s of [styleStats(texts), await inSandbox(texts)]) {
      expect(s.punctuation.endsWithQuestion).toBe(6);
      expect(s.punctuation.endsWithoutPunctuation).toBe(0);
      expect(s.scripts).toMatchObject({ other: 4, none: 1 });
    }
  });

  it("adds up: two halves sum to the whole, lists included", () => {
    for (const texts of [SAMPLES, UNICODE_SAMPLES]) {
      for (let cut = 0; cut <= texts.length; cut += 1) {
        expect(
          addUp(styleStats(texts.slice(0, cut)), styleStats(texts.slice(cut)))
        ).toEqual(styleStats(texts));
      }
    }
  });

  it("returns full counts, so an emoji second on every page is first overall", () => {
    const fox = "🦊";
    const pageOf = (offset: number) => [
      `${fox} ${fox}`,
      ...Array.from({ length: 10 }, (_, i) => emojiAt(offset + i).repeat(3)),
    ];
    const a = styleStats(pageOf(0));
    const b = styleStats(pageOf(10));
    expect(a.emoji.counts[0]?.count).toBe(3);
    expect(a.emoji.counts).toContainEqual({ value: fox, count: 2 });
    const merged = merge([a.emoji.counts, b.emoji.counts]);
    expect(merged[0]).toEqual({ value: fox, count: 4 });
    expect(merged.slice(0, 10).map((t) => t.value)).toContain(fox);
    expect(merged).toEqual(
      styleStats([...pageOf(0), ...pageOf(10)]).emoji.counts
    );
  });

  it("is all zeros and empty lists for no messages", () => {
    const s = styleStats([]);
    expect(s.messages).toBe(0);
    expect(s.emoji.counts).toEqual([]);
    expect(Object.values(s.punctuation).every((n) => n === 0)).toBe(true);
  });

  it("does not take a word that only starts like a greeting", () => {
    const s = styleStats(["куда идём?", "history", "hiking today", "ку!"]);
    expect(s.greetings).toEqual([{ value: "ку", count: 1 }]);
  });

  it("counts a joined emoji and a flag as one", () => {
    const s = styleStats(["👨‍👩‍👧 и 🇩🇪 ❤️"]);
    expect(s.emoji.total).toBe(3);
    expect(s.emoji.counts.map((t) => t.value).toSorted()).toEqual(
      ["👨‍👩‍👧", "🇩🇪", "❤️"].toSorted()
    );
  });

  it("counts a sequence longer than the value cap under a placeholder", () => {
    const long = chain(1, 1000);
    const s = styleStats([long, long, "🙂"]);
    expect(s.emoji.total).toBe(3);
    expect(s.emoji.counts).toEqual([
      { value: LONG_VALUE, count: 2 },
      { value: "🙂", count: 1 },
    ]);
  });

  it("keeps at most the distinct cap and sums the rest, so counts still add up to the total", () => {
    const texts = Array.from(
      { length: 80 * 4 },
      (_, i) =>
        emojiAt(i % 80) + String.fromCodePoint(0x1_f3_fb + Math.floor(i / 80))
    );
    const s = styleStats(texts);
    expect(s.emoji.counts).toHaveLength(DISTINCT_VALUES);
    expect(s.emoji.counts.at(-1)).toEqual({
      value: OTHER_VALUES,
      count: texts.length - (DISTINCT_VALUES - 1),
    });
    expect(s.emoji.counts.reduce((n, t) => n + t.count, 0)).toBe(s.emoji.total);
  });
});

describe("the size of a page", () => {
  it("stays under the output limit for a full page with the longest and most values", async () => {
    const messages = worstPage();
    const messagesChars = JSON.stringify(messages).length;
    expect(messagesChars).toBeGreaterThan(PAGE_CHARS - 100);
    expect(messagesChars).toBeLessThanOrEqual(PAGE_CHARS);
    const r = await runCommand<CollectPage>(
      probeDir,
      "page",
      { limit: 2000, messages },
      { mock: true }
    );
    const { stats } = r.data;
    expect(stats.emoji.counts).toHaveLength(DISTINCT_VALUES);
    expect(
      stats.emoji.counts
        .slice(0, -1)
        .every((t) => t.value.length === VALUE_UNITS)
    ).toBe(true);
    expect(stats.greetings).toHaveLength(24);
    expect(stats.signOffs).toHaveLength(27);
    expect(r.json.length).toBeLessThan(ENVELOPE_CHARS);
  });

  it("reads the end of long runs in linear time", async () => {
    const runs = [
      `${chain(2, 1300)}x`,
      `${"!".repeat(3900)}a`,
      `${";".repeat(3900)}a`,
      `${"\u200D".repeat(3900)}a`,
      `${"\uFE0F".repeat(3900)}a`,
      `a${"\u0301".repeat(3900)}!`,
    ];
    for (const text of runs) {
      const messages = Array.from({ length: 10 }, () => ({
        text,
        date: DATE,
        chatType: "private" as const,
      }));
      const started = performance.now();
      await runCommand(probeDir, "page", { limit: 100, messages }, mock);
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });

  it("stays under it for the long ZWJ chains of the review", async () => {
    const text = chain(3, 1301);
    expect(text).toHaveLength(3902);
    const messages = Array.from({ length: 9 }, () => ({
      text,
      date: DATE,
      chatType: "private" as const,
    }));
    const r = await runCommand<CollectPage>(
      probeDir,
      "page",
      { limit: 300, messages },
      { mock: true }
    );
    expect(r.data.stats.emoji.counts).toEqual([
      { value: LONG_VALUE, count: 9 },
    ]);
    expect(r.json.length).toBeLessThan(ENVELOPE_CHARS);
  });
});
