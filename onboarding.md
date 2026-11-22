# Tone of Voice: onboarding

The goal is one document, the user's style guide, saved as `style`. You build it from the user's
own messages, once per Telegram account. Follow the steps in order and do not skip the consent.

## 1. Ask for consent and the volume

Tell the user, in their language, before reading anything:

- The plugin reads **only messages they wrote themselves**; never other people's messages, never
  forwards or service messages. By default about **300 of their own messages from private chats**
  (people, not bots or groups).
- The texts come to you, the assistant, to write the guide, so they are part of this conversation
  with the AI model. The plugin itself sends nothing anywhere and has no network access.
- The finished guide is stored only on this computer, in the plugin's data. Its contents are not
  private from the AI model, though: whenever you later draft a message in their voice, you read
  the whole guide and the last 10 messages of that chat (theirs and other people's) into the
  conversation with the model. What the AI service keeps of a conversation is up to its own rules.
- While collecting, Better-TG-CLI keeps a cursor on this computer for up to 24 hours: the IDs of
  the chats being read and the position in them, so the next page continues where the last ended.
- They can see the guide (`telegram plugin data get tone-of-voice style`), change it or delete it
  (`telegram plugin data delete tone-of-voice style`) at any time.

Then ask:

1. **How many messages?** About 300 is the default; 100 is quick and rough, up to 2000 is finer.
2. **Which chats?** Private chats (default), groups, or both. Groups show how they write in a crowd;
   private chats show their everyday voice.

Go on only after an explicit yes. Use their answer as `limit` (1–2000) and `types`
(`["private"]`, `["group"]` or `["private", "group"]`).

## 2. Check that the guide can be saved here

Saving the guide is a local write. In a terminal it needs no write access. Over MCP it goes through
`telegram_write` and the write mode:

- **A read-only MCP server** (`telegram_write` is missing or refuses with `write_disabled`), or the
  write mode **`read-only`** (`telegram_read {"args": ["write-access"]}`): the guide **cannot be
  saved here**. Say so before collecting, and offer either:
  - to run onboarding in a terminal or another agent where writes are allowed, or
  - to go on here and show the finished guide, which the user saves themselves in their terminal:
    put the text into a file and run
    `telegram plugin data set tone-of-voice style - < tone-of-voice-style.md`.
- **`ask`**: saving will show an approval with the full document; that is expected.

## 3. Collect

First page (in a terminal; adjust `limit` and `types` to the user's answer):

```bash
telegram plugin run tone-of-voice collect --input '{"limit":300,"types":["private"]}'
```

Over MCP: `telegram_read {"args": ["plugin", "run", "tone-of-voice", "collect", "--input", "{\"limit\":300,\"types\":[\"private\"]}"]}`.

Each page (`data`) has `messages` (`text`, `date`, `chatType`), `count`, `cursor`, `remaining`,
`done`, `retryAfterSeconds` and `stats`. Keep every page's `messages` and `stats`, then:

- **`done` is true or `remaining` is 0**: the collection is complete.
- **Otherwise, if `retryAfterSeconds` is `null`**, run `collect` again with only the page's
  `cursor` and `limit` set to `remaining`:
  `--input '{"limit":<remaining>,"cursor":"<cursor>"}'`. Never add `types` to a cursor (the input
  refuses it: a cursor keeps the chat types of its walk). Repeat until complete.
- **`retryAfterSeconds` is a number**: Telegram asked to slow down. Keep that page once, like any
  page (its `remaining` already counts it), and do not run `collect` again on your own. Tell the
  user the wait and stop. Ask whether to go on with what you have, or to continue after the wait
  with that page's `cursor` and `remaining` (a cursor lasts 24 hours); run the next page only after
  their answer, and stop and ask again on every further wait. Never wait and retry in a loop.
- **The command fails with `flood_wait`**: nothing was read in that run. Tell the user the wait and
  stop, as above; run the same command again only when the user says so.
- **The command fails saying the cursor is unknown or expired** (`plugin_error`; cursors last 24
  hours and belong to one account): the collection ends here, at the messages you already have
  (the sum of the pages' `count`). Do not start over to fill the rest: a new walk starts from the
  newest messages again, so it would repeat what you have. If that is too little and the user wants
  a new collection, that is a new walk: ask for its volume again (consent covers one walk), drop
  the pages you have, and add up the new walk's pages from zero.

Never collect more than the user agreed to. If there are fewer messages than asked for (`done`
came early), say how many there were; under about 30 the guide will be rough, so tell the user.

**No material:** if the pages' `count` adds up to 0, there is nothing to learn from. Tell the user
(for example, that no messages of theirs were found in the chosen chats), offer other chat types or
a later try, and stop here: no shares, no template, nothing saved.

**Adding up `stats`:** every number is a count or a sum, so add the pages' numbers together. The
lists (`emoji.counts`, `greetings`, `signOffs`) hold full counts: add the counts of equal `value`s
across pages, then sort by the summed count and take the top 10 yourself. Each list has at most 200
entries a page; an emoji sequence longer than 32 characters is counted as `(long)`, and when a page
had more than 200 different values its last entry, `(other)`, sums the rarest ones. Neither is an
emoji to write down; leave them out of the guide. The share of a habit is its count divided by
`messages` (for example `emoji.messages / messages`, average length `chars / messages`).

## 4. Fill the template

Get the template: `telegram plugin show tone-of-voice --resource template`. Fill every section from
the messages and the totals, replacing each `<…>` placeholder:

- Describe habits with numbers where the stats give them ("about 70 % of messages are under 20
  characters"), and with what you see in the texts where they do not (favourite words, humour,
  how they agree or refuse, how they adapt to different people).
- Examples are short typical messages of the user, with nothing private: no names, phone numbers,
  addresses, links, codes, amounts or anything about other people. Rewrite one in the same manner
  if needed, and say so.
- Write the guide in the user's language. Keep it compact: about one or two pages.

## 5. Show it and agree

Show the whole document to the user and ask whether it sounds like them. Apply their corrections
and show the changed parts again.

## 6. Save it

```bash
telegram plugin data set tone-of-voice style -
```

with the whole document on stdin. Over MCP: `telegram_write {"args": ["plugin", "data", "set",
"tone-of-voice", "style", "-"], "stdin": "<document>"}`; in write mode `ask` the user approves it
with the full value. If it cannot be saved here (step 2), give the user the document and the
terminal command instead.

Onboarding is done once `style` holds the guide (`telegram plugin list --json` shows
`onboarding.state` as `done`). Afterwards do not keep, quote or repeat the collected messages; the
guide is the only thing Better-TG-CLI keeps of them (the collection's cursor expires after 24 hours).
