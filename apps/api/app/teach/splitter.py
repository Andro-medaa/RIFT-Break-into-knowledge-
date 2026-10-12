import re
from typing import List
from app.schemas.lesson import Sentence

ABBREVIATIONS = {
    "dr.", "mr.", "mrs.", "ms.", "prof.", "sr.", "jr.", "vs.",
    "e.g.", "i.e.", "etc.", "fig.", "eq.", "approx.", "dept.", "al."
}

def split_into_sentences(text: str) -> List[Sentence]:
    """
    Splits conversational teacher script into discrete sentences
    with speech duration estimates, respecting abbreviations and numbers.
    """
    clean_text = text.strip()
    if not clean_text:
        return []

    # Tokenize potential sentence boundaries while protecting common abbreviations
    # Regex splits on whitespace following terminal punctuation (. ? !)
    tokens = re.split(r'(?<=[.?!])\s+', clean_text)
    
    sentences_raw: List[str] = []
    buffer = ""

    for token in tokens:
        candidate = token.strip()
        if not candidate:
            continue

        if buffer:
            buffer += " " + candidate
        else:
            buffer = candidate

        # Check if the buffer ends with an abbreviation
        last_word = buffer.split()[-1].lower() if buffer.split() else ""
        if last_word in ABBREVIATIONS:
            # Continue accumulating, don't split here
            continue

        sentences_raw.append(buffer)
        buffer = ""

    if buffer:
        sentences_raw.append(buffer)

    result: List[Sentence] = []
    for s in sentences_raw:
        s_clean = s.strip()
        if not s_clean:
            continue

        words = s_clean.split()
        word_count = len(words)
        comma_count = s_clean.count(",") + s_clean.count(";") + s_clean.count(":")
        
        # Duration estimation formula:
        # Standard vocal rate: ~155 words/min (~360ms per word)
        # Comma/colon pauses: ~180ms
        # Terminal sentence pause: ~350ms
        # Minimum sentence duration floor: 800ms
        est_ms = max(800, int((word_count * 360) + (comma_count * 180) + 350))

        result.append(Sentence(text=s_clean, duration_estimate_ms=est_ms))

    return result
