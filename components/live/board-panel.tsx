"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
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

function LiveDartboard({
  onSegmentSelect,
  disabled,
  markers,
  loading,
}: {
  onSegmentSelect: (segment: LiveBoardSegment) => void;
  disabled: boolean;
  markers: LiveBoardMarker[];
  loading: boolean;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<LiveBoardSegment | null>(null);

  return (
    <div className={`rounded-[1.5rem] border border-white/10 bg-black/20 p-3 transition ${disabled ? "opacity-45" : ""}`}>
      <div className="mb-3 flex items-center justify-end gap-3">
        {hoveredSegment ? (
          <div className="min-h-[3.5rem] min-w-[9rem] rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-amber-100">Ziel</p>
            <p className="whitespace-nowrap text-sm font-semibold text-white">
              {hoveredSegment.label} · {hoveredSegment.score}
            </p>
          </div>
        ) : (
          <div className="flex min-h-[3.5rem] min-w-[9rem] items-center justify-center whitespace-nowrap rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-center text-[11px] uppercase tracking-[0.22em] text-stone-300">
            Hover + Klick
          </div>
        )}
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 400 400"
          className={`mx-auto w-full max-w-[28rem] drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)] ${disabled ? "pointer-events-none" : ""}`}
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
                    onClick={() => !disabled && onSegmentSelect(segment)}
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
            onClick={() =>
              !disabled &&
              onSegmentSelect({
                label: "Outer Bull",
                score: 25,
                number: 25,
                multiplier: 1,
                ring: "outer-bull",
                marker: createMarker(21, 0, "Outer Bull", "outer-bull"),
              })
            }
            onKeyDown={(event) =>
              !disabled &&
              handleBoardKeyDown(event, onSegmentSelect, {
                label: "Outer Bull",
                score: 25,
                number: 25,
                multiplier: 1,
                ring: "outer-bull",
                marker: createMarker(21, 0, "Outer Bull", "outer-bull"),
              })
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
            onClick={() =>
              !disabled &&
              onSegmentSelect({
                label: "Bull",
                score: 50,
                number: 25,
                multiplier: 2,
                ring: "bull",
                marker: createMarker(8, 0, "Bull", "bull"),
              })
            }
            onKeyDown={(event) =>
              !disabled &&
              handleBoardKeyDown(event, onSegmentSelect, {
                label: "Bull",
                score: 50,
                number: 25,
                multiplier: 2,
                ring: "bull",
                marker: createMarker(8, 0, "Bull", "bull"),
              })
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
              {loading ? "Synchronisiert..." : "Warte auf deinen Zug"}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LiveBoardPanel({
  liveState,
  boardHeading,
  currentVisitTotal,
  compactVisitText,
  calloutText,
  isCurrentUsersTurn,
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
  boardHeading: string;
  currentVisitTotal: number;
  compactVisitText: string;
  calloutText: string | null;
  isCurrentUsersTurn: boolean;
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
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
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
          disabled={!isCurrentUsersTurn || loading}
          className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-100 disabled:opacity-40"
        >
          No score
        </button>
      </div>

      <div className="mt-4">
        <LiveDartboard
          onSegmentSelect={onSegmentSelect}
          disabled={!isCurrentUsersTurn || loading}
          markers={boardMarkers}
          loading={loading}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
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
              disabled={!isCurrentUsersTurn || pendingLabels.length === 0}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Letzten Dart l?schen
            </button>
            <button
              onClick={onClearVisit}
              disabled={!isCurrentUsersTurn || pendingLabels.length === 0}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Board leeren
            </button>
            <button
              onClick={onFinishVisit}
              disabled={!isCurrentUsersTurn || pendingLabels.length === 0}
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
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
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
