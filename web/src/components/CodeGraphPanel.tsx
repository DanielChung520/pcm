import { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";
import { fetchGraph, fetchProjects, type GraphNode, type GraphLink } from "../mockData";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LayoutMode = "force" | "circular" | "matrix" | "3d";

interface SimNode extends d3.SimulationNodeDatum, GraphNode {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: string;
}

// ---------------------------------------------------------------------------
// Module color system — assigns a palette color per module, cached globally
// ---------------------------------------------------------------------------

const modulePalette = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  "#3b82f6", "#eab308", "#10b981", "#f43f5e", "#8b5cf6",
];

const moduleColors: Record<string, string> = {};

function getModuleColor(module: string): string {
  if (!moduleColors[module]) {
    const idx = Object.keys(moduleColors).length % modulePalette.length;
    moduleColors[module] = modulePalette[idx];
  }
  return moduleColors[module];
}

// Pre-warm colors for all nodes in the dataset so the legend is populated
function assignModuleColors(nodes: GraphNode[]): void {
  nodes.forEach((n) => getModuleColor(n.module));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return <div className="graph-empty">{message}</div>;
}

// ---------------------------------------------------------------------------
// ForceGraph — existing force-directed layout (preserved)
// ---------------------------------------------------------------------------

interface GraphProps {
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
  tooltipRef: React.RefObject<HTMLDivElement>;
  onZoomChange?: (k: number) => void;
  resetFnRef?: React.MutableRefObject<(() => void) | null>;
}

function ForceGraph({ graphData, tooltipRef, onZoomChange, resetFnRef }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectedNodeRef = useRef<string | null>(null);

  const resetZoom = useCallback(() => {
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>("g.graph-root");
    g.transition().duration(500).attr("transform", "translate(0,0) scale(1)");
    onZoomChange?.(1);
  }, [onZoomChange]);

  useEffect(() => {
    if (resetFnRef) resetFnRef.current = resetZoom;
  }, [resetFnRef, resetZoom]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = svgEl.clientWidth;
    const height = svgEl.clientHeight;

    d3.select(svgEl).selectAll("*").remove();

    const svg = d3.select(svgEl);
    const g = svg.append("g").attr("class", "graph-root");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
        onZoomChange?.(event.transform.k);
      });

    svg.call(zoom);

    if (graphData.nodes.length === 0) return;

    const nodes: SimNode[] = graphData.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = graphData.links.map((e) => ({ ...e }));

    const nodeMap = new Map<string, SimNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    const resolvedLinks = links
      .map((l) => ({
        ...l,
        source: nodeMap.get(l.source as string) as SimNode | undefined,
        target: nodeMap.get(l.target as string) as SimNode | undefined,
      }))
      .filter((l) => l.source && l.target) as SimLink[];

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(resolvedLinks)
          .id((d) => d.id)
          .distance(80)
          .strength(0.6),
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<SimNode>().radius((d) => 8 + d.complexity / 2));

    const link = g
      .selectAll<SVGLineElement, SimLink>(".graph-link")
      .data(resolvedLinks)
      .join("line")
      .attr("class", "graph-link")
      .attr("stroke-width", 1);

    const node = g
      .selectAll<SVGGElement, SimNode>(".graph-node")
      .data(nodes)
      .join("g")
      .attr("class", "graph-node")
      .style("cursor", "pointer");

    node
      .append("circle")
      .attr("class", "graph-node-circle")
      .attr("r", (d) => 6 + d.complexity / 3)
      .attr("fill", (d) => getModuleColor(d.module));

    node
      .append("text")
      .attr("class", "graph-node-label")
      .attr("dy", (d) => -(8 + d.complexity / 3) - 4)
      .text((d) => d.name);

    const getConnected = (nodeId: string): Set<string> => {
      const connected = new Set<string>([nodeId]);
      resolvedLinks.forEach((l) => {
        const s = (l.source as SimNode).id;
        const t = (l.target as SimNode).id;
        if (s === nodeId) connected.add(t);
        if (t === nodeId) connected.add(s);
      });
      return connected;
    };

    const highlight = (nodeId: string) => {
      const connected = getConnected(nodeId);
      node.classed("graph-node-dimmed", (d) => !connected.has(d.id));
      link
        .classed("highlighted", (l) => {
          const s = (l.source as SimNode).id;
          const t = (l.target as SimNode).id;
          return s === nodeId || t === nodeId;
        })
        .classed("graph-link-dimmed", (l) => {
          const s = (l.source as SimNode).id;
          const t = (l.target as SimNode).id;
          return s !== nodeId && t !== nodeId;
        });
    };

    const clearHighlight = () => {
      node.classed("graph-node-dimmed", false);
      link.classed("highlighted", false).classed("graph-link-dimmed", false);
    };

    const tooltip = d3.select(tooltipRef.current);
    node
      .on("mouseover", (event, d) => {
        tooltip
          .style("left", `${event.offsetX + 12}px`)
          .style("top", `${event.offsetY + 12}px`)
          .html(
            `<div>${d.name}</div><div class="tooltip-module">${d.filePath}</div><div class="tooltip-complexity">complexity: ${d.complexity}</div>`,
          )
          .classed("visible", true);
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", `${event.offsetX + 12}px`)
          .style("top", `${event.offsetY + 12}px`);
      })
      .on("mouseout", () => {
        tooltip.classed("visible", false);
      });

    node.on("click", (event, d) => {
      event.stopPropagation();
      if (selectedNodeRef.current === d.id) {
        clearHighlight();
        selectedNodeRef.current = null;
      } else {
        highlight(d.id);
        selectedNodeRef.current = d.id;
      }
    });

    svg.on("click", () => {
      clearHighlight();
      selectedNodeRef.current = null;
    });

    node.call(
      d3
        .drag<SVGGElement, SimNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

    simulation.on("tick", () => {
      link
        .attr("x1", (l) => (l.source as SimNode).x!)
        .attr("y1", (l) => (l.source as SimNode).y!)
        .attr("x2", (l) => (l.target as SimNode).x!)
        .attr("y2", (l) => (l.target as SimNode).y!);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, tooltipRef, onZoomChange]);

  return <svg ref={svgRef} className="graph-svg" />;
}

