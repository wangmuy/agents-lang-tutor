import type { Plugin } from "@opencode-ai/plugin"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PluginConfig {
  enabled?: boolean
  nativeLanguages?: string[]
  forcedLanguage?: string
  cooldownMs?: number
  tipModel?: string
}

interface OpencodeConfig {
  model?: string
  provider?: Record<string, {
    options?: {
      baseURL?: string
      apiKey?: string
    }
    models?: Record<string, unknown>
  }>
  plugin?: Array<string | [string, PluginConfig]>
}

interface ProviderConfig {
  baseURL: string
  apiKey: string
}

// ---------------------------------------------------------------------------
// SYSTEM PROMPT
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `You are a writing coach in a terminal-based AI coding assistant. Analyze the user's text below for grammar, clarity, vocabulary, phrasing, and naturalness in whatever language it's written in. If the text is already well-written and natural in its language, respond ONLY with: [OK]. If you notice an issue, provide exactly one short, specific correction or improvement suggestion. Under 25 words. Output ONLY the tip or [OK] — no preamble, no quotation marks, no "The user should...". Example output: "done" is more natural than "did" here.`

function buildSystemPrompt(forcedLanguage?: string): string {
  if (forcedLanguage) {
    return `You are a writing coach focusing on ${forcedLanguage}. Analyze the user's text below for grammar, clarity, vocabulary, phrasing, and naturalness in ${forcedLanguage}. If the text is already well-written and natural, respond ONLY with: [OK]. If you notice an issue, provide exactly one short, specific correction or improvement suggestion in ${forcedLanguage}. Under 25 words. Output ONLY the tip or [OK] — no preamble, no quotation marks.`
  }
  return BASE_SYSTEM_PROMPT
}

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function readOpencodeConfig(worktree: string): OpencodeConfig | null {
  const projectPath = path.join(worktree, "opencode.json")
  const homePath = path.join(os.homedir(), ".config", "opencode", "opencode.json")

  let homeConfig: OpencodeConfig = {}
  let projectConfig: OpencodeConfig = {}

  if (fs.existsSync(homePath)) {
    try {
      homeConfig = JSON.parse(fs.readFileSync(homePath, "utf-8"))
    } catch { /* ignore */ }
  }

  if (fs.existsSync(projectPath)) {
    try {
      projectConfig = JSON.parse(fs.readFileSync(projectPath, "utf-8"))
    } catch { /* ignore */ }
  }

  const merged: OpencodeConfig = {
    ...homeConfig,
    ...projectConfig,
    provider: {
      ...(homeConfig.provider ?? {}),
      ...(projectConfig.provider ?? {}),
    },
  }

  return Object.keys(merged).length > 0 ? merged : null
}

function resolveEnvVars(value: string): string {
  return value.replace(/\{env:(\w+)\}/g, (_, name: string) => process.env[name] ?? "")
}

function resolveProviderConfig(
  config: OpencodeConfig,
  modelID: string,
): ProviderConfig | null {
  const providers = config.provider
  if (!providers) return null

  for (const [, providerConfig] of Object.entries(providers)) {
    const models = providerConfig.models
    if (models && modelID in models) {
      const options = providerConfig.options
      if (!options?.baseURL) return null

      const apiKey = options.apiKey ? resolveEnvVars(options.apiKey) : ""
      return {
        baseURL: options.baseURL,
        apiKey,
      }
    }
  }

  return null
}

function resolvePluginOptions(
  config: OpencodeConfig,
): PluginConfig {
  const pluginEntries = config.plugin
  if (!pluginEntries) return {}

  for (const entry of pluginEntries) {
    if (Array.isArray(entry)) {
      return entry[1] as PluginConfig ?? {}
    }
  }

  return {}
}

// ---------------------------------------------------------------------------
// Code block stripping
// ---------------------------------------------------------------------------

