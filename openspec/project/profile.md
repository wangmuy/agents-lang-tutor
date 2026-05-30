# Project Profile

> Last auto-derived: 2026-05-30. Run `/opsx:verify project-profile` to refresh.
>
> Canonical reference: `openspec/WORKFLOW.md`
> (zoom model, bootstrap guide, walkthrough, upgrade paths)

## Fan-Out Guide

This document is under ~500 lines. If it exceeds that threshold, split per the
fan-out convention below:

1. Create `openspec/project/profile/` directory
2. Move content into:
   - `profile/_index.md` — Summary + links to sub-docs (ENTRY POINT)
   - `profile/identity.md` — One-liner, tech stack, repo links (PRESERVED)
   - `profile/status.md` — Auto-derived dashboard (FULLY REPLACED on refresh)
   - `profile/quickstart.md` — Getting started guide (PRESERVED)
3. Auto-refresh: `status.md` is fully replaced; `identity.md` and `quickstart.md` are preserved.
4. `_index.md` is always the entry point — AI agents read this first.
5. Replace `profile.md` with the `profile/` directory.

## Identity

A language writing-tutor plugin for coding agents that detects the user's
language after each message and delivers concise grammar/vocabulary tips via
the agent's plugin system — helping users improve their writing while they code.

**Tech Stack**: TypeScript (no build step), `franc-min` (ISO 639-3 language detection),
LLM API, agent plugin SDK.

**Repository**: `https://github.com/wangmuy/agents-lang-tutor`

**License**: Apache-2.0

## Current Status

### Implemented Capabilities

No BDD specs exist in `openspec/specs/` yet. Capabilities are inferred from the
codebase:

| Capability | Source | Description |
|-----------|--------|-------------|
| Lang-Tutor Plugin (OpenCode) | `.opencode/plugin/lang-tutor/index.ts` | Detects user message language via franc-min, strips code blocks, sends to LLM writing coach, displays tip inline or as notification |
| Code Block Stripping | `stripCodeBlocks()` | Replaces fenced blocks and inline code with `[CODE BLOCK]` / `[CODE]` placeholders prior to language detection |
| LLM Provider Resolution | `resolveProviderConfig()` | Discovers active model's baseURL and API key from agent config |
| Two-Layer Language Gate | `detectLanguage()` + `fetchTip()` | Client-side franc-min detection skips API calls for native languages; LLM returns `[OK]` for well-written text as second gate |

### Active Epics

No epics exist in `openspec/epics/`.

### In-Progress Changes

| Change | Schema | Artifacts | Tasks | Status |
|--------|--------|-----------|-------|--------|
| add-lang-tutor-plugin | spec-driven-enhanced | spec, design, tasks | 31/32 | in-progress |

## Quick Start

This is a multi-agent plugin project. No server or build step is required.

**OpenCode**:
1. Clone the repo
2. Add the plugin entry to `opencode.json` (see README.md for config options)
3. Run the agent — the plugin fires automatically after each user message

**To add a new agent**:
1. Create a plugin directory under that agent's conventions (e.g. `.codex/`, `.claude/`)
2. Implement the hook/event that fires on user messages
3. Adapt `stripCodeBlocks()` and `fetchTip()` patterns from the OpenCode port
4. See [IMPL-OPENCODE.md](./IMPL-OPENCODE.md) for the reference implementation

## Notes

<!-- User notes preserved across auto-refreshes. -->