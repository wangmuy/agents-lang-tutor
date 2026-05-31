#!/usr/bin/env python3
"""
Lang-tutor hook for Codex — fires on UserPromptSubmit.
Detects language of user prompts, calls the LLM for writing tips,
and displays them as a temporary ANSI toast on stderr.

No conversation history is modified — tips are purely transient UI notifications.
"""

import sys
import json
import os
import time
import re
import tomllib
import urllib.request
import urllib.error
import pathlib
import threading

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

HOOK_DIR = pathlib.Path(__file__).parent
PLUGIN_CONFIG_PATH = HOOK_DIR / "config.json"
# These are placeholders; actual paths are computed in main() using session_id
COOLDOWN_FILE = None
LOG_FILE = None

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(level: str, message: str, data: dict | None = None, session_id: str = ""):
    ts = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
    d = f" {json.dumps(data)}" if data else ""
    line = f"[{ts}] [{level}] {message}{d}\n"
    log_path = pathlib.Path(f"/tmp/lang-tutor-{session_id}.log") if session_id else pathlib.Path("/tmp/lang-tutor.log")
    try:
        with open(log_path, "a") as f:
            f.write(line)
    except OSError:
        pass
    if level == "ERROR":
        print(line.strip(), file=sys.stderr, flush=True)

# ---------------------------------------------------------------------------
# ISO 639 helpers
# ---------------------------------------------------------------------------

ISO_639_1_TO_3 = {
    "aa": "aar", "ab": "abk", "af": "afr", "ak": "aka", "am": "amh",
    "ar": "ara", "as": "asm", "av": "ava", "ay": "aym", "az": "aze",
    "ba": "bak", "be": "bel", "bg": "bul", "bh": "bih", "bi": "bis",
    "bm": "bam", "bn": "ben", "bo": "bod", "br": "bre", "bs": "bos",
    "ca": "cat", "ce": "che", "ch": "cha", "co": "cos", "cr": "cre",
    "cs": "ces", "cu": "chu", "cv": "chv", "cy": "cym", "da": "dan",
    "de": "deu", "dv": "div", "dz": "dzo", "ee": "ewe", "el": "ell",
    "en": "eng", "eo": "epo", "es": "spa", "et": "est", "eu": "eus",
    "fa": "fas", "ff": "ful", "fi": "fin", "fj": "fij", "fo": "fao",
    "fr": "fra", "fy": "fry", "ga": "gle", "gd": "gla", "gl": "glg",
    "gn": "grn", "gu": "guj", "gv": "glv", "ha": "hau", "he": "heb",
    "hi": "hin", "ho": "hmo", "hr": "hrv", "ht": "hat", "hu": "hun",
    "hy": "hye", "hz": "her", "ia": "ina", "id": "ind", "ie": "ile",
    "ig": "ibo", "ii": "iii", "ik": "ipk", "io": "ido", "is": "isl",
    "it": "ita", "iu": "iku", "ja": "jpn", "jv": "jav", "ka": "kat",
    "kg": "kon", "ki": "kik", "kj": "kua", "kk": "kaz", "kl": "kal",
    "km": "khm", "kn": "kan", "ko": "kor", "kr": "kau", "ks": "kas",
    "ku": "kur", "kv": "kom", "kw": "cor", "ky": "kir", "la": "lat",
    "lb": "ltz", "lg": "lug", "li": "lim", "ln": "lin", "lo": "lao",
    "lt": "lit", "lu": "lub", "lv": "lav", "mg": "mlg", "mh": "mah",
    "mi": "mri", "mk": "mkd", "ml": "mal", "mn": "mon", "mr": "mar",
    "ms": "msa", "mt": "mlt", "my": "mya", "na": "nau", "nb": "nob",
    "nd": "nde", "ne": "nep", "ng": "ndo", "nl": "nld", "nn": "nno",
    "no": "nor", "nr": "nbl", "nv": "nav", "ny": "nya", "oc": "oci",
    "oj": "oji", "om": "orm", "or": "ori", "os": "oss", "pa": "pan",
    "pi": "pli", "pl": "pol", "ps": "pus", "pt": "por", "qu": "que",
    "rm": "roh", "rn": "run", "ro": "ron", "ru": "rus", "rw": "kin",
    "sa": "san", "sc": "srd", "sd": "snd", "se": "sme", "sg": "sag",
    "si": "sin", "sk": "slk", "sl": "slv", "sm": "smo", "sn": "sna",
    "so": "som", "sq": "sqi", "sr": "srp", "ss": "ssw", "st": "sot",
    "su": "sun", "sv": "swe", "sw": "swa", "ta": "tam", "te": "tel",
    "tg": "tgk", "th": "tha", "ti": "tir", "tk": "tuk", "tl": "tgl",
    "tn": "tsn", "to": "ton", "tr": "tur", "ts": "tso", "tt": "tat",
    "tw": "twi", "ty": "tah", "ug": "uig", "uk": "ukr", "ur": "urd",
    "uz": "uzb", "ve": "ven", "vi": "vie", "vo": "vol", "wa": "wln",
    "wo": "wol", "xh": "xho", "yi": "yid", "yo": "yor", "za": "zha",
    "zh": "zho", "zu": "zul",
}

