import type { Plugin } from "@opencode-ai/plugin"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"

// ---------------------------------------------------------------------------
// File-based logger
// ---------------------------------------------------------------------------

const LOG_FILE = path.join(os.tmpdir(), "lang-tutor.log")

enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

function log(level: LogLevel, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString()
  const serialized = data instanceof Error
    ? { name: data.name, message: data.message, stack: data.stack?.split("\n").slice(0, 4).join("|") }
    : data
  const dataStr = serialized !== undefined ? " " + JSON.stringify(serialized) : ""
  const line = `[${timestamp}] [${level}] ${message}${dataStr}\n`
  fs.appendFileSync(LOG_FILE, line, "utf-8")
  if (level === LogLevel.ERROR) {
    console.error(`[lang-tutor] ${message}`, data ?? "")
  }
}

// Rotate log file if it exceeds 5MB
function ensureLogSize(): void {
  try {
    const stat = fs.statSync(LOG_FILE)
    if (stat.size > 5 * 1024 * 1024) {
      fs.renameSync(LOG_FILE, LOG_FILE + ".old")
      log(LogLevel.INFO, "Log rotated (exceeded 5MB)")
    }
  } catch {
    // File doesn't exist yet, fine
  }
}

ensureLogSize()
log(LogLevel.INFO, "Plugin loaded")

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PluginConfig {
  enabled?: boolean
  nativeLanguages?: string[]
  forcedLanguage?: string
  cooldownMs?: number
  tipModel?: string
  displayMethod?: "prompt" | "toast"
  mode?: "sync" | "async"
}
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

  log(LogLevel.DEBUG, "readOpencodeConfig", { worktree, homePath, projectPath })

  let homeConfig: OpencodeConfig = {}
  let projectConfig: OpencodeConfig = {}

  if (fs.existsSync(homePath)) {
    try {
      homeConfig = JSON.parse(fs.readFileSync(homePath, "utf-8"))
      log(LogLevel.DEBUG, "Home config loaded", { homePath })
    } catch {
      log(LogLevel.WARN, "Failed to parse home config", { homePath })
    }
  } else {
    log(LogLevel.DEBUG, "Home config not found", { homePath })
  }

  if (fs.existsSync(projectPath)) {
    try {
      projectConfig = JSON.parse(fs.readFileSync(projectPath, "utf-8"))
      log(LogLevel.DEBUG, "Project config loaded", { projectPath })
    } catch {
      log(LogLevel.WARN, "Failed to parse project config", { projectPath })
    }
  } else {
    log(LogLevel.DEBUG, "Project config not found", { projectPath })
  }

  const merged: OpencodeConfig = {
    ...homeConfig,
    ...projectConfig,
    provider: {
      ...(homeConfig.provider ?? {}),
      ...(projectConfig.provider ?? {}),
    },
  }

  const hasContent = Object.keys(merged).length > 0
  log(LogLevel.DEBUG, "Config merged", { hasContent })
  return hasContent ? merged : null
}

function resolveEnvVars(value: string): string {
  return value.replace(/\{env:(\w+)\}/g, (_, name: string) => process.env[name] ?? "")
}

function resolveProviderConfig(
  config: OpencodeConfig,
  modelID: string,
): ProviderConfig | null {
  const providers = config.provider
  if (!providers) {
    log(LogLevel.WARN, "No providers found in config")
    return null
  }

  for (const [providerName, providerConfig] of Object.entries(providers)) {
    const models = providerConfig.models
    if (models && modelID in models) {
      const options = providerConfig.options
      if (!options?.baseURL) {
        log(LogLevel.WARN, "Provider has no baseURL", { providerName, modelID })
        return null
      }

      const apiKey = options.apiKey ? resolveEnvVars(options.apiKey) : ""
      const hasKey = !!apiKey
      log(LogLevel.DEBUG, "Provider resolved", { providerName, modelID, baseURL: options.baseURL, hasKey })
      return {
        baseURL: options.baseURL,
        apiKey,
      }
    }
  }

  log(LogLevel.WARN, "Model not found in any provider", { modelID })
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
    const loaded = !!francMin
    log(LogLevel.DEBUG, "franc-min loaded", { loaded })
    return loaded
  } catch (e) {
    log(LogLevel.ERROR, "Failed to load franc-min", e)
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

  log(LogLevel.DEBUG, "fetchTip: sending request", { url, modelID, userTextLength: userText.length })

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal,
  })

  if (!response.ok) {
    log(LogLevel.WARN, "fetchTip: non-OK response", { status: response.status, statusText: response.statusText })
    return null
  }

  log(LogLevel.DEBUG, "fetchTip: response OK", { status: response.status })

  const rawData = await response.text()
  log(LogLevel.DEBUG, "fetchTip: raw response body", { rawData: rawData.slice(0, 500) })
  const data = JSON.parse(rawData) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>
  }

  const content = data.choices?.[0]?.message?.content
  if (!content) {
    log(LogLevel.WARN, "fetchTip: empty content", {
      hasReasoning: !!data.choices?.[0]?.message?.reasoning_content,
      choicesCount: data.choices?.length ?? 0,
      status: response.status,
    })
    return null
  }
  const trimmed = content.trim() || null
  log(LogLevel.DEBUG, "fetchTip: response content", { hasContent: !!trimmed, preview: trimmed?.slice(0, 60) })
  return trimmed
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

