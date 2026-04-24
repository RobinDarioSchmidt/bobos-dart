"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LiveBoardPanel, type LiveBoardSegment } from "@/components/live/board-panel";
import { LiveHistoryPanel, LiveStatsPanel } from "@/components/live/match-panels";
import {
  BoardPreviewPanel,
  CollapsibleFeedPanel,
  LocalSetupPanel,
  SessionFlowHeader,
  SimpleStatsPanel,
  TrainingSetupPanel,
} from "@/components/local/session-panels";
import { SignedInOverviewSection, SignedOutLandingSection } from "@/components/home/entry-sections";
import { MobileAppNav } from "@/components/mobile-app-nav";
import { getCheckoutSuggestions } from "@/lib/checkout-hints";
import type { LiveBoardMarker, LiveDart, LiveMatchState, LiveVisit } from "@/lib/live-match";
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
const LEGS_OPTIONS = [2, 3, 5];
const SETS_OPTIONS = [1, 2, 3];
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

function createPlayers(mode: GameMode, names = ["Bobo"], entryMode: EntryMode = "single"): Player[] {
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
  const [localBullOffEnabled, setLocalBullOffEnabled] = useState(false);
  const [localMatchStarted, setLocalMatchStarted] = useState(false);
  const [legsToWin, setLegsToWin] = useState(3);
  const [setsToWin, setSetsToWin] = useState(1);
  const [players, setPlayers] = useState<Player[]>(() => createPlayers(501, ["Bobo"], "single"));
  const [localBullOff, setLocalBullOff] = useState<{
    enabled: boolean;
    completed: boolean;
    currentPlayerIndex: number | null;
    winnerIndex: number | null;
    attempts: Array<{ playerIndex: number; playerName: string; dart: LiveDart; rank: number; createdAt: string }>;
  }>({
    enabled: false,
    completed: true,
    currentPlayerIndex: null,
    winnerIndex: null,
    attempts: [],
  });
  const [activePlayer, setActivePlayer] = useState(0);
  const [legStartingPlayer, setLegStartingPlayer] = useState(0);
  const [currentDarts, setCurrentDarts] = useState<number[]>([]);
  const [currentLabels, setCurrentLabels] = useState<string[]>([]);
  const [legWinner, setLegWinner] = useState<number | null>(null);
  const [matchWinner, setMatchWinner] = useState<number | null>(null);
  const [statusText, setStatusText] = useState("Match bereit. Bobo beginnt.");
  const [stats, setStats] = useState<StoredStats>(emptyStats);
  const [localMatchHistory, setLocalMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [, setCloudMatchHistory] = useState<MatchHistoryEntry[]>([]);
  const [localHistoryOpen, setLocalHistoryOpen] = useState(false);
  const [trainingFeedOpen, setTrainingFeedOpen] = useState(false);
  const [trainingStarted, setTrainingStarted] = useState(false);
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
  const [, setRecentTrainingSessions] = useState<TrainingCloudRow[]>([]);
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
      parsed.playerNames && parsed.playerNames.length >= 1 && parsed.playerNames.length <= 4
        ? parsed.playerNames
        : ["Bobo"];

    setMode(parsedMode);
    setEntryMode(parsedEntryMode);
    setPlayers(createPlayers(parsedMode, names, parsedEntryMode));
    setStatusText(`Match bereit. ${names[0]} beginnt.`);
    setActivePlayer(0);
    setLegStartingPlayer(0);
    setCurrentDarts([]);
    setCurrentLabels([]);
    setLegWinner(null);
    setMatchWinner(null);

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
  const boardPlayerIndex =
    localBullOff.enabled && !localBullOff.completed ? (localBullOff.currentPlayerIndex ?? activePlayer) : activePlayer;
  const boardPlayer = players[boardPlayerIndex] ?? currentPlayer;
  const localPlayerStats = useMemo(
    () =>
      players.map((player) => {
        const metrics = getPlayerMetrics(player);
        return {
          name: player.name,
          average: Number(metrics.average),
          bestVisit: metrics.highestVisit,
          visits: player.visits.length,
          dartsThrown: player.visits.reduce((sum, visit) => sum + visit.darts.length, 0),
          busts: player.visits.filter((visit) => visit.bust).length,
          checkouts: player.visits.filter((visit) => visit.checkout).length,
          scoredPoints: metrics.pointsScored,
        };
      }),
    [players],
  );
  const currentVisitTotal = currentDarts.reduce((sum, dart) => sum + dart, 0);
  const checkoutHints = currentPlayer.entered ? getCheckoutHints(currentPlayer.score, doubleOut) : [];
  const localStartDisabled = players.some((player) => !player.name.trim());
  const localBoardMarkers = useMemo<LiveBoardMarker[]>(
    () =>
      localBullOff.enabled && !localBullOff.completed
        ? localBullOff.attempts.map((attempt) => attempt.dart.marker).filter((marker): marker is LiveBoardMarker => Boolean(marker))
        : [],
    [localBullOff],
  );
  const localPendingDarts = useMemo<LiveDart[]>(
    () =>
      currentLabels.map((label, index) => {
        const parsed = parseThrowLabel(label, currentDarts[index] ?? 0);
        return {
          label: parsed.label,
          score: parsed.score,
          number: parsed.baseValue,
          multiplier: (parsed.ring === "miss" ? 0 : parsed.multiplier) as 0 | 1 | 2 | 3,
          ring:
            parsed.ring === "double"
              ? "double"
              : parsed.ring === "triple"
                ? "triple"
                : parsed.ring === "outer-bull"
                  ? "outer-bull"
                  : parsed.ring === "bull"
                    ? "bull"
                    : parsed.ring === "miss"
                      ? "miss"
                      : "single-outer",
          marker: null,
        };
      }),
    [currentDarts, currentLabels],
  );
  const localLiveHistory = useMemo<LiveVisit[]>(
    () =>
      players.flatMap((player, playerIndex) =>
        player.visits.map((visit, visitIndex) => ({
          playerIndex,
          playerName: player.name,
          total: visit.darts.reduce((sum, dart) => sum + dart, 0),
          scoreBefore: visit.scoreBefore,
          scoreAfter: visit.bust ? visit.scoreBefore : visit.scoreAfter,
          bust: visit.bust,
          checkout: visit.checkout,
          result: visit.checkout ? "checkout" : visit.bust ? "bust" : "ok",
          darts: visit.labels,
          note: visit.checkout ? "Checkout" : visit.bust ? "Bust" : "Visit",
          createdAt: new Date(Date.UTC(2024, 0, 1, 0, playerIndex, visitIndex)).toISOString(),
        })),
      ),
    [players],
  );
  const localLiveState = useMemo<LiveMatchState>(
    () => ({
      mode,
      entryMode,
      finishMode: doubleOut ? "double" : "single",
      legsToWin,
      setsToWin,
      maxPlayers: players.length,
      activePlayer,
      legStartingPlayer,
      legWinner,
      matchWinner,
      statusText,
      bullOffEnabled: localBullOff.enabled,
      bullOff: localBullOff,
      players: players.map((player, index) => ({
        name: player.name,
        score: player.score,
        legs: player.legs,
        sets: player.sets,
        joined: true,
        profileId: session?.user.id && index === 0 ? session.user.id : null,
        entered: player.entered,
      })),
      history: localLiveHistory,
      pendingVisit:
        localPendingDarts.length > 0
          ? {
              playerIndex: activePlayer,
              playerName: currentPlayer.name,
              darts: localPendingDarts,
              updatedAt: new Date().toISOString(),
            }
          : null,
      lastCallout: null,
      cloudSync: {
        sessionKey: "local-session",
        persistedOwnerIds: [],
        persistedAt: null,
        deviceLocks: [],
      },
    }),
    [
      activePlayer,
      currentPlayer.name,
      doubleOut,
      entryMode,
      legStartingPlayer,
      legWinner,
      legsToWin,
      localBullOff,
      localLiveHistory,
      localPendingDarts,
      matchWinner,
      mode,
      players,
      session,
      setsToWin,
      statusText,
    ],
  );

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
        setCloudStats(null);
        setPlayerPresence([]);
        setRecentMilestones([]);
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

  function createLocalBullOffState(nextPlayers: Player[], enabled: boolean) {
    return {
      enabled,
      completed: !enabled,
      currentPlayerIndex: enabled ? 0 : null,
      winnerIndex: null,
      attempts: [] as Array<{ playerIndex: number; playerName: string; dart: LiveDart; rank: number; createdAt: string }>,
    };
  }

  function getBullOffRank(dart: LiveDart) {
    if (!dart.marker) {
      return Number.NEGATIVE_INFINITY;
    }

    return -Math.hypot(dart.marker.x - 200, dart.marker.y - 200);
  }

  function startFreshMatch(nextMode = mode) {
    const names = players.map((player, index) => player.name.trim() || `Spieler ${index + 1}`);
    const nextPlayers = createPlayers(nextMode, names, entryMode);
    const nextBullOffEnabled = localBullOffEnabled && nextPlayers.length > 1;
    setMode(nextMode);
    setPlayers(nextPlayers);
    setActivePlayer(0);
    setLegStartingPlayer(0);
    setCurrentDarts([]);
    setCurrentLabels([]);
    setLegWinner(null);
    setMatchWinner(null);
    setLocalMatchStarted(true);
    setLocalBullOff(createLocalBullOffState(nextPlayers, nextBullOffEnabled));
    setStatusText(
      nextBullOffEnabled
        ? `${nextPlayers[0].name} wirft fuer das Bull-Off.`
        : entryMode === "single"
        ? `Neues Match bereit. ${nextPlayers[0].name} beginnt.`
        : `Neues Match bereit. ${nextPlayers[0].name} sucht ${getEntryModeLabel(entryMode)}.`,
    );
  }

  function startConfiguredLocalMatch() {
    if (players.some((player) => !player.name.trim())) {
      return;
    }

    startFreshMatch(mode);
  }

  function setPlayerCount(nextCount: number) {
    const nextNames = Array.from(
      { length: nextCount },
      (_, index) => players[index]?.name ?? "",
    );
    const nextPlayers = createPlayers(mode, nextNames, entryMode);
    setPlayers(nextPlayers);
    if (nextCount === 1) {
      setLocalBullOffEnabled(false);
    }
    setActivePlayer(0);
    setLegStartingPlayer(0);
    setCurrentDarts([]);
    setCurrentLabels([]);
    setLegWinner(null);
    setMatchWinner(null);
    setLocalMatchStarted(false);
    setLocalBullOff(createLocalBullOffState(nextPlayers, false));
    setStatusText("Match Setup bereit.");
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
    setLegWinner(null);
    setMatchWinner(null);
    setLocalMatchStarted(false);
    setLocalBullOff(createLocalBullOffState(nextPlayers, false));
    setStatusText("Match Setup bereit.");
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
    setLegWinner(null);
    setStatusText(
      entryMode === "single"
        ? `Nächstes Leg gestartet. ${players[nextStarter].name} ist am Zug.`
        : `Nächstes Leg gestartet. ${players[nextStarter].name} sucht ${getEntryModeLabel(entryMode)}.`,
    );
  }

  function updatePlayerName(index: number, name: string) {
    setPlayers((prev) =>
      prev.map((player, playerIndex) =>
        playerIndex === index
          ? {
              ...player,
              name: name.trimStart(),
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
  }

  function addBoardSegment(segment: Segment) {
    addDartValue(segment.score, segment.label);
  }

  function registerLocalBullOffDart(dart: LiveDart) {
    if (!localBullOff.enabled || localBullOff.completed) {
      return;
    }

    const currentIndex = localBullOff.currentPlayerIndex ?? 0;
    const nextAttempts = [
      ...localBullOff.attempts,
      {
        playerIndex: currentIndex,
        playerName: players[currentIndex]?.name ?? `Spieler ${currentIndex + 1}`,
        dart,
        rank: getBullOffRank(dart),
        createdAt: new Date().toISOString(),
      },
    ];

    const nextPlayerIndex = currentIndex + 1 < players.length ? currentIndex + 1 : null;
    if (nextPlayerIndex !== null) {
      setLocalBullOff({
        ...localBullOff,
        attempts: nextAttempts,
        currentPlayerIndex: nextPlayerIndex,
      });
      setStatusText(`${players[nextPlayerIndex]?.name ?? `Spieler ${nextPlayerIndex + 1}`} wirft fuer das Bull-Off.`);
      return;
    }

    const sortedAttempts = [...nextAttempts].sort((left, right) => {
      if (right.rank !== left.rank) {
        return right.rank - left.rank;
      }

      return right.dart.score - left.dart.score;
    });
    const winner = sortedAttempts[0];
    const winnerIndex = winner?.playerIndex ?? 0;
    setLocalBullOff({
      enabled: true,
      completed: true,
      currentPlayerIndex: null,
      winnerIndex,
      attempts: nextAttempts,
    });
    setActivePlayer(winnerIndex);
    setLegStartingPlayer(winnerIndex);
    setStatusText(`${players[winnerIndex]?.name ?? "Spieler"} gewinnt das Bull-Off und beginnt.`);
  }

  function recordVisit(darts: number[], labels = darts.map(String)) {
    if (legWinner !== null || matchWinner !== null || darts.length === 0) {
      return;
    }

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

  function resetTraining(modeOverride = trainingSession.mode) {
    setTrainingSession(createTrainingSession(modeOverride));
    setTrainingStarted(false);
  }

  function switchTrainingMode(nextMode: TrainingMode) {
    setTrainingSession(createTrainingSession(nextMode));
    setTrainingStarted(false);
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
              setLocalMatchStarted(false);
              setSelectedFlow("local");
            }}
            onStartTraining={() => {
              setAppMode("training");
              setTrainingStarted(false);
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
            <SessionFlowHeader
              title={selectedFlow === "local" ? "Lokal" : "Training"}
              onBack={() => setSelectedFlow("overview")}
            />

            {appMode === "match" ? (
              <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="order-2 space-y-4 lg:order-2">
                  {!localMatchStarted ? (
                    <LocalSetupPanel
                      playerCount={players.length}
                      playerNames={players.map((player) => player.name)}
                      mode={mode}
                      entryMode={entryMode}
                      doubleOut={doubleOut}
                      bullOffEnabled={localBullOffEnabled}
                      legsToWin={legsToWin}
                      setsToWin={setsToWin}
                      onPlayerCountChange={setPlayerCount}
                      onPlayerNameChange={updatePlayerName}
                      onModeChange={setMode}
                      onCycleEntryMode={cycleEntryMode}
                      onToggleDoubleOut={() => setDoubleOut((prev) => !prev)}
                      onToggleBullOff={() => setLocalBullOffEnabled((prev) => !prev)}
                      onLegsToWinChange={setLegsToWin}
                      onSetsToWinChange={setSetsToWin}
                      onStartMatch={startConfiguredLocalMatch}
                      startDisabled={localStartDisabled}
                    />
                  ) : null}
                  {localMatchStarted ? (
                    <LiveHistoryPanel
                      heading={`Live Historie${boardPlayer ? ` - ${boardPlayer.name} ist dran` : ""}`}
                      historyOpen={localHistoryOpen}
                      history={localLiveHistory}
                      onToggle={() => setLocalHistoryOpen((prev) => !prev)}
                    />
                  ) : null}
                </div>

                <div className="order-1 space-y-4 lg:order-1">
                  {localMatchStarted ? (
                    <LiveBoardPanel
                      liveState={localLiveState}
                      currentPlayerIndex={boardPlayerIndex}
                      currentUserId={session?.user.id ?? "local-player"}
                      boardHeading={
                        localBullOff.enabled && !localBullOff.completed
                          ? `${boardPlayer.name} wirft Bull-Off`
                          : entryMode !== "single" && !currentPlayer.entered
                            ? `${currentPlayer.name} sucht ${getEntryModeLabel(entryMode)}`
                            : `${currentPlayer.name} ist dran`
                      }
                      currentVisitTotal={currentVisitTotal}
                      compactVisitText={currentLabels.length > 0 ? currentLabels.join(", ") : "Noch kein Dart"}
                      calloutText={null}
                      canPlayFromThisDevice={true}
                      boardDisabledReason="Lokales Spiel"
                      loading={false}
                      boardMarkers={localBoardMarkers}
                      pendingLabels={currentLabels}
                      canControlLegTransition={legWinner !== null && matchWinner === null}
                      checkoutHints={checkoutHints}
                      currentPlayerName={boardPlayer.name}
                      onSegmentSelect={(segment: LiveBoardSegment) => {
                        if (localBullOff.enabled && !localBullOff.completed) {
                          registerLocalBullOffDart({
                            label: segment.label,
                            score: segment.score,
                            number: segment.number,
                            multiplier: segment.multiplier,
                            ring: segment.ring,
                            marker: segment.marker,
                          });
                          return;
                        }
                        addBoardSegment({
                          label: segment.label,
                          score: segment.score,
                          number: segment.number,
                          multiplier: segment.multiplier === 0 ? 1 : segment.multiplier,
                        });
                      }}
                      onMiss={() => {
                        if (localBullOff.enabled && !localBullOff.completed) {
                          registerLocalBullOffDart({
                            label: "Miss",
                            score: 0,
                            number: 0,
                            multiplier: 0,
                            ring: "miss",
                            marker: null,
                          });
                          return;
                        }
                        addDartValue(0, "Miss");
                      }}
                      onRemoveLast={() => {
                        setCurrentDarts((prev) => prev.slice(0, -1));
                        setCurrentLabels((prev) => prev.slice(0, -1));
                      }}
                      onFinishVisit={() => recordVisit(currentDarts, currentLabels)}
                      onNextLeg={startNextLeg}
                    />
                  ) : null}

                  {localMatchStarted && checkoutHints.length > 0 ? (
                    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-col gap-2">
                          {checkoutHints.map((hint) => (
                            <div key={hint} className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-stone-200">
                              {hint}
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  ) : null}

                  {localMatchStarted ? (
                    <LiveStatsPanel
                      currentLiveStats={localPlayerStats.find((entry) => entry.name === boardPlayer.name) ?? null}
                      livePlayerStats={localPlayerStats}
                      currentPlayerName={boardPlayer.name}
                      title={`LIVE-STATS von ${boardPlayer.name}`}
                      subtitle=""
                    />
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
                <div className="order-2 space-y-4 lg:order-2">
                  <TrainingSetupPanel
                    currentMode={trainingSession.mode}
                    currentModeLabel={getTrainingModeLabel(trainingSession.mode)}
                    trainingTarget={trainingTarget}
                    dartsThrown={trainingSession.dartsThrown}
                    shanghaiProgress={
                      trainingSession.mode === "shanghai"
                        ? trainingSession.currentGoalHits.length > 0
                          ? trainingSession.currentGoalHits.join("/")
                          : "noch offen"
                        : null
                    }
                    helperText={
                      trainingSession.mode === "shanghai"
                        ? "Treffe auf jedem Ziel Single, Double und Triple, bevor du weiter rueckst."
                        : trainingSession.mode === "doubles-around"
                          ? "Nur Doubles zaehlen. Arbeite dich ueber D1 bis Bull."
                          : trainingSession.mode === "bull-drill"
                            ? "Zehn Darts auf Bull und Outer Bull, jeder Treffer zaehlt sofort."
                            : "Treffe die Ziele der Reihe nach von 1 bis Bull."
                    }
                    started={trainingStarted}
                    onReset={() => resetTraining()}
                    onStart={() => setTrainingStarted(true)}
                    onModeChange={switchTrainingMode}
                  />

                  {trainingStarted ? (
                    <CollapsibleFeedPanel
                      title="Training Feed"
                      subtitle="Die letzten Trainingsdarts deiner aktuellen Session."
                      open={trainingFeedOpen}
                      onToggle={() => setTrainingFeedOpen((prev) => !prev)}
                    >
                      <div className="space-y-3">
                        {trainingSession.history.length > 0 ? (
                          trainingSession.history.map((entry, index) => (
                            <div
                              key={`${entry}-${index}`}
                              className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-stone-200"
                            >
                              {entry}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-stone-400">
                            Noch keine Trainingswuerfe in dieser Session.
                          </div>
                        )}
                      </div>
                    </CollapsibleFeedPanel>
                  ) : null}
                </div>

                <div className="order-1 space-y-4 lg:order-1">
                  {trainingStarted ? (
                    <BoardPreviewPanel
                      heading={`${getTrainingModeLabel(trainingSession.mode)} live spielen`}
                      badge={`Ziel ${trainingTarget}`}
                    >
                      <Dartboard
                        onSegmentSelect={registerTrainingThrow}
                        caption="Training reagiert direkt auf jeden Klick auf das Board."
                      />
                    </BoardPreviewPanel>
                  ) : null}

                  {trainingStarted ? (
                    <SimpleStatsPanel
                      title="Live-Stats"
                      subtitle={`${getTrainingModeLabel(trainingSession.mode)} im Fokus`}
                      summary={[
                        { label: "Sessions", value: stats.trainingSessions },
                        { label: "Best Score", value: stats.bestTrainingScore },
                        { label: "Treffer", value: trainingSession.hits },
                        { label: "Darts", value: trainingSession.dartsThrown },
                      ]}
                      rows={[
                        {
                          name: "Training Score",
                          meta: String(trainingSession.score),
                          values: [
                            { label: "Ziel", value: trainingTarget },
                            { label: "Modus", value: getTrainingModeLabel(trainingSession.mode) },
                            { label: "Hits", value: trainingSession.hits },
                            { label: "Darts", value: trainingSession.dartsThrown },
                          ],
                        },
                      ]}
                    />
                  ) : null}
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
