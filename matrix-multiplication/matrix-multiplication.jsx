import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Lightbulb, Target, Sparkles, Layers } from "lucide-react";

// ============================================================
// THEME — Blueprint
// ============================================================
const THEME = {
  bg: '#0a1628',
  surface: '#11243f',
  surfaceLight: '#1a3056',
  text: '#e8f0f7',
  muted: '#8aa3c3',
  accent: '#5eb1ff',       // i-hat / column 1
  highlight: '#ff9b5c',    // j-hat / column 2
  vector: '#7dd3a8',       // arbitrary vector v
  grid: '#1c3253',
  gridStrong: '#2d4a73',
  border: '#2a4061',
  ok: '#7dd3a8',
  hint: '#f5d76e',
  data1: '#5eb1ff',
  data2: '#ff9b5c',
};

// ============================================================
// MATH HELPERS
// ============================================================
const apply = (M, v) => [M.a * v[0] + M.b * v[1], M.c * v[0] + M.d * v[1]];
const det = (M) => M.a * M.d - M.b * M.c;
const fmt = (n) => (Math.abs(n) < 0.005 ? '0.00' : (n >= 0 ? ' ' : '') + n.toFixed(2));
const snap = (v, step = 0.05) => Math.round(v / step) * step;

// 45° clockwise rotation — the challenge target
const TARGET = {
  a: Math.SQRT1_2,
  b: Math.SQRT1_2,
  c: -Math.SQRT1_2,
  d: Math.SQRT1_2,
};

// F-shape outline (centered near origin)
const F_OUTLINE = [
  [-1.4, -2.1], [-0.55, -2.1], [-0.55, 0.2], [0.55, 0.2], [0.55, 0.7],
  [-0.55, 0.7], [-0.55, 1.5], [1.3, 1.5], [1.3, 2.1], [-1.4, 2.1],
];

// Sample "data points" for ML reveal viz
const DATA_DOTS = [
  { pos: [1.2, 0.4], color: THEME.data1 },
  { pos: [1.5, 0.9], color: THEME.data1 },
  { pos: [0.9, 0.2], color: THEME.data1 },
  { pos: [1.7, 0.6], color: THEME.data1 },
  { pos: [1.3, 1.1], color: THEME.data1 },
  { pos: [-1.1, -0.5], color: THEME.data2 },
  { pos: [-1.5, -0.9], color: THEME.data2 },
  { pos: [-0.8, -0.3], color: THEME.data2 },
  { pos: [-1.7, -0.7], color: THEME.data2 },
  { pos: [-1.3, -1.1], color: THEME.data2 },
];

// ============================================================
// SVG GRID — drawn inside a y-flipped <g> so we use math coords
// ============================================================
function TransformedGrid({ M, range = 6, faded = false }) {
  const lines = useMemo(() => {
    const arr = [];
    for (let k = -range; k <= range; k++) {
      const isAxis = k === 0;
      const sw = isAxis ? 0.05 : 0.025;
      const op = (isAxis ? 0.85 : 0.4) * (faded ? 0.35 : 1);
      const stroke = isAxis ? THEME.muted : THEME.gridStrong;
      const v1 = apply(M, [k, -range]);
      const v2 = apply(M, [k, range]);
      arr.push(
        <line key={`v${k}`} x1={v1[0]} y1={v1[1]} x2={v2[0]} y2={v2[1]}
          stroke={stroke} strokeWidth={sw} opacity={op} />
      );
      const h1 = apply(M, [-range, k]);
      const h2 = apply(M, [range, k]);
      arr.push(
        <line key={`h${k}`} x1={h1[0]} y1={h1[1]} x2={h2[0]} y2={h2[1]}
          stroke={stroke} strokeWidth={sw} opacity={op} />
      );
    }
    return arr;
  }, [M.a, M.b, M.c, M.d, range, faded]);
  return <g>{lines}</g>;
}