ISO_639_3_TO_NAME = {
    "aar": "Afar", "abk": "Abkhazian", "afr": "Afrikaans", "aka": "Akan",
    "amh": "Amharic", "ara": "Arabic", "asm": "Assamese", "aye": "Aymara",
    "aze": "Azerbaijani", "bak": "Bashkir", "bel": "Belarusian", "ben": "Bengali",
    "bod": "Tibetan", "bos": "Bosnian", "bul": "Bulgarian", "cat": "Catalan",
    "ces": "Czech", "chi": "Chinese", "cym": "Welsh", "dan": "Danish",
    "deu": "German", "div": "Divehi", "ell": "Greek", "eng": "English",
    "epo": "Esperanto", "est": "Estonian", "eus": "Basque", "fas": "Persian",
    "fin": "Finnish", "fra": "French", "fry": "Western Frisian", "gle": "Irish",
    "gla": "Scottish Gaelic", "glg": "Galician", "guj": "Gujarati", "hat": "Haitian",
    "heb": "Hebrew", "hin": "Hindi", "hrv": "Croatian", "hun": "Hungarian",
    "hye": "Armenian", "ind": "Indonesian", "isl": "Icelandic", "ita": "Italian",
    "jav": "Javanese", "jpn": "Japanese", "kan": "Kannada", "kat": "Georgian",
    "kaz": "Kazakh", "khm": "Khmer", "kin": "Kinyarwanda", "kir": "Kirghiz",
    "kor": "Korean", "kur": "Kurdish", "lao": "Lao", "lat": "Latin",
    "lav": "Latvian", "lit": "Lithuanian", "mal": "Malayalam", "mar": "Marathi",
    "mkd": "Macedonian", "mlt": "Maltese", "mon": "Mongolian", "mri": "Maori",
    "msa": "Malay", "mya": "Burmese", "nep": "Nepali", "nld": "Dutch",
    "nor": "Norwegian", "oci": "Occitan", "ori": "Oriya", "orm": "Oromo",
    "pan": "Panjabi", "pol": "Polish", "por": "Portuguese", "pus": "Pushto",
    "que": "Quechua", "roh": "Romansh", "ron": "Romanian", "rus": "Russian",
    "san": "Sanskrit", "sin": "Sinhala", "slk": "Slovak", "slv": "Slovenian",
    "smo": "Samoan", "snd": "Sindhi", "som": "Somali", "spa": "Spanish",
    "sqi": "Albanian", "srp": "Serbian", "sun": "Sundanese", "swa": "Swahili",
    "swe": "Swedish", "tam": "Tamil", "tel": "Telugu", "tgk": "Tajik",
    "tgl": "Tagalog", "tha": "Thai", "tur": "Turkish", "uig": "Uighur",
    "ukr": "Ukrainian", "urd": "Urdu", "uzb": "Uzbek", "vie": "Vietnamese",
    "vol": "Volapük", "wln": "Walloon", "xho": "Xhosa", "yid": "Yiddish",
    "yor": "Yoruba", "zha": "Zhuang", "zho": "Chinese", "zul": "Zulu",
}

