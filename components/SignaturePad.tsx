"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Draw or type a signature, the way Adobe and SignNow do it.
//
// Carl: "i did expect the document to open in browser and then the user can
// sign as though they might on Adobe or SignNow or QuicklySign."
//
// Both modes end up as the same thing: a transparent PNG of a dark mark. The
// document does not care which one it was, and a reader should not be able to
// tell a typed signature from a drawn one by how it is stored.
// ---------------------------------------------------------------------------

// Drawn at twice the displayed size so the mark is not a blurry mess in the
// Word file or on a printed page.
const SCALE = 2;
const W = 520;
const H = 160;

interface Props {
  /** Prefilled into the typed mode: their own name is what they would write. */
  name: string;
  onChange: (value: { dataUrl: string; kind: "drawn" | "typed" } | null) => void;
}

export default function SignaturePad({ name, onChange }: Props) {
  const [mode, setMode] = useState<"drawn" | "typed">("drawn");
  const [typed, setTyped] = useState(name);
  const [hasMark, setHasMark] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  function ctx(): CanvasRenderingContext2D | null {
    const c = canvas.current;
    if (!c) return null;
    const g = c.getContext("2d");
    if (!g) return null;
    g.lineWidth = 2.5 * SCALE;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#1a1a2e";
    return g;
  }

  function clear() {
    const g = ctx();
    if (!g || !canvas.current) return;
    g.clearRect(0, 0, canvas.current.width, canvas.current.height);
    setHasMark(false);
    onChange(null);
  }

  // Where the pointer is ON THE CANVAS, not on the page. Reading offsetX would
  // be wrong the moment the canvas is scaled or the page is scrolled, and the
  // mark would land somewhere other than under the finger.
  function pointAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvas.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    // Captured, so a stroke that leaves the box still finishes cleanly instead
    // of leaving the pad stuck in a drawing state.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointAt(e);
    // A single tap is a full stop, and a full stop is a legitimate mark.
    const g = ctx();
    if (g && last.current) {
      g.beginPath();
      g.arc(last.current.x, last.current.y, 1.25 * SCALE, 0, Math.PI * 2);
      g.fillStyle = "#1a1a2e";
      g.fill();
    }
    setHasMark(true);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const g = ctx();
    const p = pointAt(e);
    if (!g || !last.current) return;
    g.beginPath();
    g.moveTo(last.current.x, last.current.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    emitDrawn();
  }

  function emitDrawn() {
    const c = canvas.current;
    if (!c || !hasMark) return;
    onChange({ dataUrl: c.toDataURL("image/png"), kind: "drawn" });
  }

  // The typed mark is rendered to a canvas too, so the server receives one kind
  // of thing and the Word file embeds one kind of thing.
  useEffect(() => {
    if (mode !== "typed") return;
    const c = document.createElement("canvas");
    c.width = W * SCALE;
    c.height = H * SCALE;
    const g = c.getContext("2d");
    if (!g) return;
    const text = typed.trim();
    if (!text) {
      onChange(null);
      return;
    }
    g.fillStyle = "#1a1a2e";
    g.textBaseline = "middle";
    // Shrunk to fit rather than clipped: a long name silently losing its last
    // few letters would be a signature that is not the person's name.
    let size = 64 * SCALE;
    do {
      g.font = `italic ${size}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
      if (g.measureText(text).width <= c.width - 40 * SCALE) break;
      size -= 2 * SCALE;
    } while (size > 16 * SCALE);
    g.fillText(text, 20 * SCALE, c.height / 2);
    onChange({ dataUrl: c.toDataURL("image/png"), kind: "typed" });
    // onChange is a fresh closure each render; depending on it would re-run
    // this on every keystroke of the parent, not of this field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typed]);

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {(["drawn", "typed"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              if (m === "drawn") {
                clear();
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              mode === m
                ? "bg-primary text-white border-primary"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {m === "drawn" ? "Draw it" : "Type it"}
          </button>
        ))}
      </div>

      {mode === "drawn" ? (
        <div>
          <canvas
            ref={canvas}
            width={W * SCALE}
            height={H * SCALE}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            // touch-none, or a finger drag scrolls the page instead of drawing.
            className="w-full max-w-xl h-40 rounded-lg border-2 border-dashed border-gray-300 bg-white touch-none cursor-crosshair"
          />
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={clear}
              className="text-xs text-gray-500 hover:text-dark"
            >
              Clear
            </button>
            <span className="text-xs text-gray-400">
              {hasMark ? "Sign with a mouse, a finger or a stylus." : "Sign in the box above."}
            </span>
          </div>
        </div>
      ) : (
        <div>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Your name"
            className="w-full max-w-xl px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
          />
          <div
            className="mt-2 w-full max-w-xl h-40 rounded-lg border-2 border-dashed border-gray-300 bg-white flex items-center px-5 overflow-hidden"
            aria-hidden
          >
            <span
              className="text-dark italic whitespace-nowrap"
              style={{
                fontFamily: '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive',
                fontSize: "clamp(20px, 6vw, 56px)",
              }}
            >
              {typed.trim() || "Your name"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
