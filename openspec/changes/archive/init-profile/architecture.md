# Architecture Canvas

> Last verified: 2026-05-30. Living document — update when boundaries change.

## Bounded Contexts

This project has a single bounded context — the Lang-Tutor Plugin — deployed
independently per agent runtime. Each agent port is a self-contained instance.

### Lang-Tutor Plugin

- **Responsibility**: Detect user message language, evaluate writing quality
  via LLM, and display improvement tips without polluting conversation context.
- **Spec**: No BDD specs exist yet. Reference implementation: `.opencode/plugin/lang-tutor/index.ts`
- **Key Entities**:
  - `LangTutorPlugin` — Plugin entry point, registers hooks, orchestrates pipeline
  - `PluginConfig` — Runtime configuration (enabled, nativeLanguages, displayMethod, mode)
  - `ProcessedMessages` — Set-based dedup tracker (by message ID)
  - `LastTipTime` — Map-based cooldown tracker (by session ID)

## Data Flow Topology

```
User sends message
        |
        v
Agent hook fires (e.g., before-tool-execute)
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
Fetch session messages via SDK
        |
        v
Find latest user message (iterate backwards by role === "user")
        |
        v
[Gate 3] Already processed?  --Yes--> silently return
        | No
        v
stripCodeBlocks(): ```...``` -> [CODE BLOCK], `code` -> [CODE]
        |
        v
detectLanguage() via franc-min (ISO 639-3)
        |
        v
[Gate 4] Is native language? --Yes--> silently return (no API call)
        | No
        v
fetchTip(): POST /chat/completions with writing-coach system prompt
        |
        v
[Gate 5] Response is [OK]?   --Yes--> silently return
        | No
        v
displayTip(): inline prompt or notification
        |
        v
Record lastTipTime, mark message as processed
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
- **No persistence**: All state is in-memory (dedup Set, cooldown Map).
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
| 2026-05 | add-lang-tutor-plugin | Added first agent plugin implementation; established hook-based data flow pattern |