// ---------------------------------------------------------------------------
// CircularGraph — ring layout with arc links
// ---------------------------------------------------------------------------

interface CircularNode extends GraphNode {
  x: number;
  y: number;
}

function CircularGraph({ graphData, tooltipRef, onZoomChange, resetFnRef }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const selectedNodeRef = useRef<string | null>(null);

  const resetZoom = useCallback(() => {
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>("g.graph-root");
    g.transition().duration(500).attr("transform", "translate(0,0) scale(1)");
    onZoomChange?.(1);
  }, [onZoomChange]);

  useEffect(() => {
    if (resetFnRef) resetFnRef.current = resetZoom;
  }, [resetFnRef, resetZoom]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = svgEl.clientWidth;
    const height = svgEl.clientHeight;

    d3.select(svgEl).selectAll("*").remove();

    const svg = d3.select(svgEl);
    const g = svg.append("g").attr("class", "graph-root");

    // Zoom support
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
        onZoomChange?.(event.transform.k);
      });
    svg.call(zoom);

    if (graphData.nodes.length === 0) return;

    const nodes: CircularNode[] = graphData.nodes.map((n) => ({ ...n, x: 0, y: 0 }));
    const links = graphData.links.map((l) => ({ ...l }));

    const nodeMap = new Map<string, CircularNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    const resolvedLinks = links
      .map((l) => ({
        ...l,
        source: nodeMap.get(l.source as string)!,
        target: nodeMap.get(l.target as string)!,
      }))
      .filter((l) => l.source && l.target);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 80;

    // Position nodes in a circle
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      n.x = centerX + radius * Math.cos(angle);
      n.y = centerY + radius * Math.sin(angle);
    });

    // Draw links as arcs curving toward center
    const link = g
      .selectAll<SVGPathElement, typeof resolvedLinks[number]>(".graph-link")
      .data(resolvedLinks)
      .join("path")
      .attr("class", "graph-link")
      .attr("fill", "none")
      .attr("stroke-width", 1)
      .attr("d", (l) => {
        const s = l.source as CircularNode;
        const t = l.target as CircularNode;
        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;
        // Pull control point toward center for arc effect
        const dx = mx - centerX;
        const dy = my - centerY;
        const ctrlX = centerX + dx * 0.35;
        const ctrlY = centerY + dy * 0.35;
        return `M${s.x},${s.y} Q${ctrlX},${ctrlY} ${t.x},${t.y}`;
      });

    // Draw guide circle
    g.append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", radius)
      .attr("fill", "none")
      .attr("stroke", "var(--border)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4 4")
      .attr("opacity", 0.4);

    // Node groups
    const node = g
      .selectAll<SVGGElement, typeof nodes[number]>(".graph-node")
      .data(nodes)
      .join("g")
      .attr("class", "graph-node")
      .style("cursor", "pointer")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    node
      .append("circle")
      .attr("class", "graph-node-circle")
      .attr("r", (d) => 5 + d.complexity / 4)
      .attr("fill", (d) => getModuleColor(d.module));

    // Labels outside the circle
    node
      .append("text")
      .attr("class", "graph-node-label")
      .attr("dy", (d) => {
        const angle = (2 * Math.PI * nodes.indexOf(d) / nodes.length) - Math.PI / 2;
        return Math.sin(angle) >= 0 ? 16 : -8;
      })
      .text((d) => d.name);

    // Highlight logic
    const getConnected = (nodeId: string): Set<string> => {
      const connected = new Set<string>([nodeId]);
      resolvedLinks.forEach((l) => {
        const s = (l.source as { id: string }).id;
        const t = (l.target as { id: string }).id;
        if (s === nodeId) connected.add(t);
        if (t === nodeId) connected.add(s);
      });
      return connected;
    };

    const highlight = (nodeId: string) => {
      const connected = getConnected(nodeId);
      node.classed("graph-node-dimmed", (d) => !connected.has(d.id));
      link
        .classed("highlighted", (l) => {
          const s = (l.source as { id: string }).id;
          const t = (l.target as { id: string }).id;
          return s === nodeId || t === nodeId;
        })
        .classed("graph-link-dimmed", (l) => {
          const s = (l.source as { id: string }).id;
          const t = (l.target as { id: string }).id;
          return s !== nodeId && t !== nodeId;
        });
    };

    const clearHighlight = () => {
      node.classed("graph-node-dimmed", false);
      link.classed("highlighted", false).classed("graph-link-dimmed", false);
    };

    // Tooltip
    const tooltip = d3.select(tooltipRef.current);
    node
      .on("mouseover", (event, d) => {
        tooltip
          .style("left", `${event.offsetX + 12}px`)
          .style("top", `${event.offsetY + 12}px`)
          .html(
            `<div>${d.name}</div><div class="tooltip-module">${d.filePath}</div><div class="tooltip-complexity">complexity: ${d.complexity}</div>`,
          )
          .classed("visible", true);
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", `${event.offsetX + 12}px`)
          .style("top", `${event.offsetY + 12}px`);
      })
      .on("mouseout", () => {
        tooltip.classed("visible", false);
      });

    node.on("click", (event, d) => {
      event.stopPropagation();
      if (selectedNodeRef.current === d.id) {
        clearHighlight();
        selectedNodeRef.current = null;
      } else {
        highlight(d.id);
        selectedNodeRef.current = d.id;
      }
    });

    svg.on("click", () => {
      clearHighlight();
      selectedNodeRef.current = null;
    });
  }, [graphData, tooltipRef, onZoomChange]);

  return <svg ref={svgRef} className="graph-svg" />;
}

