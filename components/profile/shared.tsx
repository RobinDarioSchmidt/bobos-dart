"use client";

import Link from "next/link";

const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

function polarToCartesian(radius: number, angleDeg: number) {
  const angle = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: 120 + radius * Math.cos(angle),
    y: 120 + radius * Math.sin(angle),
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

function heatColor(count: number, max: number) {
  if (!count || max <= 0) {
    return "#111827";
  }

  const intensity = count / max;
  if (intensity >= 0.8) {
    return "#f59e0b";
  }

  if (intensity >= 0.55) {
    return "#f97316";
  }

  if (intensity >= 0.3) {
    return "#fb7185";
  }

  return "#374151";
}

export function scoreTone(value: number) {
  if (value >= 75) {
    return "border-emerald-300/25 bg-emerald-400/12 text-emerald-100";
  }

  if (value >= 55) {
    return "border-amber-300/25 bg-amber-300/12 text-amber-100";
  }

  return "border-white/10 bg-black/20 text-stone-200";
}

export function toneClasses(tone: string) {
  if (tone === "amber") {
    return {
      badge: "border-amber-300/25 bg-amber-300/10 text-amber-100",
      bar: "bg-amber-300",
    };
  }
  if (tone === "rose") {
    return {
      badge: "border-rose-300/25 bg-rose-400/12 text-rose-100",
      bar: "bg-rose-400",
    };
  }
  if (tone === "fuchsia") {
    return {
      badge: "border-fuchsia-300/25 bg-fuchsia-400/12 text-fuchsia-100",
      bar: "bg-fuchsia-400",
    };
  }
  return {
    badge: "border-emerald-300/25 bg-emerald-400/12 text-emerald-100",
    bar: "bg-emerald-400",
  };
}

export function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${tone ?? "border-white/10 bg-black/20"}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

export function MeterCard({
  label,
  value,
  hint,
  colorClass,
}: {
  label: string;
  value: number;
  hint: string;
  colorClass: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">{label}</p>
        <p className="text-lg font-semibold text-white">{value}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.max(8, value)}%` }} />
      </div>
      <p className="mt-2 text-xs text-stone-400">{hint}</p>
    </div>
  );
}

type HeatmapPoint = {
  x: number;
  y: number;
  score: number;
  ring: string;
};

function scaleBoardPoint(value: number) {
  return (value / 400) * 240;
}

function heatPointColor(point: HeatmapPoint) {
  if (point.ring === "bull") {
    return "#facc15";
  }
  if (point.ring === "outer-bull") {
    return "#fb7185";
  }
  if (point.ring === "triple") {
    return "#f97316";
  }
  if (point.ring === "double") {
    return "#38bdf8";
  }
  return "#f59e0b";
}

function heatPointRadius(point: HeatmapPoint) {
  if (point.ring === "bull") {
    return 9;
  }
  if (point.ring === "outer-bull") {
    return 8;
  }
  if (point.ring === "triple" || point.ring === "double") {
    return 7;
  }
  return 6;
}

export function HeatmapBoard({
  numbers,
  max,
  points,
  preciseCount,
}: {
  numbers: Record<string, number>;
  max: number;
  points: HeatmapPoint[];
  preciseCount: number;
}) {
  const hasPrecisePoints = preciseCount > 0;
  const renderedPoints = points.slice(-600);

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Board Heat</p>
        <p className="text-xs text-stone-400">
          {hasPrecisePoints ? `${preciseCount} praezise Trefferpunkte` : "je heller, desto haeufiger"}
        </p>
      </div>
      <svg viewBox="0 0 240 240" className="mx-auto mt-3 w-full max-w-[17rem]">
        <defs>
          <filter id="heat-blur">
            <feGaussianBlur stdDeviation="4.5" />
          </filter>
        </defs>
        <circle cx="120" cy="120" r="113" fill="#0b1120" />
        {BOARD_ORDER.map((value, index) => {
          const startAngle = -9 + index * 18;
          const endAngle = startAngle + 18;
          const midAngle = startAngle + 9;
          const labelPoint = polarToCartesian(110, midAngle);
          const count = numbers[String(value)] ?? 0;
          return (
            <g key={value}>
              <path
                d={describeSlice(34, 103, startAngle, endAngle)}
                fill={hasPrecisePoints ? "#111827" : heatColor(count, max)}
                stroke="#09090b"
                strokeWidth="1.5"
              />
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                fill="#e7e5e4"
                fontSize="10"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {value}
              </text>
            </g>
          );
        })}
        <circle
          cx="120"
          cy="120"
          r="18"
          fill={hasPrecisePoints ? "#7f1d1d" : heatColor(numbers["Bull"] ?? 0, max)}
          stroke="#09090b"
          strokeWidth="2"
        />
        <circle
          cx="120"
          cy="120"
          r="33"
          fill={hasPrecisePoints ? "#14532d" : heatColor(numbers["Outer Bull"] ?? 0, max)}
          stroke="#09090b"
          strokeWidth="2"
        />
        {hasPrecisePoints ? (
          <g filter="url(#heat-blur)">
            {renderedPoints.map((point, index) => (
              <circle
                key={`${point.x}-${point.y}-${index}`}
                cx={scaleBoardPoint(point.x)}
                cy={scaleBoardPoint(point.y)}
                r={heatPointRadius(point)}
                fill={heatPointColor(point)}
                opacity="0.16"
              />
            ))}
          </g>
        ) : null}
        {hasPrecisePoints ? (
          <g>
            {renderedPoints.slice(-180).map((point, index) => (
              <circle
                key={`core-${point.x}-${point.y}-${index}`}
                cx={scaleBoardPoint(point.x)}
                cy={scaleBoardPoint(point.y)}
                r="1.7"
                fill="#fef3c7"
                opacity="0.35"
              />
            ))}
          </g>
        ) : null}
      </svg>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatPill label="Bull" value={String(numbers["Bull"] ?? 0)} />
        <StatPill label="Outer Bull" value={String(numbers["Outer Bull"] ?? 0)} />
        {hasPrecisePoints ? <StatPill label="Punkte" value={String(preciseCount)} /> : null}
        {hasPrecisePoints ? <StatPill label="Heatmap" value="Live" tone="border-amber-300/25 bg-amber-300/10 text-amber-100" /> : null}
      </div>
      <p className="mt-3 text-xs text-stone-400">
        {hasPrecisePoints
          ? "Die Heatmap basiert jetzt auf echten Klick- und Touchpositionen deiner Darts."
          : "Aeltere Wuerfe ohne Koordinaten werden vorerst noch als Zahlenfeld-Heatmap gezeigt."}
      </p>
    </div>
  );
}

export function SimpleBarChart({
  data,
  valueKey,
  colorClass,
}: {
  data: Array<Record<string, string | number>>;
  valueKey: string;
  colorClass: string;
}) {
  const max = Math.max(1, ...data.map((entry) => Number(entry[valueKey] ?? 0)));

  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1">
      {data.map((entry) => {
        const value = Number(entry[valueKey] ?? 0);
        const height = Math.max(14, Math.round((value / max) * 120));
        return (
          <div key={String(entry.period ?? entry.label ?? value)} className="flex min-w-[3.5rem] flex-col items-center gap-2">
            <div className="flex h-32 items-end">
              <div className={`w-9 rounded-t-xl ${colorClass}`} style={{ height }} />
            </div>
            <p className="text-center text-[11px] text-stone-400">{String(entry.period ?? entry.label ?? "")}</p>
            <p className="text-xs font-semibold text-white">{value}</p>
          </div>
        );
      })}
    </div>
  );
}

export function LineChart({
  data,
  valueKey,
  stroke,
}: {
  data: Array<Record<string, string | number>>;
  valueKey: string;
  stroke: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-stone-400">Keine Daten im aktuellen Filter.</p>;
  }

  const values = data.map((entry) => Number(entry[valueKey] ?? 0));
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const points = data.map((entry, index) => {
    const x = data.length === 1 ? 150 : 16 + (index / (data.length - 1)) * 288;
    const raw = Number(entry[valueKey] ?? 0);
    const normalized = max === min ? 0.5 : (raw - min) / (max - min);
    const y = 124 - normalized * 92;
    return `${x},${y}`;
  });

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 320 140" className="w-full overflow-visible">
        <path d="M16 124 H304" stroke="#44403c" strokeWidth="1" strokeDasharray="4 4" />
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points.join(" ")}
        />
        {data.map((entry, index) => {
          const [x, y] = points[index].split(",").map(Number);
          return <circle key={`${entry.period ?? index}`} cx={x} cy={y} r="4" fill={stroke} />;
        })}
      </svg>
      <div className="flex flex-wrap gap-2">
        {data.map((entry) => (
          <div key={String(entry.period ?? entry.label ?? "")} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-stone-300">
            {String(entry.period ?? entry.label ?? "")}: {Number(entry[valueKey] ?? 0)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MatchArchiveCard({
  match,
}: {
  match: {
    id: string;
    played_at: string;
    mode: string;
    winner: string;
    opponents: string;
    did_win: boolean;
  };
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                match.did_win
                  ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100"
                  : "border-rose-300/25 bg-rose-400/12 text-rose-100"
              }`}
            >
              {match.did_win ? "Sieg" : "Niederlage"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-200">
              {match.mode}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">{match.winner} gewinnt</p>
          <p className="text-xs text-stone-400">gegen {match.opponents}</p>
        </div>
        <Link
          href={`/profile/matches/${match.id}`}
          className="rounded-full border border-emerald-300/25 bg-emerald-400/12 px-3 py-1.5 text-sm font-semibold text-emerald-100"
        >
          Oeffnen
        </Link>
      </div>
    </div>
  );
}
