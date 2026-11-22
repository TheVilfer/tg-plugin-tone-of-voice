/** A value and how many times it occurred, most frequent first. */
export interface Tally {
  value: string;
  count: number;
}

/** The longest value a frequency list keeps, in UTF-16 units; a longer emoji sequence is counted under `LONG_VALUE`. */
export const VALUE_UNITS = 32;

/** The most entries one frequency list has on one page; past it the rarest values are summed under `OTHER_VALUES`. */
export const DISTINCT_VALUES = 200;

/** The value an emoji sequence longer than `VALUE_UNITS` is counted under. */
export const LONG_VALUE = "(long)";

/** The last entry of a list that had more than `DISTINCT_VALUES` values: the sum of the rarest ones. */
export const OTHER_VALUES = "(other)";

/**
 * Simple style statistics of one page of messages. Every number is a count or a sum, and every
 * list holds full counts, so the pages of one collection add up: numbers by adding them, lists by
 * adding the counts of equal values.
 *
 * - `length`: Messages by length in characters: `short` up to 20, `medium` up to 80, `long` up to 200, `veryLong` above.
 * - `emoji`: Messages with at least one emoji, all emoji, and how often each one occurred (`counts`, at most 200 entries).
 * - `scripts`: Messages by the alphabet of their letters (links and mentions left out), a hint of the language: `mixed` when no alphabet has 80 % of the letters, `none` without letters.
 * - `greetings`, `signOffs`: Known openings and closings (Russian and English), as written in lower case, with their counts.
 * - `punctuation`: How messages end and start; `bracketSmiley` counts messages with more `)` than `(`.
 */
export interface StyleStats {
  messages: number;
  chars: number;
  words: number;
  multiline: number;
  length: { short: number; medium: number; long: number; veryLong: number };
  emoji: { messages: number; total: number; counts: Tally[] };
  scripts: {
    cyrillic: number;
    latin: number;
    mixed: number;
    other: number;
    none: number;
  };
  greetings: Tally[];
  signOffs: Tally[];
  punctuation: {
    endsWithPeriod: number;
    endsWithExclamation: number;
    endsWithQuestion: number;
    endsWithEllipsis: number;
    endsWithEmoji: number;
    endsWithoutPunctuation: number;
    bracketSmiley: number;
    startsLowercase: number;
    startsUppercase: number;
  };
}

const SHORT = 20;
const MEDIUM = 80;
const LONG = 200;
const DOMINANT = 0.8;

const GREETINGS = [
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
] as const;

const SIGN_OFFS = [
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
] as const;

const BY_LENGTH = (a: string, b: string) => b.length - a.length;
const GREETING_LIST = [...GREETINGS].toSorted(BY_LENGTH);
const SIGN_OFF_LIST = [...SIGN_OFFS].toSorted(BY_LENGTH);

const PICTOGRAPH = String.raw`(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|(?=\p{Extended_Pictographic})[\u2600-\u27BF])`;
const ELEMENT = String.raw`(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|${PICTOGRAPH}\uFE0F?(?:\p{Emoji_Modifier}\uFE0F?)?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?)`;
const SEQUENCE = String.raw`${ELEMENT}(?:\u200D${ELEMENT})*`;
const EMOJI = new RegExp(SEQUENCE, "gu");
const TEXT_STYLE =
  /(?=\p{Extended_Pictographic})(?<base>\P{Emoji_Presentation})(?!\p{Emoji_Modifier})/gu;
