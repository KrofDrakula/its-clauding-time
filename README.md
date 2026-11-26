# It's Clauding Time!

![](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2FodHRyMGNsZG9xaW5mOHV1YnpkYnVtam1nbWM5ZDZmZDEyOW5tdiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/4WjvZ6lHmrGRKT18FT/giphy.gif)

My opinionated [Claude Code](https://code.claude.com) kit, packaged as an
installable plugin. It ships the output styles, skills and mods I actually use.

## Install

```
/plugin marketplace add KrofDrakula/its-clauding-time
/plugin install clauding@krofdrakula
```

The repo is both the marketplace and the plugin, so those two commands are the
whole install.

## What's in it

### Output styles

| Style             | What it does                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clauding:STE100` | Makes Claude write all user-facing prose in [ASD-STE100 Simplified Technical English](https://en.wikipedia.org/wiki/Simplified_Technical_English): one fact per sentence, active voice, plain words, no idioms. Code, paths, and error messages stay verbatim. |
| `clauding:grug`   | Makes Claude talk to you in the voice of the [grug brained developer](https://grugbrain.dev/): small words, short sentences, complexity very bad. Code, comments, commit messages, and any document meant for other people stay in clear, plain English.       |

Pick it with `/output-style` after the plugin is enabled, or set it in
`settings.json`:

```json
{ "outputStyle": "clauding:STE100" }
```

Note the `clauding:` prefix. Plugin output styles are namespaced by plugin name,
so the bare name `STE100` will not resolve to this one.

### Skills

| Skill | What it does |
| ----- | ------------ |
| `clauding:sveltekit-pwa` | Scaffolds a SvelteKit app as an installable, offline-capable PWA with a Docker image, in a new local git repo. It follows the current SvelteKit docs (`llms.txt`), ships a service worker with an allowlist router and a `/reset` repair route, hashed install icons, and a production Dockerfile. References cover offline design, audio, wake lock, range-request media, Safari quirks and Docker variants. |

### Mods

| Mod | What it does |
| --- | ------------ |
| Context band | Shows the context window's fill in a row above the prompt, for the whole session: `Context 42% · 84k / 200k tokens`. Green below 50%, yellow from 50%, red from 80%. It updates after each turn, `/compact`, `/clear` and `/resume`. Beside it, a countdown shows when the prompt cache expires: `cache 4:32`, yellow from 15 minutes left, red in the last minute, `cache cold` once it lapses. On a Claude subscription, the right end of the row shows the account's usage windows: `5% (5h, 2:15 left) / 12% (week)`, with the time left in the 5h window as H:mm, coloured by the fuller window. Collapse the band with `ctrl+x ctrl+a`. |

The mod is on as soon as the plugin is enabled; there is nothing to configure.

## Updates

Versions are pinned in `.claude-plugin/plugin.json`. You get a new version only
after I bump it, and after your client refreshes the catalogue:

```
/plugin marketplace update krofdrakula
```

## Fork it, don't contribute to it

These are my personal preferences, tuned for how I work. I am not looking to
generalise them, and I will decline pull requests that try to. If you want
something different, fork the repo — that is the intended path, and it costs you
nothing.

Bug reports are welcome: if something is broken or does not install, open an
issue.

## Licence

[MIT](./LICENSE).