function stripCodeBlocks(text: string): string {
  let result = text
  result = result.replace(/```[\s\S]*?```/g, "[CODE BLOCK]")
  result = result.replace(/(?<!`)`([^`\n]+?)`(?!`)/g, "[CODE]")
  return result
}

// ---------------------------------------------------------------------------
// Language detection (franc-min)
// ---------------------------------------------------------------------------

let francMin: ((text: string, options?: { minLength?: number }) => string) | null = null

function loadFrancMin(): boolean {
  if (francMin) return true
  try {
    const m = require("franc-min") as { franc: (text: string, options?: { minLength?: number }) => string }
    francMin = m.franc ?? m.default?.franc ?? m.default
    return !!francMin
  } catch {
    return false
  }
}

function detectLanguage(text: string): string {
  if (!loadFrancMin()) return "und"
  const stripped = stripCodeBlocks(text)
  return francMin!(stripped, { minLength: 1 }) || "und"
}

function isNativeLanguage(lang: string, nativeLanguages?: string[]): boolean {
  if (!nativeLanguages || nativeLanguages.length === 0) return false
  return nativeLanguages.includes(lang)
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// ---------------------------------------------------------------------------
// LLM response handling
// ---------------------------------------------------------------------------

function isOKResponse(response: string): boolean {
  const trimmed = response.trim()
  return trimmed === "[OK]" || trimmed.startsWith("[OK]")
}

// ---------------------------------------------------------------------------
// LLM API call
// ---------------------------------------------------------------------------

async function fetchTip(
  baseURL: string,
  apiKey: string,
  modelID: string,
  systemPrompt: string,
  userText: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = baseURL.replace(/\/+$/, "") + "/chat/completions"

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`
  }

  const body = JSON.stringify({
    model: modelID,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    max_tokens: 50,
    temperature: 0.3,
  })

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal,
  })

  if (!response.ok) return null

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = data.choices?.[0]?.message?.content
  return content?.trim() || null
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

async function displayTip(
  client: { session: { prompt: (args: unknown) => unknown } },
  sessionID: string,
  tip: string,
): Promise<void> {
  await (client.session.prompt as (args: {
    path: { id: string }
    body: { noReply: boolean; parts: Array<{ type: string; text: string }> }
  }) => Promise<unknown>)({
    path: { id: sessionID },
    body: {
      noReply: true,
      parts: [{ type: "text", text: `[LANG-TIP] ${tip}` }],
    },
  })
}

// ---------------------------------------------------------------------------
// TipsQueue: per-session abort controller + cooldown management
// ---------------------------------------------------------------------------

class TipsQueue {
  private controllers = new Map<string, AbortController>()
  private lastTipTime = new Map<string, number>()

  enqueue(
    sessionID: string,
    fn: (signal: AbortSignal) => Promise<string | null>,
    cooldownMs?: number,
  ): void {
    // Cooldown check
    if (cooldownMs && cooldownMs > 0) {
      const last = this.lastTipTime.get(sessionID) ?? 0
      if (Date.now() - last < cooldownMs) return
    }

    // Abort previous pending request for this session
    const prev = this.controllers.get(sessionID)
    if (prev) {
      prev.abort()
    }

    const controller = new AbortController()
    this.controllers.set(sessionID, controller)

    // Run async, don't block
    fn(controller.signal).then((tip) => {
      this.controllers.delete(sessionID)
      if (tip !== null) {
        this.lastTipTime.set(sessionID, Date.now())
      }
    }).catch(() => {
      this.controllers.delete(sessionID)
    })
  }
}

// ---------------------------------------------------------------------------
// Main plugin
// ---------------------------------------------------------------------------

const tipsQueue = new TipsQueue()

export const LangTutorPlugin: Plugin = async (ctx) => {
  return {
    "chat.message": async (input, output) => {
      const message = output.message
      if (message.role !== "user" || !message.content) return

      const content = typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content.map((p: { text?: string }) => p.text ?? "").join("")
          : ""

      if (!content) return

      // Re-read config on every message for dynamic enable/disable
      const rawConfig = readOpencodeConfig(ctx.worktree)
      if (!rawConfig) return

      const pluginOpts = resolvePluginOptions(rawConfig)

      // enabled check
      if (pluginOpts.enabled === false) return

      // Layer 1: language detection gate
      const stripped = stripCodeBlocks(content)
      if (wordCount(stripped) >= 10 && pluginOpts.nativeLanguages?.length) {
        const lang = detectLanguage(content)
        if (lang !== "und" && isNativeLanguage(lang, pluginOpts.nativeLanguages)) {
          return
        }
      }

      // Resolve model: tipModel option overrides active model
      const modelID = pluginOpts.tipModel ?? input.model?.modelID ?? rawConfig.model
      if (!modelID) return

      const providerID = input.model?.providerID
      if (!providerID) return

      const providerConfig = resolveProviderConfig(rawConfig, modelID)
      if (!providerConfig) return

      const systemPrompt = buildSystemPrompt(pluginOpts.forcedLanguage)

      // Queue the async tip request
      tipsQueue.enqueue(
        input.sessionID,
        async (signal) => {
          try {
            const tip = await fetchTip(
              providerConfig.baseURL,
              providerConfig.apiKey,
              modelID,
              systemPrompt,
              stripped,
              signal,
            )

            if (!tip || isOKResponse(tip)) return null

            await displayTip(ctx.client, input.sessionID, tip)
            return tip
          } catch (err) {
            // AbortError is expected during rapid-fire, don't log
            if (err instanceof Error && err.name === "AbortError") return null
            console.error("[lang-tutor] Tip request failed:", err)
            return null
          }
        },
        pluginOpts.cooldownMs,
      )
    },
  }
}

export default LangTutorPlugin