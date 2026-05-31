import type { Plugin } from "@opencode-ai/plugin"
import * as os from "os"
import * as path from "path"
import * as fs from "fs"

// ---------------------------------------------------------------------------
// File-based logger
// ---------------------------------------------------------------------------

const BASE_LOG_FILE = path.join(os.tmpdir(), "lang-tutor.log")

enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

function getLogFile(sessionID?: string): string {
  if (sessionID) return path.join(os.tmpdir(), `lang-tutor-${sessionID}.log`)
  return BASE_LOG_FILE
}

function log(level: LogLevel, message: string, data?: unknown, sessionID?: string): void {
  const logFile = getLogFile(sessionID)
  const timestamp = new Date().toISOString()
  const serialized = data instanceof Error
    ? { name: data.name, message: data.message, stack: data.stack?.split("\n").slice(0, 4).join("|") }
    : data
  const dataStr = serialized !== undefined ? " " + JSON.stringify(serialized) : ""
  const line = `[${timestamp}] [${level}] ${message}${dataStr}\n`
  fs.appendFileSync(logFile, line, "utf-8")
  if (level === LogLevel.ERROR) {
    console.error(`[lang-tutor] ${message}`, data ?? "")
  }
}

function ensureLogSize(logFile: string): void {
  try {
    const stat = fs.statSync(logFile)
    if (stat.size > 5 * 1024 * 1024) {
      fs.renameSync(logFile, logFile + ".old")
      log(LogLevel.INFO, "Log rotated (exceeded 5MB)")
    }
  } catch {
    // File doesn't exist yet, fine
  }
}

ensureLogSize(BASE_LOG_FILE)
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
  toastDurationMs?: number
  mode?: "sync" | "async"
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
// ISO 639 code normalization
// ---------------------------------------------------------------------------

const ISO_639_1_TO_3: Record<string, string> = {
  aa: "aar", ab: "abk", ae: "ave", af: "afr", ak: "aka", am: "amh", an: "arg",
  ar: "ara", as: "asm", av: "ava", ay: "aym", az: "aze", ba: "bak", be: "bel",
  bg: "bul", bh: "bih", bi: "bis", bm: "bam", bn: "ben", bo: "bod", br: "bre",
  bs: "bos", ca: "cat", ce: "che", ch: "cha", co: "cos", cr: "cre", cs: "ces",
  cu: "chu", cv: "chv", cy: "cym", da: "dan", de: "deu", dv: "div", dz: "dzo",
  ee: "ewe", el: "ell", en: "eng", eo: "epo", es: "spa", et: "est", eu: "eus",
  fa: "fas", ff: "ful", fi: "fin", fo: "fao", fr: "fra", fy: "fry", ga: "gle",
  gd: "gla", gl: "glg", gn: "grn", gu: "guj", gv: "glv", ha: "hau", he: "heb",
  hi: "hin", ho: "hmo", hr: "hrv", ht: "hat", hu: "hun", hy: "hye", hz: "her",
  ia: "ina", id: "ind", ie: "ile", ig: "ibo", ii: "iii", ik: "ipk", io: "ido",
  is: "isl", it: "ita", iu: "iku", ja: "jpn", jv: "jav", ka: "kat", kg: "kon",
  ki: "kik", kj: "kua", kk: "kaz", kl: "kal", km: "khm", kn: "kan", ko: "kor",
  kr: "kau", ks: "kas", ku: "kur", kv: "kom", kw: "cor", ky: "kir", la: "lat",
  lb: "ltz", lg: "lug", li: "lim", ln: "lin", lo: "lao", lt: "lit", lu: "lub",
  lv: "lav", mg: "mlg", mh: "mah", mi: "mri", mk: "mkd", ml: "mal", mn: "mon",
  mr: "mar", ms: "msa", mt: "mlt", my: "mya", na: "nau", nb: "nob", nd: "nde",
  ne: "nep", ng: "ndo", nl: "nld", nn: "nno", no: "nor", nr: "nbl", nv: "nav",
  ny: "nya", oc: "oci", oj: "oji", om: "orm", or: "ori", os: "oss", pa: "pan",
  pi: "pli", pl: "pol", ps: "pus", pt: "por", qu: "que", rm: "roh", rn: "run",
  ro: "ron", ru: "rus", rw: "kin", sa: "san", sc: "srd", sd: "snd", se: "sme",
  sg: "sag", si: "sin", sk: "slk", sl: "slv", sm: "smo", sn: "sna", so: "som",
  sq: "sqi", sr: "srp", ss: "ssw", st: "sot", su: "sun", sv: "swe", sw: "swa",
  ta: "tam", te: "tel", tg: "tgk", th: "tha", ti: "tir", tk: "tuk", tl: "tgl",
  tn: "tsn", to: "ton", tr: "tur", ts: "tso", tt: "tat", tw: "twi", ty: "tah",
  ug: "uig", uk: "ukr", ur: "urd", uz: "uzb", ve: "ven", vi: "vie", vo: "vol",
  wa: "wln", wo: "wol", xh: "xho", yi: "yid", yo: "yor", za: "zha", zh: "zho",
  zu: "zul",
}

