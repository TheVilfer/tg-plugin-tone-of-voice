function definePlugin(plugin) {
  return plugin;
}

var VALUE_UNITS = 32;
var DISTINCT_VALUES = 200;
var LONG_VALUE = "(long)";
var OTHER_VALUES = "(other)";
var SHORT = 20;
var MEDIUM = 80;
var LONG = 200;
var DOMINANT = 0.8;
var GREETINGS = [
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
  "yo"
];
var SIGN_OFFS = [
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
  "good night"
];
var BY_LENGTH = (a, b) => b.length - a.length;
var GREETING_LIST = [...GREETINGS].toSorted(BY_LENGTH);
var SIGN_OFF_LIST = [...SIGN_OFFS].toSorted(BY_LENGTH);
var PICTOGRAPH = String.raw`(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|(?=\p{Extended_Pictographic})[\u2600-\u27BF])`;
var ELEMENT = String.raw`(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|${PICTOGRAPH}\uFE0F?(?:\p{Emoji_Modifier}\uFE0F?)?(?:[\u{E0020}-\u{E007E}]+\u{E007F})?)`;
var SEQUENCE = String.raw`${ELEMENT}(?:\u200D${ELEMENT})*`;
var EMOJI = new RegExp(SEQUENCE, "gu");
var TEXT_STYLE = /(?=\p{Extended_Pictographic})(?<base>\P{Emoji_Presentation})(?!\p{Emoji_Modifier})/gu;
var KEYCAP = /(?<key>[0-9#*])\u20E3/gu;
var JOINER = /^(?:\u200D|\uFE0E|\uFE0F)$/u;
var LINK = /(?:https?:\/\/|www\.)\S+|@\w+/gu;
var LETTER = /\p{L}/u;
var CYRILLIC = /\p{Script=Cyrillic}/u;
var LATIN = /\p{Script=Latin}/u;
var GREEK = /^\p{Script=Greek}$/u;
var MARK = /^\p{M}$/u;
var NOT_WORD = /^[^\p{L}\p{M}\p{N}]$/u;
var WORD = /^[\p{L}\p{N}]$/u;
var PERIOD = /^[.\u0589\u06D4\u0964\u3002\uFF0E]$/u;
var EXCLAMATION = /^[!\u203C\uFF01]$/u;
var QUESTION = /^[?\u037E\u055E\u061F\u1367\u2049\u2E2E\uFF1F]$/u;
function isLetter(ch) {
  return LETTER.test(ch);
}
function emojiOf(text) {
  return text.match(EMOJI) ?? [];
}
function endsWithEmoji(text) {
  let end = -1;
  for (const m of text.matchAll(EMOJI)) {
    end = m.index + m[0].length;
  }
  return end === text.length;
}
function dropEnd(chars, drop) {
  let n = chars.length;
  while (n > 0 && drop.test(chars[n - 1] ?? "")) {
    n -= 1;
  }
  return chars.slice(0, n);
}
function emojiValue(sequence) {
  const value = sequence.replaceAll("️", "").replaceAll(TEXT_STYLE, "$<base>️").replaceAll(KEYCAP, "$<key>️⃣");
  return value.length > VALUE_UNITS ? LONG_VALUE : value;
}
function scriptOf(text) {
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
function normalized(text) {
  return text.toLowerCase().replaceAll("ё", "е").replaceAll(/\s+/gu, " ").trim();
}
function letterAt(text, index) {
  const cp = text.codePointAt(index);
  return cp !== undefined && isLetter(String.fromCodePoint(cp));
}
function opening(text) {
  const start = text.search(/[^\s"'«(*_~-]/u);
  const rest = start < 0 ? "" : text.slice(start);
  return GREETING_LIST.find((g) => rest.startsWith(g) && !letterAt(rest, g.length));
}
function closing(text) {
  const rest = dropEnd([...text], NOT_WORD).join("");
  return SIGN_OFF_LIST.find((s) => {
    if (!rest.endsWith(s)) {
      return false;
    }
    const before = rest.length - s.length - 1;
    return before < 0 || !letterAt(rest, before);
  });
}
function firstLetter(text) {
  for (const ch of text.replaceAll(LINK, " ")) {
    if (isLetter(ch)) {
      return ch;
    }
  }
  return;
}
function count(text, ch) {
  return text.split(ch).length - 1;
}
function add(map, key) {
  if (key !== undefined) {
    map.set(key, (map.get(key) ?? 0) + 1);
  }
}
function tally(map) {
  const sorted = [...map].map(([value, n]) => ({ value, count: n })).toSorted((a, b) => b.count - a.count || (a.value < b.value ? -1 : Number(a.value > b.value)));
  if (sorted.length <= DISTINCT_VALUES) {
    return sorted;
  }
  const rest = sorted.slice(DISTINCT_VALUES - 1).reduce((sum, t) => sum + t.count, 0);
  return [
    ...sorted.slice(0, DISTINCT_VALUES - 1),
    { value: OTHER_VALUES, count: rest }
  ];
}
function isQuestion(chars) {
  const last = chars.at(-1) ?? "";
  if (QUESTION.test(last)) {
    return true;
  }
  return last === ";" && GREEK.test(dropEnd(chars.slice(0, -1), MARK).at(-1) ?? "");
}
function ending(text, stats) {
  const chars = [...text.trimEnd()];
  const bare = dropEnd(chars, JOINER);
  const end = bare.join("");
  const last = bare.at(-1) ?? "";
  if (endsWithEmoji(chars.join("")) || endsWithEmoji(end)) {
    stats.endsWithEmoji += 1;
  } else if (end.endsWith("...") || last === "…") {
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
function emptyStats() {
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
      startsUppercase: 0
    }
  };
}
function styleStats(texts) {
  const stats = emptyStats();
  const emoji = new Map;
  const greetings = new Map;
  const signOffs = new Map;
  for (const text of texts) {
    const length = [...text].length;
    stats.messages += 1;
    stats.chars += length;
    stats.words += text.split(/\s+/u).filter(Boolean).length;
    if (text.trim().includes(`
`)) {
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

function floodPage(error) {
  const e = error;
  if (e?.code !== "flood_wait" || !e.partial || !e.cursor) {
    return;
  }
  return {
    messages: e.partial.messages,
    cursor: e.cursor,
    wait: e.retryAfterSeconds ?? 0
  };
}
function page(input, messages, rest) {
  const own = messages.map(({ text, date, chatType }) => ({
    text,
    date,
    chatType
  }));
  return {
    messages: own,
    count: own.length,
    cursor: rest.cursor,
    remaining: Math.max(0, input.limit - own.length),
    done: rest.done,
    retryAfterSeconds: rest.retryAfterSeconds,
    stats: styleStats(own.map((m) => m.text))
  };
}
var { commands } = definePlugin({
  commands: {
    async collect(input, host) {
      const mine = host.messages?.mine;
      if (!mine) {
        throw new Error("Tone of Voice needs the messages:read-own permission");
      }
      try {
        const result = await mine({
          limit: input.limit,
          types: input.types,
          cursor: input.cursor
        });
        return page(input, result.messages, {
          cursor: result.cursor,
          done: result.done,
          retryAfterSeconds: null
        });
      } catch (error) {
        const flood = floodPage(error);
        if (!flood) {
          throw error;
        }
        return page(input, flood.messages, {
          cursor: flood.cursor,
          done: false,
          retryAfterSeconds: flood.wait
        });
      }
    }
  }
});
export {
  commands,
  page
};