// ---------------------------------------------------------------------------
// MatrixGraph — adjacency matrix grid
// ---------------------------------------------------------------------------

function MatrixGraph({ graphData, tooltipRef, resetFnRef }: GraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const resetZoom = useCallback(() => {
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>("g.graph-root");
    g.transition().duration(500).attr("transform", "translate(0,0) scale(1)");
  }, []);

  useEffect(() => {
    if (resetFnRef) resetFnRef.current = resetZoom;
  }, [resetFnRef, resetZoom]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = svgEl.clientWidth;
    const height = svgEl.clientHeight;

    d3.select(svgEl).selectAll("*").remove();

    const svg = d3.select(svgEl);
    const g = svg.append("g").attr("class", "graph-root");

    // Zoom/pan support
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 6])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
      });
    svg.call(zoom);

    if (graphData.nodes.length === 0) return;

    // Sort nodes by module then name
    const sortedNodes = [...graphData.nodes].sort((a, b) =>
      a.module === b.module ? a.name.localeCompare(b.name) : a.module.localeCompare(b.module),
    );

    const n = sortedNodes.length;
    const idToIndex = new Map<string, number>();
    sortedNodes.forEach((node, i) => idToIndex.set(node.id, i));

    // Build adjacency matrix — count links between each pair
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    let maxCount = 0;
    graphData.links.forEach((l) => {
      const si = idToIndex.get(l.source as string);
      const ti = idToIndex.get(l.target as string);
      if (si === undefined || ti === undefined) return;
      matrix[si][ti] += 1;
      if (matrix[si][ti] > maxCount) maxCount = matrix[si][ti];
    });

    // Layout dimensions
    const margin = { top: 80, right: 10, bottom: 10, left: 120 };
    const gridWidth = width - margin.left - margin.right;
    const gridHeight = height - margin.top - margin.bottom;
    const cellSize = Math.min(gridWidth / n, gridHeight / n);
    const gridW = cellSize * n;
    const gridH = cellSize * n;

    // Translate group to leave room for labels
    g.attr("transform", `translate(${margin.left},${margin.top})`);

    // Color scale — accent with opacity by link count
    const colorScale = d3
      .scaleLinear<string>()
      .domain([0, Math.max(1, maxCount)])
      .range(["rgba(99, 102, 241, 0.05)", "rgba(99, 102, 241, 0.9)"])
      .clamp(true);

    // Draw cells
    const tooltip = d3.select(tooltipRef.current);

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const count = matrix[i][j];
        if (count === 0) continue;
        g.append("rect")
          .attr("class", "matrix-cell")
          .attr("x", j * cellSize)
          .attr("y", i * cellSize)
          .attr("width", Math.max(1, cellSize - 0.5))
          .attr("height", Math.max(1, cellSize - 0.5))
          .attr("fill", colorScale(count))
          .on("mouseover", (event) => {
            const src = sortedNodes[i];
            const tgt = sortedNodes[j];
            tooltip
              .style("left", `${event.offsetX + 12}px`)
              .style("top", `${event.offsetY + 12}px`)
              .html(
                `<div>${src.name}</div><div class="tooltip-module">${src.filePath}</div><div style="color: var(--accent-hover); margin-top: 4px;">→ ${tgt.name}</div><div class="tooltip-module">${tgt.filePath}</div>`,
              )
              .classed("visible", true);
          })
          .on("mousemove", (event) => {
            tooltip
              .style("left", `${event.offsetX + 12}px`)
              .style("top", `${event.offsetY + 12}px`);
          })
          .on("mouseout", () => {
            tooltip.classed("visible", false);
          });
      }
    }

    // Diagonal reference line
    g.append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", gridW)
      .attr("y2", gridH)
      .attr("stroke", "var(--border)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3 3")
      .attr("opacity", 0.3);

    // Row labels (left side)
    g.selectAll<SVGTextElement, typeof sortedNodes[number]>(".matrix-row-label")
      .data(sortedNodes)
      .join("text")
      .attr("class", "matrix-label")
      .attr("x", -6)
      .attr("y", (_d, i) => i * cellSize + cellSize / 2 + 3)
      .attr("text-anchor", "end")
      .text((d) => (cellSize > 8 ? d.name : ""))
      .on("mouseover", (event, d) => {
        tooltip
          .style("left", `${event.offsetX + 12}px`)
          .style("top", `${event.offsetY + 12}px`)
          .html(`<div>${d.name}</div><div class="tooltip-module">${d.filePath}</div>`)
          .classed("visible", true);
      })
      .on("mouseout", () => {
        tooltip.classed("visible", false);
      });

    // Column labels (top, rotated)
    g.selectAll<SVGTextElement, typeof sortedNodes[number]>(".matrix-col-label")
      .data(sortedNodes)
      .join("text")
      .attr("class", "matrix-label")
      .attr("x", (_d, i) => i * cellSize + cellSize / 2)
      .attr("y", -6)
      .attr("text-anchor", "start")
      .attr("transform", (_d, i) => `rotate(-65 ${i * cellSize + cellSize / 2} -6)`)
      .text((d) => (cellSize > 8 ? d.name : ""));

    // Module color indicators on row labels
    g.selectAll<SVGRectElement, typeof sortedNodes[number]>(".matrix-module-dot")
      .data(sortedNodes)
      .join("rect")
      .attr("class", "matrix-module-dot")
      .attr("x", -2)
      .attr("y", (_d, i) => i * cellSize + cellSize / 2 - 3)
      .attr("width", 3)
      .attr("height", 6)
      .attr("fill", (d) => getModuleColor(d.module));
  }, [graphData, tooltipRef]);

  return <svg ref={svgRef} className="graph-svg" />;
}

