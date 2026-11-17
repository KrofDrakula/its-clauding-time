# clauding

This repo is one Claude Code plugin **and** its own marketplace. The marketplace
entry points at the repo root (`"source": "./"`), so a consumer adds one
marketplace and installs one plugin. Contents: my personal output styles and
skills, opinionated on purpose.

## Facts you cannot read off the layout

- **Output styles are namespaced.** A plugin style is `clauding:<Name>`, taken
  from the `name:` in the file's frontmatter. The bare `<Name>` resolves only to
  a style in `~/.claude/output-styles/`. Every doc and setting must use the
  prefixed form.
- **`version` in `.claude-plugin/plugin.json` is the delivery pin.** Users
  receive a change when — and only when — that number goes up. A push to `main`
  without a bump reaches nobody, including me.
- **This repo is the single source of truth.** Anything shipped here is deleted
  from `~/.claude/`. I install my own plugin like any user, so breakage reaches
  me first. A local copy shadowing a shipped file defeats that.
- **`claude plugin validate` takes a manifest path or a plugin root.** Pointing
  it at `output-styles/` fails with a missing-manifest error, which reads like a
  bug and is not one.
- **This file lives in `.claude/`, not the repo root.** The repo root is also
  the plugin root, and `claude plugin validate --strict` fails on a root
  `CLAUDE.md`: it warns that the file is not loaded as plugin context. Claude
  Code still loads `.claude/CLAUDE.md` for sessions in this repo. An installed
  plugin never loads it, which is correct — it is author-facing.
- **There is no CI.** Verification is the human running the steps below.

## Adding a component

- Output style: `output-styles/<slug>.md`, with `name` and `description`
  frontmatter. `name` becomes the part after `clauding:`.
- Skill: `skills/<name>/SKILL.md`, flat, one directory per skill.
  Auto-discovered — leave `plugin.json` alone. Categorised subdirectories would
  force a hand-maintained `skills` array, which is a cost this repo has not
  earned yet. Invoke the [writing-for-agents](https://github.com/mattpocock/skills)
  skill before writing one.
- Mod: hooks go in the one module `hooks/register.tsx`, which
  `hooks/hooks.json` names. Every `$.state` value is declared under
  `clauding` in `types/index.d.ts`, which `plugin.json` names as `types`.
  Split a new mod into its own file under `hooks/` and register it from
  `register.tsx`; the manifest allows one module.
- Record it in `README.md` under the matching heading.

## Checking a mod

- Type-check with a scratch `tsconfig.json` outside the repo, as the header of
  the plugin-authoring skill's `claude-code.d.ts` describes. An installed
  plugin never gets the types laid beside it.
- `claude plugin test .` runs `tests/*.test.tsx`. It also picks up the vitest
  files under `skills/sveltekit-pwa/templates/` and reports them as "the file
  did not load". Those two failures are expected: they are scaffold templates,
  not mod tests. Every other failure is real.

## Release

1. Make the change.
2. Bump `version` in `.claude-plugin/plugin.json`. Semver: a new component or a
   changed instruction is a minor, a wording or doc fix is a patch. A change
   that touches only author-facing files — this file — needs no bump and no
   release, because no user reads them.
3. Add a `CHANGELOG.md` entry under the new version, dated, describing what a
   user sees differently.
4. Validate both manifests:
   ```
   claude plugin validate --strict .claude-plugin/plugin.json
   claude plugin validate --strict .claude-plugin/marketplace.json
   ```
5. Commit and push to `main`.
6. Verify, per the next section. Verification runs against the pushed remote,
   never the working tree — a path that works locally can still fail after
   install.

## Verify

Run these after every release. Each step has a checkable result.

1. Refresh the catalogue and pull the new version:
   ```
   claude plugin marketplace update krofdrakula
   claude plugin update clauding@krofdrakula
   ```
   The output must name the version you just pushed.
2. Confirm the new version directory exists:
   ```
   ls ~/.claude/plugins/cache/krofdrakula/clauding/
   ```
3. Confirm the plugin loads what you expect:
   ```
   claude plugin details clauding@krofdrakula
   ```
   This inventories skills, agents, hooks, MCP and LSP servers. It does **not**
   list output styles, so a style needs step 4.
4. Probe a shipped instruction from a fresh headless session, outside this repo:
   ```
   cd /tmp && claude -p --settings '{"outputStyle":"clauding:STE100"}' \
     "In one short line: are ASD-STE100 rules in your instructions? yes or no."
   ```
   A `no` means the style did not load. Before hunting further, check that
   `~/.claude/output-styles/` holds no shadowing copy, and that the name carries
   the `clauding:` prefix — those two caused every failure so far.
5. Check a mod by eye. Start `claude` in a folder you already trust (this repo
   works) and send one prompt. A new folder such as `/tmp` stops at the
   workspace trust prompt first. The context band must show above the prompt
   with a percentage. A band that is
   missing means the hooks module did not load: run `claude --debug` and look
   for lines that start with `clauding:`.

## Stance on changes from other people

Fork, do not contribute. These are my preferences, and generalising them is not
a goal. Decline pull requests that widen a style or a skill to suit other
workflows, and point the author at forking. Accept fixes for things that are
plainly broken: a manifest error, a failing install, a wrong command in the
README.
