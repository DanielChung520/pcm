"""PCM Analyzer CLI — embed code and run GraphRAG from command line."""

import json
import sys
from pathlib import Path

def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print("Usage: pcm-analyzer <command> [options]")
        print("Commands:")
        print("  embed <file>        Generate embeddings for a source file")
        print("  community <json>    Detect communities from graph JSON")
        return

    command = args[0]

    if command == "embed" and len(args) >= 2:
        from .embedding import CodeEmbedder
        file_path = Path(args[1])
        source = file_path.read_text()
        embedder = CodeEmbedder()
        try:
            chunks = embedder.chunk_code(source, str(file_path))
            print(json.dumps(chunks, indent=2))
        except ImportError as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)

    elif command == "community" and len(args) >= 2:
        from .graphrag import GraphRAG
        data = json.loads(Path(args[1]).read_text())
        rag = GraphRAG()
        communities = rag.detect_communities(
            data.get("symbols", []),
            data.get("relationships", []),
        )
        print(json.dumps(communities, indent=2))

    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