// ---------------------------------------------------------------------------
// Graph3D — Three.js + three-forcegraph with graceful fallback
// ---------------------------------------------------------------------------

function Graph3D({ graphData, tooltipRef, resetFnRef }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || graphData.nodes.length === 0) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const THREE = await import("three");
        const { default: ThreeForceGraph } = await import("three-forcegraph");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

        if (cancelled || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x161821);

        // Camera
        const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 5000);
        camera.position.set(0, 0, 400);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;

        // Graph
        const graph = new ThreeForceGraph()
          .graphData({
            nodes: graphData.nodes.map((n) => ({ ...n })),
            links: graphData.links.map((l) => ({ ...l })),
          })
          .nodeId("id")
          .nodeVal((n: any) => 2 + (n.complexity ?? 0) / 3)
          .nodeColor((n: any) => getModuleColor(n.module ?? ""))
          .nodeOpacity(0.9)
          .nodeRelSize(4)
          .linkColor(() => "#4a4d6a")
          .linkOpacity(0.5)
          .linkWidth(0.5)
          .cooldownTicks(100)
          .warmupTicks(50);

        scene.add(graph);

        // Lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(0, 1, 1);
        scene.add(dirLight);

        // Raycasting for hover
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2(-2, -2);
        let mouseClientX = 0;
        let mouseClientY = 0;
        let hoveredNode: { id: string; name: string; filePath: string; complexity: number } | null = null;

        const onPointerMove = (event: PointerEvent) => {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          mouseClientX = event.clientX;
          mouseClientY = event.clientY;
        };

        const onPointerLeave = () => {
          pointer.x = -2;
          pointer.y = -2;
          if (hoveredNode) {
            hoveredNode = null;
            d3.select(tooltipRef.current).classed("visible", false);
          }
        };

        container.addEventListener("pointermove", onPointerMove);
        container.addEventListener("pointerleave", onPointerLeave);

        // Animation loop
        let frameId: number;
        const animate = () => {
          frameId = requestAnimationFrame(animate);
          controls.update();
          graph.tickFrame();

          // Hover detection via raycasting
          raycaster.setFromCamera(pointer, camera);
          const intersects = raycaster.intersectObject(graph, true);
          let foundNode: typeof hoveredNode = null;
          for (const hit of intersects) {
            const obj = hit.object as unknown as { __graphObjType?: string; __data?: { id: string; name: string; filePath: string; complexity: number } };
            if (obj.__graphObjType === "node" && obj.__data) {
              foundNode = obj.__data;
              break;
            }
          }

          if (foundNode !== hoveredNode) {
            hoveredNode = foundNode;
            const tooltip = d3.select(tooltipRef.current);
            if (hoveredNode) {
              tooltip
                .html(
                  `<div>${hoveredNode.name}</div><div class="tooltip-module">${hoveredNode.filePath}</div><div class="tooltip-complexity">complexity: ${hoveredNode.complexity}</div>`,
                )
                .classed("visible", true);
            } else {
              tooltip.classed("visible", false);
            }
          }

          // Update tooltip position to follow pointer
          if (hoveredNode) {
            const wrapperRect = container.parentElement?.getBoundingClientRect();
            if (wrapperRect) {
              d3.select(tooltipRef.current)
                .style("left", `${mouseClientX - wrapperRect.left + 12}px`)
                .style("top", `${mouseClientY - wrapperRect.top + 12}px`);
            }
          }

          renderer.render(scene, camera);
        };
        animate();

        // Resize handler
        const onResize = () => {
          const w = container.clientWidth;
          const h = container.clientHeight;
          if (w > 0 && h > 0) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
          }
        };
        const resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(container);

        // Expose reset function
        if (resetFnRef) {
          resetFnRef.current = () => {
            camera.position.set(0, 0, 400);
            controls.target.set(0, 0, 0);
            controls.update();
          };
        }

        cleanup = () => {
          cancelAnimationFrame(frameId);
          resizeObserver.disconnect();
          container.removeEventListener("pointermove", onPointerMove);
          container.removeEventListener("pointerleave", onPointerLeave);
          controls.dispose();
          renderer.dispose();
          if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        };
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [graphData, tooltipRef, resetFnRef]);

  if (error) {
    return <div className="graph-3d-fallback">3D rendering unavailable: {error}</div>;
  }

  if (graphData.nodes.length === 0) {
    return <EmptyState message="No graph data — select a project to load nodes" />;
  }

  return <div ref={containerRef} className="graph-3d-container" />;
}

