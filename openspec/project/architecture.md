# Architecture Canvas

> Last verified: 2026-05-31. Living document — update when boundaries change.

## Bounded Contexts

This project has a single bounded context — the Lang-Tutor Plugin — deployed
independently per agent runtime. Each agent port is a self-contained instance.

### Lang-Tutor Plugin

- **Responsibility**: Detect user message language, evaluate writing quality
  via LLM, and display improvement tips without polluting conversation context.
- **Spec**: `openspec/changes/add-lang-tutor-opencode/specs/lang-tutor-plugin/spec.md` and `openspec/changes/add-lang-tutor-opencode/specs/iso639-normalize/spec.md`
- **Key Entities**:
  - `LangTutorPlugin` — Plugin entry point, registers `chat.message` hook, orchestrates pipeline
  - `PluginConfig` — Runtime configuration (enabled, nativeLanguages, forcedLanguage, displayMethod, mode)
  - `messageIDCache` — Bounded dedup cache (Map<sessionID, string[]>, last 100 messageIDs per session)
  - `lastTipTime` — Map-based cooldown tracker (by session ID)
  - `tipsQueue` — TipsQueue with per-session AbortController for rapid-fire handling

## Data Flow Topology

```
User sends message
        |
        v
chat.message hook fires (provides sessionID, model, messageID, output.parts)
        |
        v
Plugin reads config from agent config file (live, no cache)
        |
        v
[Gate 1] Is plugin enabled?  --No--> silently return
        | Yes
        v
[Gate 2] Cooldown elapsed?   --No--> silently return
        | Yes
        v
[Gate 3] messageID already processed?  --Yes--> silently return (bounded cache)
        | No
        v
Extract user text from output.parts (filter TextPart entries)
        |
        v
stripCodeBlocks(): ```...``` -> [CODE BLOCK], `code` -> [CODE]
        |
        v
detectLanguage() via franc-min (ISO 639-3)
        |
        v
[Gate 4] Is native language (normalized)? --Yes--> silently return (no API call)
        | No
        v
Resolve model: tipModel config > input.model.modelID > top-level model
        |
        v
Resolve provider config from opencode.json (baseURL, apiKey)
        |
        v
fetchTip(): POST /chat/completions with writing-coach system prompt
        |
        v
[Gate 5] Response is [OK]?   --Yes--> silently return
        | No
        v
displayTip(): inline prompt (noReply) or toast notification
        |
        v
Record lastTipTime, add messageID to dedup cache
```

## Integration Points

| System | Protocol | Direction | Criticality |
|--------|----------|-----------|-------------|
| Agent Plugin SDK | In-process API | inbound (hook invocation) + outbound (display) | High — primary platform |
| LLM Provider | HTTP REST LLM endpoint (e.g., `/chat/completions`) | outbound | High — tip generation |
| Agent config file | Filesystem read | inbound (config discovery) | High — live config |
| File logger (`/tmp/lang-tutor.log`) | Filesystem append | outbound | Low — diagnostics |

## Global Constraints

- **Single runtime**: Each agent plugin runs entirely in that agent's process.
  There is no cross-agent communication, shared database, or server.
- **No persistence**: All state is in-memory (bounded messageIDCache, cooldown Map, AbortControllers).
  Restarting the agent resets all state.
- **LLM dependency**: Tip quality depends entirely on the configured LLM's
  instruction-following ability. The plugin assumes the model can return
  `[OK]` for well-written text and a short tip (<25 words) for issues.
- **Latency budget**: In `sync` mode, the plugin must complete its pipeline
  before the agent proceeds — typical LLM round-trip should be <2s.
  In `async` mode, tip display is non-blocking and may arrive after the
  agent's response.

## Evolution Log

| Date | Change | Description |
|------|--------|-------------|
| 2026-05-30 | init-profile | Initial architecture canvas — single-plugin, single-context topology |
| 2026-05 | add-lang-tutor-opencode | Added OpenCode agent plugin implementation; established hook-based data flow pattern |
| 2026-05-31 | switch-to-chat-message-hook | Migrated from tool.execute.before to chat.message hook; added ISO 639 normalization; removed unbounded processedMessages Set |