import html
import re
from typing import Tuple, List

# Known prompt injection & jailbreak attack patterns
INJECTION_PATTERNS: List[Tuple[str, str]] = [
    # Direct instruction overrides
    (r"(?i)\bignore\s+(all\s+)?(previous|prior|above)\s+instructions\b", "Instruction override attempt"),
    (r"(?i)\bdisregard\s+(all\s+)?(previous|prior|above)\s+(prompts?|instructions?|rules?)\b", "Instruction disregard attempt"),
    (r"(?i)\bforget\s+(everything\s+)?(you\s+(were|have\s+been)\s+told|prior\s+instructions)\b", "Context wipe attempt"),
    
    # System prompt extraction & leakage
    (r"(?i)\b(show|reveal|display|output|print|repeat)\s+(your\s+)?(system\s+prompt|initial\s+instructions|instructions\s+verbatim)\b", "System prompt extraction attempt"),
    (r"(?i)\bwhat\s+(is|are)\s+your\s+(exact\s+)?system\s+(prompt|instructions)\b", "System prompt discovery attempt"),
    
    # Jailbreak personas & role manipulation
    (r"(?i)\b(you\s+are\s+now|act\s+as)\s+(DAN|do\s+anything\s+now|an\s+unfiltered\s+AI|evil\s+bot|jailbroken)\b", "Jailbreak persona attempt"),
    (r"(?i)\bdeveloper\s+mode\s+(enabled|on|activate)\b", "Developer mode jailbreak attempt"),
    
    # Delimiter and tag injection
    (r"(?i)<\s*(system|system_prompt|developer_instruction)\s*>", "System tag injection attempt"),
    (r"(?i)\[\s*(system|developer|instruction)\s*\]", "Bracketed system injection attempt"),
    (r"(?i)```\s*(system|instruct)\b", "Markdown codefence system injection attempt"),
    
    # Data exfiltration commands
    (r"(?i)\b(send|curl|fetch|ping)\s+.*(api_key|token|password|secret|env)\b", "Data exfiltration attempt"),
]


def sanitize_user_input(text: str, max_chars: int = 1500) -> str:
    """Sanitize user question input:
    - Strips leading/trailing whitespace
    - Clamps to max_chars
    - Escapes raw HTML control characters
    - Normalizes null bytes and unicode control characters
    """
    if not text:
        return ""

    # Remove null bytes and non-printable control characters (except newline and tab)
    sanitized = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", text)
    sanitized = sanitized.strip()

    # Truncate length to prevent token-exhaustion denial of service
    if len(sanitized) > max_chars:
        sanitized = sanitized[:max_chars].strip()

    # Escape HTML to prevent XSS reflections in markdown rendering
    sanitized = html.escape(sanitized, quote=False)

    return sanitized


def scan_for_prompt_injection(text: str) -> Tuple[bool, str]:
    """Scan text against known adversarial prompt injection patterns.
    Returns (is_suspicious, reason).
    """
    if not text or not text.strip():
        return False, "Input empty"

    clean = text.strip()

    for pattern, description in INJECTION_PATTERNS:
        if re.search(pattern, clean):
            return True, description

    return False, "Input safe"
