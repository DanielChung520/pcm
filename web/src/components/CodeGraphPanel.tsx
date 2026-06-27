import { useRef, useEffect, useState, useCallback } from "react";
import * as d3 from "d3";
import { fetchGraph, fetchProjects, type GraphNode, type GraphLink } from "../mockData";

interface SimNode extends d3.SimulationNodeDatum, GraphNode {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: string;
}

const moduleColors: Record<string, string> = {};

export function CodeGraphPanel() {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const selectedNodeRef = useRef<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [projectName, setProjectName] = useState("");
  const [projectList, setProjectList] = useState<string[]>([]);

  useEffect(() => {
    fetchProjects().then(projects => {
      setProjectList(projects.map(p => p.name));
      if (projects.length > 0 && !projectName) setProjectName(projects[0].name);
    });
  }, []);

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });

  useEffect(() => {
    if (!projectName) return;
    fetchGraph(projectName).then(data => setGraphData(data));
  }, [projectName]);

  const resetZoom = useCallback(() => {
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>("g.graph-root");
    g.transition().duration(500).attr("transform", "translate(0,0) scale(1)");
    setZoomLevel(1);
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const width = svgEl.clientWidth;
    const height = svgEl.clientHeight;

    // Clear previous
    d3.select(svgEl).selectAll("*").remove();

    const svg = d3.select(svgEl);
    const g = svg.append("g").attr("class", "graph-root");

    // Zoom support
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
        setZoomLevel(event.transform.k);
      });

    svg.call(zoom);

    // Prepare data copies
    if (graphData.nodes.length === 0) return;
    const nodes: SimNode[] = graphData.nodes.map((n) => ({ ...n }));
    const links: SimLink[] = graphData.links.map((e) => ({ ...e }));

    // Build id -> node map
    const nodeMap = new Map<string, SimNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    // Resolve link source/target to node refs
    const resolvedLinks = links.map((l) => ({
      ...l,
      source: nodeMap.get(l.source as string) as SimNode,
      target: nodeMap.get(l.target as string) as SimNode,
    }));

    // Force simulation
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

    // Links
    const link = g
      .selectAll<SVGLineElement, SimLink>(".graph-link")
      .data(resolvedLinks)
      .join("line")
      .attr("class", "graph-link")
      .attr("stroke-width", 1);

    // Nodes group
    const node = g
      .selectAll<SVGGElement, SimNode>(".graph-node")
      .data(nodes)
      .join("g")
      .attr("class", "graph-node")
      .style("cursor", "pointer");

    // Node circles — sized by complexity
    node
      .append("circle")
      .attr("class", "graph-node-circle")
      .attr("r", (d) => 6 + d.complexity / 3)
      .attr("fill", (d) => moduleColors[d.module] || "#666");

    // Node labels
    node
      .append("text")
      .attr("class", "graph-node-label")
      .attr("dy", (d) => -(8 + d.complexity / 3) - 4)
      .text((d) => d.name);

    // Highlight logic
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

    // Hover tooltip
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

    // Click highlight
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

    // Click background to clear
    svg.on("click", () => {
      clearHighlight();
      selectedNodeRef.current = null;
    });

    // Drag
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

    // Tick
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
  }, [graphData]);

  return (
    <div className="panel-fade graph-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">CodeGraph</h2>
          <p className="panel-subtitle">Interactive dependency graph — drag, zoom, click to highlight</p>
        </div>
        <select className="project-select" value={projectName} onChange={e => setProjectName(e.target.value)}>
          {projectList.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div className="graph-toolbar">
        <button onClick={resetZoom}>Reset Zoom</button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>
          zoom: {zoomLevel.toFixed(2)}x | nodes: {graphData.nodes.length} | edges: {graphData.links.length}
        </span>
      </div>

      <div className="graph-wrapper">
        <svg ref={svgRef} className="graph-svg" />
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