// ============================================================
// ARROW — math coords, optionally draggable
// ============================================================
function Arrow({ x, y, color, draggable, onPointerDown, opacity = 1, thick = 0.08 }) {
  const len = Math.hypot(x, y);
  const headSize = 0.28;
  if (len < 0.06) {
    return draggable ? (
      <circle cx={0} cy={0} r={0.22} fill={color} fillOpacity={0.5}
        stroke={color} strokeWidth={0.04}
        onPointerDown={onPointerDown} style={{ cursor: 'grab', touchAction: 'none' }} />
    ) : (
      <circle cx={0} cy={0} r={0.1} fill={color} opacity={opacity} />
    );
  }
  const angle = Math.atan2(y, x);
  const baseX = x - headSize * 0.85 * Math.cos(angle);
  const baseY = y - headSize * 0.85 * Math.sin(angle);
  const lAng = angle - Math.PI / 7;
  const rAng = angle + Math.PI / 7;
  const leftX = x - headSize * Math.cos(lAng);
  const leftY = y - headSize * Math.sin(lAng);
  const rightX = x - headSize * Math.cos(rAng);
  const rightY = y - headSize * Math.sin(rAng);
  return (
    <g opacity={opacity}>
      <line x1={0} y1={0} x2={baseX} y2={baseY}
        stroke={color} strokeWidth={thick} strokeLinecap="round" />
      <polygon points={`${x},${y} ${leftX},${leftY} ${rightX},${rightY}`} fill={color} />
      {draggable && (
        <circle cx={x} cy={y} r={0.45}
          fill={color} fillOpacity={0}
          stroke={color} strokeOpacity={0.5} strokeWidth={0.04}
          onPointerDown={onPointerDown}
          style={{ cursor: 'grab', touchAction: 'none' }} />
      )}
    </g>
  );
}

// ============================================================
// F-SHAPE — useful for showing "what happens to a whole shape"
// ============================================================
function FShape({ M, color, fillOpacity = 0.18, strokeOpacity = 1, strokeWidth = 0.07, dashed = false }) {
  const path = useMemo(() => {
    const pts = F_OUTLINE.map((p) => apply(M, p));
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';
  }, [M.a, M.b, M.c, M.d]);
  return (
    <path d={path} fill={color} fillOpacity={fillOpacity}
      stroke={color} strokeOpacity={strokeOpacity}
      strokeWidth={strokeWidth} strokeLinejoin="round"
      strokeDasharray={dashed ? "0.18,0.12" : undefined} />
  );
}

