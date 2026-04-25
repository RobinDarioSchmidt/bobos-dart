"use client";

import Image from "next/image";
import type { ReactNode } from "react";

type EntryMode = "single" | "double" | "master";
type FinishMode = "single" | "double" | "master";
type TrainingMode = "around-the-clock" | "bull-drill" | "shanghai" | "doubles-around";

const optionButton =
  "min-w-0 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-semibold text-white transition hover:bg-white/10";

function getEntryLabel(entryMode: EntryMode) {
  if (entryMode === "double") {
    return "Double In";
  }

  if (entryMode === "master") {
    return "Masters In";
  }

  return "Straight In";
}

function getFinishLabel(finishMode: FinishMode) {
  if (finishMode === "double") {
    return "Double Out";
  }

  if (finishMode === "master") {
    return "Masters Out";
  }

  return "Straight Out";
}

export function LocalSetupPanel({
  playerCount,
  playerNames,
  mode,
  entryMode,
  finishMode,
  bullOffEnabled,
  legsToWin,
  setsToWin,
  onPlayerCountChange,
  onPlayerNameChange,
  onModeChange,
  onCycleEntryMode,
  onCycleFinishMode,
  onToggleBullOff,
  onLegsToWinChange,
  onSetsToWinChange,
  onStartMatch,
  startDisabled,
}: {
  playerCount: number;
  playerNames: string[];
  mode: 301 | 501;
  entryMode: EntryMode;
  finishMode: FinishMode;
  bullOffEnabled: boolean;
  legsToWin: number;
  setsToWin: number;
  onPlayerCountChange: (value: number) => void;
  onPlayerNameChange: (index: number, value: string) => void;
  onModeChange: (value: 301 | 501) => void;
  onCycleEntryMode: () => void;
  onCycleFinishMode: () => void;
  onToggleBullOff: () => void;
  onLegsToWinChange: (value: number) => void;
  onSetsToWinChange: (value: number) => void;
  onStartMatch: () => void;
  startDisabled: boolean;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Match Setup</h2>
        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-stone-300">
          {playerCount} Spieler
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((option) => (
          <button
            key={option}
            onClick={() => onPlayerCountChange(option)}
            className={`${optionButton} ${playerCount === option ? "border-emerald-400 bg-emerald-400 text-black hover:bg-emerald-400" : ""}`}
          >
            {option}P
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {playerNames.map((name, index) => (
          <input
            key={`local-player-name-${index}`}
            value={name}
            onChange={(event) => onPlayerNameChange(index, event.target.value)}
            placeholder={`Spieler ${index + 1}`}
            className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500"
          />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onModeChange(301)}
          className={`${optionButton} ${mode === 301 ? "border-amber-300 bg-amber-300 text-black hover:bg-amber-300" : ""}`}
        >
          301
        </button>
        <button
          onClick={() => onModeChange(501)}
          className={`${optionButton} ${mode === 501 ? "border-emerald-400 bg-emerald-400 text-black hover:bg-emerald-400" : ""}`}
        >
          501
        </button>
      </div>

      <div className={`mt-3 grid gap-2 ${playerCount > 1 ? "grid-cols-3" : "grid-cols-2"}`}>
        <button onClick={onCycleEntryMode} className={optionButton}>
          {getEntryLabel(entryMode)}
        </button>
        <button
          onClick={onCycleFinishMode}
          className={`${optionButton} ${
            finishMode !== "single" ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/10" : ""
          }`}
        >
          {getFinishLabel(finishMode)}
        </button>
        {playerCount > 1 ? (
          <button
            onClick={onToggleBullOff}
            className={`${optionButton} ${
              bullOffEnabled ? "border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/10" : ""
            }`}
          >
            {bullOffEnabled ? "Bull-Off An" : "Bull-Off Aus"}
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => onLegsToWinChange(legsToWin === 2 ? 3 : legsToWin === 3 ? 5 : 2)} className={optionButton}>
          {legsToWin} Legs
        </button>
        <button onClick={() => onSetsToWinChange(setsToWin === 1 ? 2 : setsToWin === 2 ? 3 : 1)} className={optionButton}>
          {setsToWin} {setsToWin === 1 ? "Satz" : "Saetze"}
        </button>
      </div>

      <button
        onClick={onStartMatch}
        disabled={startDisabled}
        className="mt-3 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black shadow-lg shadow-white/10 disabled:opacity-40"
      >
        Match starten
      </button>
    </section>
  );
}

export function SessionFlowHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
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
          <h1 className="mt-1 truncate text-2xl font-semibold text-white sm:text-3xl">{title}</h1>
        </div>
      </div>
      <button
        onClick={onBack}
        className="rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold text-white"
      >
        Zurueck
      </button>
    </div>
  );
}

export function BoardPreviewPanel({
  heading,
  badge,
  children,
}: {
  heading: string;
  badge?: string | null;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Board</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{heading}</h2>
        </div>
        {badge ? (
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-stone-300">
            {badge}
          </div>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function LocalVisitPanel({
  heading,
  subtitle,
  statusChip,
  labels,
  visitTotal,
  quickValues,
  manualValue,
  onManualValueChange,
  onAddManualValue,
  onQuickValue,
  onFinishVisit,
  onUndo,
  onResetOrNext,
  resetLabel,
  finishDisabled,
  manualVisitValue,
  onManualVisitValueChange,
  onManualVisit,
  visitPresets,
  onVisitPreset,
}: {
  heading: string;
  subtitle: string;
  statusChip: string | null;
  labels: string[];
  visitTotal: number;
  quickValues: number[];
  manualValue: string;
  onManualValueChange: (value: string) => void;
  onAddManualValue: () => void;
  onQuickValue: (value: number) => void;
  onFinishVisit: () => void;
  onUndo: () => void;
  onResetOrNext: () => void;
  resetLabel: string;
  finishDisabled: boolean;
  manualVisitValue: string;
  onManualVisitValueChange: (value: string) => void;
  onManualVisit: () => void;
  visitPresets: number[];
  onVisitPreset: (value: number) => void;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Aktueller Besuch</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{heading}</h2>
          <p className="mt-1 text-sm text-stone-400">{subtitle}</p>
        </div>
        {statusChip ? (
          <div className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-black">{statusChip}</div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">Laufender Besuch</p>
        <div className="mt-3 flex min-h-14 flex-wrap gap-2">
          {labels.length > 0 ? (
            labels.map((label, index) => (
              <span key={`${label}-${index}`} className="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl bg-white/10 px-4 text-lg font-semibold text-white">
                {label}
              </span>
            ))
          ) : (
            <span className="self-center text-sm text-stone-400">Noch keine Darts erfasst.</span>
          )}
        </div>
        <p className="mt-3 text-sm text-stone-400">Summe dieses Besuchs: {visitTotal}</p>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {quickValues.map((value) => (
          <button
            key={value}
            onClick={() => onQuickValue(value)}
            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-lg font-semibold text-white transition hover:border-emerald-300/40 hover:bg-emerald-300/10"
          >
            {value}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="number"
          min={0}
          max={60}
          value={manualValue}
          onChange={(event) => onManualValueChange(event.target.value)}
          placeholder="Dart 0-60"
          className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500 focus:border-emerald-300/40"
        />
        <button onClick={onAddManualValue} className="h-12 rounded-2xl bg-emerald-400 px-5 font-semibold text-black transition hover:bg-emerald-300">
          Dart hinzufuegen
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onFinishVisit}
          disabled={finishDisabled}
          className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          Besuch abschliessen
        </button>
        <button onClick={onUndo} className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
          Undo
        </button>
        <button onClick={onResetOrNext} className="rounded-2xl border border-red-400/30 bg-red-400/10 px-5 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-400/20">
          {resetLabel}
        </button>
      </div>

      <details className="mt-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
        <summary className="cursor-pointer list-none text-lg font-semibold text-white">
          Schnell buchen
          <span className="ml-2 text-sm font-normal text-stone-400">Ohne Einzeldarts</span>
        </summary>
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="number"
            min={0}
            max={180}
            value={manualVisitValue}
            onChange={(event) => onManualVisitValueChange(event.target.value)}
            placeholder="Besuch 0-180"
            className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-white outline-none placeholder:text-stone-500 focus:border-amber-300/40"
          />
          <button onClick={onManualVisit} className="h-12 rounded-2xl bg-amber-300 px-5 font-semibold text-black transition hover:bg-amber-200">
            Besuch buchen
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {visitPresets.map((preset) => (
            <button
              key={preset}
              onClick={() => onVisitPreset(preset)}
              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-lg font-semibold text-white transition hover:border-amber-300/40 hover:bg-amber-300/10"
            >
              {preset}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

export function SimpleStatsPanel({
  title,
  subtitle,
  summary,
  rows,
}: {
  title: string;
  subtitle: string;
  summary: Array<{ label: string; value: ReactNode }>;
  rows?: Array<{ name: string; meta: string; values: Array<{ label: string; value: ReactNode }> }>;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">{title}</p>
        <p className="text-xs text-stone-400">{subtitle}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {summary.map((entry) => (
          <div key={entry.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-stone-400">{entry.label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{entry.value}</p>
          </div>
        ))}
      </div>

      {rows && rows.length > 0 ? (
        <div className="mt-3 space-y-2">
          {rows.map((entry) => (
            <div key={entry.name} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{entry.name}</p>
                <p className="text-sm text-stone-300">{entry.meta}</p>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                {entry.values.map((value) => (
                  <div key={`${entry.name}-${value.label}`}>
                    <p className="text-stone-400">{value.label}</p>
                    <p className="mt-1 font-semibold text-white">{value.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function CollapsibleFeedPanel({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-stone-400">{subtitle}</p>
        </div>
        <span className="text-sm text-stone-400">{open ? "Einklappen" : "Ausklappen"}</span>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export function TrainingSetupPanel({
  currentMode,
  currentModeLabel,
  trainingTarget,
  dartsThrown,
  shanghaiProgress,
  helperText,
  started,
  onReset,
  onStart,
  onModeChange,
}: {
  currentMode: TrainingMode;
  currentModeLabel: string;
  trainingTarget: string;
  dartsThrown: number;
  shanghaiProgress: string | null;
  helperText: string;
  started: boolean;
  onReset: () => void;
  onStart: () => void;
  onModeChange: (value: TrainingMode) => void;
}) {
  const options: Array<{ value: TrainingMode; label: string; activeClass: string }> = [
    { value: "around-the-clock", label: "Around the Clock", activeClass: "bg-white text-black" },
    { value: "bull-drill", label: "Bull Drill", activeClass: "bg-amber-300 text-black" },
    { value: "shanghai", label: "Shanghai", activeClass: "bg-emerald-400 text-black" },
    { value: "doubles-around", label: "Doubles Around", activeClass: "bg-fuchsia-400 text-black" },
  ];

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Training Setup</h2>
          <p className="mt-1 text-sm text-stone-400">{currentModeLabel}</p>
        </div>
        {started ? (
          <button onClick={onReset} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-stone-200">
            Reset
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onModeChange(option.value)}
            className={`rounded-2xl px-5 py-4 text-left transition ${
              currentMode === option.value ? option.activeClass : "border border-white/10 bg-black/20 text-white hover:bg-white/10"
            }`}
          >
            <span className="block text-xs uppercase tracking-[0.22em]">Training</span>
            <span className="text-xl font-semibold">{option.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-sm text-stone-300">Ziel: {trainingTarget}</div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-sm text-stone-300">Darts: {dartsThrown}</div>
        {shanghaiProgress ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-3 text-sm text-stone-300">Shanghai: {shanghaiProgress}</div>
        ) : null}
      </div>

      <div className="mt-3 rounded-[1.5rem] border border-white/10 bg-black/20 p-4 text-sm text-stone-300">{helperText}</div>

      <button onClick={onStart} className="mt-3 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black shadow-lg shadow-white/10">
        Training starten
      </button>
    </section>
  );
}
