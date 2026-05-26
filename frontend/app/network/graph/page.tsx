"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveApiUrl } from "@/components/api";
import { ROLE_OPTIONS, formatRole, getRoleColorGroup } from "@/components/roleTaxonomy";
import type { NetworkGraph, NetworkNode, Contact } from "@/components/types";

const COLOR_MAP: Record<string, string> = {
  sf_buyer: "#22c55e",
  sf_seller: "#f97316",
  cre_buyer: "#38bdf8",
  cre_seller: "#e879f9",
  capital: "#a78bfa",
  buyer: "#34d399",
  seller: "#f59e0b",
  vendor: "#60a5fa",
  operator: "#f87171",
  community: "#fb923c",
  other: "#6b7280",
};

type NodePos = { x: number; y: number; node: NetworkNode };

function useGraph(graph: NetworkGraph | null, width: number, height: number) {
  const positions = useMemo<NodePos[]>(() => {
    if (!graph || !graph.nodes.length) return [];
    const cx = width / 2;
    const cy = height / 2;
    return graph.nodes.map((node, i) => {
      const angle = (i / graph.nodes.length) * Math.PI * 2;
      const radius = Math.min(cx, cy) * 0.75;
      const jitter = (Math.random() - 0.5) * 60;
      return { x: cx + Math.cos(angle) * (radius + jitter), y: cy + Math.sin(angle) * (radius + jitter), node };
    });
  }, [graph, width, height]);
  return positions;
}

