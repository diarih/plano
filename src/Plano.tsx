import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

// Plano MVP — Drag + Snap + Measure (Width × Height × Depth + Container Depth + Qty Validation)
// - Drag to move; bottom-right handle to resize (snaps to grid)
// - Toggle "Measure" to draw a measurement box (W×H in cm)
// - Each item has Depth (cm) and Quantity
// - Container depth (cm) defined on toolbar
// - If qty × item.depth > containerDepth => error ring + badge, plus global banner
// - Units: default 10 px = 1 cm (changeable from toolbar)

const GRID_SIZE_DEFAULT = 20; // px
const DEFAULT_PX_PER_CM = 10; // px per cm

type PlanoItem = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  qty: number;
  color: string;
};

type DragState =
  | {
      id: string;
      offsetX: number;
      offsetY: number;
      resizing: boolean;
    }
  | null;

type MeasureState = {
  active: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
};

type StageSize = {
  width: number;
  height: number;
};

function snap(value: number, grid: number) {
  return Math.round(value / grid) * grid;
}

function withinHandle(x: number, y: number, item: PlanoItem) {
  const handleSize = 14; // px
  return (
    x >= item.x + item.w - handleSize &&
    x <= item.x + item.w &&
    y >= item.y + item.h - handleSize &&
    y <= item.y + item.h
  );
}

function cm(px: number, pxPerCm: number) {
  return (px / pxPerCm).toFixed(1);
}

