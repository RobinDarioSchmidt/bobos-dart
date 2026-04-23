"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { LiveBoardMarker, LiveMatchState, LiveSegmentRing } from "@/lib/live-match";

export type LiveBoardSegment = {
  label: string;
  score: number;
  number: number;
  multiplier: 0 | 1 | 2 | 3;
  ring: LiveSegmentRing;
  marker: LiveBoardMarker | null;
};

const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const BOARD_START_ANGLE = -9;
const BOARD_SLICE_ANGLE = 18;
const BOARD_RADIUS = {
  bullInner: 14,
  bullOuter: 28,
  tripleInner: 88,
  tripleOuter: 108,
  doubleInner: 150,
  doubleOuter: 172,
  label: 188,
};

function polarToCartesian(radius: number, angleDeg: number) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: 200 + radius * Math.cos(angle),
    y: 200 + radius * Math.sin(angle),
  };
}

function describeSlice(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number) {
  const startOuter = polarToCartesian(outerRadius, startAngle);
  const endOuter = polarToCartesian(outerRadius, endAngle);
  const startInner = polarToCartesian(innerRadius, startAngle);
  const endInner = polarToCartesian(innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

function createMarker(radius: number, angleDeg: number, label: string, ring: LiveSegmentRing): LiveBoardMarker {
  const point = polarToCartesian(radius, angleDeg);
  return {
    x: point.x,
    y: point.y,
    label,
    ring,
  };
}

function handleBoardKeyDown(
  event: KeyboardEvent<SVGGElement>,
  onSegmentSelect: (segment: LiveBoardSegment) => void,
  segment: LiveBoardSegment,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSegmentSelect(segment);
  }
}

function markerColorForRing(ring: LiveSegmentRing) {
  void ring;
  return "#6b7280";
}

function buildSegment(value: number, midAngle: number, ring: LiveSegmentRing): LiveBoardSegment {
  const markerRadiusByRing: Record<LiveSegmentRing, number> = {
    double: (BOARD_RADIUS.doubleInner + BOARD_RADIUS.doubleOuter) / 2,
    triple: (BOARD_RADIUS.tripleInner + BOARD_RADIUS.tripleOuter) / 2,
    "single-outer": (BOARD_RADIUS.tripleOuter + BOARD_RADIUS.doubleInner) / 2,
    "single-inner": (BOARD_RADIUS.bullOuter + BOARD_RADIUS.tripleInner) / 2,
    "outer-bull": 21,
    bull: 8,
    miss: -1,
  };

  if (ring === "outer-bull") {
    return {
      label: "Outer Bull",
      score: 25,
      number: 25,
      multiplier: 1,
      ring,
      marker: createMarker(markerRadiusByRing[ring], 0, "Outer Bull", ring),
    };
  }

  if (ring === "bull") {
    return {
      label: "Bull",
      score: 50,
      number: 25,
      multiplier: 2,
      ring,
      marker: createMarker(markerRadiusByRing[ring], 0, "Bull", ring),
    };
  }

  const multiplier = ring === "double" ? 2 : ring === "triple" ? 3 : 1;
  const prefix = multiplier === 2 ? "D" : multiplier === 3 ? "T" : "S";
  return {
    label: `${prefix}${value}`,
    score: value * multiplier,
    number: value,
    multiplier,
    ring,
    marker: createMarker(markerRadiusByRing[ring], midAngle, `${prefix}${value}`, ring),
  };
}

function getSegmentFromBoardPoint(x: number, y: number) {
  const dx = x - 200;
  const dy = y - 200;
  const radius = Math.sqrt(dx * dx + dy * dy);

  if (radius > BOARD_RADIUS.doubleOuter) {
    return null;
  }

  if (radius <= BOARD_RADIUS.bullInner) {
    return buildSegment(25, 0, "bull");
  }

  if (radius <= BOARD_RADIUS.bullOuter) {
    return buildSegment(25, 0, "outer-bull");
  }

  const angle = (((Math.atan2(dy, dx) * 180) / Math.PI + 90) % 360 + 360) % 360;
  const index = Math.floor((((angle - BOARD_START_ANGLE + 360) % 360) / BOARD_SLICE_ANGLE)) % BOARD_ORDER.length;
  const value = BOARD_ORDER[index] ?? 20;
  const midAngle = BOARD_START_ANGLE + index * BOARD_SLICE_ANGLE + BOARD_SLICE_ANGLE / 2;

  if (radius >= BOARD_RADIUS.doubleInner) {
    return buildSegment(value, midAngle, "double");
  }

  if (radius >= BOARD_RADIUS.tripleOuter) {
    return buildSegment(value, midAngle, "single-outer");
  }

  if (radius >= BOARD_RADIUS.tripleInner) {
    return buildSegment(value, midAngle, "triple");
  }

  return buildSegment(value, midAngle, "single-inner");
}

function LiveDartboard({
  onSegmentSelect,
  disabled,
  disabledLabel,
  markers,
  loading,
}: {
  onSegmentSelect: (segment: LiveBoardSegment) => void;
  disabled: boolean;
  disabledLabel: string;
  markers: LiveBoardMarker[];
  loading: boolean;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<LiveBoardSegment | null>(null);
  const [touchPreview, setTouchPreview] = useState<{
    x: number;
    y: number;
    segment: LiveBoardSegment | null;
    active: boolean;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const suppressClickRef = useRef(false);

  function getBoardPointFromPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const scaleX = 400 / rect.width;
    const scaleY = 400 / rect.height;
    return {
      boardX: (event.clientX - rect.left) * scaleX,
      boardY: (event.clientY - rect.top) * scaleY,
      clientX: event.clientX - rect.left,
      clientY: event.clientY - rect.top,
    };
  }

  function updateTouchPreview(event: ReactPointerEvent<SVGSVGElement>) {
    const point = getBoardPointFromPointer(event);
    if (!point) {
      return null;
    }

    const segment = getSegmentFromBoardPoint(point.boardX, point.boardY);
    setTouchPreview({
      x: point.clientX,
      y: point.clientY,
      segment,
      active: true,
    });
    setHoveredSegment(segment);
    return segment;
  }

  function handleTouchPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled || event.pointerType !== "touch") {
      return;
    }

    suppressClickRef.current = true;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateTouchPreview(event);
  }

  function handleTouchPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled || event.pointerType !== "touch" || !touchPreview?.active) {
      return;
    }

    event.preventDefault();
    updateTouchPreview(event);
  }

  function handleTouchPointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
    if (disabled || event.pointerType !== "touch") {
      return;
    }

    event.preventDefault();
    const finalSegment = updateTouchPreview(event) ?? touchPreview?.segment ?? null;
    setTouchPreview(null);
    setHoveredSegment(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 180);

    if (finalSegment) {
      onSegmentSelect(finalSegment);
    }
  }

  function handleTouchPointerCancel() {
    setTouchPreview(null);
    setHoveredSegment(null);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 180);
  }

  function handleSegmentClick(segment: LiveBoardSegment) {
    if (disabled || suppressClickRef.current) {
      return;
    }

    onSegmentSelect(segment);
  }

  return (
    <div
      className={`rounded-none border-0 bg-transparent p-0 transition sm:rounded-[1.5rem] sm:border sm:border-white/10 sm:bg-black/20 sm:p-3 ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-end gap-3 sm:mb-3">
        {hoveredSegment ? (
          <div className="min-h-[3.25rem] min-w-[8.5rem] rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-amber-100">Ziel</p>
            <p className="whitespace-nowrap text-sm font-semibold text-white">
              {hoveredSegment.label} · {hoveredSegment.score}
            </p>
          </div>
        ) : (
          <div className="flex min-h-[3.25rem] min-w-[8.5rem] items-center justify-center whitespace-nowrap rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-center text-[11px] uppercase tracking-[0.22em] text-stone-300">
            Hover + Klick
          </div>
        )}
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox="0 0 400 400"
          className={`mx-auto w-full max-w-[35rem] touch-none drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)] ${disabled ? "pointer-events-none" : ""}`}
          onPointerDown={handleTouchPointerDown}
          onPointerMove={handleTouchPointerMove}
          onPointerUp={handleTouchPointerEnd}
          onPointerCancel={handleTouchPointerCancel}
        >
          <circle cx="200" cy="200" r="194" fill="#111827" />
          <circle cx="200" cy="200" r="182" fill="#d6d3d1" />
          <circle cx="200" cy="200" r={BOARD_RADIUS.doubleOuter} fill="#0f172a" />

          {BOARD_ORDER.map((value, index) => {
            const startAngle = BOARD_START_ANGLE + index * BOARD_SLICE_ANGLE;
            const endAngle = startAngle + BOARD_SLICE_ANGLE;
            const midAngle = startAngle + BOARD_SLICE_ANGLE / 2;
            const isEven = index % 2 === 0;
            const singleColor = isEven ? "#f5f5f4" : "#111827";
            const doubleTripleColor = isEven ? "#b91c1c" : "#166534";
            const labelPoint = polarToCartesian(BOARD_RADIUS.label, midAngle);

            const segments: Array<{ key: string; fill: string; path: string; segment: LiveBoardSegment }> = [
              {
                key: `double-${value}`,
                fill: doubleTripleColor,
                path: describeSlice(BOARD_RADIUS.doubleInner, BOARD_RADIUS.doubleOuter, startAngle, endAngle),
                segment: {
                  label: `D${value}`,
                  score: value * 2,
                  number: value,
                  multiplier: 2,
                  ring: "double",
                  marker: createMarker((BOARD_RADIUS.doubleInner + BOARD_RADIUS.doubleOuter) / 2, midAngle, `D${value}`, "double"),
                },
              },
              {
                key: `outer-single-${value}`,
                fill: singleColor,
                path: describeSlice(BOARD_RADIUS.tripleOuter, BOARD_RADIUS.doubleInner, startAngle, endAngle),
                segment: {
                  label: `S${value}`,
                  score: value,
                  number: value,
                  multiplier: 1,
                  ring: "single-outer",
                  marker: createMarker((BOARD_RADIUS.tripleOuter + BOARD_RADIUS.doubleInner) / 2, midAngle, `S${value}`, "single-outer"),
                },
              },
              {
                key: `triple-${value}`,
                fill: doubleTripleColor,
                path: describeSlice(BOARD_RADIUS.tripleInner, BOARD_RADIUS.tripleOuter, startAngle, endAngle),
                segment: {
                  label: `T${value}`,
                  score: value * 3,
                  number: value,
                  multiplier: 3,
                  ring: "triple",
                  marker: createMarker((BOARD_RADIUS.tripleInner + BOARD_RADIUS.tripleOuter) / 2, midAngle, `T${value}`, "triple"),
                },
              },
              {
                key: `inner-single-${value}`,
                fill: singleColor,
                path: describeSlice(BOARD_RADIUS.bullOuter, BOARD_RADIUS.tripleInner, startAngle, endAngle),
                segment: {
                  label: `S${value}`,
                  score: value,
                  number: value,
                  multiplier: 1,
                  ring: "single-inner",
                  marker: createMarker((BOARD_RADIUS.bullOuter + BOARD_RADIUS.tripleInner) / 2, midAngle, `S${value}`, "single-inner"),
                },
              },
            ];

            return (
              <g key={value}>
                {segments.map(({ key, fill, path, segment }) => (
                  <g
                    key={key}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-label={segment.label}
                    onClick={() => handleSegmentClick(segment)}
                    onKeyDown={(event) => !disabled && handleBoardKeyDown(event, onSegmentSelect, segment)}
                    className="cursor-pointer outline-none"
                  >
                    <path
                      d={path}
                      fill={fill}
                      stroke="#0a0a0a"
                      strokeWidth="1.5"
                      onMouseEnter={() => !disabled && setHoveredSegment(segment)}
                      onMouseLeave={() => setHoveredSegment((current) => (current?.label === segment.label ? null : current))}
                      onFocus={() => !disabled && setHoveredSegment(segment)}
                      onBlur={() => setHoveredSegment((current) => (current?.label === segment.label ? null : current))}
                      className="transition duration-150 hover:brightness-125 focus:brightness-125"
                    />
                  </g>
                ))}
                <text
                  x={labelPoint.x}
                  y={labelPoint.y}
                  fill="#9ca3af"
                  fontSize="16"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {value}
                </text>
              </g>
            );
          })}

          <g
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="Outer Bull"
            onClick={() => handleSegmentClick(buildSegment(25, 0, "outer-bull"))}
            onKeyDown={(event) =>
              !disabled &&
              handleBoardKeyDown(event, onSegmentSelect, buildSegment(25, 0, "outer-bull"))
            }
            className="cursor-pointer outline-none"
          >
            <circle
              cx="200"
              cy="200"
              r={BOARD_RADIUS.bullOuter}
              fill="#166534"
              stroke="#0a0a0a"
              strokeWidth="2"
              onMouseEnter={() =>
                !disabled &&
                setHoveredSegment({
                  label: "Outer Bull",
                  score: 25,
                  number: 25,
                  multiplier: 1,
                  ring: "outer-bull",
                  marker: createMarker(21, 0, "Outer Bull", "outer-bull"),
                })
              }
              onMouseLeave={() => setHoveredSegment((current) => (current?.label === "Outer Bull" ? null : current))}
              onFocus={() =>
                !disabled &&
                setHoveredSegment({
                  label: "Outer Bull",
                  score: 25,
                  number: 25,
                  multiplier: 1,
                  ring: "outer-bull",
                  marker: createMarker(21, 0, "Outer Bull", "outer-bull"),
                })
              }
              onBlur={() => setHoveredSegment((current) => (current?.label === "Outer Bull" ? null : current))}
              className="transition duration-150 hover:brightness-125 focus:brightness-125"
            />
          </g>
          <g
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="Bull"
            onClick={() => handleSegmentClick(buildSegment(25, 0, "bull"))}
            onKeyDown={(event) =>
              !disabled &&
              handleBoardKeyDown(event, onSegmentSelect, buildSegment(25, 0, "bull"))
            }
            className="cursor-pointer outline-none"
          >
            <circle
              cx="200"
              cy="200"
              r={BOARD_RADIUS.bullInner}
              fill="#b91c1c"
              stroke="#0a0a0a"
              strokeWidth="2"
              onMouseEnter={() =>
                !disabled &&
                setHoveredSegment({
                  label: "Bull",
                  score: 50,
                  number: 25,
                  multiplier: 2,
                  ring: "bull",
                  marker: createMarker(8, 0, "Bull", "bull"),
                })
              }
              onMouseLeave={() => setHoveredSegment((current) => (current?.label === "Bull" ? null : current))}
              onFocus={() =>
                !disabled &&
                setHoveredSegment({
                  label: "Bull",
                  score: 50,
                  number: 25,
                  multiplier: 2,
                  ring: "bull",
                  marker: createMarker(8, 0, "Bull", "bull"),
                })
              }
              onBlur={() => setHoveredSegment((current) => (current?.label === "Bull" ? null : current))}
              className="transition duration-150 hover:brightness-125 focus:brightness-125"
            />
          </g>

          {markers.map((marker, index) =>
            marker.ring === "miss" || marker.x < 0 || marker.y < 0 ? null : (
              <g key={`${marker.label}-${index}`}>
                <line
                  x1={marker.x - 7}
                  y1={marker.y - 7}
                  x2={marker.x + 7}
                  y2={marker.y + 7}
                  stroke={markerColorForRing(marker.ring)}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <line
                  x1={marker.x + 7}
                  y1={marker.y - 7}
                  x2={marker.x - 7}
                  y2={marker.y + 7}
                  stroke={markerColorForRing(marker.ring)}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </g>
            ),
          )}
        </svg>

        {disabled ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs uppercase tracking-[0.22em] text-stone-200">
              {loading ? "Synchronisiert..." : disabledLabel}
            </div>
          </div>
        ) : null}

        {touchPreview?.active ? (
          <div
            className="pointer-events-none absolute z-10"
            style={{
              left: `${Math.max(44, Math.min(touchPreview.x, 320))}px`,
              top: `${Math.max(54, touchPreview.y - 72)}px`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-black/80 shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 text-center">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {touchPreview.segment?.label ?? "Miss"}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100">
                    {touchPreview.segment?.score ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LiveBoardPanel({
  liveState,
  currentPlayerIndex,
  currentUserId,
  boardHeading,
  currentVisitTotal,
  compactVisitText,
  calloutText,
  canPlayFromThisDevice,
  boardDisabledReason,
  loading,
  boardMarkers,
  pendingLabels,
  canControlLegTransition,
  checkoutHints,
  currentPlayerName,
  onSegmentSelect,
  onMiss,
  onRemoveLast,
  onClearVisit,
  onFinishVisit,
  onNextLeg,
}: {
  liveState: LiveMatchState;
  currentPlayerIndex: number;
  currentUserId: string;
  boardHeading: string;
  currentVisitTotal: number;
  compactVisitText: string;
  calloutText: string | null;
  canPlayFromThisDevice: boolean;
  boardDisabledReason: string;
  loading: boolean;
  boardMarkers: LiveBoardMarker[];
  pendingLabels: string[];
  canControlLegTransition: boolean;
  checkoutHints: string[];
  currentPlayerName: string | null;
  onSegmentSelect: (segment: LiveBoardSegment) => void;
  onMiss: () => void;
  onRemoveLast: () => void;
  onClearVisit: () => void;
  onFinishVisit: () => void;
  onNextLeg: () => void;
}) {
  const visiblePlayers = liveState.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.joined);

  return (
    <section className="rounded-none border-0 bg-transparent p-0 backdrop-blur-none sm:rounded-[1.5rem] sm:border sm:border-white/10 sm:bg-white/5 sm:p-4 sm:backdrop-blur">
      <div className="px-2 sm:px-0 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{boardHeading}</h2>
          {calloutText ? (
            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-amber-100">{calloutText}</p>
          ) : null}
          <p className="mt-1 text-sm text-stone-400">
            {liveState.bullOff.enabled && !liveState.bullOff.completed
              ? "Ein Wurf pro Spieler entscheidet über den Start."
              : `${currentVisitTotal} Punkte · ${compactVisitText}`}
          </p>
        </div>
        <button
          onClick={onMiss}
          disabled={!canPlayFromThisDevice || loading}
          className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-40"
        >
          No score
        </button>
      </div>

      {visiblePlayers.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 px-2 sm:px-0 xl:grid-cols-4">
          {visiblePlayers.map(({ player, index: originalIndex }) => {
            const isActive = currentPlayerIndex === originalIndex && liveState.matchWinner === null;
            const isMe = player.profileId === currentUserId;

            return (
              <div
                key={`${player.name}-${originalIndex}`}
                className={`rounded-[1.25rem] border p-3 ${
                  isActive ? "border-emerald-300/40 bg-emerald-300/10" : "border-white/10 bg-black/20"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{player.name}</p>
                  {isMe ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-stone-300">
                      Du
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-4xl font-semibold leading-none text-white">{player.score}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl bg-white/5 p-2">
                    <p className="text-stone-400">Sets</p>
                    <p className="mt-1 text-lg font-semibold text-white">{player.sets}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-2">
                    <p className="text-stone-400">Legs</p>
                    <p className="mt-1 text-lg font-semibold text-white">{player.legs}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 -mx-2 sm:mx-0">
        <LiveDartboard
          onSegmentSelect={onSegmentSelect}
          disabled={!canPlayFromThisDevice || loading}
          disabledLabel={boardDisabledReason}
          markers={boardMarkers}
          loading={loading}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 mx-2 sm:mx-0">
        <div className="flex flex-wrap gap-2">
          {pendingLabels.length > 0 ? (
            pendingLabels.map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-sm font-semibold text-amber-100"
              >
                {label}
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-400">
              {liveState.bullOff.enabled && !liveState.bullOff.completed
                ? "Bull-Off wartet auf den nächsten Wurf."
                : "Noch keine Darts geklickt."}
            </p>
          )}
        </div>
        {!liveState.bullOff.enabled || liveState.bullOff.completed ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={onRemoveLast}
              disabled={!canPlayFromThisDevice || pendingLabels.length === 0}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Letzten Dart l?schen
            </button>
            <button
              onClick={onClearVisit}
              disabled={!canPlayFromThisDevice || pendingLabels.length === 0}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Board leeren
            </button>
            <button
              onClick={onFinishVisit}
              disabled={!canPlayFromThisDevice || pendingLabels.length === 0}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              Visit abschliessen
            </button>
          </div>
        ) : null}

        {liveState.legWinner !== null && liveState.matchWinner === null ? (
          <button
            onClick={onNextLeg}
            disabled={!canControlLegTransition}
            className="mt-4 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
          >
            Nächstes Leg starten
          </button>
        ) : null}
      </div>

      {checkoutHints.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 mx-2 sm:mx-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-100">
            Mögliche Finishes für {currentPlayerName}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {checkoutHints.map((hint) => (
              <div
                key={hint}
                className="rounded-2xl border border-emerald-300/15 bg-black/20 px-3 py-2 text-sm text-emerald-50"
              >
                {hint}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
