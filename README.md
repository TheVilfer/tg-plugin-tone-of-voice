# Tone of Voice

The official [Better-TG-CLI](https://github.com/TheVilfer/better-tg-cli) plugin that lets your AI
agent write Telegram messages **in your own voice**. Ask "write to Alice that I'm running late" and
the draft sounds like you wrote it: your length, your greetings, your punctuation, your emoji.

It is the reference plugin of the [plugin spec](https://github.com/TheVilfer/better-tg-cli/blob/main/docs/plugins.md)
(§12), written only against the public spec and the plugin SDK.

## How it works

1. **Onboarding, once per Telegram account.** The agent asks for your consent and how much to read
   (by default about 300 of your own messages from private chats; you choose the amount and the
   chat types). It runs the plugin's `collect` command page by page, fills a style guide
   ([`templates/style.md`](templates/style.md)) from your messages and simple statistics, shows it
   to you, and saves it as the plugin's data (`style`) once you agree.
2. **Writing.** When you ask the agent to write or reply to someone without giving the exact text,
   it reads your style guide and the last 10 messages of that chat, drafts the message and asks
   you to confirm it as your write mode says (one confirmation; in `read-only` it only shows the
   draft). It sends with Better-TG-CLI's own `send` or `reply`.
3. **Exact text goes as it is.** If you dictate the words, they are sent unchanged.

| File                                       | What it is                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| [`tg-plugin.json`](tg-plugin.json)         | The manifest: permissions, the `collect` command, the `compose` trigger           |
| [`SKILL.md`](SKILL.md)                     | Instructions for the agent; `#compose` is how to draft and send a message         |
| [`onboarding.md`](onboarding.md)           | Consent, volume, collecting, filling the guide and saving it                      |
| [`templates/style.md`](templates/style.md) | The style guide the agent fills in                                                |
| `src/plugin.ts`, `src/stats.ts`            | `collect` and its statistics (length, emoji, scripts, greetings, punctuation)     |
| `dist/plugin.js`                           | The built code the sandbox runs; committed, because an install fetches a commit   |
| `test/`                                    | Tests on the mock account through the SDK's test host, and a probe of the sandbox |

## Privacy

- **The plugin sends nothing anywhere.** It has no network permission, and its code runs in
  Better-TG-CLI's sandbox, which has no files, processes or network of its own.
- **It reads only messages you wrote.** Never other people's messages: the host drops forwards,
  service messages and anything from Telegram's own service accounts before the plugin sees a
  page, and each message comes with its text, date and chat type only (no names, no chat IDs).
- **Your messages go to your agent's AI model** during onboarding: the agent reads them to write
  your style guide, so they are part of that conversation, under your AI provider's own retention
  rules. The plugin and Better-TG-CLI keep nothing of them but the guide.
- **The guide is stored on your computer**, in Better-TG-CLI's plugin data for your Telegram
  account, but it is not kept from the model: every time the agent drafts a message for you, the
  whole guide and the last 10 messages of that chat (yours and other people's) go to your agent's
  AI model as part of the conversation. See the guide with
  `telegram plugin data get tone-of-voice style`, delete it with
  `telegram plugin data delete tone-of-voice style`; `telegram plugin remove tone-of-voice` removes
  the plugin and its data.
- **While collecting, Better-TG-CLI keeps a cursor** on your computer for up to 24 hours: the IDs of
  the chats being read and the position in them, so the next page continues where the last ended.

## Permissions

| Permission          | Why                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `messages:read-own` | `collect` reads your own messages, page by page, for the style guide                     |
| no `network`        | Nothing leaves your computer through the plugin                                          |
| no `messages:read`  | Other people's messages are never read by the plugin (the agent reads a chat on its own) |
| no `actions`        | The plugin never proposes or sends messages; your agent drafts and sends them            |

The `collect` command has no effects: it only reads, so it runs as a read in every transport. The
agent saves the guide itself with `telegram plugin data set tone-of-voice style -`, a local write
that follows your write mode over MCP (on a read-only MCP server it cannot be saved: the agent says
so and gives you the command for your terminal).

## Install

Needs Better-TG-CLI **0.41.0 or newer** (the first release with plugins); an older CLI refuses the
plugin (`plugin_unsupported`).

```bash
telegram plugin install github:TheVilfer/tg-plugin-tone-of-voice
```

You confirm the install; then ask your agent to set up Tone of Voice (it runs the onboarding).

## Development

```bash
npm install
npm run build        # bundles src/plugin.ts into dist/plugin.js (needs Bun 1.4.4: https://bun.sh); the tests run the built code
npm run typecheck    # plugin code as ES2023 alone, then the tests
npm run lint         # Ultracite on oxlint and oxfmt; no comments in code files
npm test             # the commands on the mock account, through the SDK's test host
npm run validate     # telegram plugin validate .
npm run dev          # telegram plugin dev . collect --mock --input '{"limit":20}'
```

`npm run validate` and `npm run dev` need the `telegram` CLI (`npm install -g better-tg-cli`).
Commit `dist/plugin.js` after every change of `src/`; CI fails when it differs from a fresh build.

Code style follows Better-TG-CLI's `AGENTS.md`: no comments in code files except a shebang,
generated files and JSDoc directly above an export.

## License

[MIT](LICENSE)