async function displayTipPrompt(
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

async function displayTipToast(
  client: { tui: { showToast: (args: unknown) => unknown } },
  tip: string,
): Promise<void> {
  await (client.tui.showToast as (args: {
    body: { message: string; variant: string; duration?: number }
  }) => Promise<unknown>)({
    body: {
      message: `[LANG-TIP] ${tip}`,
      variant: "info",
      duration: 8000,
    },
  })
}

async function displayTip(
  client: { session: { prompt: (args: unknown) => unknown }; tui: { showToast: (args: unknown) => unknown } },
  sessionID: string,
  tip: string,
  method: "prompt" | "toast",
): Promise<void> {
  if (method === "toast") {
    await displayTipToast(client, tip)
  } else {
    await displayTipPrompt(client, sessionID, tip)
  }
}

// ---------------------------------------------------------------------------
// TipsQueue: per-session abort controller + cooldown management
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main plugin
// ---------------------------------------------------------------------------

const processedMessages = new Set<string>()
const lastTipTime = new Map<string, number>()

export const LangTutorPlugin: Plugin = async (ctx) => {
  return {
    "tool.execute.before": async (input: { sessionID?: string }, _output: unknown) => {
      const sessionID = input.sessionID
      if (!sessionID) return

      // Re-read config
      const rawConfig = readOpencodeConfig(ctx.worktree)
      if (!rawConfig) return

      const pluginOpts = resolvePluginOptions(rawConfig)
      if (pluginOpts.enabled === false) return

      // Cooldown check
      if (pluginOpts.cooldownMs && pluginOpts.cooldownMs > 0) {
        const last = lastTipTime.get(sessionID) ?? 0
        if (Date.now() - last < pluginOpts.cooldownMs) return
      }

      const modelID = pluginOpts.tipModel ?? rawConfig.model
      if (!modelID) return

      const providerConfig = resolveProviderConfig(rawConfig, modelID)
      if (!providerConfig) return

      // Fetch session messages synchronously to find latest user message
      let userContent = ""
      let userMessageID = ""
      try {
        const msgsResult = await (ctx.client.session.messages as (args: {
          path: { id: string }
        }) => Promise<{ data?: Array<{ info?: { id?: string; role?: string }; parts?: Array<{ type?: string; text?: string }> }> }>)({
          path: { id: sessionID },
        })

        const msgs = msgsResult.data ?? []
        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i]
          if (msg.info?.role === "user") {
            userMessageID = msg.info.id ?? ""
            const parts = msg.parts ?? []
            for (const part of parts) {
              if (part.type === "text" && part.text) {
                userContent += part.text
              }
            }
            break
          }
        }
      } catch {
        return
      }

      // Skip if no user content or already processed
      if (!userContent || !userMessageID) return
      if (processedMessages.has(userMessageID)) return
      processedMessages.add(userMessageID)

      log(LogLevel.INFO, "tool.execute.before: processing tip", { modelID, contentLength: userContent.length, mode: pluginOpts.mode ?? "sync" })

      const stripped = stripCodeBlocks(userContent)
      const systemPrompt = buildSystemPrompt(pluginOpts.forcedLanguage)

      const runTip = async () => {
        try {
          const tip = await fetchTip(
            providerConfig.baseURL,
            providerConfig.apiKey,
            modelID,
            systemPrompt,
            stripped,
          )

          if (!tip || isOKResponse(tip)) {
            log(LogLevel.DEBUG, "tool.execute.before: no actionable tip (null or [OK])", { tip })
            return
          }

          log(LogLevel.INFO, "tool.execute.before: displaying tip", { tip, method: pluginOpts.displayMethod ?? "prompt" })
          await displayTip(ctx.client, sessionID, tip, pluginOpts.displayMethod ?? "prompt")
          lastTipTime.set(sessionID, Date.now())
        } catch (err) {
          log(LogLevel.ERROR, "Tip request failed", err)
        }
      }

      if (pluginOpts.mode === "async") {
        Promise.resolve().then(runTip)
      } else {
        await runTip()
      }
    },
  }
}

export default LangTutorPlugin