// ============================================================
// MAIN INTERACTIVE CANVAS
// ============================================================
function MatrixCanvas({
  M, setM,
  showOriginalGrid = true,
  showTransformedGrid = true,
  showVector = false,
  vector = [2, 1],
  setVector,
  showFShape = false,
  showTargetF = false,
  draggable = true,
  range = 6,
  showDots = false,
  showOriginalDots = false,
}) {
  const svgRef = useRef(null);
  const innerRef = useRef(null);
  const [drag, setDrag] = useState(null);

  const handlePointerDown = useCallback((target) => (e) => {
    e.stopPropagation();
    setDrag(target);
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch (_) {}
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!drag || !innerRef.current || !svgRef.current) return;
    const ctm = innerRef.current.getScreenCTM();
    if (!ctm) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    const x = snap(local.x);
    const y = snap(local.y);
    if (drag === 'i') setM((prev) => ({ ...prev, a: x, c: y }));
    else if (drag === 'j') setM((prev) => ({ ...prev, b: x, d: y }));
    else if (drag === 'v' && setVector) setVector([x, y]);
  }, [drag, setM, setVector]);

  const handlePointerUp = useCallback((e) => {
    setDrag(null);
    try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch (_) {}
  }, []);

  const iHat = [M.a, M.c];
  const jHat = [M.b, M.d];
  const vTransformed = showVector ? apply(M, vector) : null;

  return (
    <div className="w-full" style={{ aspectRatio: '1', maxWidth: 560 }}>
      <svg
        ref={svgRef}
        viewBox={`-${range} -${range} ${range * 2} ${range * 2}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: '100%', height: '100%',
          backgroundColor: THEME.bg, borderRadius: 10,
          border: `1px solid ${THEME.border}`,
          touchAction: 'none', userSelect: 'none',
        }}
      >
        <g ref={innerRef} transform="matrix(1 0 0 -1 0 0)">
          {showOriginalGrid && <TransformedGrid M={{ a: 1, b: 0, c: 0, d: 1 }} range={range} faded={true} />}
          {showTransformedGrid && <TransformedGrid M={M} range={range} />}

          {showFShape && (
            <>
              <FShape M={{ a: 1, b: 0, c: 0, d: 1 }} color={THEME.muted}
                fillOpacity={0.04} strokeOpacity={0.3} dashed strokeWidth={0.04} />
              <FShape M={M} color={THEME.vector} fillOpacity={0.22} strokeWidth={0.08} />
            </>
          )}
          {showTargetF && (
            <FShape M={TARGET} color={THEME.hint} fillOpacity={0}
              strokeOpacity={0.75} strokeWidth={0.07} dashed />
          )}

          {showDots && DATA_DOTS.map((d, i) => {
            const t = apply(M, d.pos);
            return (
              <g key={i}>
                {showOriginalDots && (
                  <circle cx={d.pos[0]} cy={d.pos[1]} r={0.1}
                    fill={d.color} opacity={0.25} />
                )}
                <circle cx={t[0]} cy={t[1]} r={0.14} fill={d.color} />
              </g>
            );
          })}

          {showVector && (
            <>
              <Arrow x={vector[0]} y={vector[1]} color={THEME.vector}
                opacity={0.3} draggable={!!setVector}
                onPointerDown={handlePointerDown('v')} thick={0.06} />
              <Arrow x={vTransformed[0]} y={vTransformed[1]} color={THEME.vector} thick={0.09} />
            </>
          )}

          <Arrow x={iHat[0]} y={iHat[1]} color={THEME.accent}
            draggable={draggable} onPointerDown={handlePointerDown('i')} />
          <Arrow x={jHat[0]} y={jHat[1]} color={THEME.highlight}
            draggable={draggable} onPointerDown={handlePointerDown('j')} />
        </g>
      </svg>
    </div>
  );
}

// ============================================================
// MATRIX DISPLAY
// ============================================================
function MatrixDisplay({ M, highlightCols = false, size = 'normal', columnLabels = false }) {
  const fontSize = size === 'large' ? '1.5rem' : '1.1rem';
  const labelSize = '0.7rem';
  const colA = highlightCols ? THEME.accent : THEME.text;
  const colB = highlightCols ? THEME.highlight : THEME.text;
  return (
    <div style={{ display: 'inline-block' }}>
      {columnLabels && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
          textAlign: 'center', fontSize: labelSize, color: THEME.muted,
          padding: '0 1.5rem 0.3rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          <span style={{ color: colA }}>where î goes</span>
          <span style={{ color: colB }}>where ĵ goes</span>
        </div>
      )}
      <div style={{ display: 'inline-flex', alignItems: 'stretch',
        padding: size === 'large' ? '1rem 0.6rem' : '0.7rem 0.4rem',
        backgroundColor: THEME.surface, borderRadius: 8,
        border: `1px solid ${THEME.border}`,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>
        <div style={{ width: 3, backgroundColor: THEME.muted, borderRadius: 1 }} />
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: '0.35rem 1.4rem', padding: '0 0.9rem',
          fontSize, color: THEME.text }}>
          <div style={{ color: colA, textAlign: 'right', fontWeight: 500 }}>{fmt(M.a)}</div>
          <div style={{ color: colB, textAlign: 'right', fontWeight: 500 }}>{fmt(M.b)}</div>
          <div style={{ color: colA, textAlign: 'right', fontWeight: 500 }}>{fmt(M.c)}</div>
          <div style={{ color: colB, textAlign: 'right', fontWeight: 500 }}>{fmt(M.d)}</div>
        </div>
        <div style={{ width: 3, backgroundColor: THEME.muted, borderRadius: 1 }} />
      </div>
    </div>
  );
}

// ============================================================
// PRESET BUTTONS
// ============================================================
const PRESETS = [
  { name: 'Identity', M: { a: 1, b: 0, c: 0, d: 1 }, hint: 'do nothing' },
  { name: 'Rotate 90°', M: { a: 0, b: -1, c: 1, d: 0 }, hint: 'turn left' },
  { name: 'Scale 2×', M: { a: 2, b: 0, c: 0, d: 2 }, hint: 'zoom in' },
  { name: 'Shear', M: { a: 1, b: 1, c: 0, d: 1 }, hint: 'slant sideways' },
  { name: 'Reflect', M: { a: -1, b: 0, c: 0, d: 1 }, hint: 'mirror' },
  { name: 'Squish', M: { a: 1, b: 1, c: 1, d: 1 }, hint: 'collapse to a line' },
];

const matricesEqual = (A, B, tol = 0.02) =>
  Math.abs(A.a - B.a) < tol && Math.abs(A.b - B.b) < tol &&
  Math.abs(A.c - B.c) < tol && Math.abs(A.d - B.d) < tol;

function PresetButton({ preset, onClick, isActive }) {
  return (
    <button onClick={() => onClick(preset.M)}
      style={{
        padding: '0.45rem 0.7rem', fontSize: '0.78rem',
        backgroundColor: isActive ? THEME.accent : THEME.surfaceLight,
        color: isActive ? THEME.bg : THEME.text,
        border: `1px solid ${isActive ? THEME.accent : THEME.border}`,
        borderRadius: 6, cursor: 'pointer', fontWeight: 500,
        transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}>
      {preset.name}
    </button>
  );
}

// ============================================================
// SMALL UI HELPERS
// ============================================================
function Card({ children, accent }) {
  return (
    <div style={{
      padding: '0.9rem 1rem',
      backgroundColor: THEME.surface,
      borderRadius: 8,
      border: `1px solid ${accent || THEME.border}`,
      borderLeft: accent ? `3px solid ${accent}` : `1px solid ${THEME.border}`,
    }}>
      {children}
    </div>
  );
}

function Pill({ icon: Icon, label, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
      {Icon && <Icon size={14} style={{ color }} />}
      <span style={{ color, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

function ResetButton({ onClick }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '0.4rem 0.8rem', backgroundColor: 'transparent',
        color: THEME.muted, border: `1px solid ${THEME.border}`,
        borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
      }}>
      <RotateCcw size={12} /> Reset
    </button>
  );
}

// ============================================================
// SCREEN 1 — PUZZLE
// ============================================================
function PuzzleScreen({ M, setM, vector, setVector }) {
  const reset = () => { setM({ a: 1, b: 0, c: 0, d: 1 }); setVector([2, 1]); };
  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex justify-center" style={{ flex: '1 1 auto', minWidth: 0, width: '100%' }}>
        <MatrixCanvas M={M} setM={setM}
          showOriginalGrid={true} showTransformedGrid={true}
          showVector={true} vector={vector} setVector={setVector}
          draggable={true} />
      </div>
      <div className="flex flex-col gap-3" style={{ width: '100%', maxWidth: 360, flexShrink: 0 }}>
        <Card accent={THEME.hint}>
          <Pill icon={Target} label="The puzzle" color={THEME.hint} />
          <p style={{ color: THEME.text, fontSize: '0.95rem', lineHeight: 1.55, margin: 0 }}>
            Drag the <span style={{ color: THEME.accent, fontWeight: 600 }}>blue arrow</span> and the <span style={{ color: THEME.highlight, fontWeight: 600 }}>orange arrow</span> anywhere you want.
          </p>
          <p style={{ color: THEME.muted, fontSize: '0.86rem', lineHeight: 1.55, margin: '0.6rem 0 0' }}>
            Watch the <span style={{ color: THEME.vector, fontWeight: 600 }}>green vector</span> and the whole grid bend with them.
          </p>
        </Card>

        <Card>
          <p style={{ color: THEME.text, fontSize: '0.92rem', lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>
            How does green "know" where to go when you only specify what happens to blue and orange?
          </p>
        </Card>

        <div style={{ padding: '0.8rem 1rem', border: `1px dashed ${THEME.border}`, borderRadius: 8 }}>
          <Pill icon={Lightbulb} label="Try" color={THEME.hint} />
          <ul style={{ color: THEME.muted, fontSize: '0.83rem', lineHeight: 1.7, margin: 0, paddingLeft: '1.1rem' }}>
            <li>Drag blue to (2, 0). What happens to green?</li>
            <li>Now drag orange to (0, 2). And now?</li>
            <li>Send blue and orange to the same place. What collapses?</li>
            <li>Drag green itself — does it always stay on the warped grid?</li>
          </ul>
        </div>

        <ResetButton onClick={reset} />
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 2 — EXPLORE
// ============================================================
function ExploreScreen({ M, setM, vector, setVector }) {
  const reset = () => { setM({ a: 1, b: 0, c: 0, d: 1 }); setVector([2, 1]); };
  const activePreset = PRESETS.find(p => matricesEqual(p.M, M));

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex justify-center" style={{ flex: '1 1 auto', minWidth: 0, width: '100%' }}>
        <MatrixCanvas M={M} setM={setM}
          showOriginalGrid={true} showTransformedGrid={true}
          showVector={true} vector={vector} setVector={setVector}
          draggable={true} />
      </div>
      <div className="flex flex-col gap-3" style={{ width: '100%', maxWidth: 380, flexShrink: 0 }}>
        <Card accent={THEME.accent}>
          <Pill icon={Sparkles} label="Look at this" color={THEME.accent} />
          <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0 0.75rem' }}>
            <MatrixDisplay M={M} highlightCols={true} columnLabels={true} size="large" />
          </div>
          <p style={{ color: THEME.text, fontSize: '0.88rem', lineHeight: 1.55, margin: 0 }}>
            The <span style={{ color: THEME.accent, fontWeight: 600 }}>first column</span> is exactly where <span style={{ color: THEME.accent, fontWeight: 600 }}>î</span> ends up. The <span style={{ color: THEME.highlight, fontWeight: 600 }}>second column</span> is where <span style={{ color: THEME.highlight, fontWeight: 600 }}>ĵ</span> ends up.
          </p>
          <p style={{ color: THEME.muted, fontSize: '0.82rem', lineHeight: 1.5, margin: '0.6rem 0 0' }}>
            Drag a basis vector. Watch the column update. That's the entire matrix — no procedure, just two destinations.
          </p>
        </Card>

        <div>
          <Pill label="Presets" color={THEME.muted} />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <PresetButton key={p.name} preset={p}
                onClick={(M) => setM(M)} isActive={activePreset?.name === p.name} />
            ))}
          </div>
        </div>

        <div style={{ padding: '0.8rem 1rem', border: `1px dashed ${THEME.border}`, borderRadius: 8 }}>
          <Pill icon={Lightbulb} label="Notice" color={THEME.hint} />
          <ul style={{ color: THEME.muted, fontSize: '0.83rem', lineHeight: 1.7, margin: 0, paddingLeft: '1.1rem' }}>
            <li><span style={{ color: THEME.text }}>Rotate 90°</span> — î → (0,1), ĵ → (-1,0). Read it from the matrix.</li>
            <li><span style={{ color: THEME.text }}>Squish</span> — both columns point the same way. The plane collapses to a line.</li>
            <li>Try Squish + drag green. Where can it land?</li>
          </ul>
        </div>

        <ResetButton onClick={reset} />
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 3 — NAME
// ============================================================
function NameScreen({ M, setM, vector, setVector }) {
  const reset = () => { setM({ a: 1.2, b: 0.5, c: -0.3, d: 1 }); setVector([2, 1]); };
  const tv = apply(M, vector);
  const x = vector[0], y = vector[1];
  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex justify-center" style={{ flex: '1 1 auto', minWidth: 0, width: '100%' }}>
        <MatrixCanvas M={M} setM={setM}
          showOriginalGrid={true} showTransformedGrid={true}
          showVector={true} vector={vector} setVector={setVector}
          draggable={true} />
      </div>
      <div className="flex flex-col gap-3" style={{ width: '100%', maxWidth: 420, flexShrink: 0 }}>
        <Card accent={THEME.vector}>
          <Pill icon={Layers} label="The bridge" color={THEME.vector} />
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.88rem', lineHeight: 1.85, color: THEME.text }}>
            <div>
              <span style={{ color: THEME.muted }}>any vector → </span>
              <span style={{ color: THEME.vector }}>v</span> = <span style={{ color: THEME.text }}>{fmt(x)}</span>·<span style={{ color: THEME.accent }}>î</span> + <span style={{ color: THEME.text }}>{fmt(y)}</span>·<span style={{ color: THEME.highlight }}>ĵ</span>
            </div>
            <div style={{ color: THEME.muted, fontSize: '0.78rem', margin: '0.2rem 0 0.6rem' }}>
              every vector is just x copies of î plus y copies of ĵ
            </div>
            <div>
              <span style={{ color: THEME.muted }}>after transform → </span>
              T(<span style={{ color: THEME.vector }}>v</span>) = <span style={{ color: THEME.text }}>{fmt(x)}</span>·T(<span style={{ color: THEME.accent }}>î</span>) + <span style={{ color: THEME.text }}>{fmt(y)}</span>·T(<span style={{ color: THEME.highlight }}>ĵ</span>)
            </div>
            <div style={{ color: THEME.muted, fontSize: '0.78rem', margin: '0.2rem 0 0.6rem' }}>
              same recipe, but using the new î and new ĵ
            </div>
            <div>
              = <span style={{ color: THEME.text }}>{fmt(x)}</span>·(<span style={{ color: THEME.accent }}>{fmt(M.a)}</span>, <span style={{ color: THEME.accent }}>{fmt(M.c)}</span>) + <span style={{ color: THEME.text }}>{fmt(y)}</span>·(<span style={{ color: THEME.highlight }}>{fmt(M.b)}</span>, <span style={{ color: THEME.highlight }}>{fmt(M.d)}</span>)
            </div>
            <div style={{ marginTop: '0.6rem', padding: '0.5rem 0.7rem', backgroundColor: THEME.surfaceLight, borderRadius: 6, border: `1px solid ${THEME.border}` }}>
              = (<span style={{ color: THEME.accent }}>{fmt(M.a)}</span>·{fmt(x)} + <span style={{ color: THEME.highlight }}>{fmt(M.b)}</span>·{fmt(y)}, <span style={{ color: THEME.accent }}>{fmt(M.c)}</span>·{fmt(x)} + <span style={{ color: THEME.highlight }}>{fmt(M.d)}</span>·{fmt(y)})
            </div>
            <div style={{ marginTop: '0.4rem', color: THEME.ok, fontSize: '0.85rem' }}>
              = (<span style={{ color: THEME.vector, fontWeight: 600 }}>{fmt(tv[0])}</span>, <span style={{ color: THEME.vector, fontWeight: 600 }}>{fmt(tv[1])}</span>)
            </div>
          </div>
        </Card>

        <Card>
          <Pill label="The reframe" color={THEME.muted} />
          <p style={{ color: THEME.text, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
            "Rows × columns" is a <em>shortcut</em> for the same idea: take x copies of column&nbsp;1, plus y copies of column&nbsp;2. The procedure was always geometric — just compressed.
          </p>
        </Card>

        <div style={{ padding: '0.8rem 1rem', backgroundColor: THEME.surfaceLight, borderRadius: 8, border: `1px solid ${THEME.border}` }}>
          <Pill label="Where this lives" color={THEME.muted} />
          <ul style={{ color: THEME.text, fontSize: '0.84rem', lineHeight: 1.7, margin: 0, paddingLeft: '1.1rem' }}>
            <li><span style={{ color: THEME.muted }}>Graphics:</span> every rotation, scale, projection of a 3D scene = a matrix</li>
            <li><span style={{ color: THEME.muted }}>Neural nets:</span> each layer is <code style={{ color: THEME.accent, fontFamily: 'monospace' }}>W·x + b</code> — W is a learned matrix</li>
            <li><span style={{ color: THEME.muted }}>PCA:</span> finds the matrix that aligns data with its natural axes</li>
          </ul>
        </div>

        <ResetButton onClick={reset} />
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 4 — CHALLENGE
// ============================================================
function ChallengeScreen({ M, setM }) {
  const reset = () => setM({ a: 1, b: 0, c: 0, d: 1 });
  const errSq = useMemo(() =>
    (M.a - TARGET.a) ** 2 + (M.b - TARGET.b) ** 2 +
    (M.c - TARGET.c) ** 2 + (M.d - TARGET.d) ** 2,
    [M.a, M.b, M.c, M.d]);
  const isCorrect = errSq < 0.06;
  const isClose = errSq < 0.4;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex justify-center" style={{ flex: '1 1 auto', minWidth: 0, width: '100%' }}>
        <MatrixCanvas M={M} setM={setM}
          showOriginalGrid={true} showTransformedGrid={true}
          showFShape={true} showTargetF={true}
          draggable={true} />
      </div>
      <div className="flex flex-col gap-3" style={{ width: '100%', maxWidth: 380, flexShrink: 0 }}>
        <Card accent={isCorrect ? THEME.ok : THEME.hint}>
          <Pill icon={Target} label="The challenge" color={isCorrect ? THEME.ok : THEME.hint} />
          <p style={{ color: THEME.text, fontSize: '0.92rem', lineHeight: 1.55, margin: 0 }}>
            Rotate the green <strong>F</strong> 45° clockwise to match the dashed yellow target.
          </p>
          <p style={{ color: THEME.muted, fontSize: '0.83rem', lineHeight: 1.55, margin: '0.5rem 0 0' }}>
            Drag <span style={{ color: THEME.accent, fontWeight: 600 }}>î</span> and <span style={{ color: THEME.highlight, fontWeight: 600 }}>ĵ</span> to where they need to go.
          </p>
        </Card>

        <Card>
          <Pill label="Current matrix" color={THEME.muted} />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.4rem' }}>
            <MatrixDisplay M={M} highlightCols={true} />
          </div>
          <div style={{ marginTop: '0.7rem', textAlign: 'center', fontSize: '0.78rem', color: isCorrect ? THEME.ok : (isClose ? THEME.hint : THEME.muted) }}>
            {isCorrect ? '✓ matched' : (isClose ? 'getting warm…' : 'not yet')}
          </div>
        </Card>

        {!isCorrect && (
          <div style={{ padding: '0.8rem 1rem', border: `1px dashed ${THEME.border}`, borderRadius: 8 }}>
            <Pill icon={Lightbulb} label="Hint" color={THEME.hint} />
            <p style={{ color: THEME.muted, fontSize: '0.83rem', lineHeight: 1.6, margin: 0 }}>
              Where does <span style={{ color: THEME.accent }}>î = (1,0)</span> land after a 45° clockwise turn? Where does <span style={{ color: THEME.highlight }}>ĵ = (0,1)</span> go? Build the matrix from those two answers.
            </p>
          </div>
        )}

        {isCorrect && (
          <Card accent={THEME.ok}>
            <Pill icon={Sparkles} label="The ML connection" color={THEME.ok} />
            <p style={{ color: THEME.text, fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              You just hand-built a transformation matrix. Every neural-network layer does this — but with a much bigger matrix and learned automatically.
            </p>
            <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', backgroundColor: THEME.surfaceLight, padding: '0.5rem 0.7rem', borderRadius: 6, margin: '0.7rem 0', border: `1px solid ${THEME.border}`, color: THEME.text }}>
              output = <span style={{ color: THEME.accent }}>W</span> · input + b
            </div>
            <p style={{ color: THEME.muted, fontSize: '0.82rem', lineHeight: 1.55, margin: 0 }}>
              <strong style={{ color: THEME.text }}>Training</strong> = searching for the matrix W whose columns send the input space's basis vectors somewhere useful — somewhere the next layer can do its job. <strong style={{ color: THEME.text }}>Backprop</strong> figures out which way to nudge each entry.
            </p>
          </Card>
        )}

        <ResetButton onClick={reset} />
      </div>
    </div>
  );
}

// ============================================================
// ML REVEAL — bonus screen-after-success showing the same matrix on data
// ============================================================
function MLRevealStrip({ M }) {
  return (
    <div style={{
      marginTop: '1rem', padding: '1rem',
      backgroundColor: THEME.surface, borderRadius: 10,
      border: `1px solid ${THEME.border}`,
    }}>
      <Pill icon={Layers} label="Same matrix, applied to data" color={THEME.accent} />
      <p style={{ color: THEME.muted, fontSize: '0.82rem', lineHeight: 1.55, margin: '0 0 0.7rem' }}>
        Imagine these dots are 2D feature vectors entering an NN layer. The matrix you built sends each one to a new spot — exactly the same operation as on î and ĵ, applied in parallel.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div style={{ fontSize: '0.7rem', color: THEME.muted, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>before</div>
          <svg viewBox="-3 -3 6 6" style={{ width: '100%', aspectRatio: '1', backgroundColor: THEME.bg, borderRadius: 6, border: `1px solid ${THEME.border}` }}>
            <g transform="matrix(1 0 0 -1 0 0)">
              <TransformedGrid M={{a:1,b:0,c:0,d:1}} range={3} faded={true} />
              {DATA_DOTS.map((d, i) => (
                <circle key={i} cx={d.pos[0]} cy={d.pos[1]} r={0.13} fill={d.color} />
              ))}
            </g>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: '0.7rem', color: THEME.muted, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>after</div>
          <svg viewBox="-3 -3 6 6" style={{ width: '100%', aspectRatio: '1', backgroundColor: THEME.bg, borderRadius: 6, border: `1px solid ${THEME.border}` }}>
            <g transform="matrix(1 0 0 -1 0 0)">
              <TransformedGrid M={M} range={3} />
              {DATA_DOTS.map((d, i) => {
                const t = apply(M, d.pos);
                return <circle key={i} cx={t[0]} cy={t[1]} r={0.13} fill={d.color} />;
              })}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
const SCREENS = [
  { key: 1, label: 'Puzzle', sub: 'Drag the basis vectors' },
  { key: 2, label: 'Explore', sub: 'Read the matrix' },
  { key: 3, label: 'Name', sub: 'Find the formula' },
  { key: 4, label: 'Challenge', sub: 'Apply it' },
];

export default function App() {
  const [screen, setScreen] = useState(1);
  const [matrix, setMatrix] = useState({ a: 1.2, b: 0.5, c: -0.3, d: 1 });
  const [vector, setVector] = useState([2, 1]);

  // Reset matrix to a sensible default when switching to challenge
  useEffect(() => {
    if (screen === 4) {
      setMatrix({ a: 1, b: 0, c: 0, d: 1 });
    } else if (screen === 1) {
      setMatrix((m) => (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1)
        ? { a: 1.2, b: 0.5, c: -0.3, d: 1 } : m);
    }
  }, [screen]);

  const isChallengeWin = screen === 4 && (
    (matrix.a - TARGET.a) ** 2 + (matrix.b - TARGET.b) ** 2 +
    (matrix.c - TARGET.c) ** 2 + (matrix.d - TARGET.d) ** 2 < 0.06
  );

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: THEME.bg, color: THEME.text,
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
      padding: '1.25rem 1rem 3rem',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.72rem', color: THEME.muted, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '0.3rem' }}>
            Linear Algebra · Geometric Intuition
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: THEME.text, margin: 0, letterSpacing: '-0.01em' }}>
            What a matrix actually <em style={{ color: THEME.accent, fontStyle: 'normal' }}>does</em>
          </h1>
        </div>

        {/* Screen tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {SCREENS.map((s) => {
            const isActive = s.key === screen;
            const isPast = s.key < screen;
            return (
              <button key={s.key} onClick={() => setScreen(s.key)}
                style={{
                  padding: '0.55rem 0.9rem',
                  backgroundColor: isActive ? THEME.surface : 'transparent',
                  color: isActive ? THEME.text : (isPast ? THEME.muted : THEME.muted),
                  border: `1px solid ${isActive ? THEME.accent : THEME.border}`,
                  borderRadius: 7, cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  opacity: isPast || isActive ? 1 : 0.85,
                }}>
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  backgroundColor: isActive ? THEME.accent : 'transparent',
                  border: `1px solid ${isActive ? THEME.accent : THEME.border}`,
                  color: isActive ? THEME.bg : THEME.muted,
                  fontSize: '0.7rem', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.key}
                </span>
                <span>{s.label}</span>
                <span style={{ color: THEME.muted, fontSize: '0.72rem', display: 'none' }} className="md:inline">— {s.sub}</span>
              </button>
            );
          })}
        </div>

        {/* Active screen */}
        <div>
          {screen === 1 && <PuzzleScreen M={matrix} setM={setMatrix} vector={vector} setVector={setVector} />}
          {screen === 2 && <ExploreScreen M={matrix} setM={setMatrix} vector={vector} setVector={setVector} />}
          {screen === 3 && <NameScreen M={matrix} setM={setMatrix} vector={vector} setVector={setVector} />}
          {screen === 4 && <ChallengeScreen M={matrix} setM={setMatrix} />}
        </div>

        {/* ML reveal after winning */}
        {isChallengeWin && <MLRevealStrip M={matrix} />}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', paddingTop: '1rem', borderTop: `1px solid ${THEME.border}` }}>
          <button onClick={() => setScreen(Math.max(1, screen - 1))}
            disabled={screen === 1}
            style={{
              padding: '0.55rem 1rem',
              backgroundColor: 'transparent',
              color: screen === 1 ? THEME.border : THEME.text,
              border: `1px solid ${screen === 1 ? THEME.border : THEME.muted}`,
              borderRadius: 6, cursor: screen === 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.88rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            }}>
            <ChevronLeft size={15} /> Back
          </button>
          <div style={{ fontSize: '0.78rem', color: THEME.muted }}>
            screen {screen} of 4
          </div>
          <button onClick={() => setScreen(Math.min(4, screen + 1))}
            disabled={screen === 4}
            style={{
              padding: '0.55rem 1rem',
              backgroundColor: screen === 4 ? 'transparent' : THEME.accent,
              color: screen === 4 ? THEME.border : THEME.bg,
              border: `1px solid ${screen === 4 ? THEME.border : THEME.accent}`,
              borderRadius: 6, cursor: screen === 4 ? 'not-allowed' : 'pointer',
              fontSize: '0.88rem', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            }}>
            Next <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}