NAME_TO_639_3 = {v.lower(): k for k, v in ISO_639_3_TO_NAME.items()}


def normalize_to_6393(value: str) -> str:
    v = value.strip().lower()
    if len(v) == 2:
        return ISO_639_1_TO_3.get(v, v)
    if len(v) == 3:
        return v
    # Maybe a language name
    mapped = NAME_TO_639_3.get(v)
    if mapped:
        return mapped
    return v


def normalize_native_languages(langs: list[str]) -> list[str]:
    return list({normalize_to_6393(l) for l in langs})


def resolve_forced_language_name(forced: str) -> str | None:
    as_6393 = normalize_to_6393(forced)
    name = ISO_639_3_TO_NAME.get(as_6393)
    if name:
        return name
    mapped = NAME_TO_639_3.get(forced.strip().lower())
    if mapped:
        return ISO_639_3_TO_NAME.get(mapped) or forced
    return forced


ONLY_639_3_CODES = {v: k for k, v in ISO_639_1_TO_3.items()}


def has_6391(value: str) -> bool:
    return value in ISO_639_1_TO_3


def lang_name_from_value(value: str) -> str:
    """Return a readable language name from ISO 639-1, 639-3, or a name string."""
    v = value.strip()
    # If it's a language name already
    name_check = NAME_TO_639_3.get(v.lower())
    if name_check:
        return ISO_639_3_TO_NAME.get(name_check, v)
    # If it's a 2-letter code
    if len(v) == 2 and v in ISO_639_1_TO_3:
        code3 = ISO_639_1_TO_3[v]
        return ISO_639_3_TO_NAME.get(code3, v)
    # If it's a 3-letter code
    if len(v) == 3 and v in ISO_639_3_TO_NAME:
        return ISO_639_3_TO_NAME[v]
    return v


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------

def load_plugin_config() -> dict:
    """Read the lang-tutor plugin config from config.json."""
    try:
        with open(PLUGIN_CONFIG_PATH) as f:
            cfg = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        cfg = {}
    return {
        "enabled": cfg.get("enabled", True),
        "nativeLanguages": cfg.get("nativeLanguages", []),
        "forcedLanguage": cfg.get("forcedLanguage"),
        "cooldownMs": cfg.get("cooldownMs", 10000),
        "tipModel": cfg.get("tipModel"),
        "displayMethod": cfg.get("displayMethod", "toast"),
        "toastDurationMs": cfg.get("toastDurationMs", 5000),
    }


def resolve_codex_llm_config() -> dict | None:
    """Read Codex config to find LLM provider details (base_url, api_key, env_key).

    Scans all config sources in order:
      1. Project `.codex/config.toml`
      2. User `~/.codex/config.toml`
      3. Profile configs `~/.codex/*.config.toml`
    """
    project_config_path = HOOK_DIR.parent / "config.toml"
    user_config_path = pathlib.Path.home() / ".codex" / "config.toml"
    profile_dir = pathlib.Path.home() / ".codex"

    configs = []

    def _load_toml(path):
        try:
            with open(path, "rb") as f:
                return tomllib.load(f)
        except (FileNotFoundError, tomllib.TOMLDecodeError, OSError):
            return {}

    # Load project config first
    configs.append(_load_toml(project_config_path))

    # Load user config
    user_cfg = _load_toml(user_config_path)
    if user_cfg:
        configs.append(user_cfg)

    # Load profile configs
    try:
        for f in sorted(profile_dir.glob("*.config.toml")):
            cfg = _load_toml(f)
            if cfg:
                configs.append(cfg)
    except OSError:
        pass

    # Merge all configs, later overwriting earlier
    merged = {}
    for cfg in configs:
        merged.update(cfg)
        # Merge model_providers subsections
        provs = cfg.get("model_providers", {})
        if provs:
            mp = merged.setdefault("model_providers", {})
            mp.update(provs)

    model = merged.get("model", "")
    model_provider = merged.get("model_provider", "")
    providers = merged.get("model_providers", {})

    # If a model_provider is specified, resolve it
    if model_provider and model_provider in providers:
        info = providers[model_provider]
        base_url = info.get("base_url", "")
        env_key = info.get("env_key", "")
        api_key = os.environ.get(env_key, "") if env_key else ""
        return {
            "base_url": base_url.rstrip("/") + "/chat/completions" if base_url else None,
            "api_key": api_key,
            "model": model or "",
        }

    # Fallback: first provider with base_url
    for name, info in providers.items():
        base_url = info.get("base_url", "")
        env_key = info.get("env_key", "")
        api_key = os.environ.get(env_key, "") if env_key else ""
        if base_url:
            return {
                "base_url": base_url.rstrip("/") + "/chat/completions",
                "api_key": api_key,
                "model": model or "",
            }

    return None