export default function NetworkGraphPage() {
  const API_URL = useMemo(resolveApiUrl, []);
  const [graph, setGraph] = useState<NetworkGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [contactDetail, setContactDetail] = useState<Contact | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [revenueMin, setRevenueMin] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const W = 900;
  const H = 600;
  const positions = useGraph(graph, W, H);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.set("role", roleFilter);
      if (revenueMin > 0) params.set("revenue_min", String(revenueMin));
      const res = await fetch(`${API_URL}/network/graph?${params}`, { cache: "no-store" });
      if (res.ok) setGraph(await res.json());
    } finally {
      setLoading(false);
    }
  }, [API_URL, roleFilter, revenueMin]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph || !positions.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f1117";
    ctx.fillRect(0, 0, W, H);

    // Draw edges
    const posMap = new Map(positions.map(p => [p.node.id, p]));
    for (const edge of graph.edges) {
      const src = posMap.get(edge.source);
      const tgt = posMap.get(edge.target);
      if (!src || !tgt) continue;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = `rgba(139,92,246,${Math.min(0.7, 0.15 + edge.strength * 0.3)})`;
      ctx.lineWidth = Math.max(0.5, edge.strength);
      ctx.stroke();
    }

    // Draw nodes
    for (const { x, y, node } of positions) {
      const r = node.size * 0.45;
      const colorGroup = getRoleColorGroup(node);
      const color = COLOR_MAP[colorGroup] || COLOR_MAP.other;
      const isSelected = selectedNode?.id === node.id;

      // Glow for selected
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = color + "33";
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color + (isSelected ? "ff" : "cc");
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#fff" : color + "66";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = isSelected ? "#fff" : "#9ca3af";
      ctx.font = `${isSelected ? "bold " : ""}${Math.min(11, r * 0.9)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(node.label.split(" ")[0], x, y + r + 12);
    }
  }, [graph, positions, selectedNode]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);

    let closest: NodePos | null = null;
    let minDist = 30;
    for (const p of positions) {
      const d = Math.hypot(mx - p.x, my - p.y);
      if (d < minDist) { minDist = d; closest = p; }
    }
    if (closest) {
      setSelectedNode(closest.node);
      fetch(`${API_URL}/contacts/${closest.node.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setContactDetail(d));
    } else {
      setSelectedNode(null);
      setContactDetail(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text">Network Graph</h2>
          <p className="text-sm text-muted mt-1">Trammell Crow-style relationship web. Click any node to explore.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); }}
            className="rounded-lg border border-soft bg-panel px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/60">
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <input type="number" placeholder="Min Revenue $" value={revenueMin || ""}
            onChange={e => setRevenueMin(Number(e.target.value))}
            className="w-36 rounded-lg border border-soft bg-panel px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent/60"
          />
          <button onClick={fetchGraph} className="rounded-lg bg-accent/20 border border-accent/40 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/30 transition">
            Refresh
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {Object.entries(COLOR_MAP).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-muted capitalize">{key}</span>
          </div>
        ))}
        <span className="text-muted">· Node size = lifetime value · Edge thickness = relationship strength</span>
      </div>

      <div className="flex gap-6">
        {/* Canvas */}
        <div className="flex-1 rounded-xl border border-soft overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-[400px] text-muted text-sm">Loading network…</div>
          ) : !graph || graph.nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-center">
              <p className="text-muted text-sm">No contacts in graph yet.</p>
              <p className="text-muted text-xs mt-2">Add contacts and relationship edges to populate the network.</p>
            </div>
          ) : (
            <canvas
              ref={canvasRef} width={W} height={H}
              onClick={handleCanvasClick}
              className="cursor-pointer w-full"
              style={{ aspectRatio: `${W}/${H}` }}
            />
          )}
        </div>

        {/* Side panel */}
        {selectedNode && (
          <div className="w-72 shrink-0 rounded-xl border border-accent/40 bg-panel p-5 space-y-4 overflow-y-auto max-h-[600px]">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLOR_MAP[getRoleColorGroup(selectedNode)] || "#6b7280" }} />
                <h3 className="font-semibold text-text">{selectedNode.label}</h3>
              </div>
              <p className="text-xs text-muted">{selectedNode.role_label || formatRole(selectedNode.role)}</p>
              {selectedNode.market_segment && selectedNode.market_segment !== "general" ? (
                <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">{selectedNode.market_segment.replace(/_/g, " ")}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ["Lifetime Value", `$${selectedNode.lifetime_value.toLocaleString()}`],
                ["Deals", selectedNode.deal_count],
                ["Strength", selectedNode.relationship_strength_score.toFixed(1)],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-lg bg-base border border-soft p-2">
                  <p className="text-xs text-muted">{k as string}</p>
                  <p className="text-sm font-semibold text-text">{String(v)}</p>
                </div>
              ))}
            </div>

            {contactDetail && (
              <div className="space-y-2 text-sm">
                {contactDetail.email && <p className="text-muted">{contactDetail.email}</p>}
                {contactDetail.phone && <p className="text-muted">{contactDetail.phone}</p>}
                {contactDetail.relationship_stage && (
                  <p className="text-muted capitalize">Stage: <span className="text-text">{contactDetail.relationship_stage}</span></p>
                )}
                {contactDetail.notes_summary && (
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-muted text-xs">{contactDetail.notes_summary}</p>
                  </div>
                )}
                {contactDetail.ai_profile_summary && (
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide mb-1">AI Summary</p>
                    <p className="text-muted text-xs">{contactDetail.ai_profile_summary}</p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-soft space-y-2">
              <button className="w-full rounded-lg bg-accent/10 border border-accent/30 px-3 py-2 text-xs text-accent hover:bg-accent/20 transition">
                View Full Profile
              </button>
              <button className="w-full rounded-lg bg-soft/30 border border-soft px-3 py-2 text-xs text-muted hover:text-text transition">
                Create Deal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      {graph && (
        <div className="flex gap-6 text-sm text-muted">
          <span><span className="text-text font-semibold">{graph.nodes.length}</span> nodes</span>
          <span><span className="text-text font-semibold">{graph.edges.length}</span> connections</span>
          {graph.nodes.length > 0 && (
            <span>
              <span className="text-text font-semibold">
                ${graph.nodes.reduce((s, n) => s + n.lifetime_value, 0).toLocaleString()}
              </span> total network value
            </span>
          )}
        </div>
      )}
    </div>
  );
}
