import React, { useMemo, useRef, useState } from "react";

// Plano MVP — Drag + Snap + Measure (Width × Height × Depth + Container Depth + Qty Validation)
// - Drag to move; bottom-right handle to resize (snaps to grid)
// - Toggle "Measure" to draw a measurement box (W×H in cm)
// - Each item has Depth (cm) and Quantity
// - Container depth (cm) defined on toolbar
// - If qty × item.depth > containerDepth => error ring + badge, plus global banner
// - Units: default 10 px = 1 cm (changeable from toolbar)

const GRID_SIZE_DEFAULT = 20; // px
const DEFAULT_PX_PER_CM = 10; // px per cm

function snap(value, grid) {
  return Math.round(value / grid) * grid;
}

function withinHandle(x, y, item) {
  const handleSize = 14; // px
  return (
    x >= item.x + item.w - handleSize &&
    x <= item.x + item.w &&
    y >= item.y + item.h - handleSize &&
    y <= item.y + item.h
  );
}

function cm(px, pxPerCm) {
  return (px / pxPerCm).toFixed(1);
}

export default function PlanoMVP() {
  const stageRef = useRef(null);
  const [gridSize, setGridSize] = useState(GRID_SIZE_DEFAULT);
  const [pxPerCm, setPxPerCm] = useState(DEFAULT_PX_PER_CM);
  const [containerDepth, setContainerDepth] = useState(40); // cm
  const [measureMode, setMeasureMode] = useState(false);

  const [items, setItems] = useState([
    { id: "A", name: "Box A", x: 60,  y: 60,  w: 160, h: 120, depth: 30, qty: 1, color: "#22d3ee" },
    { id: "B", name: "Box B", x: 280, y: 60,  w: 120, h: 160, depth: 20, qty: 1, color: "#ef4444" },
  ]);
  const [selectedId, setSelectedId] = useState("A");

  const [drag, setDrag] = useState(null); // { id, offsetX, offsetY, resizing }
  const [measure, setMeasure] = useState({ active: false, x: 0, y: 0, w: 0, h: 0 });

  const selected = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  const depthExceeded = (it) => (it.qty || 0) * (it.depth || 0) > containerDepth;

  // Mouse handlers on the stage
  const onPointerDown = (e) => {
    const rect = stageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (measureMode) {
      setMeasure({ active: true, x, y, w: 0, h: 0 });
      return;
    }

    // Check if clicked on an item (top-most)
    const topItem = [...items].reverse().find((it) => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h);
    if (topItem) {
      setSelectedId(topItem.id);
      const resizing = withinHandle(x, y, topItem);
      setDrag({ id: topItem.id, offsetX: x - topItem.x, offsetY: y - topItem.y, resizing });
    } else {
      setSelectedId(null);
    }
  };

  const onPointerMove = (e) => {
    const rect = stageRef.current.getBoundingClientRect();
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
    setDrag(null);
  };

  // Cursor style updates (resize cursor near handle)
  const onPointerMoveStage = (e) => {
    const rect = stageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (measureMode) {
      stageRef.current.style.cursor = "crosshair";
      return;
    }

    const topItem = [...items].reverse().find((it) => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h);
    if (topItem && withinHandle(x, y, topItem)) {
      stageRef.current.style.cursor = "nwse-resize";
    } else if (topItem) {
      stageRef.current.style.cursor = "grab";
    } else {
      stageRef.current.style.cursor = "default";
    }
  };

  // Grid background via CSS gradients
  const gridBg = useMemo(
    () => ({
      backgroundImage: `
        linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)
      `,
      backgroundSize: `${gridSize}px ${gridSize}px`,
    }),
    [gridSize]
  );

  // Update helpers
  const updateDepth = (depth) => {
    setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, depth } : it)));
  };
  const updateQty = (qty) => {
    setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, qty } : it)));
  };
  const updateName = (name) => {
    setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, name } : it)));
  };

  const addItem = () => {
    const num = items.length + 1;
    const colorPool = ["#22d3ee", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#3b82f6"];
    setItems((prev) => [
      ...prev,
      {
        id: `N${num}`,
        name: `Box ${num}`,
        x: snap(40 + num * 24, gridSize),
        y: snap(200 + (num % 3) * 24, gridSize),
        w: snap(120, gridSize),
        h: snap(80, gridSize),
        depth: 25,
        qty: 1,
        color: colorPool[num % colorPool.length],
      },
    ]);
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
            style={gridBg}
          >
            {/* Items */}
            {items.map((it) => (
              <div
                key={it.id}
                className={`absolute rounded-xl shadow-md ${
                  selectedId === it.id
                    ? "ring-2 ring-cyan-400"
                    : depthExceeded(it)
                    ? "ring-2 ring-red-500"
                    : "ring-1 ring-slate-700"
                }`}
                style={{
                  left: it.x,
                  top: it.y,
                  width: it.w,
                  height: it.h,
                  backgroundColor: it.color + "22",
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="absolute left-2 top-2 text-[11px] px-2 py-0.5 rounded-full bg-slate-900/70 border border-slate-700">
                  {it.name}
                </div>
                {/* Size pill */}
                <div className="absolute right-2 bottom-2 text-[11px] px-2 py-0.5 rounded-full bg-slate-900/70 border border-slate-700">
                  {cm(it.w, pxPerCm)}cm × {cm(it.h, pxPerCm)}cm × {it.depth}cm • qty {it.qty}
                </div>
                {/* Error badge if depth exceeded */}
                {depthExceeded(it) && (
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
            ))}

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
                  {cm(Math.abs(measure.w), pxPerCm)}cm × {cm(Math.abs(measure.h), pxPerCm)}cm
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

            <div className="pt-2">
              <div className="text-sm font-semibold mb-2">Export (JSON)</div>
              <pre className="text-xs bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-auto max-h-64 whitespace-pre-wrap">
                {JSON.stringify({ pxPerCm, gridSize, containerDepth, items }, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Global validation banner */}
      {items.some((it) => depthExceeded(it)) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-red-600/90 border border-red-300 shadow">
          <span className="font-semibold">Depth errors:</span>{" "}
          {items.filter((it) => depthExceeded(it)).map((it) => it.name).join(", ")}
        </div>
      )}
    </div>
  );
}