export default function PlanoMVP() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [gridSize, setGridSize] = useState<number>(GRID_SIZE_DEFAULT);
  const [pxPerCm, setPxPerCm] = useState<number>(DEFAULT_PX_PER_CM);
  const [containerDepth, setContainerDepth] = useState<number>(40); // cm
  const [measureMode, setMeasureMode] = useState<boolean>(false);
  const [rowCount, setRowCount] = useState<number>(3);
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 });

  const [items, setItems] = useState<PlanoItem[]>([
    { id: "A", name: "Box A", x: 60,  y: 60,  w: 160, h: 120, depth: 30, qty: 1, color: "#22d3ee" },
    { id: "B", name: "Box B", x: 280, y: 60,  w: 120, h: 160, depth: 20, qty: 1, color: "#ef4444" },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>("A");

  const [drag, setDrag] = useState<DragState>(null); // { id, offsetX, offsetY, resizing }
  const [measure, setMeasure] = useState<MeasureState>({ active: false, x: 0, y: 0, w: 0, h: 0 });

  const selected = useMemo<PlanoItem | null>(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  const depthExceeded = useCallback(
    (it: PlanoItem) => (it.qty || 0) * (it.depth || 0) > containerDepth,
    [containerDepth]
  );

  useEffect(() => {
    const measure = () => {
      if (!stageRef.current) return;
      const { width, height } = stageRef.current.getBoundingClientRect();
      setStageSize((prev) => {
        if (Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) {
          return prev;
        }
        return { width, height };
      });
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver((entries) => {
      entries.forEach(({ contentRect }) => {
        const { width, height } = contentRect;
        setStageSize((prev) => {
          if (Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) {
            return prev;
          }
          return { width, height };
        });
      });
    });

    if (stageRef.current) {
      observer.observe(stageRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const alignItemToRows = useCallback(
    (item: PlanoItem, stageHeight?: number) => {
      if (!stageHeight || rowCount <= 0) return item;
      const rowHeight = stageHeight / rowCount;
      const itemBottom = item.y + item.h;
      const rawRow = Math.ceil(itemBottom / rowHeight) - 1;
      const rowIndex = Math.max(0, Math.min(rowCount - 1, rawRow));
      const baseline = Math.min(stageHeight, rowHeight * (rowIndex + 1));
      const newY = Math.max(0, baseline - item.h);
      if (Math.abs(newY - item.y) < 0.01) {
        return item;
      }
      return { ...item, y: newY };
    },
    [rowCount]
  );

  useEffect(() => {
    if (!stageSize.height) return;
    setItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        const aligned = alignItemToRows(it, stageSize.height);
        if (aligned !== it) {
          changed = true;
        }
        return aligned;
      });
      return changed ? next : prev;
    });
  }, [alignItemToRows, stageSize.height]);

  const rowHeightPx = useMemo(
    () => (rowCount > 0 && stageSize.height ? stageSize.height / rowCount : null),
    [rowCount, stageSize.height]
  );

  const isHeightExceeded = useCallback(
    (item: PlanoItem) => rowHeightPx !== null && item.h > rowHeightPx + 0.01,
    [rowHeightPx]
  );

  const heightAlerts = useMemo<PlanoItem[]>(
    () => (rowHeightPx === null ? [] : items.filter((it) => isHeightExceeded(it))),
    [isHeightExceeded, items, rowHeightPx]
  );

  const depthAlerts = useMemo<PlanoItem[]>(
    () => items.filter((it) => depthExceeded(it)),
    [depthExceeded, items]
  );

  // Mouse handlers on the stage
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (measureMode) {
      setMeasure({ active: true, x, y, w: 0, h: 0 });
      return;
    }

    // Check if clicked on an item (top-most)
    const topItem = [...items]
      .reverse()
      .find((it) => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h);
    if (topItem) {
      setSelectedId(topItem.id);
      const resizing = withinHandle(x, y, topItem);
      setDrag({ id: topItem.id, offsetX: x - topItem.x, offsetY: y - topItem.y, resizing });
    } else {
      setSelectedId(null);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (measureMode && measure.active) {
      setMeasure((m) => ({ ...m, w: x - m.x, h: y - m.y }));
      return;
    }

    if (!drag) return;
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== drag.id) return it;
        if (drag.resizing) {
          // resize — keep min size 20×20, snap as we go
          const newW = Math.max(20, x - it.x);
          const newH = Math.max(20, y - it.y);
          return { ...it, w: snap(newW, gridSize), h: snap(newH, gridSize) };
        } else {
          // move — maintain grab offset, snap as we go
          const newX = x - drag.offsetX;
          const newY = y - drag.offsetY;
          return { ...it, x: snap(newX, gridSize), y: snap(newY, gridSize) };
        }
      })
    );
  };

  const onPointerUp = () => {
    if (measureMode && measure.active) {
      // Finalize measurement with snapping for display
      setMeasure((m) => ({ ...m, w: snap(m.w, gridSize), h: snap(m.h, gridSize), active: false }));
      return;
    }
    if (drag && stageSize.height) {
      setItems((prev) =>
        prev.map((it) => (it.id === drag.id ? alignItemToRows(it, stageSize.height) : it))
      );
    }
    setDrag(null);
  };

  // Cursor style updates (resize cursor near handle)
  const onPointerMoveStage = (e: PointerEvent<HTMLDivElement>) => {
    const stageEl = stageRef.current;
    const rect = stageEl?.getBoundingClientRect();
    if (!rect || !stageEl) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (measureMode) {
      stageEl.style.cursor = "crosshair";
      return;
    }

    const topItem = [...items]
      .reverse()
      .find((it) => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h);
    if (topItem && withinHandle(x, y, topItem)) {
      stageEl.style.cursor = "nwse-resize";
    } else if (topItem) {
      stageEl.style.cursor = "grab";
    } else {
      stageEl.style.cursor = "default";
    }
  };

  // Grid background via CSS gradients
  const stageBackground = useMemo(() => {
    const images = [
      `linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px)`,
      `linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)`,
    ];
    const sizes = [`${gridSize}px ${gridSize}px`, `${gridSize}px ${gridSize}px`];

    if (rowCount > 0) {
      images.unshift(`linear-gradient(to bottom, rgba(148,163,184,0.35) 1px, transparent 1px)`);
      sizes.unshift(`100% ${100 / rowCount}%`);
    }

    return {
      backgroundImage: images.join(","),
      backgroundSize: sizes.join(","),
      backgroundRepeat: "repeat",
    };
  }, [gridSize, rowCount]);

  // Update helpers
  const updateDepth = (depth: number) => {
    setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, depth } : it)));
  };
  const updateQty = (qty: number) => {
    setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, qty } : it)));
  };
  const updateName = (name: string) => {
    setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, name } : it)));
  };

  const addItem = () => {
    const num = items.length + 1;
    const colorPool = ["#22d3ee", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#3b82f6"];
    const stageHeight = stageRef.current?.getBoundingClientRect().height ?? stageSize.height;
    const baseItem = {
      id: `N${num}`,
      name: `Box ${num}`,
      x: snap(40 + num * 24, gridSize),
      y: snap(200 + (num % 3) * 24, gridSize),
      w: snap(120, gridSize),
      h: snap(80, gridSize),
      depth: 25,
      qty: 1,
      color: colorPool[num % colorPool.length],
    };
    const alignedItem = alignItemToRows(baseItem, stageHeight);
    setItems((prev) => [...prev, alignedItem]);
    setSelectedId(`N${num}`);
  };

  const removeSelected = () => {
    if (!selected) return;
    setItems((prev) => prev.filter((it) => it.id !== selected.id));
    setSelectedId(null);
  };

  return (
    <div className="w-full h-full min-h-screen bg-slate-900 text-slate-100">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 w-full border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 py-3 flex items-center gap-3">
        <div className="text-lg font-semibold">Plano MVP</div>
        <div className="mx-2 h-6 w-px bg-slate-700" />
        <label className="text-sm flex items-center gap-2">
          Grid: {gridSize}px
          <input
            type="range"
            min={10}
            max={40}
            step={2}
            className="accent-cyan-400"
            value={gridSize}
            onChange={(e) => setGridSize(parseInt(e.target.value))}
          />
        </label>
        <label className="text-sm flex items-center gap-2">
          Scale: 1 cm =
          <input
            type="number"
            className="w-16 rounded bg-slate-800 px-2 py-1 border border-slate-700"
            value={pxPerCm}
            min={2}
            onChange={(e) =>
              setPxPerCm(Math.max(2, parseFloat(e.target.value) || DEFAULT_PX_PER_CM))
            }
          />
          px
        </label>
        <label className="text-sm flex items-center gap-2">
          Container depth:
          <input
            type="number"
            className="w-20 rounded bg-slate-800 px-2 py-1 border border-slate-700"
            value={containerDepth}
            min={1}
            onChange={(e) =>
              setContainerDepth(Math.max(1, parseFloat(e.target.value) || 1))
            }
          />
          cm
        </label>
        <label className="text-sm flex items-center gap-2">
          Rows:
          <input
            type="number"
            className="w-16 rounded bg-slate-800 px-2 py-1 border border-slate-700"
            value={rowCount}
            min={1}
            max={12}
            onChange={(e) =>
              setRowCount(
                Math.min(12, Math.max(1, parseInt(e.target.value) || 1))
              )
            }
          />
        </label>
        <div className="mx-2 h-6 w-px bg-slate-700" />
        <button
          onClick={() => setMeasureMode((v) => !v)}
          className={`px-3 py-1.5 rounded-xl text-sm border ${
            measureMode ? "bg-cyan-500/20 border-cyan-500" : "bg-slate-800 border-slate-700"
          }`}
        >
          {measureMode ? "Measuring… (drag)" : "Measure"}
        </button>
        <button
          onClick={addItem}
          className="px-3 py-1.5 rounded-xl text-sm border bg-slate-800 border-slate-700"
        >
          + Add Box
        </button>
        <button
          onClick={removeSelected}
          className="px-3 py-1.5 rounded-xl text-sm border bg-slate-800 border-slate-700 disabled:opacity-40"
          disabled={!selected}
        >
          Delete Selected
        </button>
        <div className="ml-auto text-xs opacity-70">
          Drag to move • Corner to resize • Snap on grid
        </div>
      </div>

      {/* Main area */}
      <div className="grid grid-cols-12 gap-0">
        {/* Stage */}
        <div className="col-span-9 p-6">
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={(e) => {
              onPointerMoveStage(e);
              onPointerMove(e);
            }}
            onPointerUp={onPointerUp}
            className="relative w-full h-[70vh] rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden"
            style={stageBackground}
          >
            {rowCount > 0 && (
              <div className="pointer-events-none absolute inset-0">
                {Array.from({ length: rowCount }).map((_, idx) => (
                  <div
                    key={`shelf-row-${idx}`}
                    className="absolute left-0 right-0 border-t border-slate-800/70"
                    style={{
                      top: `${((idx + 1) / rowCount) * 100}%`,
                      transform: "translateY(-0.5px)",
                    }}
                  />
                ))}
              </div>
            )}
            {/* Items */}
            {items.map((it) => {
              const selectedMatch = selectedId === it.id;
              const depthError = depthExceeded(it);
              const heightError = isHeightExceeded(it);
              const hasAnyError = depthError || heightError;

              const ringClasses = selectedMatch
                ? hasAnyError
                  ? "ring-2 ring-red-500 outline outline-2 outline-offset-2 outline-cyan-400"
                  : "ring-2 ring-cyan-400"
                : depthError
                ? "ring-2 ring-red-500"
                : heightError
                ? "ring-2 ring-red-400"
                : "ring-1 ring-slate-700";

              return (
                <div
                  key={it.id}
                  className={`absolute rounded-xl ${ringClasses}`}
                  style={{
                    left: it.x,
                    top: it.y,
                    width: it.w,
                    height: it.h,
                    backgroundColor: `${it.color}22`,
                    boxShadow: heightError
                      ? "0 0 0 2px rgba(248,113,113,0.55), 0 0 22px rgba(248,113,113,0.45)"
                      : "0 10px 15px -3px rgba(15,23,42,0.35), 0 4px 6px -4px rgba(15,23,42,0.45)",
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="absolute left-2 top-2 text-[11px] px-2 py-0.5 rounded-full bg-slate-900/70 border border-slate-700">
                    {it.name}
                  </div>
                  {/* Size pill */}
                  <div className="absolute right-2 bottom-2 text-[11px] px-2 py-0.5 rounded-full bg-slate-900/70 border border-slate-700">
                    {cm(it.w, pxPerCm)}cm x {cm(it.h, pxPerCm)}cm x {it.depth}cm | qty {it.qty}
                  </div>
                  {/* Height badge */}
                  {heightError && (
                    <div className="absolute left-1/2 -translate-x-1/2 -top-9 text-[11px] px-2 py-0.5 rounded bg-red-500 border border-red-200 shadow">
                      TOO TALL FOR ROW
                    </div>
                  )}
                  {/* Error badge if depth exceeded */}
                  {depthError && (
                    <div className="absolute left-1/2 -translate-x-1/2 -top-5 text-[11px] px-2 py-0.5 rounded bg-red-600 border border-red-400 shadow">
                      DEPTH EXCEEDED
                    </div>
                  )}
                  {/* Resize handle */}
                  <div
                    className="absolute w-3.5 h-3.5 right-0 bottom-0 translate-x-1/2 translate-y-1/2 rounded bg-cyan-400 border border-cyan-300"
                    style={{ boxShadow: "0 0 0 2px rgba(15,23,42,0.9)" }}
                  />
                </div>
              );
            })}
            {/* Measurement overlay */}
            {(measure.active || (measure.w !== 0 && measure.h !== 0)) && (
              <div
                className="absolute border-2 border-cyan-400/80 bg-cyan-400/10 rounded"
                style={{
                  left: Math.min(measure.x, measure.x + measure.w),
                  top: Math.min(measure.y, measure.y + measure.h),
                  width: Math.abs(measure.w),
                  height: Math.abs(measure.h),
                }}
              >
                <div className="absolute -top-6 left-0 text-xs px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700">
                  {cm(Math.abs(measure.w), pxPerCm)}cm x {cm(Math.abs(measure.h), pxPerCm)}cm
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Inspector */}
        <div className="col-span-3 p-6 border-l border-slate-800">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold mb-2">Inspector</div>
              {selected ? (
                <div className="space-y-3">
                  <div className="text-xs opacity-70">ID: {selected.id}</div>
                  <label className="block text-sm">
                    <span className="block mb-1 opacity-80">Name</span>
                    <input
                      className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2"
                      value={selected.name}
                      onChange={(e) => updateName(e.target.value)}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs opacity-70 mb-1">X / Y</div>
                      <div className="text-sm">
                        {selected.x}px / {selected.y}px
                      </div>
                    </div>
                    <div>
                      <div className="text-xs opacity-70 mb-1">W × H</div>
                      <div className="text-sm">
                        {selected.w}px × {selected.h}px
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-xs opacity-70 mb-1">Size (cm)</div>
                      <div className="text-sm">
                        {cm(selected.w, pxPerCm)} × {cm(selected.h, pxPerCm)} × {selected.depth}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="block mb-1 opacity-80">Depth (cm)</span>
                      <input
                        type="number"
                        min={1}
                        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2"
                        value={selected.depth}
                        onChange={(e) =>
                          updateDepth(Math.max(0, parseFloat(e.target.value) || 0))
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="block mb-1 opacity-80">Quantity</span>
                      <input
                        type="number"
                        min={0}
                        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2"
                        value={selected.qty ?? 0}
                        onChange={(e) =>
                          updateQty(Math.max(0, parseInt(e.target.value) || 0))
                        }
                      />
                    </label>
                  </div>
                  {depthExceeded(selected) && (
                    <div className="text-xs text-red-400 bg-red-950/40 border border-red-700 rounded-xl px-3 py-2">
                      Total depth <span className="font-mono">(qty × depth)</span> ={" "}
                      {selected.qty * selected.depth}cm exceeds container depth {containerDepth}cm.
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm opacity-70">No selection. Click a box to edit.</div>
              )}
            </div>

            {(heightAlerts.length > 0 || depthAlerts.length > 0) && (
              <div className="pt-2 space-y-3">
                <div className="text-sm font-semibold">Error Logs</div>
                <div className="space-y-3 text-xs">
                  {heightAlerts.length > 0 && (
                    <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2">
                      <div className="font-semibold text-red-200">Height</div>
                      <div className="mt-1 space-y-1">
                        {heightAlerts.map((it) => (
                          <div key={`height-${it.id}`}>
                            <span className="font-semibold">{it.name}</span> is {cm(it.h, pxPerCm)}cm tall
                            {rowHeightPx !== null
                              ? ` (row limit ${cm(rowHeightPx, pxPerCm)}cm)`
                              : ""}. Adjust size or row configuration.
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {depthAlerts.length > 0 && (
                    <div className="rounded-xl border border-red-500/40 bg-red-950/30 px-3 py-2">
                      <div className="font-semibold text-red-200">Depth</div>
                      <div className="mt-1 space-y-1">
                        {depthAlerts.map((it) => (
                          <div key={`depth-${it.id}`}>
                            <span className="font-semibold">{it.name}</span> total depth{" "}
                            {(it.qty || 0) * (it.depth || 0)}cm exceeds container limit {containerDepth}cm.
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-2">
              <div className="text-sm font-semibold mb-2">Export (JSON)</div>
              <pre className="text-xs bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-auto max-h-64 whitespace-pre-wrap">
                {JSON.stringify({ pxPerCm, gridSize, containerDepth, rowCount, items }, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Global validation banner */}
      {(heightAlerts.length > 0 || depthAlerts.length > 0) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-red-600/90 border border-red-300 shadow">
          {heightAlerts.length > 0 && (
            <div>
              <span className="font-semibold">Height issues:</span>{" "}
              {heightAlerts.map((it) => it.name).join(", ")}
            </div>
          )}
          {depthAlerts.length > 0 && (
            <div>
              <span className="font-semibold">Depth issues:</span>{" "}
              {depthAlerts.map((it) => it.name).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
