from typing import Tuple
from fastapi import HTTPException, status
import fitz
from app.core.config import settings


class PDFSecurityException(HTTPException):
    def __init__(self, detail: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(status_code=status_code, detail=detail)


def validate_pdf_safety(pdf_bytes: bytes, filename: str = "document.pdf") -> Tuple[int, int]:
    """Validate uploaded PDF bytes against denial-of-service, decompression bombs,
    and malformed stream exploits.
    Returns (page_count, file_size_bytes) on success, or raises PDFSecurityException.
    """
    file_size = len(pdf_bytes)

    # 1. Size bounds check
    if file_size < 32:
        raise PDFSecurityException(
            f"File '{filename}' is too small to be a valid PDF document ({file_size} bytes).",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
        max_mb = settings.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)
        raise PDFSecurityException(
            f"File size exceeds maximum upload limit of {max_mb:.0f}MB ({file_size / (1024 * 1024):.1f}MB).",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    # 2. PDF Magic Header verification (%PDF-)
    # Per PDF 32000-1 specification, header must start within first 1024 bytes
    header_chunk = pdf_bytes[:1024]
    if b"%PDF-" not in header_chunk:
        raise PDFSecurityException(
            f"File '{filename}' does not contain a valid PDF magic header (%PDF-).",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    # 3. Sandbox extraction in fitz with error trapping
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise PDFSecurityException(
            f"Malformed or corrupted PDF stream could not be parsed: {str(exc)}",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    try:
        # Check if PDF is encrypted or requires password
        if doc.is_encrypted:
            raise PDFSecurityException(
                f"PDF '{filename}' is encrypted or password-protected. Please provide an unencrypted PDF.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        page_count = len(doc)
        if page_count < 1:
            raise PDFSecurityException(
                f"PDF '{filename}' contains 0 pages.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if page_count > settings.MAX_PDF_PAGES:
            raise PDFSecurityException(
                f"PDF page count ({page_count}) exceeds maximum allowed pages ({settings.MAX_PDF_PAGES}).",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # 4. Check for nested compression bomb characteristics (excessive stream count)
        # Scan first few pages safely
        total_sample_text_len = 0
        pages_to_sample = min(page_count, 5)
        for i in range(pages_to_sample):
            text = doc[i].get_text()
            total_sample_text_len += len(text)

        # If 5 sample pages expand to > 20MB of pure text, suspect decompression attack
        if total_sample_text_len > 20 * 1024 * 1024:
            raise PDFSecurityException(
                "Excessive text expansion ratio detected; potential decompression bomb.",
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        return page_count, file_size

    finally:
        doc.close()