# ---------------------------------------------------------------------------
# Code block stripping
# ---------------------------------------------------------------------------

CODE_BLOCK_RE = re.compile(r"```[\s\S]*?```")
INLINE_CODE_RE = re.compile(r"(?<![`])`([^`\n]+?)`(?!`)")


def strip_code_blocks(text: str) -> str:
    result = CODE_BLOCK_RE.sub("[CODE BLOCK]", text)
    result = INLINE_CODE_RE.sub("[CODE]", result)
    return result


# ---------------------------------------------------------------------------
# LLM tip request
# ---------------------------------------------------------------------------

def fetch_tip(
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_text: str,
    timeout: float = 10.0,
) -> str | None:
    """Call the LLM and return the tip text, or None on failure."""
    if not base_url or not model:
        log("ERROR", "fetch_tip: missing base_url or model", {"base_url": base_url, "model": model})
        return None

    headers = {
        "Content-Type": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text},
        ],
        "max_tokens": 200,
        "temperature": 0.3,
    }).encode("utf-8")

    # Try without reasoning first
    try:
        req = urllib.request.Request(
            base_url,
            data=body,
            headers=headers,
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=timeout)
        data = json.loads(resp.read())
        choice = data.get("choices", [{}])[0]
        content = choice.get("message", {}).get("content", "").strip()
        if content:
            return content
    except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
        log("WARN", "fetch_tip: request failed", {"error": str(e)[:120]})

    return None


# ---------------------------------------------------------------------------
# System prompt builder
# ---------------------------------------------------------------------------

BASE_SYSTEM_PROMPT = (
    "You are a writing coach in a terminal-based AI coding assistant. "
    "Analyze the user's text below for grammar, clarity, vocabulary, phrasing, "
    "and naturalness in whatever language it's written in. "
    "If the text is already well-written and natural in its language, respond ONLY with: [OK]. "
    "If you notice an issue, provide exactly one short, specific correction or improvement "
    "suggestion. Under 25 words. "
    "Output ONLY the tip or [OK] — no preamble, no quotation marks, no markdown."
)


def build_system_prompt(config: dict) -> str:
    forced = config.get("forcedLanguage")
    if forced:
        lang_name = lang_name_from_value(forced)
        return (
            f"You are a writing coach focusing on {lang_name}. "
            f"Analyze the user's text below for grammar, clarity, vocabulary, phrasing, "
            f"and naturalness in {lang_name}. "
            f"If the text is already well-written and natural, respond ONLY with: [OK]. "
            f"If you notice an issue, provide exactly one short, specific correction or "
            f"improvement suggestion in {lang_name}. Under 25 words. "
            f"Output ONLY the tip or [OK] — no preamble, no quotation marks, no markdown."
        )

    native = config.get("nativeLanguages", [])
    if native:
        names = [lang_name_from_value(n) for n in native if n]
        if names:
            nlist = ", ".join(names)
            return (
                f"You are a writing coach in a terminal-based AI coding assistant. "
                f"The user's native language(s): {nlist}. "
                f"If the text is in one of their native languages, respond ONLY with: [OK] "
                f"since they don't need language coaching for it. "
                f"Otherwise, analyze the text for grammar, clarity, vocabulary, phrasing, "
                f"and naturalness. If already well-written, respond [OK]. "
                f"If you notice an issue, provide one short correction or improvement "
                f"suggestion. Under 25 words. "
                f"Output ONLY the tip or [OK] — no preamble, no quotation marks."
            )

    return BASE_SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# Cooldown