const KEYCAP = /(?<key>[0-9#*])\u20E3/gu;
const JOINER = /^(?:\u200D|\uFE0E|\uFE0F)$/u;

const LINK = /(?:https?:\/\/|www\.)\S+|@\w+/gu;
const LETTER = /\p{L}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const LATIN = /\p{Script=Latin}/u;
const GREEK = /^\p{Script=Greek}$/u;
const MARK = /^\p{M}$/u;
const NOT_WORD = /^[^\p{L}\p{M}\p{N}]$/u;
const WORD = /^[\p{L}\p{N}]$/u;
const PERIOD = /^[.\u0589\u06D4\u0964\u3002\uFF0E]$/u;
const EXCLAMATION = /^[!\u203C\uFF01]$/u;
const QUESTION = /^[?\u037E\u055E\u061F\u1367\u2049\u2E2E\uFF1F]$/u;

function isLetter(ch: string): boolean {
  return LETTER.test(ch);
}

function emojiOf(text: string): string[] {
  return text.match(EMOJI) ?? [];
}

function endsWithEmoji(text: string): boolean {
  let end = -1;
  for (const m of text.matchAll(EMOJI)) {
    end = m.index + m[0].length;
  }
  return end === text.length;
}

function dropEnd(chars: string[], drop: RegExp): string[] {
  let n = chars.length;
  while (n > 0 && drop.test(chars[n - 1] ?? "")) {
    n -= 1;
  }
  return chars.slice(0, n);
}

function emojiValue(sequence: string): string {
  const value = sequence
    .replaceAll("\uFE0F", "")
    .replaceAll(TEXT_STYLE, "$<base>\uFE0F")
    .replaceAll(KEYCAP, "$<key>\uFE0F\u20E3");
  return value.length > VALUE_UNITS ? LONG_VALUE : value;
}

function scriptOf(text: string): keyof StyleStats["scripts"] {
  let cyrillic = 0;
  let latin = 0;
  let other = 0;
  for (const ch of text.replaceAll(LINK, " ")) {
    if (CYRILLIC.test(ch)) {
      cyrillic += 1;
    } else if (LATIN.test(ch)) {
      latin += 1;
    } else if (isLetter(ch)) {
      other += 1;
    }
  }
  const letters = cyrillic + latin + other;
  if (!letters) {
    return "none";
  }
  if (cyrillic >= letters * DOMINANT) {
    return "cyrillic";
  }
  if (latin >= letters * DOMINANT) {
    return "latin";
  }
  if (other >= letters * DOMINANT) {
    return "other";
  }
  return "mixed";
}

function normalized(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ё", "е")
    .replaceAll(/\s+/gu, " ")
    .trim();
}

function letterAt(text: string, index: number): boolean {
  const cp = text.codePointAt(index);
  return cp !== undefined && isLetter(String.fromCodePoint(cp));
}

function opening(text: string): string | undefined {
  const start = text.search(/[^\s"'«(*_~-]/u);
  const rest = start < 0 ? "" : text.slice(start);
  return GREETING_LIST.find(
    (g) => rest.startsWith(g) && !letterAt(rest, g.length)
  );
}

function closing(text: string): string | undefined {
  const rest = dropEnd([...text], NOT_WORD).join("");
  return SIGN_OFF_LIST.find((s) => {
    if (!rest.endsWith(s)) {
      return false;
    }
    const before = rest.length - s.length - 1;
    return before < 0 || !letterAt(rest, before);
  });
}

function firstLetter(text: string): string | undefined {
  for (const ch of text.replaceAll(LINK, " ")) {
    if (isLetter(ch)) {
      return ch;
    }
  }
  return undefined;
}

function count(text: string, ch: string): number {
  return text.split(ch).length - 1;
}

function add(map: Map<string, number>, key: string | undefined): void {
  if (key !== undefined) {
    map.set(key, (map.get(key) ?? 0) + 1);
  }
}

function tally(map: Map<string, number>): Tally[] {
  const sorted = [...map]
    .map(([value, n]) => ({ value, count: n }))
    .toSorted(
      (a, b) =>
        b.count - a.count ||
        (a.value < b.value ? -1 : Number(a.value > b.value))
    );
  if (sorted.length <= DISTINCT_VALUES) {
    return sorted;
  }
  const rest = sorted
    .slice(DISTINCT_VALUES - 1)
    .reduce((sum, t) => sum + t.count, 0);
  return [
    ...sorted.slice(0, DISTINCT_VALUES - 1),
    { value: OTHER_VALUES, count: rest },
  ];
}

function isQuestion(chars: string[]): boolean {
  const last = chars.at(-1) ?? "";
  if (QUESTION.test(last)) {
    return true;
  }
  return (
    last === ";" && GREEK.test(dropEnd(chars.slice(0, -1), MARK).at(-1) ?? "")
  );
}

function ending(text: string, stats: StyleStats["punctuation"]): void {
  const chars = [...text.trimEnd()];
  const bare = dropEnd(chars, JOINER);
  const end = bare.join("");
  const last = bare.at(-1) ?? "";
  if (endsWithEmoji(chars.join("")) || endsWithEmoji(end)) {
    stats.endsWithEmoji += 1;
  } else if (end.endsWith("...") || last === "\u2026") {
    stats.endsWithEllipsis += 1;
  } else if (PERIOD.test(last)) {
    stats.endsWithPeriod += 1;
  } else if (EXCLAMATION.test(last)) {
    stats.endsWithExclamation += 1;
  } else if (isQuestion(bare)) {
    stats.endsWithQuestion += 1;
  } else if (WORD.test(dropEnd(bare, MARK).at(-1) ?? "")) {
    stats.endsWithoutPunctuation += 1;
  }
}

function emptyStats(): StyleStats {
  return {
    messages: 0,
    chars: 0,
    words: 0,
    multiline: 0,
    length: { short: 0, medium: 0, long: 0, veryLong: 0 },
    emoji: { messages: 0, total: 0, counts: [] },
    scripts: { cyrillic: 0, latin: 0, mixed: 0, other: 0, none: 0 },
    greetings: [],
    signOffs: [],
    punctuation: {
      endsWithPeriod: 0,
      endsWithExclamation: 0,
      endsWithQuestion: 0,
      endsWithEllipsis: 0,
      endsWithEmoji: 0,
      endsWithoutPunctuation: 0,
      bracketSmiley: 0,
      startsLowercase: 0,
      startsUppercase: 0,
    },
  };
}

/** Computes the style statistics of some message texts, in the plugin, without the network. */
export function styleStats(texts: readonly string[]): StyleStats {
  const stats = emptyStats();
  const emoji = new Map<string, number>();
  const greetings = new Map<string, number>();
  const signOffs = new Map<string, number>();
  for (const text of texts) {
    const length = [...text].length;
    stats.messages += 1;
    stats.chars += length;
    stats.words += text.split(/\s+/u).filter(Boolean).length;
    if (text.trim().includes("\n")) {
      stats.multiline += 1;
    }
    if (length <= SHORT) {
      stats.length.short += 1;
    } else if (length <= MEDIUM) {
      stats.length.medium += 1;
    } else if (length <= LONG) {
      stats.length.long += 1;
    } else {
      stats.length.veryLong += 1;
    }
    const found = emojiOf(text);
    if (found.length) {
      stats.emoji.messages += 1;
      stats.emoji.total += found.length;
      for (const e of found) {
        add(emoji, emojiValue(e));
      }
    }
    stats.scripts[scriptOf(text)] += 1;
    const plain = normalized(text);
    add(greetings, opening(plain));
    add(signOffs, closing(plain));
    ending(text, stats.punctuation);
    if (count(text, ")") > count(text, "(")) {
      stats.punctuation.bracketSmiley += 1;
    }
    const first = firstLetter(text);
    if (first !== undefined && first !== first.toUpperCase()) {
      stats.punctuation.startsLowercase += 1;
    } else if (first !== undefined && first !== first.toLowerCase()) {
      stats.punctuation.startsUppercase += 1;
    }
  }
  stats.emoji.counts = tally(emoji);
  stats.greetings = tally(greetings);
  stats.signOffs = tally(signOffs);
  return stats;
}
