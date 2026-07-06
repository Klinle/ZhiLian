import os
import asyncio
import tempfile
from typing import List
from pypdf import PdfReader
from docx import Document as DocxDocument
import uuid

try:
    import fitz
except ImportError:
    fitz = None

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import pymupdf4llm
except ImportError:
    pymupdf4llm = None

try:
    from ocrmac import ocrmac
except ImportError:
    ocrmac = None

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    RapidOCR = None

try:
    from unstructured.partition.auto import partition as unstructured_partition
    from unstructured.chunking.title import chunk_by_title as unstructured_chunk_by_title
    UNSTRUCTURED_AVAILABLE = True
except ImportError:
    UNSTRUCTURED_AVAILABLE = False
    unstructured_partition = None
    unstructured_chunk_by_title = None

# PDF partitioning via unstructured requires unstructured_inference (layout detection).
# If not installed, PDFs fall back to the legacy parser pipeline.
try:
    import unstructured_inference  # noqa: F401
    UNSTRUCTURED_PDF_AVAILABLE = True
except ImportError:
    UNSTRUCTURED_PDF_AVAILABLE = False

MEANINGFUL_TEXT_MIN_CHARS = 60


class DocumentService:
    def __init__(self, upload_dir: str = "uploads"):
        self.upload_dir = upload_dir
        os.makedirs(upload_dir, exist_ok=True)

    async def save_document(self, file_name: str, content: bytes) -> str:
        """Save uploaded document and return file path"""
        file_id = str(uuid.uuid4())
        file_ext = os.path.splitext(file_name)[1].lower()
        file_path = os.path.join(self.upload_dir, f"{file_id}{file_ext}")

        with open(file_path, "wb") as f:
            f.write(content)

        return file_path, file_ext

    async def parse_document(
        self,
        file_path: str,
        file_type: str,
        start_page: int = None,
        end_page: int = None,
    ) -> str:
        """Parse document and return text content

        Args:
            file_path: Path to the document
            file_type: File extension (.pdf, .docx, .txt, .md)
            start_page: For PDFs, start from this page (0-indexed, optional)
            end_page: For PDFs, end at this page (exclusive, optional)
        """
        if file_type == ".pdf":
            return await asyncio.to_thread(
                self._parse_pdf,
                file_path,
                start_page or 0,
                end_page,
            )
        elif file_type == ".docx":
            return await asyncio.to_thread(self._parse_docx, file_path)
        elif file_type in [".txt", ".md"]:
            return await asyncio.to_thread(self._parse_text, file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

    def _parse_pdf(
        self, file_path: str, start_page: int = 0, end_page: int = None
    ) -> str:
        extractor_sequence = [
            self._parse_pdf_with_pymupdf4llm,
            self._parse_pdf_with_pypdf,
            self._parse_pdf_with_pymupdf,
            self._parse_pdf_with_pdfplumber,
            self._parse_pdf_with_ocrmac,
            self._parse_pdf_with_rapidocr,
        ]

        first_non_empty_text = ""

        for extractor in extractor_sequence:
            try:
                extracted_text = extractor(file_path, start_page, end_page)
            except Exception:
                continue

            if extracted_text and extracted_text.strip() and not first_non_empty_text:
                first_non_empty_text = extracted_text

            if self.has_meaningful_text(extracted_text):
                return extracted_text

        return first_non_empty_text

    def _parse_pdf_with_pymupdf4llm(
        self, file_path: str, start_page: int = 0, end_page: int = None
    ) -> str:
        if pymupdf4llm is None:
            return ""

        doc = fitz.open(file_path) if fitz is not None else None
        total_pages = doc.page_count if doc is not None else 0
        if doc is not None:
            doc.close()

        if total_pages <= 0:
            return ""

        start = max(0, start_page)
        end = min(total_pages, end_page) if end_page is not None else total_pages
        if end <= start:
            return ""

        pages = list(range(start, end))
        markdown_text = pymupdf4llm.to_markdown(file_path, pages=pages)
        return markdown_text if isinstance(markdown_text, str) else ""

    def _parse_pdf_with_pypdf(
        self, file_path: str, start_page: int = 0, end_page: int = None
    ) -> str:
        reader = PdfReader(file_path)
        total_pages = len(reader.pages)
        start = max(0, start_page)
        end = min(total_pages, end_page) if end_page is not None else total_pages

        text_parts: list[str] = []
        for i in range(start, end):
            page = reader.pages[i]
            page_text = page.extract_text()
            if page_text:
                text_parts.append(f"\n--- 第 {i + 1} 页 ---\n{page_text}\n")

        return "".join(text_parts)

    def _parse_pdf_with_pymupdf(
        self, file_path: str, start_page: int = 0, end_page: int = None
    ) -> str:
        if fitz is None:
            return ""

        doc = fitz.open(file_path)
        try:
            total_pages = doc.page_count
            start = max(0, start_page)
            end = min(total_pages, end_page) if end_page is not None else total_pages

            text_parts: list[str] = []
            for i in range(start, end):
                page = doc.load_page(i)
                page_text = page.get_text("text")
                if page_text:
                    text_parts.append(f"\n--- 第 {i + 1} 页 ---\n{page_text}\n")

            return "".join(text_parts)
        finally:
            doc.close()

    def _parse_pdf_with_pdfplumber(
        self, file_path: str, start_page: int = 0, end_page: int = None
    ) -> str:
        if pdfplumber is None:
            return ""

        with pdfplumber.open(file_path) as pdf:
            total_pages = len(pdf.pages)
            start = max(0, start_page)
            end = min(total_pages, end_page) if end_page is not None else total_pages

            text_parts: list[str] = []
            for i in range(start, end):
                page = pdf.pages[i]
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(f"\n--- 第 {i + 1} 页 ---\n{page_text}\n")

            return "".join(text_parts)

    def _parse_pdf_with_rapidocr(
        self, file_path: str, start_page: int = 0, end_page: int = None
    ) -> str:
        if RapidOCR is None or fitz is None:
            return ""

        ocr_engine = RapidOCR()
        doc = fitz.open(file_path)
        try:
            total_pages = doc.page_count
            start = max(0, start_page)
            end = min(total_pages, end_page) if end_page is not None else total_pages

            text_parts: list[str] = []
            for i in range(start, end):
                page = doc.load_page(i)
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)

                temp_path = ""
                try:
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                        temp_path = f.name
                        pix.save(temp_path)

                    ocr_result, _ = ocr_engine(temp_path)
                    if not ocr_result:
                        continue

                    line_texts: list[str] = []
                    for item in ocr_result:
                        if isinstance(item, list) and len(item) >= 2:
                            line = item[1]
                            if isinstance(line, str) and line.strip():
                                line_texts.append(line.strip())

                    if line_texts:
                        text_parts.append(
                            f"\n--- 第 {i + 1} 页 ---\n{'\n'.join(line_texts)}\n"
                        )
                finally:
                    if temp_path and os.path.exists(temp_path):
                        os.remove(temp_path)

            return "".join(text_parts)
        finally:
            doc.close()

    def _parse_pdf_with_ocrmac(
        self, file_path: str, start_page: int = 0, end_page: int = None
    ) -> str:
        if ocrmac is None or fitz is None:
            return ""

        doc = fitz.open(file_path)
        try:
            total_pages = doc.page_count
            start = max(0, start_page)
            end = min(total_pages, end_page) if end_page is not None else total_pages

            text_parts: list[str] = []
            for i in range(start, end):
                page = doc.load_page(i)
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)

                temp_path = ""
                try:
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                        temp_path = f.name
                        pix.save(temp_path)

                    ocr = ocrmac.OCR(
                        temp_path,
                        language_preference=["zh-Hans", "en-US"],
                    )
                    annotations = ocr.recognize()
                    if not annotations:
                        continue

                    line_texts = [
                        item[0].strip()
                        for item in annotations
                        if isinstance(item, tuple)
                        and len(item) > 0
                        and isinstance(item[0], str)
                        and item[0].strip()
                    ]

                    if line_texts:
                        text_parts.append(
                            f"\n--- 第 {i + 1} 页 ---\n{'\n'.join(line_texts)}\n"
                        )
                finally:
                    if temp_path and os.path.exists(temp_path):
                        os.remove(temp_path)

            return "".join(text_parts)
        finally:
            doc.close()

    def has_meaningful_text(
        self, text: str, min_chars: int = MEANINGFUL_TEXT_MIN_CHARS
    ) -> bool:
        compact = "".join(text.split())
        valid_chars = sum(1 for ch in compact if ch.isalnum())
        return valid_chars >= min_chars

    def get_pdf_info(self, file_path: str) -> dict:
        """Get PDF metadata (page count, file size)"""
        reader = PdfReader(file_path)
        file_size = os.path.getsize(file_path)
        return {
            "total_pages": len(reader.pages),
            "file_size_bytes": file_size,
            "file_size_mb": round(file_size / (1024 * 1024), 2),
        }

    def _parse_docx(self, file_path: str) -> str:
        doc = DocxDocument(file_path)
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        return text

    def _parse_text(self, file_path: str) -> str:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    async def parse_document_structured(
        self,
        file_path: str,
        file_type: str,
    ) -> list:
        """Parse document using unstructured, returning structured elements.

        Falls back to the legacy text-based parsers if unstructured is not
        installed, if the file type requires unavailable extras (e.g. PDF
        needs unstructured_inference), or if partitioning raises an exception.
        """
        # Fast path: skip unstructured entirely when unavailable or when PDF
        # lacks the required unstructured_inference dependency.
        if not UNSTRUCTURED_AVAILABLE:
            text = await self.parse_document(file_path, file_type)
            return self._text_to_elements(text)

        if file_type == ".pdf" and not UNSTRUCTURED_PDF_AVAILABLE:
            text = await self.parse_document(file_path, file_type)
            return self._text_to_elements(text)

        try:
            elements = await asyncio.to_thread(
                unstructured_partition, filename=file_path
            )
            # Filter out empty elements
            elements = [
                el for el in elements
                if hasattr(el, "text") and el.text and el.text.strip()
            ]
            return elements
        except Exception as e:
            print(f"[Unstructured Parse Error] {e}, falling back to legacy parser")
            text = await self.parse_document(file_path, file_type)
            return self._text_to_elements(text)

    def _text_to_elements(self, text: str) -> list:
        """Convert plain text into pseudo-elements for the structured pipeline.

        Attempts to classify each line as a Title or NarrativeText so that
        chunk_by_title can split the document at heading boundaries.
        """
        import re

        class _PseudoElement:
            """Lightweight stand-in for unstructured.Element.

            Marked with ``_is_pseudo = True`` so that ``chunk_text_structured``
            can route pseudo-elements to the fixed-size fallback chunker
            instead of calling ``chunk_by_title`` (which expects full
            ``ElementMetadata`` with ``known_fields`` etc.).
            """
            _is_pseudo = True

            def __init__(self, text: str, page_number: int = None,
                         element_type: str = "NarrativeText"):
                self.text = text
                self.metadata = type("_Meta", (), {
                    "page_number": page_number,
                    "element_type": element_type,
                    "categories": [element_type],
                })()

        # Patterns that suggest a line is a title/heading
        title_patterns = [
            re.compile(r'^#{1,6}\s'),        # Markdown headings: # Title
            re.compile(r'^第[一二三四五六七八九十\d]+[章节条]'),  # 第X章/节
            re.compile(r'^\d+[\.\)]\s+\S'),    # 1. Title / 1) Title
            re.compile(r'^[A-Z][\s·]'),       # ALL CAPS or A. Title
            re.compile(r'^[\u4e00-\u9fa5]{2,20}$'),  # Short Chinese text
        ]

        def _is_title(line: str) -> bool:
            stripped = line.strip()
            if not stripped or len(stripped) > 80:
                return False
            # Short line not ending with sentence punctuation → likely title
            if len(stripped) <= 50 and not stripped.endswith(
                ('.', '。', '!', '！', '?', '？', ',', '，', ';', '；', ':', '：')
            ):
                for pat in title_patterns:
                    if pat.match(stripped):
                        return True
            # Markdown heading
            if stripped.startswith('#'):
                return True
            return False

        lines = text.split("\n")
        elements = []
        current_page = None
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            # Detect page markers like "--- 第 1 页 ---"
            if stripped.startswith("---") and "页" in stripped:
                match = re.search(r"第\s*(\d+)\s*页", stripped)
                if match:
                    current_page = int(match.group(1))
                continue
            etype = "Title" if _is_title(stripped) else "NarrativeText"
            elements.append(_PseudoElement(stripped, current_page, etype))
        return elements

    async def parse_document_text(
        self,
        file_path: str,
        file_type: str,
        start_page: int = None,
        end_page: int = None,
    ) -> str:
        """Parse document and return plain text (backward-compatible with preview)."""
        return await self.parse_document(file_path, file_type, start_page, end_page)

    def chunk_text_structured(
        self, elements: list, max_chunk_size: int = 1500
    ) -> List[dict]:
        """Semantic chunking based on unstructured element types.

        Returns a list of dicts with keys: content, element_type, page_number, chunk_index.
        Falls back to fixed-size chunking if unstructured chunking is unavailable.
        """
        if not elements:
            return []

        chunks_data: List[dict] = []

        # Use unstructured's chunk_by_title only for real unstructured elements.
        # Pseudo-elements (from legacy parser) lack the full ElementMetadata
        # interface and would trigger ``'_Meta' object has no attribute
        # 'known_fields'`` errors, so route them to the fallback chunker.
        _all_pseudo = all(getattr(e, "_is_pseudo", False) for e in elements)

        if (
            UNSTRUCTURED_AVAILABLE
            and unstructured_chunk_by_title is not None
            and not _all_pseudo
        ):
            try:
                chunked = unstructured_chunk_by_title(
                    elements, max_characters=max_chunk_size
                )
                for i, chunk in enumerate(chunked):
                    page_number = None
                    element_type = "Text"
                    if hasattr(chunk, "metadata"):
                        page_number = getattr(chunk.metadata, "page_number", None)
                        element_type = getattr(
                            chunk.metadata, "element_type", None
                        ) or (
                            chunk.metadata.categories[0]
                            if hasattr(chunk.metadata, "categories")
                            and chunk.metadata.categories
                            else "Text"
                        )
                    chunks_data.append({
                        "content": chunk.text if hasattr(chunk, "text") else str(chunk),
                        "element_type": element_type,
                        "page_number": page_number,
                        "chunk_index": i,
                    })
            except Exception as e:
                print(f"[Unstructured Chunk Error] {e}, falling back to fixed chunking")
                chunks_data = self._fallback_chunk_elements(elements, max_chunk_size)
        else:
            chunks_data = self._fallback_chunk_elements(elements, max_chunk_size)

        return chunks_data

    def _fallback_chunk_elements(
        self, elements: list, max_chunk_size: int = 1500
    ) -> List[dict]:
        """Fallback: combine elements into fixed-size chunks with metadata."""
        chunks_data: List[dict] = []
        current_text = ""
        current_page = None
        current_type = "Text"
        chunk_index = 0

        for el in elements:
            el_text = el.text if hasattr(el, "text") else str(el)
            el_page = None
            el_type = "Text"
            if hasattr(el, "metadata"):
                el_page = getattr(el.metadata, "page_number", None)
                el_type = getattr(el.metadata, "element_type", None) or "Text"

            if current_text and len(current_text) + len(el_text) > max_chunk_size:
                chunks_data.append({
                    "content": current_text,
                    "element_type": current_type,
                    "page_number": current_page,
                    "chunk_index": chunk_index,
                })
                chunk_index += 1
                current_text = ""

            if not current_text:
                current_page = el_page
                current_type = el_type

            current_text = f"{current_text}\n{el_text}" if current_text else el_text

        if current_text:
            chunks_data.append({
                "content": current_text,
                "element_type": current_type,
                "page_number": current_page,
                "chunk_index": chunk_index,
            })

        return chunks_data

    def chunk_text(
        self, text: str, chunk_size: int = 1000, overlap: int = 200
    ) -> List[str]:
        """Split text into chunks with overlap (legacy method, kept as fallback)"""
        chunks = []
        start = 0
        text_len = len(text)

        while start < text_len:
            end = min(start + chunk_size, text_len)
            chunk = text[start:end]
            chunks.append(chunk)
            start += chunk_size - overlap

        return chunks


document_service = DocumentService()