# ---------------------------------------------------------------------------

def check_cooldown(cooldown_ms: int, session_id: str) -> bool:
    """Return True if cooldown has elapsed (or no cooldown file), False if still cooling."""
    if cooldown_ms <= 0:
        return True
    cooldown_path = pathlib.Path(f"/tmp/lang-tutor-cooldown-{session_id}")
    try:
        if cooldown_path.exists():
            last = float(cooldown_path.read_text().strip())
            elapsed = (time.time() * 1000) - last
            if elapsed < cooldown_ms:
                return False
    except (OSError, ValueError):
        pass
    return True


def mark_cooldown(session_id: str):
    """Record the current time as the last tip time."""
    cooldown_path = pathlib.Path(f"/tmp/lang-tutor-cooldown-{session_id}")
    try:
        cooldown_path.write_text(str(time.time() * 1000))
    except OSError:
        pass


# ---------------------------------------------------------------------------
# ANSI toast display
# ---------------------------------------------------------------------------

def show_toast(tip: str, duration_ms: int):
    """Display a temporary toast notification in the terminal via stderr ANSI sequences."""
    tip = tip.strip().replace("\n", " ").replace("\r", "")
    if len(tip) > 80:
        tip = tip[:77] + "..."

    sys.stderr.write("\n\x1b[S")
    sys.stderr.write(f"\x1b[1G\x1b[33m\u2728 [Lang-Tip]: {tip}\x1b[0m")
    sys.stderr.flush()
    time.sleep(duration_ms / 1000.0)
    sys.stderr.write("\x1b[1G\x1b[2K")
    sys.stderr.flush()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        log("ERROR", "main: failed to parse stdin JSON", session_id=session_id)
        json.dump({"continue": True}, sys.stdout)
        return

    prompt = input_data.get("prompt", "")
    session_id = input_data.get("session_id", "")
    model_from_hook = input_data.get("model", "")

    if not prompt:
        json.dump({"continue": True}, sys.stdout)
        return

    # Load config
    config = load_plugin_config()
    if not config["enabled"]:
        json.dump({"continue": True}, sys.stdout)
        return

    # Cooldown check
    if not check_cooldown(config["cooldownMs"], session_id):
        json.dump({"continue": True}, sys.stdout)
        return

    # Strip code blocks
    stripped = strip_code_blocks(prompt)
    stripped = stripped.strip()
    if len(stripped) < 3:
        json.dump({"continue": True}, sys.stdout)
        return

    log("INFO", "hook fired", {
        "session_id": session_id[:8] if session_id else "",
        "model": model_from_hook,
        "prompt_len": len(stripped),
        "forcedLanguage": config.get("forcedLanguage"),
        "nativeLanguages": config.get("nativeLanguages"),
    })

    # Resolve LLM config
    llm_config = resolve_codex_llm_config()
    if not llm_config or not llm_config.get("base_url"):
        log("WARN", "No LLM provider config found, skipping tip", session_id=session_id)
        json.dump({"continue": True}, sys.stdout)
        return

    model = config["tipModel"] or model_from_hook or llm_config.get("model", "")
    if not model:
        log("WARN", "No model name available, skipping tip", session_id=session_id)
        json.dump({"continue": True}, sys.stdout)
        return

    system_prompt = build_system_prompt(config)

    # Fetch tip
    tip = fetch_tip(
        llm_config["base_url"],
        llm_config.get("api_key", ""),
        model,
        system_prompt,
        stripped,
    )

    if tip and not tip.strip().upper().startswith("[OK]"):
        log("INFO", "showing tip", {"tip": tip[:80]}, session_id=session_id)
        # Show ANSI toast on stderr (temporary, non-persistent)
        show_toast(tip, config["toastDurationMs"])
        mark_cooldown(session_id)
        # Also return systemMessage for native Codex UI notification
        json.dump({"continue": True, "systemMessage": f"[Lang-Tip] {tip.strip()[:200]}"}, sys.stdout)
    else:
        log("DEBUG", "no tip ([OK] or None)", session_id=session_id)
        json.dump({"continue": True}, sys.stdout)


if __name__ == "__main__":
    main()