const ISO_639_3_TO_NAME: Record<string, string> = {
  aar: "Afar", abk: "Abkhazian", ave: "Avestan", afr: "Afrikaans", aka: "Akan",
  amh: "Amharic", arg: "Aragonese", ara: "Arabic", asm: "Assamese", ava: "Avaric",
  aym: "Aymara", aze: "Azerbaijani", bak: "Bashkir", bel: "Belarusian", bul: "Bulgarian",
  bih: "Bihari", bis: "Bislama", bam: "Bambara", ben: "Bengali", bod: "Tibetan",
  bre: "Breton", bos: "Bosnian", cat: "Catalan", che: "Chechen", cha: "Chamorro",
  cos: "Corsican", cre: "Cree", ces: "Czech", chu: "Church Slavic", chv: "Chuvash",
  cym: "Welsh", dan: "Danish", deu: "German", div: "Divehi", dzo: "Dzongkha",
  ewe: "Ewe", ell: "Greek", eng: "English", epo: "Esperanto", spa: "Spanish",
  est: "Estonian", eus: "Basque", fas: "Persian", ful: "Fulah", fin: "Finnish",
  fao: "Faroese", fra: "French", fry: "Western Frisian", gle: "Irish", gla: "Scottish Gaelic",
  glg: "Galician", grn: "Guarani", guj: "Gujarati", glv: "Manx", hau: "Hausa",
  heb: "Hebrew", hin: "Hindi", hmo: "Hiri Motu", hrv: "Croatian", hat: "Haitian",
  hun: "Hungarian", hye: "Armenian", her: "Herero", ina: "Interlingua", ind: "Indonesian",
  ile: "Interlingue", ibo: "Igbo", iii: "Sichuan Yi", ipk: "Inupiaq", ido: "Ido",
  isl: "Icelandic", ita: "Italian", iku: "Inuktitut", jpn: "Japanese", jav: "Javanese",
  kat: "Georgian", kon: "Kongo", kik: "Kikuyu", kua: "Kuanyama", kaz: "Kazakh",
  kal: "Kalaallisut", khm: "Khmer", kan: "Kannada", kor: "Korean", kau: "Kanuri",
  kas: "Kashmiri", kur: "Kurdish", kom: "Komi", cor: "Cornish", kir: "Kirghiz",
  lat: "Latin", ltz: "Luxembourgish", lug: "Ganda", lim: "Limburgish", lin: "Lingala",
  lao: "Lao", lit: "Lithuanian", lub: "Luba-Katanga", lav: "Latvian", mlg: "Malagasy",
  mah: "Marshallese", mri: "Maori", mkd: "Macedonian", mal: "Malayalam", mon: "Mongolian",
  mar: "Marathi", msa: "Malay", mlt: "Maltese", mya: "Burmese", nau: "Nauru",
  nob: "Norwegian Bokmål", nde: "North Ndebele", nep: "Nepali", ndo: "Ndonga",
  nld: "Dutch", nno: "Norwegian Nynorsk", nor: "Norwegian", nbl: "South Ndebele",
  nav: "Navajo", nya: "Chichewa", oci: "Occitan", oji: "Ojibwa", orm: "Oromo",
  ori: "Oriya", oss: "Ossetian", pan: "Panjabi", pli: "Pali", pol: "Polish",
  pus: "Pushto", por: "Portuguese", que: "Quechua", roh: "Romansh", run: "Rundi",
  ron: "Romanian", rus: "Russian", kin: "Kinyarwanda", san: "Sanskrit", srd: "Sardinian",
  snd: "Sindhi", sme: "Northern Sami", sag: "Sango", sin: "Sinhala", slk: "Slovak",
  slv: "Slovenian", smo: "Samoan", sna: "Shona", som: "Somali", sqi: "Albanian",
  srp: "Serbian", ssw: "Swati", sot: "Southern Sotho", sun: "Sundanese", swe: "Swedish",
  swa: "Swahili", tam: "Tamil", tel: "Telugu", tgk: "Tajik", tha: "Thai",
  tir: "Tigrinya", tuk: "Turkmen", tgl: "Tagalog", tsn: "Tswana", ton: "Tonga",
  tur: "Turkish", tso: "Tsonga", tat: "Tatar", twi: "Twi", tah: "Tahitian",
  uig: "Uighur", ukr: "Ukrainian", urd: "Urdu", uzb: "Uzbek", ven: "Venda",
  vie: "Vietnamese", vol: "Volapük", wln: "Walloon", wol: "Wolof", xho: "Xhosa",
  yid: "Yiddish", yor: "Yoruba", zha: "Zhuang", zho: "Chinese", zul: "Zulu",
}

