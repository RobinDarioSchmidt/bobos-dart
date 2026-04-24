"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SignedInOverviewSection, SignedOutLandingSection } from "@/components/home/entry-sections";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { getCheckoutSuggestions } from "@/lib/checkout-hints";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type AppMode = "match" | "training";
type SelectedFlow = "overview" | "local" | "training";
type GameMode = 301 | 501;
type EntryMode = "single" | "double" | "master";
type TrainingMode = "around-the-clock" | "bull-drill" | "shanghai" | "doubles-around";
type SegmentRing = "single" | "double" | "triple" | "outer-bull" | "bull" | "miss" | "unknown";

type Visit = {
  darts: number[];
  labels: string[];
  scoreBefore: number;
  scoreAfter: number;
  bust: boolean;
  checkout: boolean;
};

type Player = {
  name: string;
  score: number;
  legs: number;
  sets: number;
  visits: Visit[];
  entered: boolean;
};

type StoredStats = {
  legsFinished: number;
  matchesFinished: number;
  bestCheckout: number;
  bestAverage: number;
  trainingSessions: number;
  bestTrainingScore: number;
};

type MatchHistoryEntry = {
  id: string;
  playedAt: string;
  winner: string;
  opponents: string;
  mode: GameMode;
  doubleOut: boolean;
  sets: string;
};

type UndoSnapshot = {
  players: Player[];
  activePlayer: number;
  legStartingPlayer: number;
  legWinner: number | null;
  matchWinner: number | null;
  statusText: string;
  stats: StoredStats;
  history: MatchHistoryEntry[];
};

type TrainingSession = {
  mode: TrainingMode;
  targetIndex: number;
  dartsThrown: number;
  hits: number;
  score: number;
  finished: boolean;
  message: string;
  history: string[];
  throws: StoredThrow[];
  currentGoalHits: Array<"S" | "D" | "T">;
};

type Segment = {
  label: string;
  score: number;
  number: number;
  multiplier: 1 | 2 | 3;
};

type StoredThrow = {
  label: string;
  baseValue: number;
  multiplier: 0 | 1 | 2 | 3;
  ring: SegmentRing;
  score: number;
  hit: boolean;
  checkout: boolean;
  target: string | null;
};

type CloudMatchRow = {
  id: string;
  played_at: string;
  mode: string;
  double_out: boolean;
};

type CloudMatchPlayerRow = {
  match_id: string;
  guest_name: string | null;
  seat_index: number;
  is_winner: boolean;
  sets_won: number;
};

type CloudProfileRow = {
  display_name: string;
  username: string | null;
  app_settings?: CloudAppSettings | null;
};

type CloudDashboardStats = {
  matchesPlayed: number;
  matchesWon: number;
  totalSetsWon: number;
  totalLegsWon: number;
  bestAverage: number;
  bestVisit: number;
  trainingSessions: number;
  bestTrainingScore: number;
  totalTrainingDarts: number;
  totalTrainingHits: number;
};

type CloudPlayerPresence = {
  id: string;
  displayName: string;
  lastSeenAt: string;
  isActive: boolean;
};

type CloudRecentMilestone = {
  key: string;
  title: string;
  unlockedAt: string;
  tone: string;
};

type TrainingCloudRow = {
  score: number;
  darts_thrown: number;
  hits: number;
  played_at: string;
};

type CloudAppSettings = {
  appMode: AppMode;
  mode: GameMode;
  entryMode: EntryMode;
  doubleOut: boolean;
  legsToWin: number;
  setsToWin: number;
  playerNames: string[];
  trainingMode: TrainingMode;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function getInstallGuidance(userAgentValue: string, platformValue: string) {
  const userAgent = userAgentValue.toLowerCase();
  const platform = platformValue.toLowerCase();
  const os = userAgent.includes("android")
    ? "Android"
    : userAgent.includes("iphone") || userAgent.includes("ipad") || platform.includes("iphone") || platform.includes("ipad")
      ? "iOS"
      : userAgent.includes("windows")
        ? "Windows"
        : userAgent.includes("mac os") || platform.includes("mac")
          ? "macOS"
          : userAgent.includes("linux")
            ? "Linux"
            : "dein Gerät";
  const browser = userAgent.includes("opr/") || userAgent.includes("opera")
    ? "Opera"
    : userAgent.includes("edg/")
      ? "Edge"
      : userAgent.includes("firefox") || userAgent.includes("fxios")
        ? "Firefox"
        : userAgent.includes("crios") || (userAgent.includes("chrome") && !userAgent.includes("chromium"))
          ? "Chrome"
          : userAgent.includes("safari")
            ? "Safari"
            : "dein Browser";

  if (browser === "Opera") {
    return {
      title: `Installation für ${os}, ${browser}`,
      hint: "Opera zeigt den Installieren-Button oft nicht an. Öffne das Browser-Menü und wähle 'Install app' oder 'Zum Startbildschirm'.",
    };
  }

  if (os === "iOS") {
    return {
      title: `Installation für ${os}, ${browser}`,
      hint: "Auf Apple-Geräten installierst du die App über Teilen > Zum Home-Bildschirm. Ein direkter Installieren-Button ist dort normal nicht verfügbar.",
    };
  }

  if (browser === "Firefox" && os === "Android") {
    return {
      title: `Installation für ${os}, ${browser}`,
      hint: "In Firefox auf Android findest du die Installation meist im Drei-Punkte-Menü unter 'Installieren' oder 'Zum Startbildschirm hinzufügen'.",
    };
  }

  if (browser === "Chrome" || browser === "Edge") {
    return {
      title: `Installation für ${os}, ${browser}`,
      hint: "Wenn dein Browser die Installation anbietet, erscheint hier der Installieren-Button. Alternativ findest du sie meist im Browser-Menü.",
    };
  }

  return {
    title: `Installation für ${os}, ${browser}`,
    hint: "Wenn dein Browser die App unterstützt, erscheint der Installieren-Button automatisch. Sonst findest du die Option meist im Browser-Menü.",
  };
}

type LocalStoredState = CloudAppSettings & {
  stats: StoredStats;
  localMatchHistory: MatchHistoryEntry[];
};

const STORAGE_KEY = "bobos-dart-state-v3";

const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const QUICK_DARTS = [0, 1, 5, 10, 20, 25, 50, 60];
const VISIT_PRESETS = [26, 41, 45, 60, 81, 85, 95, 100, 121, 140, 180];
const LEGS_OPTIONS = [2, 3, 5];
const SETS_OPTIONS = [1, 2, 3];
const PLAYER_COUNT_OPTIONS = [2, 3, 4];
const TRAINING_TARGETS = [...Array.from({ length: 20 }, (_, index) => index + 1), 25];
const SHANGHAI_TARGETS = Array.from({ length: 20 }, (_, index) => index + 1);
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

const emptyStats: StoredStats = {
  legsFinished: 0,
  matchesFinished: 0,
  bestCheckout: 0,
  bestAverage: 0,
  trainingSessions: 0,
  bestTrainingScore: 0,
};

function createPlayers(mode: GameMode, names = ["Bobo", "Guest"], entryMode: EntryMode = "single"): Player[] {
  return names.map((name) => ({
    name,
    score: mode,
    legs: 0,
    sets: 0,
    visits: [],
    entered: entryMode === "single",
  }));
}

function createTrainingSession(mode: TrainingMode): TrainingSession {
  if (mode === "bull-drill") {
    return {
      mode,
      targetIndex: 0,
      dartsThrown: 0,
      hits: 0,
      score: 0,
      finished: false,
      message: "Bull Drill gestartet. Triff 10 Darts lang Bull oder Outer Bull.",
      history: [],
      throws: [],
      currentGoalHits: [],
    };
  }

  if (mode === "shanghai") {
    return {
      mode,
      targetIndex: 0,
      dartsThrown: 0,
      hits: 0,
      score: 0,
      finished: false,
      message: "Shanghai gestartet. Triff Single, Double und Triple auf dasselbe Ziel.",
      history: [],
      throws: [],
      currentGoalHits: [],
    };
  }

  if (mode === "doubles-around") {
    return {
      mode,
      targetIndex: 0,
      dartsThrown: 0,
      hits: 0,
      score: 0,
      finished: false,
      message: "Doubles Around gestartet. Arbeite dich über Doubles bis Bull.",
      history: [],
      throws: [],
      currentGoalHits: [],
    };
  }

  return {
    mode,
    targetIndex: 0,
    dartsThrown: 0,
    hits: 0,
    score: 0,
    finished: false,
    message: "Around the Clock gestartet. Ziel ist die 1.",
    history: [],
    throws: [],
    currentGoalHits: [],
  };
}

function getTrainingTargets(mode: TrainingMode) {
  if (mode === "shanghai") {
    return SHANGHAI_TARGETS;
  }

  return TRAINING_TARGETS;
}

function getTrainingModeLabel(mode: TrainingMode) {
  if (mode === "bull-drill") {
    return "Bull Drill";
  }
  if (mode === "shanghai") {
    return "Shanghai";
  }
  if (mode === "doubles-around") {
    return "Doubles Around";
  }
  return "Around the Clock";
}

function clonePlayers(players: Player[]) {
  return players.map((player) => ({
    ...player,
    visits: player.visits.map((visit) => ({
      ...visit,
      darts: [...visit.darts],
      labels: [...visit.labels],
    })),
  }));
}

function parseThrowLabel(label: string, fallbackScore = 0): StoredThrow {
  const trimmed = label.trim();

  if (trimmed === "Bull") {
    return {
      label: trimmed,
      baseValue: 25,
      multiplier: 2,
      ring: "bull",
      score: 50,
      hit: true,
      checkout: true,
      target: null,
    };
  }

  if (trimmed === "Outer Bull") {
    return {
      label: trimmed,
      baseValue: 25,
      multiplier: 1,
      ring: "outer-bull",
      score: 25,
      hit: true,
      checkout: false,
      target: null,
    };
  }

  const match = trimmed.match(/^([SDT])(\d{1,2})$/i);
  if (match) {
    const multiplier = match[1].toUpperCase() === "D" ? 2 : match[1].toUpperCase() === "T" ? 3 : 1;
    const baseValue = Number(match[2]);
    return {
      label: trimmed.toUpperCase(),
      baseValue,
      multiplier,
      ring: multiplier === 3 ? "triple" : multiplier === 2 ? "double" : "single",
      score: baseValue * multiplier,
      hit: true,
      checkout: multiplier === 2,
      target: null,
    };
  }

  const numeric = trimmed.startsWith("Visit ") ? Number(trimmed.replace("Visit ", "")) : Number(trimmed);
  if (!Number.isNaN(numeric)) {
    return {
      label: trimmed,
      baseValue: numeric,
      multiplier: 1,
      ring: numeric === 0 ? "miss" : "unknown",
      score: numeric,
      hit: numeric > 0,
      checkout: false,
      target: null,
    };
  }

  return {
    label: trimmed,
    baseValue: fallbackScore,
    multiplier: 1,
    ring: fallbackScore === 0 ? "miss" : "unknown",
    score: fallbackScore,
    hit: fallbackScore > 0,
    checkout: false,
    target: null,
  };
}

function segmentToStoredThrow(segment: Segment, target: string | null = null): StoredThrow {
  const ring: SegmentRing =
    segment.number === 25 && segment.multiplier === 2
      ? "bull"
      : segment.number === 25
        ? "outer-bull"
        : segment.multiplier === 3
          ? "triple"
          : segment.multiplier === 2
            ? "double"
            : "single";

  return {
    label: segment.label,
    baseValue: segment.number,
    multiplier: segment.multiplier,
    ring,
    score: segment.score,
    hit: segment.score > 0,
    checkout: ring === "double" || ring === "bull",
    target,
  };
}

function canStartLocalWithLabel(label: string, entryMode: EntryMode) {
  const parsed = parseThrowLabel(label);
  if (entryMode === "single") {
    return parsed.score > 0;
  }

  if (entryMode === "double") {
    return parsed.multiplier === 2;
  }

  return parsed.multiplier === 2 || parsed.multiplier === 3;
}

function canFinishLocalWithLabel(label: string, doubleOut: boolean) {
  if (!doubleOut) {
    return true;
  }

  const parsed = parseThrowLabel(label);
  return parsed.multiplier === 2;
}

function getEntryModeLabel(entryMode: EntryMode) {
  if (entryMode === "double") {
    return "Double In";
  }

  if (entryMode === "master") {
    return "Masters In";
  }

  return "Straight In";
}

function getNextEntryMode(entryMode: EntryMode): EntryMode {
  if (entryMode === "single") {
    return "double";
  }

  if (entryMode === "double") {
    return "master";
  }

  return "single";
}

function evaluateLocalVisit(
  scoreBefore: number,
  darts: number[],
  labels: string[],
  enteredBefore: boolean,
  entryMode: EntryMode,
  doubleOut: boolean,
) {
  let remaining = scoreBefore;
  let enteredAfter = enteredBefore;
  let countedTotal = 0;

  for (let index = 0; index < darts.length; index += 1) {
    const dart = darts[index] ?? 0;
    const label = labels[index] ?? `${dart}`;

    if (!enteredAfter) {
      if (!canStartLocalWithLabel(label, entryMode)) {
        continue;
      }

      enteredAfter = true;
    }

    remaining -= dart;
    countedTotal += dart;

    if (remaining < 0) {
      return {
        scoreAfter: scoreBefore,
        countedTotal,
        bust: true,
        checkout: false,
        enteredAfter: enteredBefore,
      };
    }

    if (doubleOut && remaining === 1) {
      return {
        scoreAfter: scoreBefore,
        countedTotal,
        bust: true,
        checkout: false,
        enteredAfter: enteredBefore,
      };
    }

    if (remaining === 0 && !canFinishLocalWithLabel(label, doubleOut)) {
      return {
        scoreAfter: scoreBefore,
        countedTotal,
        bust: true,
        checkout: false,
        enteredAfter: enteredBefore,
      };
    }
  }

  return {
    scoreAfter: remaining,
    countedTotal,
    bust: false,
    checkout: remaining === 0 && enteredAfter,
    enteredAfter,
  };
}

function formatAverage(pointsScored: number, dartsThrown: number) {
  if (dartsThrown === 0) {
    return "0.00";
  }

  return ((pointsScored / dartsThrown) * 3).toFixed(2);
}

function getCheckoutHints(score: number, doubleOut: boolean) {
  return getCheckoutSuggestions(score, doubleOut ? "double" : "single");
}

function getPlayerMetrics(player: Player) {
  const pointsScored = player.visits.reduce((sum, visit) => {
    if (visit.bust) {
      return sum;
    }

    return sum + (visit.scoreBefore - visit.scoreAfter);
  }, 0);

  const dartsThrown = player.visits.reduce((sum, visit) => sum + visit.darts.length, 0);
  const highestVisit = player.visits.reduce((best, visit) => {
    if (visit.bust) {
      return best;
    }

    return Math.max(best, visit.scoreBefore - visit.scoreAfter);
  }, 0);

  return {
    pointsScored,
    dartsThrown,
    highestVisit,
    average: formatAverage(pointsScored, dartsThrown),
  };
}

function getMatchScore(players: Player[]) {
  return players.map((player) => `${player.name} ${player.sets}`).join(" · ");
}

function getCurrentTrainingTarget(session: TrainingSession) {
  if (session.mode === "bull-drill") {
    return "Bull";
  }

  if (session.mode === "doubles-around") {
    const target = TRAINING_TARGETS[session.targetIndex];
    return target === 25 ? "Bull" : `D${target}`;
  }

  const target = getTrainingTargets(session.mode)[session.targetIndex];
  return target === 25 ? "Bull" : `${target}`;
}

function getPreferredProfileName(email: string | undefined, fallbackName: string, adminEmail: string) {
  if (email && adminEmail && email === adminEmail) {
    return "Robin";
  }

  return fallbackName.trim() || email?.split("@")[0] || "Spieler";
}

function buildCloudSettings(payload: CloudAppSettings) {
  return payload;
}

function toHistoryEntry(row: CloudMatchRow, players: CloudMatchPlayerRow[]): MatchHistoryEntry {
  const orderedPlayers = [...players].sort((a, b) => a.seat_index - b.seat_index);
  const winner = orderedPlayers.find((player) => player.is_winner)?.guest_name ?? "Unbekannt";
  const opponents = orderedPlayers
    .filter((player) => !player.is_winner)
    .map((player) => player.guest_name ?? "Gast")
    .join(", ");

  return {
    id: row.id,
    playedAt: new Date(row.played_at).toLocaleString("de-DE"),
    winner,
    opponents,
    mode: row.mode === "301" ? 301 : 501,
    doubleOut: row.double_out,
    sets: orderedPlayers.map((player) => `${player.guest_name ?? "Gast"} ${player.sets_won}`).join(" · "),
  };
}

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

function handleBoardKeyDown(
  event: React.KeyboardEvent<SVGGElement>,
  onSegmentSelect: (segment: Segment) => void,
  segment: Segment,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSegmentSelect(segment);
  }
}