// ---------------------------------------------------------------------------
// Main CodeGraphPanel
// ---------------------------------------------------------------------------

const layoutLabels: { mode: LayoutMode; label: string }[] = [
  { mode: "force", label: "Force" },
  { mode: "circular", label: "Circular" },
  { mode: "matrix", label: "Matrix" },
  { mode: "3d", label: "3D" },
];

export function CodeGraphPanel() {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [projectName, setProjectName] = useState("");
  const [projectList, setProjectList] = useState<string[]>([]);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const resetFnRef = useRef<(() => void) | null>(null);

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });

  useEffect(() => {
    fetchProjects().then((projects) => {
      setProjectList(projects.map((p) => p.name));
      if (projects.length > 0 && !projectName) setProjectName(projects[0].name);
    });
  }, []);

  useEffect(() => {
    if (!projectName) return;
    fetchGraph(projectName).then((data) => setGraphData(data));
  }, [projectName]);

  // Assign module colors whenever data changes so legend is populated
  useEffect(() => {
    assignModuleColors(graphData.nodes);
  }, [graphData]);

  const resetZoom = useCallback(() => {
    resetFnRef.current?.();
  }, []);

  const handleZoomChange = useCallback((k: number) => {
    setZoomLevel(k);
  }, []);

  const sharedProps: GraphProps = {
    graphData,
    tooltipRef,
    onZoomChange: handleZoomChange,
    resetFnRef,
  };

  return (
    <div className="panel-fade graph-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">CodeGraph</h2>
          <p className="panel-subtitle">Interactive dependency graph — drag, zoom, click to highlight</p>
        </div>
        <select className="project-select" value={projectName} onChange={(e) => setProjectName(e.target.value)}>
          {projectList.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="graph-toolbar">
        <div className="layout-switcher">
          {layoutLabels.map(({ mode, label }) => (
            <button
              key={mode}
              className={layoutMode === mode ? "active" : ""}
              onClick={() => setLayoutMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
        <button onClick={resetZoom}>Reset Zoom</button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>
          zoom: {zoomLevel.toFixed(2)}x | nodes: {graphData.nodes.length} | edges: {graphData.links.length}
        </span>
      </div>

      <div className="graph-wrapper">
        {graphData.nodes.length === 0 && layoutMode !== "3d" ? (
          <EmptyState message="No graph data — select a project to load nodes" />
        ) : layoutMode === "force" ? (
          <ForceGraph {...sharedProps} />
        ) : layoutMode === "circular" ? (
          <CircularGraph {...sharedProps} />
        ) : layoutMode === "matrix" ? (
          <MatrixGraph {...sharedProps} />
        ) : (
          <Graph3D {...sharedProps} />
        )}
        <div ref={tooltipRef} className="graph-tooltip" />

        <div className="graph-legend">
          <div className="legend-title">Modules</div>
          {Object.entries(moduleColors).map(([mod, color]) => (
            <div key={mod} className="legend-item">
              <div className="legend-color" style={{ background: color }} />
              <span>{mod}</span>
            </div>
          ))}
        </div>

        <div className="graph-info">
          node size = complexity | <span>click</span> to highlight deps
        </div>
      </div>
    </div>
  );
}