function normalizeTo6393(value: string): string {
  if (value.length === 2) {
    return ISO_639_1_TO_3[value] ?? value
  }
  return value
}

function normalizeNativeLanguages(nativeLanguages: string[]): string[] {
  const normalized = nativeLanguages.map(normalizeTo6393)
  return [...new Set(normalized)]
}

const NAME_TO_639_3: Record<string, string> = {}
for (const [code, name] of Object.entries(ISO_639_3_TO_NAME)) {
  NAME_TO_639_3[name.toLowerCase()] = code
}

function resolveForcedLanguageName(forcedLanguage: string): string {
  const as6393 = normalizeTo6393(forcedLanguage)
  const fromCode = ISO_639_3_TO_NAME[as6393]
  if (fromCode) return fromCode
  const fromName = NAME_TO_639_3[forcedLanguage.toLowerCase()]
  if (fromName) return ISO_639_3_TO_NAME[fromName] ?? forcedLanguage
  return forcedLanguage
}

// ---------------------------------------------------------------------------
// SYSTEM PROMPT
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `You are a writing coach in a terminal-based AI coding assistant. Analyze the user's text below for grammar, clarity, vocabulary, phrasing, and naturalness in whatever language it's written in. If the text is already well-written and natural in its language, respond ONLY with: [OK]. If you notice an issue, provide exactly one short, specific correction or improvement suggestion. Under 25 words. Output ONLY the tip or [OK] — no preamble, no quotation marks, no "The user should...". Example output: "done" is more natural than "did" here.`

