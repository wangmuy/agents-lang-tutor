#!/usr/bin/env python3
"""Lang-tutor hook for Claude Code — UserPromptSubmit hook.

Reads user prompt from stdin, calls an LLM for writing-coach feedback,
and displays a short tip if the text can be improved. Never modifies or
blocks the prompt — always passes it through on stdout.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CONFIG_FILE = ".claude/lang-tutor/config.json"

DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": True,
    "nativeLanguages": [],
    "forcedLanguage": None,
    "cooldownMs": 10000,
    "tipModel": None,
    "displayMethod": "stderr",
    "toastDurationMs": 5000,
    "mode": "sync",
    "baseUrl": None,
    "wireApi": None,
}

BASE_SYSTEM_PROMPT = (
    "You are a writing coach in a terminal-based AI coding assistant. "
    "Analyze the user's text below for grammar, clarity, vocabulary, phrasing, "
    "and naturalness in whatever language it's written in. If the text is already "
    "well-written and natural in its language, respond ONLY with: [OK]. "
    "If you notice an issue, provide exactly one short, specific correction or "
    "improvement suggestion. Under 25 words. Output ONLY the tip or [OK] — "
    "no preamble, no quotation marks, no \"The user should...\". "
    'Example output: "done" is more natural than "did" here.'
)

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_BASE_URL = "https://api.anthropic.com"
LOG_DIR = Path("/tmp")

# ---------------------------------------------------------------------------
# ISO 639 code normalization (ported from OpenCode TypeScript implementation)
# ---------------------------------------------------------------------------

ISO_639_1_TO_3: dict[str, str] = {
    "aa": "aar", "ab": "abk", "ae": "ave", "af": "afr", "ak": "aka",
    "am": "amh", "an": "arg", "ar": "ara", "as": "asm", "av": "ava",
    "ay": "aym", "az": "aze", "ba": "bak", "be": "bel", "bg": "bul",
    "bh": "bih", "bi": "bis", "bm": "bam", "bn": "ben", "bo": "bod",
    "br": "bre", "bs": "bos", "ca": "cat", "ce": "che", "ch": "cha",
    "co": "cos", "cr": "cre", "cs": "ces", "cu": "chu", "cv": "chv",
    "cy": "cym", "da": "dan", "de": "deu", "dv": "div", "dz": "dzo",
    "ee": "ewe", "el": "ell", "en": "eng", "eo": "epo", "es": "spa",
    "et": "est", "eu": "eus", "fa": "fas", "ff": "ful", "fi": "fin",
    "fo": "fao", "fr": "fra", "fy": "fry", "ga": "gle", "gd": "gla",
    "gl": "glg", "gn": "grn", "gu": "guj", "gv": "glv", "ha": "hau",
    "he": "heb", "hi": "hin", "ho": "hmo", "hr": "hrv", "ht": "hat",
    "hu": "hun", "hy": "hye", "hz": "her", "ia": "ina", "id": "ind",
    "ie": "ile", "ig": "ibo", "ii": "iii", "ik": "ipk", "io": "ido",
    "is": "isl", "it": "ita", "iu": "iku", "ja": "jpn", "jv": "jav",
    "ka": "kat", "kg": "kon", "ki": "kik", "kj": "kua", "kk": "kaz",
    "kl": "kal", "km": "khm", "kn": "kan", "ko": "kor", "kr": "kau",
    "ks": "kas", "ku": "kur", "kv": "kom", "kw": "cor", "ky": "kir",
    "la": "lat", "lb": "ltz", "lg": "lug", "li": "lim", "ln": "lin",
    "lo": "lao", "lt": "lit", "lu": "lub", "lv": "lav", "mg": "mlg",
    "mh": "mah", "mi": "mri", "mk": "mkd", "ml": "mal", "mn": "mon",
    "mr": "mar", "ms": "msa", "mt": "mlt", "my": "mya", "na": "nau",
    "nb": "nob", "nd": "nde", "ne": "nep", "ng": "ndo", "nl": "nld",
    "nn": "nno", "no": "nor", "nr": "nbl", "nv": "nav", "ny": "nya",
    "oc": "oci", "oj": "oji", "om": "orm", "or": "ori", "os": "oss",
    "pa": "pan", "pi": "pli", "pl": "pol", "ps": "pus", "pt": "por",
    "qu": "que", "rm": "roh", "rn": "run", "ro": "ron", "ru": "rus",
    "rw": "kin", "sa": "san", "sc": "srd", "sd": "snd", "se": "sme",
    "sg": "sag", "si": "sin", "sk": "slk", "sl": "slv", "sm": "smo",
    "sn": "sna", "so": "som", "sq": "sqi", "sr": "srp", "ss": "ssw",
    "st": "sot", "su": "sun", "sv": "swe", "sw": "swa", "ta": "tam",
    "te": "tel", "tg": "tgk", "th": "tha", "ti": "tir", "tk": "tuk",
    "tl": "tgl", "tn": "tsn", "to": "ton", "tr": "tur", "ts": "tso",
    "tt": "tat", "tw": "twi", "ty": "tah", "ug": "uig", "uk": "ukr",
    "ur": "urd", "uz": "uzb", "ve": "ven", "vi": "vie", "vo": "vol",
    "wa": "wln", "wo": "wol", "xh": "xho", "yi": "yid", "yo": "yor",
    "za": "zha", "zh": "zho", "zu": "zul",
}

ISO_639_3_TO_NAME: dict[str, str] = {
    "aar": "Afar", "abk": "Abkhazian", "ave": "Avestan", "afr": "Afrikaans",
    "aka": "Akan", "amh": "Amharic", "arg": "Aragonese", "ara": "Arabic",
    "asm": "Assamese", "ava": "Avaric", "aym": "Aymara", "aze": "Azerbaijani",
    "bak": "Bashkir", "bel": "Belarusian", "bul": "Bulgarian", "bih": "Bihari",
    "bis": "Bislama", "bam": "Bambara", "ben": "Bengali", "bod": "Tibetan",
    "bre": "Breton", "bos": "Bosnian", "cat": "Catalan", "che": "Chechen",
    "cha": "Chamorro", "cos": "Corsican", "cre": "Cree", "ces": "Czech",
    "chu": "Church Slavic", "chv": "Chuvash", "cym": "Welsh", "dan": "Danish",
    "deu": "German", "div": "Divehi", "dzo": "Dzongkha", "ewe": "Ewe",
    "ell": "Greek", "eng": "English", "epo": "Esperanto", "spa": "Spanish",
    "est": "Estonian", "eus": "Basque", "fas": "Persian", "ful": "Fulah",
    "fin": "Finnish", "fao": "Faroese", "fra": "French", "fry": "Western Frisian",
    "gle": "Irish", "gla": "Scottish Gaelic", "glg": "Galician", "grn": "Guarani",
    "guj": "Gujarati", "glv": "Manx", "hau": "Hausa", "heb": "Hebrew",
    "hin": "Hindi", "hmo": "Hiri Motu", "hrv": "Croatian", "hat": "Haitian",
    "hun": "Hungarian", "hye": "Armenian", "her": "Herero", "ina": "Interlingua",
    "ind": "Indonesian", "ile": "Interlingue", "ibo": "Igbo", "iii": "Sichuan Yi",
    "ipk": "Inupiaq", "ido": "Ido", "isl": "Icelandic", "ita": "Italian",
    "iku": "Inuktitut", "jpn": "Japanese", "jav": "Javanese", "kat": "Georgian",
    "kon": "Kongo", "kik": "Kikuyu", "kua": "Kuanyama", "kaz": "Kazakh",
    "kal": "Kalaallisut", "khm": "Khmer", "kan": "Kannada", "kor": "Korean",
    "kau": "Kanuri", "kas": "Kashmiri", "kur": "Kurdish", "kom": "Komi",
    "cor": "Cornish", "kir": "Kirghiz", "lat": "Latin", "ltz": "Luxembourgish",
    "lug": "Ganda", "lim": "Limburgish", "lin": "Lingala", "lao": "Lao",
    "lit": "Lithuanian", "lub": "Luba-Katanga", "lav": "Latvian", "mlg": "Malagasy",
    "mah": "Marshallese", "mri": "Maori", "mkd": "Macedonian", "mal": "Malayalam",
    "mon": "Mongolian", "mar": "Marathi", "msa": "Malay", "mlt": "Maltese",
    "mya": "Burmese", "nau": "Nauru", "nob": "Norwegian Bokmal", "nde": "North Ndebele",
    "nep": "Nepali", "ndo": "Ndonga", "nld": "Dutch", "nno": "Norwegian Nynorsk",
    "nor": "Norwegian", "nbl": "South Ndebele", "nav": "Navajo", "nya": "Chichewa",
    "oci": "Occitan", "oji": "Ojibwa", "orm": "Oromo", "ori": "Oriya",
    "oss": "Ossetian", "pan": "Panjabi", "pli": "Pali", "pol": "Polish",
    "pus": "Pushto", "por": "Portuguese", "que": "Quechua", "roh": "Romansh",
    "run": "Rundi", "ron": "Romanian", "rus": "Russian", "kin": "Kinyarwanda",
    "san": "Sanskrit", "srd": "Sardinian", "snd": "Sindhi", "sme": "Northern Sami",
    "sag": "Sango", "sin": "Sinhala", "slk": "Slovak", "slv": "Slovenian",
    "smo": "Samoan", "sna": "Shona", "som": "Somali", "sqi": "Albanian",
    "srp": "Serbian", "ssw": "Swati", "sot": "Southern Sotho", "sun": "Sundanese",
    "swe": "Swedish", "swa": "Swahili", "tam": "Tamil", "tel": "Telugu",
    "tgk": "Tajik", "tha": "Thai", "tir": "Tigrinya", "tuk": "Turkmen",
    "tgl": "Tagalog", "tsn": "Tswana", "ton": "Tonga", "tur": "Turkish",
    "tso": "Tsonga", "tat": "Tatar", "twi": "Twi", "tah": "Tahitian",
    "uig": "Uighur", "ukr": "Ukrainian", "urd": "Urdu", "uzb": "Uzbek",
    "ven": "Venda", "vie": "Vietnamese", "vol": "Volapuk", "wln": "Walloon",
    "wol": "Wolof", "xho": "Xhosa", "yid": "Yiddish", "yor": "Yoruba",
    "zha": "Zhuang", "zho": "Chinese", "zul": "Zulu",
}

NAME_TO_639_3: dict[str, str] = {
    name.lower(): code for code, name in ISO_639_3_TO_NAME.items()
}


def normalize_to_6393(value: str) -> str:
    """Convert ISO 639-1 (2-letter) to ISO 639-3 (3-letter). Pass through 3-letter codes."""
    if len(value) == 2:
        return ISO_639_1_TO_3.get(value, value)
    return value


def resolve_forced_language_name(forced_language: str) -> str:
    """Resolve a forced language value (code or name) to a display name."""
    as_6393 = normalize_to_6393(forced_language)
    from_code = ISO_639_3_TO_NAME.get(as_6393)
    if from_code:
        return from_code
    from_name = NAME_TO_639_3.get(forced_language.lower())
    if from_name:
        return ISO_639_3_TO_NAME.get(from_name, forced_language)
    return forced_language


def build_system_prompt(forced_language: str | None = None) -> str:
    """Build the writing-coach system prompt, optionally targeting a specific language."""
    if forced_language:
        lang_name = resolve_forced_language_name(forced_language)
        return (
            f"You are a writing coach focusing on {lang_name}. "
            f"Analyze the user's text below for grammar, clarity, vocabulary, phrasing, "
            f"and naturalness in {lang_name}. If the text is already well-written and "
            f"natural, respond ONLY with: [OK]. "
            f"If you notice an issue, provide exactly one short, specific correction or "
            f"improvement suggestion in {lang_name}. "
            f"Under 25 words. Output ONLY the tip or [OK] — no preamble, no quotation marks."
        )
    return BASE_SYSTEM_PROMPT

# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------


def load_config(project_dir: str) -> dict[str, Any]:
    """Load lang-tutor config from .claude/lang-tutor/config.json.

    Returns default config if file is missing or malformed.
    """
    config_path = Path(project_dir) / CONFIG_FILE
    if not config_path.exists():
        return dict(DEFAULT_CONFIG)

    try:
        with open(config_path) as f:
            data = json.load(f)
        merged = dict(DEFAULT_CONFIG)
        merged.update(data)
        return merged
    except (json.JSONDecodeError, OSError) as e:
        log(project_dir, "WARN", f"Failed to parse config: {e}")
        return dict(DEFAULT_CONFIG)


# ---------------------------------------------------------------------------
# LLM config resolution
# ---------------------------------------------------------------------------


def _find_settings_file(path: str | Path) -> dict[str, Any]:
    """Read and parse a Claude Code settings file, returning {} on failure."""
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def resolve_llm_config(project_dir: str, config: dict[str, Any]) -> dict[str, Any] | None:
    """Resolve LLM API credentials and model selection.

    Model priority:
      tipModel from config.json
      → .claude/settings.json langTutor.tipModel
      → ~/.claude/settings.json langTutor.tipModel
      → ANTHROPIC_DEFAULT_HAIKU_MODEL env
      → ANTHROPIC_DEFAULT_SONNET_MODEL env
      → ANTHROPIC_MODEL env
      → ANTHROPIC_DEFAULT_OPUS_MODEL env
      → claude-sonnet-4-6

    Base URL priority:
      baseUrl from config.json
      → .claude/settings.json langTutor.baseUrl
      → ~/.claude/settings.json langTutor.baseUrl
      → ANTHROPIC_BASE_URL env
      → https://api.anthropic.com

    API key priority:
      .claude/settings.json langTutor.apiKey
      → ~/.claude/settings.json langTutor.apiKey
      → ANTHROPIC_AUTH_TOKEN env
      → ANTHROPIC_API_KEY env
      → None (hook bails out silently)
    """
    model = config.get("tipModel")  # may be None
    api_key: str | None = None
    base_url: str | None = None

    # Check settings files for langTutor config overrides
    project_settings = _find_settings_file(Path(project_dir) / ".claude" / "settings.json")
    user_settings = _find_settings_file(Path.home() / ".claude" / "settings.json")

    for settings in [project_settings, user_settings]:
        lt = settings.get("langTutor", {})
        if isinstance(lt, dict):
            api_key = api_key or lt.get("apiKey")
            base_url = base_url or lt.get("baseUrl")
            model = model or lt.get("tipModel")

    # Resolve base URL: config → ANTHROPIC_BASE_URL env → default
    if not base_url:
        base_url = os.environ.get("ANTHROPIC_BASE_URL")
    if not base_url:
        base_url = DEFAULT_BASE_URL

    # Resolve model: config → env vars in priority order → default
    if not model:
        MODEL_ENV_VARS = [
            "ANTHROPIC_DEFAULT_HAIKU_MODEL",
            "ANTHROPIC_DEFAULT_SONNET_MODEL",
            "ANTHROPIC_MODEL",
            "ANTHROPIC_DEFAULT_OPUS_MODEL",
        ]
        for var in MODEL_ENV_VARS:
            val = os.environ.get(var)
            if val:
                model = val
                break
    if not model:
        model = DEFAULT_MODEL

    # Resolve API key: settings → env vars
    if not api_key:
        auth_token = os.environ.get("ANTHROPIC_AUTH_TOKEN")
        env_api_key = os.environ.get("ANTHROPIC_API_KEY")
        if auth_token:
            api_key = auth_token
        elif env_api_key:
            api_key = env_api_key

    if not api_key:
        return None

    return {
        "api_key": api_key,
        "base_url": base_url.rstrip("/"),
        "model": model,
        "wire_api": config.get("wireApi") or "messages",
    }


# ---------------------------------------------------------------------------
# Code block stripping
# ---------------------------------------------------------------------------

FENCED_CODE_RE = re.compile(r"```[\s\S]*?```")
INLINE_CODE_RE = re.compile(r"(?<![`])`([^`\n]+?)`(?!`)")


def strip_code_blocks(text: str) -> str:
    """Replace fenced and inline code blocks with placeholders."""
    result = FENCED_CODE_RE.sub("[CODE BLOCK]", text)
    result = INLINE_CODE_RE.sub("[CODE]", result)
    return result


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------


def log(project_dir: str, level: str, message: str, session_id: str = "") -> None:
    """Write a log entry to /tmp/lang-tutor-<session_id>.log.

    Rotates log file at 5MB.
    """
    if session_id:
        log_path = LOG_DIR / f"lang-tutor-{session_id}.log"
    else:
        log_path = LOG_DIR / "lang-tutor.log"

    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    entry = f"[{timestamp}] [{level}] {message}\n"

    try:
        # Rotate if > 5MB
        if log_path.exists() and log_path.stat().st_size > 5 * 1024 * 1024:
            old_path = log_path.with_suffix(".log.old")
            log_path.rename(old_path)

        with open(log_path, "a") as f:
            f.write(entry)
    except OSError:
        pass  # Silent fallback — can't write log


# ---------------------------------------------------------------------------
# Cooldown
# ---------------------------------------------------------------------------


def get_cooldown_path(session_id: str) -> Path:
    """Return the filesystem path for the cooldown timestamp file."""
    return LOG_DIR / f"lang-tutor-cooldown-{session_id}"


def is_cooldown_active(session_id: str, cooldown_ms: int) -> bool:
    """Check if the cooldown period is still active for this session.

    Reads the timestamp file; returns True if cooldown hasn't expired.
    """
    cooldown_path = get_cooldown_path(session_id)
    if not cooldown_path.exists():
        return False
    try:
        with open(cooldown_path) as f:
            last_time = int(f.read().strip())
        elapsed = int(time.time() * 1000) - last_time
        return elapsed < cooldown_ms
    except (ValueError, OSError):
        return False


def update_cooldown(session_id: str) -> None:
    """Write the current timestamp to the cooldown file."""
    cooldown_path = get_cooldown_path(session_id)
    try:
        with open(cooldown_path, "w") as f:
            f.write(str(int(time.time() * 1000)))
    except OSError:
        pass


# ---------------------------------------------------------------------------
# LLM API call
# ---------------------------------------------------------------------------


def call_llm_messages(
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_text: str,
) -> str | None:
    """Call the Anthropic Messages API (/v1/messages).

    Returns the response text, or None on failure.
    """
    url = f"{base_url}/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    body = json.dumps({
        "model": model,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_text}],
        "max_tokens": 200,
        "temperature": 0.3,
    }).encode()

    try:
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        return _extract_messages_text(data)
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError) as e:
        log("", "ERROR", f"LLM call failed (messages API): {e}")
        return None


def call_llm_chat(
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_text: str,
) -> str | None:
    """Call an OpenAI-compatible Chat Completions API (/v1/chat/completions).

    Returns the response text, or None on failure.
    """
    url = f"{base_url}/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
        "max_tokens": 200,
        "temperature": 0.3,
    }).encode()

    try:
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        return _extract_chat_text(data)
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError) as e:
        log("", "ERROR", f"LLM call failed (chat API): {e}")
        return None


def _extract_messages_text(data: dict[str, Any]) -> str | None:
    """Extract text content from Anthropic Messages API response."""
    content = data.get("content", [])
    for block in content:
        if block.get("type") == "text":
            text = block.get("text", "").strip()
            if text:
                return text
    return None


def _extract_chat_text(data: dict[str, Any]) -> str | None:
    """Extract text content from Chat Completions API response."""
    choices = data.get("choices", [])
    if choices:
        message = choices[0].get("message", {})
        content = message.get("content", "").strip()
        return content if content else None
    return None


def fetch_tip(
    llm_config: dict[str, Any],
    system_prompt: str,
    user_text: str,
) -> str | None:
    """Call the LLM and return the tip text, or None on failure."""
    api_key = llm_config["api_key"]
    base_url = llm_config["base_url"]
    model = llm_config["model"]
    wire_api = llm_config["wire_api"]

    if wire_api == "chat":
        return call_llm_chat(base_url, api_key, model, system_prompt, user_text)
    return call_llm_messages(base_url, api_key, model, system_prompt, user_text)


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------


def is_ok_response(response: str) -> bool:
    """Check if the LLM returned [OK] (no tip needed)."""
    trimmed = response.strip()
    return trimmed == "[OK]" or trimmed.startswith("[OK]")


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------


def display_tip(tip: str) -> None:
    """Display the tip via systemMessage JSON on stdout.

    NOTE: stderr/ANSI is NOT visible in Claude Code hooks (hooks have no
    controlling terminal). systemMessage is the only reliable display channel
    — it renders as a persistent notification visible to the user.
    """
    display_text = tip[:200]
    output = json.dumps({
        "continue": True,
        "systemMessage": f"💡 [Lang-Tip] {display_text}",
    })
    sys.stdout.write(output)
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    """Entry point. Reads stdin, calls LLM if configured, displays tip."""
    # Read stdin (hook input)
    try:
        raw_input = sys.stdin.read().strip()
        if not raw_input:
            sys.exit(0)
        input_data = json.loads(raw_input)
    except json.JSONDecodeError:
        # Not JSON — pass through
        if raw_input:
            sys.stdout.write(raw_input)
        sys.exit(0)

    prompt = input_data.get("prompt", "")
    session_id = input_data.get("session_id", "")
    cwd = input_data.get("cwd", "")

    if not prompt or not session_id:
        if prompt:
            sys.stdout.write(prompt)
        sys.exit(0)

    # Derive project_dir from cwd
    project_dir = cwd or os.getcwd()

    # Load config
    config = load_config(project_dir)

    if not config.get("enabled", True):
        sys.stdout.write(prompt)
        sys.exit(0)

    # Cooldown check
    cooldown_ms = config.get("cooldownMs", 10000)
    if is_cooldown_active(session_id, cooldown_ms):
        log(project_dir, "DEBUG", f"Cooldown active, skipping", session_id)
        sys.stdout.write(prompt)
        sys.exit(0)

    # Skip very short messages
    if len(prompt.strip()) < 10:
        sys.stdout.write(prompt)
        sys.exit(0)

    # Resolve LLM config
    llm_config = resolve_llm_config(project_dir, config)
    if llm_config is None:
        log(project_dir, "DEBUG", "No LLM credentials found, skipping", session_id)
        sys.stdout.write(prompt)
        sys.exit(0)

    # Strip code blocks
    stripped = strip_code_blocks(prompt)

    # Build system prompt
    system_prompt = build_system_prompt(config.get("forcedLanguage"))

    # Call LLM
    tip = fetch_tip(llm_config, system_prompt, stripped)

    if tip is None or is_ok_response(tip):
        log(project_dir, "DEBUG", f"No actionable tip (tip={tip!r})", session_id)
        sys.stdout.write(prompt)
        sys.exit(0)

    log(project_dir, "INFO", f"Tip: {tip}", session_id)

    # Display tip via systemMessage (the only visible channel in Claude Code hooks)
    display_tip(tip)

    # Update cooldown
    update_cooldown(session_id)


if __name__ == "__main__":
    main()
