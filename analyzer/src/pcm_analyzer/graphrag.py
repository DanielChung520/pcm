"""GraphRAG: community detection + summarization over code dependency graphs."""

import json
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

class GraphRAG:
    def __init__(self, llm_provider: Optional[Any] = None):
        self.llm = llm_provider

    def detect_communities(
        self, symbols: List[dict], relationships: List[dict]
    ) -> List[dict]:
        adj = defaultdict(set)
        node_names: Dict[str, str] = {}
        node_dirs: Dict[str, str] = {}

        for s in symbols:
            node_names[s["id"]] = s.get("name", s["id"])
            parts = s.get("filePath", "").split("/")
            node_dirs[s["id"]] = parts[0] if len(parts) > 1 else "root"

        for r in relationships:
            if r.get("relType") == "imports" or r.get("type") == "imports":
                adj[r["sourceId"]].add(r["targetId"])
                adj[r["targetId"]].add(r["sourceId"])

        # Community detection via directory grouping + label propagation
        communities: Dict[str, List[str]] = defaultdict(list)
        for nid, _ in node_names.items():
            dir_name = node_dirs.get(nid, "root")
            communities[dir_name].append(nid)

        result = []
        for dir_name, members in sorted(communities.items()):
            member_names = [node_names.get(m, m) for m in members]
            result.append({
                "id": f"community:{dir_name}",
                "name": dir_name,
                "members": members,
                "member_names": member_names,
                "size": len(members),
            })
        return result

    def summarize_community(
        self, community: dict, symbols: List[dict], code_map: Dict[str, str]
    ) -> str:
        member_codes = []
        for mid in community.get("members", []):
            sym = next((s for s in symbols if s["id"] == mid), None)
            if sym:
                fp = sym.get("filePath", "")
                code = code_map.get(fp, "")[:500]
                if code:
                    member_codes.append(f"--- {fp} ---\n{code}")

        if not member_codes or not self.llm:
            summary = f"Module {community['name']} with {community['size']} files"
            if member_codes:
                summary += f": {', '.join(community.get('member_names', []))}"
            return summary

        prompt = (
            f"Summarize the following code module '{community['name']}' "
            f"({community['size']} files):\n\n"
            + "\n\n".join(member_codes[:5])
            + "\n\nProvide a concise summary of the module's purpose and key components."
        )

        try:
            response = self.llm(prompt)
            return response[:500]
        except Exception as e:
            return f"Module {community['name']}: {e}"

    def build_index(
        self, symbols: List[dict], relationships: List[dict], code_map: Dict[str, str]
    ) -> dict:
        communities = self.detect_communities(symbols, relationships)
        summaries = {}
        for comm in communities:
            summaries[comm["id"]] = self.summarize_community(comm, symbols, code_map)

        return {
            "communities": communities,
            "summaries": summaries,
            "node_count": len(symbols),
            "edge_count": len(relationships),
        }