function buildSystemPrompt(forcedLanguage?: string): string {
  if (forcedLanguage) {
    const langName = resolveForcedLanguageName(forcedLanguage)
    return `You are a writing coach focusing on ${langName}. Analyze the user's text below for grammar, clarity, vocabulary, phrasing, and naturalness in ${langName}. If the text is already well-written and natural, respond ONLY with: [OK]. If you notice an issue, provide exactly one short, specific correction or improvement suggestion in ${langName}. Under 25 words. Output ONLY the tip or [OK] — no preamble, no quotation marks.`
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
  const normalized = normalizeNativeLanguages(nativeLanguages)
  return normalized.includes(lang)
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
  maxTokens: number,
  signal?: AbortSignal,
  disableReasoning?: boolean,
): Promise<string | null> {
  const url = baseURL.replace(/\/+$/, "") + "/chat/completions"

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`
  }

  const bodyObj: Record<string, unknown> = {
    model: modelID,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
  }

  if (disableReasoning) {
    bodyObj.enable_thinking = false
  }

  const body = JSON.stringify(bodyObj)

  log(LogLevel.DEBUG, "fetchTip: sending request", { url, modelID, userTextLength: userText.length, disableReasoning: !!disableReasoning })

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal,
  })

  if (!response.ok) {
    log(LogLevel.WARN, "fetchTip: non-OK response", { status: response.status, statusText: response.statusText, disableReasoning: !!disableReasoning })
    if (disableReasoning) {
      log(LogLevel.INFO, "fetchTip: reasoning-disabled request failed, falling back to reasoning-enabled")
      return fetchTip(baseURL, apiKey, modelID, systemPrompt, userText, maxTokens, signal, false)
    }
    return null
  }

  log(LogLevel.DEBUG, "fetchTip: response OK", { status: response.status })

  const rawData = await response.text()
  log(LogLevel.DEBUG, "fetchTip: raw response body", { rawData: rawData.slice(0, 500) })
  const data = JSON.parse(rawData) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string }; finish_reason?: string }>
  }

  const choice = data.choices?.[0]
  const content = choice?.message?.content
  const finishReason = choice?.finish_reason

  if (!content || !content.trim()) {
    log(LogLevel.WARN, "fetchTip: empty content", {
      hasReasoning: !!choice?.message?.reasoning_content,
      finishReason,
      choicesCount: data.choices?.length ?? 0,
      maxTokens,
      disableReasoning: !!disableReasoning,
    })
    if (disableReasoning) {
      log(LogLevel.INFO, "fetchTip: reasoning-disabled produced empty content, falling back to reasoning-enabled")
      return fetchTip(baseURL, apiKey, modelID, systemPrompt, userText, maxTokens, signal, false)
    }
    if (finishReason === "length" && choice?.message?.reasoning_content && maxTokens < 512) {
      log(LogLevel.INFO, "fetchTip: retrying with higher max_tokens", { oldMaxTokens: maxTokens, newMaxTokens: 512 })
      return fetchTip(baseURL, apiKey, modelID, systemPrompt, userText, 512, signal, false)
    }
    return null
  }
  const trimmed = content.trim() || null
  log(LogLevel.DEBUG, "fetchTip: response content", { hasContent: !!trimmed, preview: trimmed?.slice(0, 60) })
  return trimmed
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

async function displayTipToast(
  client: { tui: { publish: (params?: { body?: unknown }) => Promise<unknown> } },
  tip: string,
  duration: number,
): Promise<void> {
  await client.tui.publish({
    body: {
      type: "tui.toast.show",
      properties: {
        message: `[LANG-TIP] ${tip}`,
        variant: "info",
        duration,
      },
    },
  })
}

async function displayTipPrompt(
  client: { session: { prompt: (params: { sessionID: string; noReply?: boolean; parts?: Array<{ type: string; text: string }> }) => Promise<unknown> } },
  sessionID: string,
  tip: string,
): Promise<void> {
  await client.session.prompt({
    sessionID,
    noReply: true,
    parts: [{ type: "text", text: `[LANG-TIP] ${tip}` }],
  })
}

async function displayTip(
  client: { session: { prompt: (params: { sessionID: string; noReply?: boolean; parts?: Array<{ type: string; text: string }> }) => Promise<unknown> }; tui: { publish: (params?: { body?: unknown }) => Promise<unknown> } },
  sessionID: string,
  tip: string,
  method: "prompt" | "toast",
  toastDuration: number,
): Promise<void> {
  if (method === "toast") {
    await displayTipToast(client, tip, toastDuration)
  } else {
    await displayTipPrompt(client, sessionID, tip)
  }
}

// ---------------------------------------------------------------------------
// TipsQueue — per-session AbortController for rapid-fire messages
// ---------------------------------------------------------------------------

class TipsQueue {
  private controllers = new Map<string, AbortController>()

  enqueue(sessionID: string, fn: (signal: AbortSignal) => Promise<void>): void {
    const prev = this.controllers.get(sessionID)
    if (prev) {
      prev.abort()
      log(LogLevel.DEBUG, "TipsQueue: aborted previous request", { sessionID })
    }
    const controller = new AbortController()
    this.controllers.set(sessionID, controller)
    fn(controller.signal)
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") {
          log(LogLevel.DEBUG, "TipsQueue: request aborted", { sessionID })
        } else {
          log(LogLevel.ERROR, "TipsQueue: request failed", err)
        }
      })
      .finally(() => {
        if (this.controllers.get(sessionID) === controller) {
          this.controllers.delete(sessionID)
        }
      })
  }
}

// ---------------------------------------------------------------------------
// Main plugin
// ---------------------------------------------------------------------------

const messageIDCache = new Map<string, string[]>()
const MAX_CACHE_PER_SESSION = 100
const lastTipTime = new Map<string, number>()
const tipsQueue = new TipsQueue()

function isMessageProcessed(sessionID: string, messageID: string | undefined): boolean {
  if (!messageID) return false
  const cached = messageIDCache.get(sessionID) ?? []
  if (cached.includes(messageID)) return true
  const updated = [...cached, messageID]
  if (updated.length > MAX_CACHE_PER_SESSION) {
    updated.splice(0, updated.length - MAX_CACHE_PER_SESSION)
  }
  messageIDCache.set(sessionID, updated)
  return false
}

export const LangTutorPlugin: Plugin = async (ctx) => {
  return {
    "chat.message": async (
      input: { sessionID: string; agent?: string; model?: { providerID: string; modelID: string }; messageID?: string; variant?: string },
      output: { message: { id?: string; role?: string }; parts: Array<{ type?: string; text?: string }> },
    ) => {
      const sessionID = input.sessionID
      if (!sessionID) return

      if (isMessageProcessed(sessionID, input.messageID ?? output.message?.id)) {
        log(LogLevel.DEBUG, "chat.message: messageID already processed", { messageID: input.messageID }, sessionID)
        return
      }

      const rawConfig = readOpencodeConfig(ctx.worktree)
      if (!rawConfig) return

      const pluginOpts = resolvePluginOptions(rawConfig)
      if (pluginOpts.enabled === false) return

      if (pluginOpts.cooldownMs && pluginOpts.cooldownMs > 0) {
        const last = lastTipTime.get(sessionID) ?? 0
        if (Date.now() - last < pluginOpts.cooldownMs) {
          log(LogLevel.DEBUG, "chat.message: cooldown active", { cooldownMs: pluginOpts.cooldownMs }, sessionID)
          return
        }
      }

      const modelID = pluginOpts.tipModel ?? input.model?.modelID ?? rawConfig.model
      if (!modelID) {
        log(LogLevel.WARN, "chat.message: no model ID available", undefined, sessionID)
        return
      }

      const providerConfig = resolveProviderConfig(rawConfig, modelID)
      if (!providerConfig) return

      const userContent = (output.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text" && !!p.text)
        .map((p) => p.text)
        .join("")
      if (!userContent) return

      log(LogLevel.INFO, "chat.message: processing tip", { modelID, contentLength: userContent.length, mode: pluginOpts.mode ?? "sync" }, sessionID)

      const lang = detectLanguage(userContent)
      if (isNativeLanguage(lang, pluginOpts.nativeLanguages)) {
        log(LogLevel.INFO, "chat.message: native language detected, skipping", { lang }, sessionID)
        return
      }

      const wc = wordCount(userContent)
      if (wc < 10 && lang === "und") {
        log(LogLevel.DEBUG, "chat.message: short text with uncertain language, proceeding to LLM", undefined, sessionID)
      }

      const stripped = stripCodeBlocks(userContent)
      const systemPrompt = buildSystemPrompt(pluginOpts.forcedLanguage)

      const runTip = async (signal: AbortSignal) => {
        try {
          const tip = await fetchTip(
            providerConfig.baseURL,
            providerConfig.apiKey,
            modelID,
            systemPrompt,
            stripped,
            200,
            signal,
            true,
          )

          if (!tip || isOKResponse(tip)) {
            log(LogLevel.DEBUG, "chat.message: no actionable tip (null or [OK])", { tip }, sessionID)
            return
          }

          log(LogLevel.INFO, "chat.message: displaying tip", { tip, method: pluginOpts.displayMethod ?? "prompt" }, sessionID)
          try {
            await displayTip(ctx.client, sessionID, tip, pluginOpts.displayMethod ?? "prompt", pluginOpts.toastDurationMs ?? 8000)
          } catch (displayErr) {
            log(LogLevel.ERROR, "chat.message: displayTip failed", displayErr, sessionID)
          }
          lastTipTime.set(sessionID, Date.now())
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return
          log(LogLevel.ERROR, "Tip request failed", err, sessionID)
        }
      }

      if (pluginOpts.mode === "async") {
        tipsQueue.enqueue(sessionID, runTip)
      } else {
        const controller = new AbortController()
        try {
          await runTip(controller.signal)
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return
          log(LogLevel.ERROR, "Tip request failed (sync)", err, sessionID)
        }
      }
    },
  }
}

export default LangTutorPlugin