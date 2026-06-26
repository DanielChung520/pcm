"""Code embedding using sentence-transformers."""

import json
import re
import sys
from pathlib import Path
from typing import List, Optional

CHUNK_PATTERNS = [
    r'^class\s+\w+',
    r'^def\s+\w+',
    r'^async\s+def\s+\w+',
    r'^\s*(export\s+)?(function|class|interface|type)\s+\w+',
]

class CodeEmbedder:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._model = None

    def _lazy_load(self):
        if self._model is not None:
            return
        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name)
        except ImportError:
            print("sentence-transformers not installed. Install with: pip install pcm-analyzer[ml]", file=sys.stderr)
            raise

    def chunk_code(self, source: str, file_path: str = "") -> List[dict]:
        chunks = []
        lines = source.split("\n")
        current_chunk: List[str] = []
        current_start = 1

        for i, line in enumerate(lines, 1):
            is_definition = any(re.match(p, line) for p in CHUNK_PATTERNS)

            if is_definition and current_chunk:
                chunks.append({
                    "file": file_path,
                    "start_line": current_start,
                    "end_line": i - 1,
                    "content": "\n".join(current_chunk),
                })
                current_chunk = []
                current_start = i

            current_chunk.append(line)

        if current_chunk:
            chunks.append({
                "file": file_path,
                "start_line": current_start,
                "end_line": len(lines),
                "content": "\n".join(current_chunk),
            })

        return chunks

    def embed(self, texts: List[str]) -> List[List[float]]:
        self._lazy_load()
        embeddings = self._model.encode(texts, show_progress_bar=False)
        return embeddings.tolist()

    def embed_chunks(self, chunks: List[dict]) -> List[dict]:
        texts = [c["content"] for c in chunks]
        vectors = self.embed(texts)
        for chunk, vec in zip(chunks, vectors):
            chunk["embedding"] = vec
        return chunks

    @staticmethod
    def cosine_similarity(a: List[float], b: List[float]) -> float:
        import math
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(y * y for y in b))
        return dot / (na * nb + 1e-10)