function Dartboard({
  onSegmentSelect,
  caption,
}: {
  onSegmentSelect: (segment: Segment) => void;
  caption: string;
}) {
  const [hoveredSegment, setHoveredSegment] = useState<Segment | null>(null);

  return (
    <div className="rounded-[2rem] border border-white/10 bg-black/20 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Visuelles Dartboard</h3>
          <p className="text-sm text-stone-400">{caption}</p>
        </div>
        {hoveredSegment ? (
          <div className="min-h-[3.5rem] min-w-[9rem] rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-100">Ziel</p>
            <p className="whitespace-nowrap text-sm font-semibold text-white">
              {hoveredSegment.label} · {hoveredSegment.score} Punkte
            </p>
          </div>
        ) : (
          <div className="flex min-h-[3.5rem] min-w-[9rem] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-center text-xs uppercase tracking-[0.22em] text-stone-300 whitespace-nowrap">
            Hover + Klick
          </div>
        )}
      </div>

      <svg viewBox="0 0 400 400" className="mx-auto w-full max-w-[34rem] drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
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

          const segments: Array<{
            key: string;
            fill: string;
            path: string;
            segment: Segment;
          }> = [
            {
              key: `double-${value}`,
              fill: doubleTripleColor,
              path: describeSlice(BOARD_RADIUS.doubleInner, BOARD_RADIUS.doubleOuter, startAngle, endAngle),
              segment: { label: `D${value}`, score: value * 2, number: value, multiplier: 2 },
            },
            {
              key: `outer-single-${value}`,
              fill: singleColor,
              path: describeSlice(BOARD_RADIUS.tripleOuter, BOARD_RADIUS.doubleInner, startAngle, endAngle),
              segment: { label: `S${value}`, score: value, number: value, multiplier: 1 },
            },
            {
              key: `triple-${value}`,
              fill: doubleTripleColor,
              path: describeSlice(BOARD_RADIUS.tripleInner, BOARD_RADIUS.tripleOuter, startAngle, endAngle),
              segment: { label: `T${value}`, score: value * 3, number: value, multiplier: 3 },
            },
            {
              key: `inner-single-${value}`,
              fill: singleColor,
              path: describeSlice(BOARD_RADIUS.bullOuter, BOARD_RADIUS.tripleInner, startAngle, endAngle),
              segment: { label: `S${value}`, score: value, number: value, multiplier: 1 },
            },
          ];

          return (
            <g key={value}>
              {segments.map(({ key, fill, path, segment }) => (
                <g
                  key={key}
                  role="button"
                  tabIndex={0}
                  aria-label={segment.label}
                  onClick={() => onSegmentSelect(segment)}
                  onKeyDown={(event) => handleBoardKeyDown(event, onSegmentSelect, segment)}
                  className="cursor-pointer outline-none"
                >
                  <path
                    d={path}
                    fill={fill}
                    stroke="#0a0a0a"
                    strokeWidth="1.5"
                    onMouseEnter={() => setHoveredSegment(segment)}
                    onMouseLeave={() => setHoveredSegment((current) => (current?.label === segment.label ? null : current))}
                    onFocus={() => setHoveredSegment(segment)}
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
          tabIndex={0}
          aria-label="Outer Bull"
          onClick={() => onSegmentSelect({ label: "Outer Bull", score: 25, number: 25, multiplier: 1 })}
          onKeyDown={(event) =>
            handleBoardKeyDown(event, onSegmentSelect, {
              label: "Outer Bull",
              score: 25,
              number: 25,
              multiplier: 1,
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
              setHoveredSegment({ label: "Outer Bull", score: 25, number: 25, multiplier: 1 })
            }
            onMouseLeave={() => setHoveredSegment((current) => (current?.label === "Outer Bull" ? null : current))}
            onFocus={() => setHoveredSegment({ label: "Outer Bull", score: 25, number: 25, multiplier: 1 })}
            onBlur={() => setHoveredSegment((current) => (current?.label === "Outer Bull" ? null : current))}
            className="transition duration-150 hover:brightness-125 focus:brightness-125"
          />
        </g>
        <g
          role="button"
          tabIndex={0}
          aria-label="Bull"
          onClick={() => onSegmentSelect({ label: "Bull", score: 50, number: 25, multiplier: 2 })}
          onKeyDown={(event) =>
            handleBoardKeyDown(event, onSegmentSelect, {
              label: "Bull",
              score: 50,
              number: 25,
              multiplier: 2,
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
            onMouseEnter={() => setHoveredSegment({ label: "Bull", score: 50, number: 25, multiplier: 2 })}
            onMouseLeave={() => setHoveredSegment((current) => (current?.label === "Bull" ? null : current))}
            onFocus={() => setHoveredSegment({ label: "Bull", score: 50, number: 25, multiplier: 2 })}
            onBlur={() => setHoveredSegment((current) => (current?.label === "Bull" ? null : current))}
            className="transition duration-150 hover:brightness-125 focus:brightness-125"
          />
        </g>
      </svg>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-300">
          Single: normaler Ring
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          Double: aeußerer Ring
        </div>
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          Triple: mittlerer Ring
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [appMode, setAppMode] = useState<AppMode>("match");
  const [selectedFlow, setSelectedFlow] = useState<SelectedFlow>("overview");
  const [mode, setMode] = useState<GameMode>(501);
  const [entryMode, setEntryMode] = useState<EntryMode>("single");
  const [doubleOut, setDoubleOut] = useState(true);
  const [legsToWin, setLegsToWin] = useState(3);
  const [setsToWin, setSetsToWin] = useState(1);
  const [players, setPlayers] = useState<Player[]>(() => createPlayers(501, ["Bobo", "Guest"], "single"));
  const [activePlayer, setActivePlayer] = useState(0);
  const [legStartingPlayer, setLegStartingPlayer] = useState(0);
  const [currentDarts, setCurrentDarts] = useState<number[]>([]);
  const [currentLabels, setCurrentLabels] = useState<string[]>([]);
  const [manualDart, setManualDart] = useState("");
  const [manualVisit, setManualVisit] = useState("");
  const [legWinner, setLegWinner] = useState<number | null>(null);
  const [matchWinner, setMatchWinner] = useState<number | null>(null);
  const [statusText, setStatusText] = useState("Match bereit. Bobo beginnt.");
  const [stats, setStats] = useState<StoredStats>(emptyStats);
  const [localMatchHistory, setLocalMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [cloudMatchHistory, setCloudMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [localHistoryOpen, setLocalHistoryOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileDraft, setProfileDraft] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [cloudMessage, setCloudMessage] = useState("");
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudStats, setCloudStats] = useState<CloudDashboardStats | null>(null);
  const [playerPresence, setPlayerPresence] = useState<CloudPlayerPresence[]>([]);
  const [recentMilestones, setRecentMilestones] = useState<CloudRecentMilestone[]>([]);
  const [recentTrainingSessions, setRecentTrainingSessions] = useState<TrainingCloudRow[]>([]);
  const [trainingSession, setTrainingSession] = useState<TrainingSession>(() =>
    createTrainingSession("around-the-clock"),
  );
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installBusy, setInstallBusy] = useState(false);
  const [installTitle, setInstallTitle] = useState("Installation für dein Gerät");
  const [installHint, setInstallHint] = useState(
    "Je nach Browser kannst du die App direkt installieren oder über das Browser-Menü zum Homescreen hinzufügen.",
  );
  const [isInstalledApp, setIsInstalledApp] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [cloudSettingsReady, setCloudSettingsReady] = useState(false);
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "";
  const isAdmin = Boolean(session?.user.email && adminEmail && session.user.email === adminEmail);

  const applyStoredState = useCallback((parsed: Partial<LocalStoredState>) => {
    const parsedMode = parsed.mode === 301 || parsed.mode === 501 ? parsed.mode : 501;
    const parsedEntryMode =
      parsed.entryMode === "single" || parsed.entryMode === "double" || parsed.entryMode === "master"
        ? parsed.entryMode
        : "single";
    const names =
      parsed.playerNames && parsed.playerNames.length >= 2 && parsed.playerNames.length <= 4
        ? parsed.playerNames
        : ["Bobo", "Guest"];

    setMode(parsedMode);
    setEntryMode(parsedEntryMode);
    setPlayers(createPlayers(parsedMode, names, parsedEntryMode));
    setStatusText(`Match bereit. ${names[0]} beginnt.`);
    setActivePlayer(0);
    setLegStartingPlayer(0);
    setCurrentDarts([]);
    setCurrentLabels([]);
    setManualDart("");
    setManualVisit("");
    setLegWinner(null);
    setMatchWinner(null);
    setUndoStack([]);

    if (parsed.appMode === "match" || parsed.appMode === "training") {
      setAppMode(parsed.appMode);
    }

    if (typeof parsed.doubleOut === "boolean") {
      setDoubleOut(parsed.doubleOut);
    }

    if (typeof parsed.legsToWin === "number" && LEGS_OPTIONS.includes(parsed.legsToWin)) {
      setLegsToWin(parsed.legsToWin);
    }

    if (typeof parsed.setsToWin === "number" && SETS_OPTIONS.includes(parsed.setsToWin)) {
      setSetsToWin(parsed.setsToWin);
    }

    if (parsed.stats) {
      setStats({
        legsFinished: parsed.stats.legsFinished ?? 0,
        matchesFinished: parsed.stats.matchesFinished ?? 0,
        bestCheckout: parsed.stats.bestCheckout ?? 0,
        bestAverage: parsed.stats.bestAverage ?? 0,
        trainingSessions: parsed.stats.trainingSessions ?? 0,
        bestTrainingScore: parsed.stats.bestTrainingScore ?? 0,
      });
    }

    if (parsed.localMatchHistory) {
      setLocalMatchHistory(parsed.localMatchHistory.slice(0, 8));
    }

    if (
      parsed.trainingMode === "bull-drill" ||
      parsed.trainingMode === "around-the-clock" ||
      parsed.trainingMode === "shanghai" ||
      parsed.trainingMode === "doubles-around"
    ) {
      setTrainingSession(createTrainingSession(parsed.trainingMode));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const installMediaQuery = window.matchMedia("(display-mode: standalone)");

    const updateInstalledState = () => {
      const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
      setIsInstalledApp(Boolean(installMediaQuery.matches || standaloneNavigator.standalone));
    };

    const installGuidance = getInstallGuidance(window.navigator.userAgent, window.navigator.platform);
    setInstallTitle(installGuidance.title);
    setInstallHint(installGuidance.hint);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPromptEvent(null);
      setInstallBusy(false);
      setIsInstalledApp(true);
    };

    updateInstalledState();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    installMediaQuery.addEventListener("change", updateInstalledState);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      installMediaQuery.removeEventListener("change", updateInstalledState);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<{
        mode: GameMode;
        appMode: AppMode;
        entryMode: EntryMode;
        doubleOut: boolean;
        legsToWin: number;
        setsToWin: number;
        playerNames: string[];
        stats: StoredStats;
        localMatchHistory: MatchHistoryEntry[];
        trainingMode: TrainingMode;
      }>;
      applyStoredState(parsed);
    } catch {
      // Ignore invalid local state and continue with defaults.
    } finally {
      setHydrated(true);
    }
  }, [applyStoredState]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        appMode,
        mode,
        entryMode,
        doubleOut,
        legsToWin,
        setsToWin,
        playerNames: players.map((player) => player.name),
        stats,
        localMatchHistory,
        trainingMode: trainingSession.mode,
      }),
    );
  }, [
    appMode,
    doubleOut,
    entryMode,
    hydrated,
    legsToWin,
    localMatchHistory,
    mode,
    players,
    setsToWin,
    stats,
    trainingSession.mode,
  ]);

  const currentPlayer = players[activePlayer];
  const currentPlayerMetrics = useMemo(() => getPlayerMetrics(currentPlayer), [currentPlayer]);
  const localPlayerStats = useMemo(
    () =>
      players.map((player) => {
        const metrics = getPlayerMetrics(player);
        return {
          name: player.name,
          average: Number(metrics.average),
          bestVisit: metrics.highestVisit,
          visits: player.visits.length,
          busts: player.visits.filter((visit) => visit.bust).length,
          checkouts: player.visits.filter((visit) => visit.checkout).length,
          scoredPoints: metrics.pointsScored,
        };
      }),
    [players],
  );
  const currentVisitTotal = currentDarts.reduce((sum, dart) => sum + dart, 0);
  const checkoutHints = currentPlayer.entered ? getCheckoutHints(currentPlayer.score, doubleOut) : [];

  function saveSnapshot() {
    setUndoStack((prev) => [
      ...prev,
      {
        players: clonePlayers(players),
        activePlayer,
        legStartingPlayer,
        legWinner,
        matchWinner,
        statusText,
        stats: { ...stats },
        history: [...localMatchHistory],
      },
    ]);
  }

  const ensureProfile = useCallback(async (nextSession: Session) => {
    if (!supabase || !nextSession.user.email) {
      return;
    }

    const displayName = getPreferredProfileName(nextSession.user.email, players[0]?.name ?? "", adminEmail);
    const appSettings = buildCloudSettings({
      appMode,
      mode,
      entryMode,
      doubleOut,
      legsToWin,
      setsToWin,
      playerNames: players.map((player) => player.name),
      trainingMode: trainingSession.mode,
    });

    await supabase.from("profiles").upsert({
      id: nextSession.user.id,
      display_name: displayName,
      username: nextSession.user.email,
      app_settings: appSettings,
      updated_at: new Date().toISOString(),
    });
  }, [adminEmail, appMode, doubleOut, entryMode, legsToWin, mode, players, setsToWin, trainingSession.mode]);

  const loadCloudProfile = useCallback(async (nextSession: Session) => {
    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("display_name, username, app_settings")
      .eq("id", nextSession.user.id)
      .single();

    if (error || !data) {
      return;
    }

    const profile = data as CloudProfileRow;
    const preferredName = getPreferredProfileName(nextSession.user.email, profile.display_name, adminEmail);
    if (profile.app_settings) {
      applyStoredState(profile.app_settings as Partial<LocalStoredState>);
    }

    if (preferredName !== profile.display_name) {
      await supabase.from("profiles").update({ display_name: preferredName }).eq("id", nextSession.user.id);
    }

    setProfileName(preferredName);
    setProfileDraft(preferredName);
    setPlayers((prev) => {
      if (prev.length === 0 || !preferredName) {
        return prev;
      }

      const currentName = prev[0]?.name?.trim();
      if (currentName === preferredName) {
        return prev;
      }

      return prev.map((player, index) =>
        index === 0
          ? {
              ...player,
              name: preferredName,
            }
          : player,
      );
    });
    setCloudSettingsReady(true);
  }, [adminEmail, applyStoredState]);

  const loadCloudMatches = useCallback(async (nextSession: Session) => {
    if (!supabase) {
      return;
    }

    setCloudLoading(true);
    setCloudMessage("");

    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();

    const accessToken = freshSession?.access_token ?? nextSession.access_token;
    if (!accessToken) {
      setCloudLoading(false);
      setCloudMessage("Kein gültiger Cloud-Token gefunden.");
      return;
    }

    const response = await fetch("/api/cloud/matches", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const result = (await response.json()) as {
      error?: string;
      matches?: CloudMatchRow[];
      players?: CloudMatchPlayerRow[];
    };

    setCloudLoading(false);

    if (!response.ok || result.error) {
      setCloudMessage(`Cloud-Historie konnte nicht geladen werden: ${result.error ?? "Unbekannter Fehler"}`);
      return;
    }

    const rows = result.matches ?? [];
    if (rows.length === 0) {
      setCloudMatchHistory([]);
      setCloudMessage("Noch keine Cloud-Matches gespeichert.");
      return;
    }

    const playerRows = result.players ?? [];
    const history = rows.map((row) =>
      toHistoryEntry(
        row,
        playerRows.filter((player) => player.match_id === row.id),
      ),
    );

    setCloudMatchHistory(history);
    setCloudMessage("Cloud-Historie geladen.");
  }, []);

  const loadCloudDashboard = useCallback(async (nextSession: Session) => {
    if (!supabase) {
      return;
    }

    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();

    const accessToken = freshSession?.access_token ?? nextSession.access_token;
    if (!accessToken) {
      return;
    }

    const response = await fetch("/api/cloud/dashboard", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const result = (await response.json()) as {
      error?: string;
      profile?: CloudProfileRow & { created_at?: string };
      stats?: CloudDashboardStats;
      recentTraining?: TrainingCloudRow[];
      insights?: {
        recentMilestones?: CloudRecentMilestone[];
      };
    };

    if (!response.ok || result.error) {
      setCloudMessage(`Cloud-Profil konnte nicht geladen werden: ${result.error ?? "Unbekannter Fehler"}`);
      return;
    }

    if (result.profile?.display_name) {
      setProfileName(result.profile.display_name);
      setProfileDraft(result.profile.display_name);
    }

    setCloudStats(result.stats ?? null);
    setRecentMilestones(result.insights?.recentMilestones ?? []);
    setRecentTrainingSessions(result.recentTraining ?? []);
  }, []);

  const loadPlayerPresence = useCallback(async (nextSession: Session) => {
    if (!supabase) {
      return;
    }

    const {
      data: { session: freshSession },
    } = await supabase.auth.getSession();

    const accessToken = freshSession?.access_token ?? nextSession.access_token;
    if (!accessToken) {
      return;
    }

    const response = await fetch("/api/cloud/players", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const result = (await response.json()) as {
      error?: string;
      players?: CloudPlayerPresence[];
    };

    if (!response.ok || result.error) {
      return;
    }

    setPlayerPresence(result.players ?? []);
  }, []);

  const refreshCloudData = useCallback(
    async (nextSession: Session, options?: { includeHistory?: boolean }) => {
      if (options?.includeHistory) {
        await loadCloudMatches(nextSession);
      }
      await Promise.all([loadCloudDashboard(nextSession), loadPlayerPresence(nextSession)]);
    },
    [loadCloudDashboard, loadCloudMatches, loadPlayerPresence],
  );

  async function saveProfileDraft() {
    if (!supabase || !session) {
      return;
    }

    const trimmedName = profileDraft.trim();
    if (!trimmedName) {
      setCloudMessage("Profilname darf nicht leer sein.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: trimmedName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    if (error) {
      setCloudMessage(`Profil konnte nicht gespeichert werden: ${error.message}`);
      return;
    }

    setProfileName(trimmedName);
    setPlayers((prev) =>
      prev.map((player, index) =>
        index === 0
          ? {
              ...player,
              name: trimmedName,
            }
          : player,
      ),
    );
    setCloudMessage("Profilname in der Cloud gespeichert.");
    await refreshCloudData(session, { includeHistory: true });
  }

  useEffect(() => {
    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        void loadCloudProfile(data.session);
        void refreshCloudData(data.session, { includeHistory: true });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void loadCloudProfile(nextSession);
        void refreshCloudData(nextSession, { includeHistory: true });
      } else {
        setProfileName("");
        setProfileDraft("");
        setCloudMatchHistory([]);
        setCloudStats(null);
        setPlayerPresence([]);
        setRecentMilestones([]);
        setRecentTrainingSessions([]);
        setCloudSettingsReady(false);
        setSelectedFlow("overview");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadCloudProfile, refreshCloudData]);

  useEffect(() => {
    if (!session || !supabase) {
      return;
    }

    const currentName = players[0]?.name?.trim();
    const preferredName = getPreferredProfileName(session.user.email, currentName ?? "", adminEmail);

    if (!currentName || currentName !== preferredName) {
      setPlayers((prev) =>
        prev.map((player, index) =>
          index === 0
            ? {
                ...player,
                name: preferredName,
              }
            : player,
        ),
      );
    }

    if (!preferredName || preferredName === profileName) {
      return;
    }

    void ensureProfile(session).then(() => {
      setProfileName(preferredName);
    });
  }, [adminEmail, ensureProfile, players, profileName, session]);

  useEffect(() => {
    if (!session || !supabase || !cloudSettingsReady) {
      return;
    }

    const appSettings = buildCloudSettings({
      appMode,
      mode,
      entryMode,
      doubleOut,
      legsToWin,
      setsToWin,
      playerNames: players.map((player) => player.name),
      trainingMode: trainingSession.mode,
    });

    void supabase
      .from("profiles")
      .update({
        app_settings: appSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);
  }, [appMode, cloudSettingsReady, doubleOut, entryMode, legsToWin, mode, players, session, setsToWin, trainingSession.mode]);

  useEffect(() => {
    if (!session || typeof window === "undefined") {
      return;
    }

    const refreshVisibleCloudData = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void refreshCloudData(session, { includeHistory: true });
    };

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshCloudData(session);
      }
    }, 45000);

    window.addEventListener("focus", refreshVisibleCloudData);
    document.addEventListener("visibilitychange", refreshVisibleCloudData);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisibleCloudData);
      document.removeEventListener("visibilitychange", refreshVisibleCloudData);
    };
  }, [refreshCloudData, session]);

  async function handleAuthSubmit() {
    if (!supabase) {
      setAuthMessage("Supabase ist noch nicht konfiguriert.");
      return;
    }

    if (!email || !password) {
      setAuthMessage("Bitte E-Mail und Passwort ausfüllen.");
      return;
    }

    setAuthMessage("");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthMessage(error.message);
      return;
    }

    if (data.session) {
      await ensureProfile(data.session);
      await refreshCloudData(data.session, { includeHistory: true });
      setAuthMessage("Login erfolgreich.");
      setSelectedFlow("overview");
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    setCloudMessage("Abgemeldet. Lokale Daten bleiben erhalten.");
    setSelectedFlow("overview");
  }

  async function saveMatchToCloud(winnerIndex: number, finalPlayers: Player[]) {
    if (!supabase || !session) {
      return;
    }

    const winner = finalPlayers[winnerIndex];
    const { data: matchRow, error: matchError } = await supabase
      .from("matches")
      .insert({
        owner_id: session.user.id,
        mode: String(mode),
        double_out: doubleOut,
        legs_to_win: legsToWin,
        sets_to_win: setsToWin,
        winner_profile_id: winnerIndex === 0 ? session.user.id : null,
      })
      .select("id")
      .single();

    if (matchError || !matchRow) {
      setCloudMessage("Match konnte nicht in der Cloud gespeichert werden.");
      return;
    }

    const playerRows = finalPlayers.map((player, seatIndex) => {
      const metrics = getPlayerMetrics(player);
      return {
        match_id: matchRow.id,
        profile_id: seatIndex === 0 ? session.user.id : null,
        guest_name: player.name,
        seat_index: seatIndex,
        sets_won: player.sets,
        legs_won: player.legs,
        average: Number(metrics.average),
        best_visit: metrics.highestVisit,
        is_winner: seatIndex === winnerIndex,
      };
    });

    const { error: playersError } = await supabase.from("match_players").insert(playerRows);

    if (playersError) {
      setCloudMessage("Match wurde nur teilweise gespeichert.");
      return;
    }

    const dartRows = finalPlayers.flatMap((player, seatIndex) =>
      player.visits.flatMap((visit, visitIndex) =>
        visit.labels.map((label, dartIndex) => {
          const parsed = parseThrowLabel(label, visit.darts[dartIndex] ?? 0);
          const isLastDart = dartIndex === visit.labels.length - 1;

          return {
            owner_id: session.user.id,
            source_type: "match",
            match_id: matchRow.id,
            training_session_id: null,
            player_name: player.name,
            player_seat_index: seatIndex,
            visit_index: visitIndex,
            dart_index: dartIndex,
            segment_label: parsed.label,
            base_value: parsed.baseValue,
            multiplier: parsed.multiplier,
            ring: parsed.ring,
            score: parsed.score,
            is_hit: parsed.hit,
            is_checkout_dart: visit.checkout && isLastDart,
            target_label: null,
          };
        }),
      ),
    );

    if (dartRows.length > 0) {
      const { error: dartsError } = await supabase.from("dart_events").insert(dartRows);
      if (dartsError) {
        setCloudMessage("Match gespeichert, aber Wurfdaten konnten nicht gesichert werden.");
        return;
      }
    }

    setCloudMessage(`Cloud-Save erfolgreich für ${winner.name}.`);
    await refreshCloudData(session, { includeHistory: true });
  }

  async function saveTrainingSessionToCloud(nextSession: TrainingSession) {
    if (!supabase || !session) {
      return;
    }

    const { data: trainingRow, error } = await supabase.from("training_sessions").insert({
      owner_id: session.user.id,
      mode: nextSession.mode,
      score: nextSession.score,
      hits: nextSession.hits,
      darts_thrown: nextSession.dartsThrown,
      finished: nextSession.finished,
      notes: nextSession.history,
    }).select("id").single();

    if (error || !trainingRow) {
      setCloudMessage("Training konnte nicht in der Cloud gespeichert werden.");
      return;
    }

    if (nextSession.throws.length > 0) {
      const dartRows = nextSession.throws.map((entry, index) => ({
        owner_id: session.user.id,
        source_type: "training",
        match_id: null,
        training_session_id: trainingRow.id,
        player_name: profileName || players[0]?.name || "Spieler",
        player_seat_index: 0,
        visit_index: 0,
        dart_index: index,
        segment_label: entry.label,
        base_value: entry.baseValue,
        multiplier: entry.multiplier,
        ring: entry.ring,
        score: entry.score,
        is_hit: entry.hit,
        is_checkout_dart: false,
        target_label: entry.target,
      }));

      const { error: dartsError } = await supabase.from("dart_events").insert(dartRows);
      if (dartsError) {
        setCloudMessage("Training gespeichert, aber Wurfdaten konnten nicht gesichert werden.");
        return;
      }
    }

    setCloudMessage("Training in der Cloud gespeichert.");
    await refreshCloudData(session);
  }

function resetLegBoards(nextPlayers: Player[]) {
  return nextPlayers.map((player) => ({
    ...player,
    score: mode,
    visits: [],
    entered: entryMode === "single",
  }));
}

  function startFreshMatch(nextMode = mode) {
    const names = players.map((player) => player.name);
    const nextPlayers = createPlayers(nextMode, names, entryMode);
    setMode(nextMode);
    setPlayers(nextPlayers);
    setActivePlayer(0);
    setLegStartingPlayer(0);
    setCurrentDarts([]);
    setCurrentLabels([]);
    setManualDart("");
    setManualVisit("");
    setLegWinner(null);
    setMatchWinner(null);
    setStatusText(
      entryMode === "single"
        ? `Neues Match bereit. ${nextPlayers[0].name} beginnt.`
        : `Neues Match bereit. ${nextPlayers[0].name} sucht ${getEntryModeLabel(entryMode)}.`,
    );
    setUndoStack([]);
  }

  function setPlayerCount(nextCount: number) {
    const nextNames = Array.from(
      { length: nextCount },
      (_, index) => players[index]?.name ?? `Spieler ${index + 1}`,
    );
    const nextPlayers = createPlayers(mode, nextNames, entryMode);
    setPlayers(nextPlayers);
    setActivePlayer(0);
    setLegStartingPlayer(0);
    setCurrentDarts([]);
    setCurrentLabels([]);
    setManualDart("");
    setManualVisit("");
    setLegWinner(null);
    setMatchWinner(null);
    setStatusText(
      entryMode === "single"
        ? `Neues Match bereit. ${nextPlayers[0].name} beginnt.`
        : `Neues Match bereit. ${nextPlayers[0].name} sucht ${getEntryModeLabel(entryMode)}.`,
    );
    setUndoStack([]);
  }

  function cycleEntryMode() {
    const nextEntryMode = getNextEntryMode(entryMode);
    const names = players.map((player) => player.name);
    const nextPlayers = createPlayers(mode, names, nextEntryMode);

    setEntryMode(nextEntryMode);
    setPlayers(nextPlayers);
    setActivePlayer(0);
    setLegStartingPlayer(0);
    setCurrentDarts([]);
    setCurrentLabels([]);
    setManualDart("");
    setManualVisit("");
    setLegWinner(null);
    setMatchWinner(null);
    setStatusText(
      nextEntryMode === "single"
        ? `Neues Match bereit. ${nextPlayers[0].name} beginnt.`
        : `Neues Match bereit. ${nextPlayers[0].name} sucht ${getEntryModeLabel(nextEntryMode)}.`,
    );
    setUndoStack([]);
  }

  function startNextLeg() {
    if (matchWinner !== null) {
      return;
    }

    const nextStarter = (legStartingPlayer + 1) % players.length;
    setPlayers((prev) => resetLegBoards(clonePlayers(prev)));
    setActivePlayer(nextStarter);
    setLegStartingPlayer(nextStarter);
    setCurrentDarts([]);
    setCurrentLabels([]);
    setManualDart("");
    setManualVisit("");
    setLegWinner(null);
    setStatusText(
      entryMode === "single"
        ? `Nächstes Leg gestartet. ${players[nextStarter].name} ist am Zug.`
        : `Nächstes Leg gestartet. ${players[nextStarter].name} sucht ${getEntryModeLabel(entryMode)}.`,
    );
    setUndoStack([]);
  }

  function updatePlayerName(index: number, name: string) {
    setPlayers((prev) =>
      prev.map((player, playerIndex) =>
        playerIndex === index
          ? {
              ...player,
              name: name.trimStart() || `Spieler ${index + 1}`,
            }
          : player,
      ),
    );
  }

  function addDartValue(value: number, label?: string) {
    if (legWinner !== null || matchWinner !== null || currentDarts.length >= 3) {
      return;
    }

    if (value < 0 || value > 60) {
      return;
    }

    setCurrentDarts((prev) => [...prev, value]);
    setCurrentLabels((prev) => [...prev, label ?? `${value}`]);
    setManualDart("");
  }

  function addBoardSegment(segment: Segment) {
    addDartValue(segment.score, segment.label);
  }

  function commitManualDart() {
    const value = Number(manualDart);
    if (Number.isNaN(value)) {
      return;
    }

    addDartValue(value);
  }

  function recordVisit(darts: number[], labels = darts.map(String)) {
    if (legWinner !== null || matchWinner !== null || darts.length === 0) {
      return;
    }

    saveSnapshot();

    const nextPlayers = clonePlayers(players);
    const player = nextPlayers[activePlayer];
    const evaluation = evaluateLocalVisit(player.score, darts, labels, player.entered, entryMode, doubleOut);
    const total = evaluation.countedTotal;
    const remaining = evaluation.scoreAfter;
    const checkout = evaluation.checkout;
    const bust = evaluation.bust;

    const visit: Visit = {
      darts,
      labels,
      scoreBefore: player.score,
      scoreAfter: bust ? player.score : remaining,
      bust,
      checkout: !bust && checkout,
    };

    player.visits = [...player.visits, visit];
    player.score = bust ? player.score : remaining;
    player.entered = evaluation.enteredAfter;

    setPlayers(nextPlayers);
    setCurrentDarts([]);
    setCurrentLabels([]);
    setManualDart("");
    setManualVisit("");

    if (bust) {
      const nextPlayerIndex = (activePlayer + 1) % nextPlayers.length;
      setActivePlayer(nextPlayerIndex);
      setStatusText(`${player.name} bustet. ${nextPlayers[nextPlayerIndex].name} übernimmt.`);
      return;
    }

    if (checkout) {
      const metrics = getPlayerMetrics(player);
      const nextStats: StoredStats = {
        ...stats,
        legsFinished: stats.legsFinished + 1,
        bestCheckout: Math.max(stats.bestCheckout, total),
        bestAverage: Math.max(stats.bestAverage, Number(metrics.average)),
      };

      player.legs += 1;

      let nextHistory = [...localMatchHistory];
      let nextStatus = `${player.name} gewinnt das Leg.`;
      const winnerIndex: number | null = activePlayer;
      let finalMatchWinner: number | null = null;

      if (player.legs >= legsToWin) {
        player.sets += 1;
        nextStatus = `${player.name} gewinnt den Satz.`;

        nextPlayers.forEach((entry) => {
          entry.legs = 0;
        });
      }

      if (player.sets >= setsToWin) {
        finalMatchWinner = activePlayer;
        const opponents = nextPlayers
          .filter((_, index) => index !== activePlayer)
          .map((entry) => entry.name)
          .join(", ");
        nextHistory = [
          {
            id: `${Date.now()}`,
            playedAt: new Date().toLocaleString("de-DE"),
            winner: player.name,
            opponents,
            mode,
            doubleOut,
            sets: getMatchScore(nextPlayers),
          },
          ...nextHistory,
        ].slice(0, 8);
        nextStatus = `${player.name} gewinnt das Match ${getMatchScore(nextPlayers)}.`;
        nextStats.matchesFinished += 1;
      }

      setPlayers(nextPlayers);
      setStats(nextStats);
      setLocalMatchHistory(nextHistory);
      setLegWinner(winnerIndex);
      setMatchWinner(finalMatchWinner);
      setStatusText(nextStatus);
      if (finalMatchWinner !== null) {
        void saveMatchToCloud(finalMatchWinner, nextPlayers);
      }
      return;
    }

    const nextPlayerIndex = (activePlayer + 1) % nextPlayers.length;
    setActivePlayer(nextPlayerIndex);
    if (!player.entered && entryMode !== "single") {
      setStatusText(
        `${player.name} sucht weiter ${getEntryModeLabel(entryMode)}. ${nextPlayers[nextPlayerIndex].name} ist dran.`,
      );
      return;
    }

    if (entryMode !== "single" && !nextPlayers[nextPlayerIndex]?.entered) {
      setStatusText(
        `${player.name} stellt ${remaining}. ${nextPlayers[nextPlayerIndex].name} sucht ${getEntryModeLabel(entryMode)}.`,
      );
      return;
    }

    setStatusText(`${player.name} stellt ${remaining}. ${nextPlayers[nextPlayerIndex].name} ist dran.`);
  }

  function submitManualVisit() {
    const total = Number(manualVisit);
    if (Number.isNaN(total) || total < 0 || total > 180) {
      return;
    }

    recordVisit([total], [`Visit ${total}`]);
  }

  function undo() {
    if (currentDarts.length > 0) {
      setCurrentDarts((prev) => prev.slice(0, -1));
      setCurrentLabels((prev) => prev.slice(0, -1));
      return;
    }

    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot) {
      return;
    }

    setPlayers(snapshot.players);
    setActivePlayer(snapshot.activePlayer);
    setLegStartingPlayer(snapshot.legStartingPlayer);
    setLegWinner(snapshot.legWinner);
    setMatchWinner(snapshot.matchWinner);
    setStatusText(snapshot.statusText);
    setStats(snapshot.stats);
    setLocalMatchHistory(snapshot.history);
    setUndoStack((prev) => prev.slice(0, -1));
    setCurrentDarts([]);
    setCurrentLabels([]);
    setManualDart("");
    setManualVisit("");
  }

  function resetTraining(modeOverride = trainingSession.mode) {
    setTrainingSession(createTrainingSession(modeOverride));
  }

  function switchTrainingMode(nextMode: TrainingMode) {
    setTrainingSession(createTrainingSession(nextMode));
  }

  async function installApp() {
    if (!installPromptEvent) {
      return;
    }

    setInstallBusy(true);
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome !== "accepted") {
      setInstallBusy(false);
    }
    setInstallPromptEvent(null);
  }

  function registerTrainingThrow(segment: Segment) {
    if (trainingSession.finished) {
      return;
    }

    const targetPool = getTrainingTargets(trainingSession.mode);
    const currentTargetValue = targetPool[trainingSession.targetIndex];
    const targetLabel = trainingSession.mode === "bull-drill"
      ? "Bull"
      : currentTargetValue === 25
        ? "Bull"
        : `${currentTargetValue}`;
    const storedThrow = segmentToStoredThrow(segment, targetLabel);

    if (trainingSession.mode === "bull-drill") {
      const isBull = segment.number === 25;
      const gained = isBull ? segment.score : 0;
      const dartsThrown = trainingSession.dartsThrown + 1;
      const hits = trainingSession.hits + (isBull ? 1 : 0);
      const score = trainingSession.score + gained;
      const finished = dartsThrown >= 10;
      const historyEntry = `${segment.label}${isBull ? " getroffen" : " vorbei"}`;
      const message = finished
        ? `Bull Drill beendet. ${hits} Treffer für ${score} Punkte.`
        : `Bull Drill: Dart ${dartsThrown}/10 - ${historyEntry}.`;

      setTrainingSession((prev) => ({
        ...prev,
        dartsThrown,
        hits,
        score,
        finished,
        message,
        history: [historyEntry, ...prev.history].slice(0, 12),
        throws: [...prev.throws, storedThrow],
      }));

      if (finished) {
        setStats((prev) => ({
          ...prev,
          trainingSessions: prev.trainingSessions + 1,
          bestTrainingScore: Math.max(prev.bestTrainingScore, score),
        }));
        void saveTrainingSessionToCloud({
          ...trainingSession,
          dartsThrown,
          hits,
          score,
          finished,
          message,
          history: [historyEntry, ...trainingSession.history].slice(0, 12),
          throws: [...trainingSession.throws, storedThrow],
        });
      }

      return;
    }

    if (trainingSession.mode === "doubles-around") {
      const target = TRAINING_TARGETS[trainingSession.targetIndex];
      const hit =
        target === 25
          ? segment.number === 25 && segment.multiplier === 2
          : segment.number === target && segment.multiplier === 2;
      const nextIndex = hit ? trainingSession.targetIndex + 1 : trainingSession.targetIndex;
      const finished = nextIndex >= TRAINING_TARGETS.length;
      const hits = trainingSession.hits + (hit ? 1 : 0);
      const dartsThrown = trainingSession.dartsThrown + 1;
      const gained = hit ? (target === 25 ? 50 : target * 2) : 0;
      const score = trainingSession.score + gained;
      const nextTarget = finished ? "fertig" : TRAINING_TARGETS[nextIndex] === 25 ? "Bull" : `D${TRAINING_TARGETS[nextIndex]}`;
      const historyEntry = `${segment.label} auf ${target === 25 ? "Bull" : `D${target}`}: ${hit ? "Treffer" : "Fehlwurf"}`;
      const message = finished
        ? `Doubles Around beendet in ${dartsThrown} Darts.`
        : hit
          ? `Double getroffen. Nächstes Ziel: ${nextTarget}.`
          : `Noch nicht drin. Ziel bleibt ${target === 25 ? "Bull" : `D${target}`}.`;

      setTrainingSession((prev) => ({
        ...prev,
        targetIndex: nextIndex,
        dartsThrown,
        hits,
        score,
        finished,
        message,
        history: [historyEntry, ...prev.history].slice(0, 12),
        throws: [...prev.throws, storedThrow],
        currentGoalHits: [],
      }));

      if (finished) {
        setStats((prev) => ({
          ...prev,
          trainingSessions: prev.trainingSessions + 1,
          bestTrainingScore: Math.max(prev.bestTrainingScore, score),
        }));
        void saveTrainingSessionToCloud({
          ...trainingSession,
          targetIndex: nextIndex,
          dartsThrown,
          hits,
          score,
          finished,
          message,
          history: [historyEntry, ...trainingSession.history].slice(0, 12),
          throws: [...trainingSession.throws, storedThrow],
          currentGoalHits: [],
        });
      }
      return;
    }

    if (trainingSession.mode === "shanghai") {
      const target = SHANGHAI_TARGETS[trainingSession.targetIndex];
      const hitType =
        segment.number === target
          ? segment.multiplier === 3
            ? "T"
            : segment.multiplier === 2
              ? "D"
              : "S"
          : null;
      const alreadyHit = hitType ? trainingSession.currentGoalHits.includes(hitType) : false;
      const nextGoalHits: Array<"S" | "D" | "T"> =
        hitType && !alreadyHit ? [...trainingSession.currentGoalHits, hitType] : trainingSession.currentGoalHits;
      const clearedTarget = nextGoalHits.length === 3;
      const nextIndex = clearedTarget ? trainingSession.targetIndex + 1 : trainingSession.targetIndex;
      const finished = nextIndex >= SHANGHAI_TARGETS.length;
      const hits = trainingSession.hits + (hitType && !alreadyHit ? 1 : 0);
      const dartsThrown = trainingSession.dartsThrown + 1;
      const score = trainingSession.score + (hitType && !alreadyHit ? segment.score : 0);
      const nextTarget = finished ? "fertig" : `${SHANGHAI_TARGETS[nextIndex]}`;
      const progressText = nextGoalHits.length > 0 ? nextGoalHits.join("/") : "noch offen";
      const historyEntry = `${segment.label} auf ${target}: ${hitType && !alreadyHit ? `${hitType} gesammelt` : "kein neuer Treffer"}`;
      const message = finished
        ? `Shanghai beendet in ${dartsThrown} Darts.`
        : clearedTarget
          ? `Shanghai auf ${target} komplett. Nächstes Ziel: ${nextTarget}.`
          : `Shanghai ${target}: ${progressText}.`;

      setTrainingSession((prev) => ({
        ...prev,
        targetIndex: nextIndex,
        dartsThrown,
        hits,
        score,
        finished,
        message,
        history: [historyEntry, ...prev.history].slice(0, 12),
        throws: [...prev.throws, storedThrow],
        currentGoalHits: clearedTarget ? [] : nextGoalHits,
      }));

      if (finished) {
        setStats((prev) => ({
          ...prev,
          trainingSessions: prev.trainingSessions + 1,
          bestTrainingScore: Math.max(prev.bestTrainingScore, score),
        }));
        void saveTrainingSessionToCloud({
          ...trainingSession,
          targetIndex: nextIndex,
          dartsThrown,
          hits,
          score,
          finished,
          message,
          history: [historyEntry, ...trainingSession.history].slice(0, 12),
          throws: [...trainingSession.throws, storedThrow],
          currentGoalHits: [],
        });
      }
      return;
    }

    const target = currentTargetValue;
    const hit = segment.number === target;
    const nextIndex = hit ? trainingSession.targetIndex + 1 : trainingSession.targetIndex;
    const finished = nextIndex >= targetPool.length;
    const hits = trainingSession.hits + (hit ? 1 : 0);
    const dartsThrown = trainingSession.dartsThrown + 1;
    const score = hit ? trainingSession.score + 10 : trainingSession.score;
    const nextTarget = finished ? "fertig" : targetPool[nextIndex] === 25 ? "Bull" : `${targetPool[nextIndex]}`;
    const historyEntry = `${segment.label} auf ${target === 25 ? "Bull" : target}: ${hit ? "Treffer" : "Fehlwurf"}`;
    const message = finished
      ? `Around the Clock beendet in ${dartsThrown} Darts.`
      : hit
        ? `Treffer. Nächstes Ziel: ${nextTarget}.`
        : `Knapp daneben. Ziel bleibt ${target === 25 ? "Bull" : target}.`;

    setTrainingSession((prev) => ({
      ...prev,
      targetIndex: nextIndex,
      dartsThrown,
      hits,
      score,
      finished,
      message,
      history: [historyEntry, ...prev.history].slice(0, 12),
      throws: [...prev.throws, storedThrow],
      currentGoalHits: [],
    }));

    if (finished) {
      setStats((prev) => ({
        ...prev,
        trainingSessions: prev.trainingSessions + 1,
        bestTrainingScore: Math.max(prev.bestTrainingScore, score),
      }));
      void saveTrainingSessionToCloud({
        ...trainingSession,
        targetIndex: nextIndex,
        dartsThrown,
        hits,
        score,
        finished,
        message,
        history: [historyEntry, ...trainingSession.history].slice(0, 12),
        throws: [...trainingSession.throws, storedThrow],
        currentGoalHits: [],
      });
    }
  }

  const finishDisabled = currentDarts.length === 0 || legWinner !== null || matchWinner !== null;
  const trainingTarget = getCurrentTrainingTarget(trainingSession);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937,_#09090b_55%)] pb-28 text-stone-100 sm:pb-8">
      <div
        className={`mx-auto flex w-full ${
          session && selectedFlow !== "overview" ? "max-w-5xl" : "max-w-7xl"
        } flex-col gap-6 py-4 sm:px-6 sm:py-6 lg:px-8 ${session && selectedFlow === "overview" ? "px-0" : "px-4"}`}
      >
        {!session ? (
          <SignedOutLandingSection
            supabaseEnabled={supabaseEnabled}
            email={email}
            password={password}
            authMessage={authMessage}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onLogin={() => void handleAuthSubmit()}
          />
        ) : selectedFlow === "overview" ? (
          <SignedInOverviewSection
            sessionEmail={session.user.email ?? ""}
            profileName={profileName}
            profileDraft={profileDraft}
            isAdmin={isAdmin}
            cloudStats={
              cloudStats
                ? {
                    matchesPlayed: cloudStats.matchesPlayed,
                    matchesWon: cloudStats.matchesWon,
                    bestAverage: cloudStats.bestAverage,
                    bestVisit: cloudStats.bestVisit,
                    trainingSessions: cloudStats.trainingSessions,
                  }
                : null
            }
            cloudMessage={cloudMessage}
            cloudLoading={cloudLoading}
            playerPresence={playerPresence}
            recentMilestones={recentMilestones}
            onProfileDraftChange={setProfileDraft}
            onSaveProfile={() => void saveProfileDraft()}
            onStartLocal={() => {
              setAppMode("match");
              setSelectedFlow("local");
            }}
            onStartTraining={() => {
              setAppMode("training");
              setSelectedFlow("training");
            }}
            onRefreshCloud={() => void refreshCloudData(session, { includeHistory: true })}
            onLogout={() => void handleSignOut()}
            canInstallApp={Boolean(installPromptEvent)}
            isInstalledApp={isInstalledApp}
            installBusy={installBusy}
            installTitle={installTitle}
            installHint={isInstalledApp ? "Die App laeuft bereits als installierte Web-App." : installHint}
            onInstallApp={() => void installApp()}
          />
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Image
                  src="/icons/bobo-logo.jpg"
                  alt="Bobo mit Dart"
                  width={72}
                  height={72}
                  className="h-[4.5rem] w-[4.5rem] rounded-2xl border border-emerald-300/30 object-cover shadow-lg shadow-emerald-950/40"
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">Bobo&apos;s Dart</p>
                  <h1 className="mt-1 truncate text-2xl font-semibold text-white sm:text-3xl">
                    {selectedFlow === "local" ? "Lokales Match" : "Training"}
                  </h1>
                </div>
              </div>
              <button
                onClick={() => setSelectedFlow("overview")}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white"
              >
                Zur Auswahl
              </button>
            </div>

        <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 backdrop-blur">
          <div className="grid gap-4 p-4 lg:grid-cols-[1.05fr_0.95fr] lg:p-5">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-emerald-200">
                {selectedFlow === "local" ? "Lokales Spiel" : "Training"}
              </div>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  {appMode === "match" ? "Alles bereit fuer das naechste Leg." : getTrainingModeLabel(trainingSession.mode)}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-stone-300 sm:text-base">
                  Wechsle zwischen lokalem Match-Modus und Training, erfasse Würfe als Segmente
                  mit `S`, `D`, `T` oder Bulls und speichere Fortschritt direkt im Browser.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-stone-300">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{players.length} Spieler</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">{mode}</span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  {appMode === "match" ? `${getEntryModeLabel(entryMode)} · ${doubleOut ? "Double-Out" : "Straight-Out"}` : trainingTarget}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setAppMode("match")}
                  className={`rounded-2xl px-5 py-3 font-semibold transition ${
                    appMode === "match"
                      ? "bg-white text-black"
                      : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                  }`}
                >
                  Match
                </button>
                <button
                  onClick={() => setAppMode("training")}
                  className={`rounded-2xl px-5 py-3 font-semibold transition ${
                    appMode === "training"
                      ? "bg-amber-300 text-black"
                      : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                  }`}
                >
                  Training
                </button>
                <Link
                  href="/live"
                  className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-5 py-3 font-semibold text-emerald-100 transition hover:bg-emerald-400/20"
                >
                  Live-Match
                </Link>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
              {appMode === "match" ? (
                <>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Match Uebersicht</p>
                  <p className="mt-2 text-lg font-medium text-white">{statusText}</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    {players.map((player, index) => {
                      const metrics = getPlayerMetrics(player);
                      const isActive = activePlayer === index && legWinner === null && matchWinner === null;

                      return (
                        <div
                          key={`${player.name}-${index}`}
                          className={`rounded-[1.5rem] border p-4 transition ${
                            isActive
                              ? "border-emerald-300/40 bg-emerald-300/10"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <input
                            value={player.name}
                            onChange={(event) => updatePlayerName(index, event.target.value)}
                            className="w-full border-none bg-transparent text-lg font-semibold text-white outline-none"
                          />
                          {entryMode !== "single" && !player.entered ? (
                            <p className="mt-2 text-xs font-medium text-amber-200">{getEntryModeLabel(entryMode)} offen</p>
                          ) : null}
                          <p className="mt-3 text-5xl font-semibold leading-none text-white">{player.score}</p>
                          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                            <div className="rounded-2xl bg-black/20 p-3">
                              <p className="text-stone-400">Sets</p>
                              <p className="mt-1 text-xl font-semibold text-white">{player.sets}</p>
                            </div>
                            <div className="rounded-2xl bg-black/20 p-3">
                              <p className="text-stone-400">Legs</p>
                              <p className="mt-1 text-xl font-semibold text-white">{player.legs}</p>
                            </div>
                            <div className="rounded-2xl bg-black/20 p-3">
                              <p className="text-stone-400">Avg</p>
                              <p className="mt-1 text-xl font-semibold text-white">{metrics.average}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Training Status</p>
                  <p className="mt-2 text-lg font-medium text-white">{trainingSession.message}</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Modus</p>
                      <p className="mt-2 text-2xl font-semibold text-white">
                        {getTrainingModeLabel(trainingSession.mode)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Aktuelles Ziel</p>
                      <p className="mt-2 text-2xl font-semibold text-amber-200">{trainingTarget}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Training Score</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{trainingSession.score}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Treffer</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{trainingSession.hits}</p>
                    </div>
                  </div>
                </>
              )}

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Cloud Sync</p>
                  <div
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      session
                        ? "bg-emerald-400/20 text-emerald-200"
                        : "bg-white/10 text-stone-300"
                    }`}
                  >
                    {session ? "Verbunden" : supabaseEnabled ? "Nicht eingeloggt" : "Nicht konfiguriert"}
                  </div>
                </div>

                {supabaseEnabled ? (
                  session ? (
                    <div className="mt-3 space-y-3">
                      <div className="text-sm text-stone-300">
                        <p>{session.user.email}</p>
                        {profileName ? <p className="text-stone-400">Profilname: {profileName}</p> : null}
                        <p className="mt-1 text-stone-400">
                          Match-Historie, Training und deine App-Einstellungen werden für eingeloggte Nutzer in der Cloud gehalten.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <input
                          value={profileDraft}
                          onChange={(event) => setProfileDraft(event.target.value)}
                          placeholder="Profilname"
                          className="h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                        />
                        <button
                          onClick={() => void saveProfileDraft()}
                          className="rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-black"
                        >
                          Profil speichern
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => void loadCloudMatches(session)}
                          className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black"
                        >
                          Cloud-Historie laden
                        </button>
                        <Link
                          href="/profile"
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Profilseite
                        </Link>
                        <button
                          onClick={() => void loadCloudDashboard(session)}
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Cloud-Statistik laden
                        </button>
                        {isAdmin ? (
                          <Link
                            href="/admin"
                            className="rounded-2xl bg-amber-300 px-4 py-2 text-sm font-semibold text-black"
                          >
                            Admin-Nutzer
                          </Link>
                        ) : null}
                        <button
                          onClick={() => void handleSignOut()}
                          className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Logout
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <p className="text-sm text-stone-400">
                        Konten werden manuell vom Admin angelegt. Hier ist nur der Login offen.
                      </p>
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="E-Mail"
                        className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Passwort"
                        className="h-11 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
                      />
                      <button
                        onClick={() => void handleAuthSubmit()}
                        className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black"
                      >
                        Einloggen
                      </button>
                    </div>
                  )
                ) : (
                  <p className="mt-3 text-sm text-stone-400">
                    Trage erst `NEXT_PUBLIC_SUPABASE_URL` und `NEXT_PUBLIC_SUPABASE_ANON_KEY` ein.
                  </p>
                )}

                {authMessage ? <p className="mt-3 text-sm text-amber-200">{authMessage}</p> : null}
                {cloudMessage ? <p className="mt-2 text-sm text-stone-300">{cloudMessage}</p> : null}
                {cloudLoading ? <p className="mt-2 text-sm text-stone-500">Cloud-Historie wird geladen...</p> : null}

                {session && cloudStats ? (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-stone-400">Deine Cloud-Zahlen</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Matches</p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                          {cloudStats.matchesWon} / {cloudStats.matchesPlayed}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Bestes Avg</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{cloudStats.bestAverage.toFixed(2)}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Best Visit</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{cloudStats.bestVisit}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Sets / Legs</p>
                        <p className="mt-2 text-2xl font-semibold text-white">
                          {cloudStats.totalSetsWon} / {cloudStats.totalLegsWon}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Training</p>
                        <p className="mt-2 text-xl font-semibold text-white">{cloudStats.trainingSessions}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Best Score</p>
                        <p className="mt-2 text-xl font-semibold text-white">{cloudStats.bestTrainingScore}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Trainingsdarts</p>
                        <p className="mt-2 text-xl font-semibold text-white">{cloudStats.totalTrainingDarts}</p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Letzte Trainingssessions</p>
                      {recentTrainingSessions.length > 0 ? (
                        recentTrainingSessions.slice(0, 3).map((entry, index) => (
                          <div
                            key={`${entry.played_at}-${index}`}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-300"
                          >
                            {new Date(entry.played_at).toLocaleString("de-DE")} · Score {entry.score} · Treffer {entry.hits} · Darts {entry.darts_thrown}
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-stone-400">Noch keine Trainingsdaten in der Cloud.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {appMode === "match" ? (
          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="order-2 space-y-4 lg:order-2">
              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-4">
                <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Spiel-Setup</p>
                  <p className="mt-2 text-sm text-stone-400">Alles fuer dein lokales Match in einer Karte.</p>
                  <p className="mt-4 text-xs uppercase tracking-[0.22em] text-stone-400">Spielerzahl</p>
                  <div className="mt-3 flex gap-2">
                    {PLAYER_COUNT_OPTIONS.map((option) => (
                      <button
                        key={option}
                        onClick={() => setPlayerCount(option)}
                        className={`rounded-2xl px-4 py-3 transition ${
                          players.length === option
                            ? "bg-white text-black"
                            : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Modus</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => startFreshMatch(301)}
                        className={`rounded-2xl px-4 py-3 text-left transition ${
                          mode === 301
                            ? "bg-amber-400 text-black"
                            : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                        }`}
                      >
                        301
                      </button>
                      <button
                        onClick={() => startFreshMatch(501)}
                        className={`rounded-2xl px-4 py-3 text-left transition ${
                          mode === 501
                            ? "bg-emerald-400 text-black"
                            : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                        }`}
                      >
                        501
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Start Regel</p>
                    <button
                      onClick={cycleEntryMode}
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-stone-200 transition hover:bg-white/10"
                    >
                      {getEntryModeLabel(entryMode)}
                    </button>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Finish Regel</p>
                    <button
                      onClick={() => setDoubleOut((prev) => !prev)}
                      className={`mt-3 w-full rounded-2xl border px-4 py-3 text-left transition ${
                        doubleOut
                          ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                          : "border-white/10 bg-black/20 text-stone-300"
                      }`}
                    >
                      {doubleOut ? "Double-Out aktiv" : "Straight-Out aktiv"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Legs zum Satz</p>
                    <div className="mt-3 flex gap-2">
                      {LEGS_OPTIONS.map((option) => (
                        <button
                          key={option}
                          onClick={() => setLegsToWin(option)}
                          className={`rounded-2xl px-4 py-3 transition ${
                            legsToWin === option
                              ? "bg-white text-black"
                              : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">SÃ¤tze zum Match</p>
                    <div className="mt-3 flex gap-2">
                      {SETS_OPTIONS.map((option) => (
                        <button
                          key={option}
                          onClick={() => setSetsToWin(option)}
                          className={`rounded-2xl px-4 py-3 transition ${
                            setsToWin === option
                              ? "bg-white text-black"
                              : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Aktueller Besuch</p>
                    <h2 className="mt-1 text-2xl font-semibold text-white">
                      {entryMode !== "single" && !currentPlayer.entered
                        ? `${currentPlayer.name} sucht ${getEntryModeLabel(entryMode)}`
                        : `${currentPlayer.name} ist dran`}
                    </h2>
                    <p className="mt-1 text-sm text-stone-400">
                      {entryMode !== "single" && !currentPlayer.entered
                        ? `${currentPlayer.name} sucht gerade ${getEntryModeLabel(entryMode)}.`
                        : "Baue den aktuellen Besuch auf oder buche ihn direkt als Gesamtwert."}
                    </p>
                  </div>
                  {legWinner !== null ? (
                    <div className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-black">
                      Leg abgeschlossen
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Laufender Besuch</p>
                  <div className="mt-3 flex min-h-14 flex-wrap gap-2">
                    {currentLabels.length > 0 ? (
                      currentLabels.map((label, index) => (
                        <span
                          key={`${label}-${index}`}
                          className="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl bg-white/10 px-4 text-lg font-semibold"
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="self-center text-sm text-stone-400">Noch keine Darts erfasst.</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-stone-400">Summe dieses Besuchs: {currentVisitTotal}</p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  {QUICK_DARTS.map((value) => (
                    <button
                      key={value}
                      onClick={() => addDartValue(value)}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-lg font-semibold text-white transition hover:border-emerald-300/40 hover:bg-emerald-300/10"
                    >
                      {value}
                    </button>
                  ))}
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={manualDart}
                    onChange={(event) => setManualDart(event.target.value)}
                    placeholder="Dart 0-60"
                    className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500 focus:border-emerald-300/40"
                  />
                  <button
                    onClick={commitManualDart}
                    className="h-12 rounded-2xl bg-emerald-400 px-5 font-semibold text-black transition hover:bg-emerald-300"
                  >
                    Dart hinzufügen
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={() => recordVisit(currentDarts, currentLabels)}
                    disabled={finishDisabled}
                    className="rounded-2xl bg-white px-5 py-3 font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Besuch abschlieÃen
                  </button>
                  <button
                    onClick={undo}
                    className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
                  >
                    Undo
                  </button>
                  {matchWinner === null ? (
                    <button
                      onClick={legWinner !== null ? startNextLeg : () => startFreshMatch(mode)}
                      className="rounded-2xl border border-red-400/30 bg-red-400/10 px-5 py-3 font-semibold text-red-100 transition hover:bg-red-400/20"
                    >
                      {legWinner !== null ? "Nächstes Leg" : "Neues Match"}
                    </button>
                  ) : (
                    <button
                      onClick={() => startFreshMatch(mode)}
                      className="rounded-2xl border border-red-400/30 bg-red-400/10 px-5 py-3 font-semibold text-red-100 transition hover:bg-red-400/20"
                    >
                      Rematch starten
                    </button>
                  )}
                </div>

                <details className="mt-8 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                  <summary className="cursor-pointer list-none text-lg font-semibold text-white">
                    Schnell buchen
                    <span className="ml-2 text-sm font-normal text-stone-400">Für schnelle Eingaben ohne Einzeldarts</span>
                  </summary>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                      type="number"
                      min={0}
                      max={180}
                      value={manualVisit}
                      onChange={(event) => setManualVisit(event.target.value)}
                      placeholder="Besuch 0-180"
                      className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500 focus:border-amber-300/40"
                    />
                    <button
                      onClick={submitManualVisit}
                      className="h-12 rounded-2xl bg-amber-300 px-5 font-semibold text-black transition hover:bg-amber-200"
                    >
                      Besuch buchen
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {VISIT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        onClick={() =>
                          recordVisit(
                            [preset],
                            [`Visit ${preset}`],
                          )
                        }
                        className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-lg font-semibold text-white transition hover:border-amber-300/40 hover:bg-amber-300/10"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </details>
              </section>

              <details className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur" open={localHistoryOpen}>
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    setLocalHistoryOpen((prev) => !prev);
                  }}
                  className="flex cursor-pointer list-none items-center justify-between gap-3"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-white">Live Historie</h2>
                    <p className="mt-1 text-sm font-normal text-stone-400">Besuche im laufenden Leg.</p>
                  </div>
                  <span className="text-sm text-stone-400">{localHistoryOpen ? "Einklappen" : "Ausklappen"}</span>
                </summary>

                {localHistoryOpen ? <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  {players.map((player, playerIndex) => (
                    <div key={`${player.name}-history-${playerIndex}`} className="rounded-2xl border border-white/10">
                      <div className="border-b border-white/10 bg-black/20 px-4 py-3">
                        <p className="font-semibold text-white">{player.name}</p>
                      </div>
                      <div className="max-h-[20rem] overflow-auto">
                        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                          <thead className="bg-black/10 text-stone-400">
                            <tr>
                              <th className="px-4 py-3 font-medium">#</th>
                              <th className="px-4 py-3 font-medium">Würfe</th>
                              <th className="px-4 py-3 font-medium">Vorher</th>
                              <th className="px-4 py-3 font-medium">Nachher</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {player.visits.length > 0 ? (
                              player.visits
                                .slice()
                                .reverse()
                                .map((visit, index) => (
                                  <tr key={`${visit.scoreBefore}-${visit.scoreAfter}-${index}`} className="bg-white/[0.02]">
                                    <td className="px-4 py-3 text-stone-300">{player.visits.length - index}</td>
                                    <td className="px-4 py-3 text-white">{visit.labels.join(" / ")}</td>
                                    <td className="px-4 py-3 text-stone-300">{visit.scoreBefore}</td>
                                    <td className="px-4 py-3 text-stone-300">
                                      {visit.bust ? "Bust" : visit.scoreAfter}
                                    </td>
                                  </tr>
                                ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="px-4 py-6 text-center text-stone-400">
                                  Noch keine Besuche für {player.name}.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div> : null}
              </details>
            </div>

            <div className="order-1 space-y-4 lg:order-1">
              <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Board</p>
                    <h2 className="mt-1 text-2xl font-semibold text-white">{currentPlayer.name} zielt auf den nächsten Besuch</h2>
                    <p className="mt-1 text-sm text-stone-400">
                      {entryMode !== "single" && !currentPlayer.entered
                        ? `Öffne zuerst mit ${getEntryModeLabel(entryMode)}. Erst danach zählt der Score.`
                        : "Tippe Singles, Doubles, Triples oder Bulls für den laufenden Besuch."}
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-stone-300">
                    {getEntryModeLabel(entryMode)} · {doubleOut ? "Double-Out" : "Straight-Out"}
                  </div>
                </div>
                <div className="mt-5">
                  <Dartboard
                    onSegmentSelect={addBoardSegment}
                    caption="Jeder Ring und jedes Feld ist direkt anklickbar."
                  />
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Live-Stats</p>
                {currentPlayer.entered ? (
                  <p className="mt-1 text-sm text-stone-400">
                    Empfehlungen für {currentPlayer.name} bei Restscore {currentPlayer.score}.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-stone-400">
                    Checkout-Hinweise erscheinen, sobald {currentPlayer.name} mit {getEntryModeLabel(entryMode)} im Spiel ist.
                  </p>
                )}

                <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                  {checkoutHints.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      {checkoutHints.map((hint) => (
                        <div key={hint} className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-stone-200">
                          {hint}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-stone-400">
                      Noch kein klassischer Checkout-Weg hinterlegt. Spiele auf einen komfortablen
                      Finish-Bereich hin.
                    </p>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-stone-400">Average</p>
                    <p className="mt-1 text-lg font-semibold text-white">{currentPlayerMetrics.average}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-stone-400">Best Visit</p>
                    <p className="mt-1 text-lg font-semibold text-white">{currentPlayerMetrics.highestVisit}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-stone-400">Busts</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {currentPlayer.visits.filter((visit) => visit.bust).length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-stone-400">Checkouts</p>
                    <p className="mt-1 text-lg font-semibold text-white">
                      {currentPlayer.visits.filter((visit) => visit.checkout).length}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {localPlayerStats.map((entry) => (
                    <div
                      key={`local-stat-${entry.name}`}
                      className={`rounded-2xl border p-3 ${
                        currentPlayer.name === entry.name ? "border-emerald-300/25 bg-emerald-400/12" : "border-white/10 bg-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{entry.name}</p>
                        <p className="text-sm text-stone-300">{entry.average.toFixed(1)} Avg</p>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                        <div>
                          <p className="text-stone-400">Visits</p>
                          <p className="mt-1 font-semibold text-white">{entry.visits}</p>
                        </div>
                        <div>
                          <p className="text-stone-400">Punkte</p>
                          <p className="mt-1 font-semibold text-white">{entry.scoredPoints}</p>
                        </div>
                        <div>
                          <p className="text-stone-400">Best</p>
                          <p className="mt-1 font-semibold text-white">{entry.bestVisit}</p>
                        </div>
                        <div>
                          <p className="text-stone-400">Busts</p>
                          <p className="mt-1 font-semibold text-white">{entry.busts}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <h2 className="text-2xl font-semibold text-white">Langzeit-Stats</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Legs beendet</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{stats.legsFinished}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Matches beendet</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{stats.matchesFinished}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Bestes Finish</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{stats.bestCheckout}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Bestes Avg</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{stats.bestAverage.toFixed(2)}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold text-white">Archiv</h2>
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.22em] text-stone-300">
                    {session ? "Cloud" : "Lokal"}
                  </div>
                </div>
                <p className="mt-2 text-sm text-stone-400">
                  {session
                    ? "Angemeldet: Es wird die Cloud-Historie deines Kontos angezeigt."
                    : "Nicht eingeloggt: Es wird nur die lokale Browser-Historie angezeigt."}
                </p>
                <div className="mt-5 space-y-3">
                  {(session ? cloudMatchHistory : localMatchHistory).length > 0 ? (
                    (session ? cloudMatchHistory : localMatchHistory).map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm"
                      >
                        <p className="font-semibold text-white">
                          {entry.winner} gewinnt gegen {entry.opponents}
                        </p>
                        <p className="mt-1 text-stone-400">
                          {entry.playedAt} · {entry.mode} · {entry.doubleOut ? "Double-Out" : "Straight-Out"} ·
                          {" "}SÃ¤tze {entry.sets}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-stone-400">
                      Noch keine abgeschlossenen Matches gespeichert.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="order-2 space-y-4 lg:order-2">
              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Training Setup</p>
                    <h2 className="mt-1 text-2xl font-semibold text-white">{getTrainingModeLabel(trainingSession.mode)}</h2>
                    <p className="mt-1 text-sm text-stone-400">
                      Wähle einen Modus und trage danach jeden Dart über das Segment Board ein.
                    </p>
                  </div>
                  <button
                    onClick={() => resetTraining()}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-stone-200"
                  >
                    Reset
                  </button>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <button
                    onClick={() => switchTrainingMode("around-the-clock")}
                    className={`rounded-2xl px-5 py-4 text-left transition ${
                      trainingSession.mode === "around-the-clock"
                        ? "bg-white text-black"
                        : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-[0.22em]">Training</span>
                    <span className="text-xl font-semibold">Around the Clock</span>
                  </button>
                  <button
                    onClick={() => switchTrainingMode("bull-drill")}
                    className={`rounded-2xl px-5 py-4 text-left transition ${
                      trainingSession.mode === "bull-drill"
                        ? "bg-amber-300 text-black"
                        : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-[0.22em]">Training</span>
                    <span className="text-xl font-semibold">Bull Drill</span>
                  </button>
                  <button
                    onClick={() => switchTrainingMode("shanghai")}
                    className={`rounded-2xl px-5 py-4 text-left transition ${
                      trainingSession.mode === "shanghai"
                        ? "bg-emerald-400 text-black"
                        : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-[0.22em]">Training</span>
                    <span className="text-xl font-semibold">Shanghai</span>
                  </button>
                  <button
                    onClick={() => switchTrainingMode("doubles-around")}
                    className={`rounded-2xl px-5 py-4 text-left transition ${
                      trainingSession.mode === "doubles-around"
                        ? "bg-fuchsia-400 text-black"
                        : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-[0.22em]">Training</span>
                    <span className="text-xl font-semibold">Doubles Around</span>
                  </button>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-sm text-stone-300">
                    Ziel: {trainingTarget}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-sm text-stone-300">
                    Darts: {trainingSession.dartsThrown}
                  </div>
                  {trainingSession.mode === "shanghai" ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-sm text-stone-300">
                      Shanghai: {trainingSession.currentGoalHits.length > 0 ? trainingSession.currentGoalHits.join("/") : "noch offen"}
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-4 text-sm text-stone-300">
                  {trainingSession.mode === "shanghai"
                    ? "Treffe auf jedem Ziel Single, Double und Triple, bevor du weiterrÃ¼ckst."
                    : trainingSession.mode === "doubles-around"
                      ? "Nur Doubles zählen. Arbeite dich über D1 bis Bull."
                      : trainingSession.mode === "bull-drill"
                        ? "Zehn Darts auf Bull und Outer Bull, jeder Treffer z?hlt sofort."
                        : "Treffe die Ziele der Reihe nach von 1 bis Bull."}
                </div>
              </section>

              <details className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <summary className="cursor-pointer list-none text-lg font-semibold text-white">
                  Training Feed
                  <p className="mt-1 text-sm font-normal text-stone-400">Die letzten Trainingsdarts deiner aktuellen Session.</p>
                </summary>

                <div className="mt-5 space-y-3">
                  {trainingSession.history.length > 0 ? (
                    trainingSession.history.map((entry, index) => (
                      <div key={`${entry}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-200">
                        {entry}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-stone-400">
                      Noch keine Trainingswürfe in dieser Session.
                    </div>
                  )}
                </div>
              </details>
            </div>

            <div className="order-1 space-y-4 lg:order-1">
              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Board</p>
                    <h2 className="mt-1 text-2xl font-semibold text-white">{getTrainingModeLabel(trainingSession.mode)} live spielen</h2>
                    <p className="mt-1 text-sm text-stone-400">
                      Nutze die Segmente wie auf einem echten Board. Im Training wird jeder Dart direkt gewertet.
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-stone-300">
                    Ziel {trainingTarget}
                  </div>
                </div>
                <div className="mt-5">
                  <Dartboard
                    onSegmentSelect={registerTrainingThrow}
                    caption="Training reagiert direkt auf jeden Klick auf das Board."
                  />
                </div>
              </section>

              <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Live-Stats</p>
                    <p className="text-xs text-stone-400">{getTrainingModeLabel(trainingSession.mode)} im Fokus</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-stone-400">Sessions</p>
                    <p className="mt-1 text-lg font-semibold text-white">{stats.trainingSessions}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-stone-400">Best Score</p>
                    <p className="mt-1 text-lg font-semibold text-white">{stats.bestTrainingScore}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-stone-400">Treffer</p>
                    <p className="mt-1 text-lg font-semibold text-white">{trainingSession.hits}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-stone-400">Darts</p>
                    <p className="mt-1 text-lg font-semibold text-white">{trainingSession.dartsThrown}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Training Score</p>
                      <p className="text-sm text-stone-300">{trainingSession.score}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Ziel</p>
                      <p className="text-sm text-stone-300">{trainingTarget}</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </section>
        )}
          </>
        )}
      </div>
      {session ? <MobileAppNav /> : null}
    </main>
  );
}
