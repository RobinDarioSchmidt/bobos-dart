import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import { fetchAccessibleFinishedMatches } from "@/lib/server/cloud-match-access";
import { authorizeSupabaseRequest } from "@/lib/server/request-auth";

type ProfileRow = {
  id?: string;
  display_name: string;
  username: string | null;
  app_settings: Record<string, unknown> | null;
  created_at: string;
};

type MatchPlayerRow = {
  profile_id?: string | null;
  match_id?: string;
  sets_won: number;
  legs_won: number;
  average: number | null;
  best_visit: number | null;
  is_winner: boolean;
};

type TrainingRow = {
  mode?: string;
  score: number;
  darts_thrown: number;
  hits: number;
  played_at: string;
};

type MatchRow = {
  id: string;
  played_at: string;
  mode: string;
  double_out: boolean;
  finish_mode?: string | null;
  owner_id?: string;
  status?: string;
};

type MatchDetailRow = {
  match_id: string;
  guest_name: string | null;
  seat_index: number;
  is_winner: boolean;
  sets_won: number;
  legs_won: number;
  average: number | null;
  best_visit: number | null;
  profile_id: string | null;
};

type DartEventRow = {
  match_id?: string | null;
  player_name?: string;
  player_seat_index?: number;
  visit_index?: number;
  dart_index?: number;
  segment_label: string;
  base_value: number;
  multiplier: number;
  ring: string;
  score: number;
  is_hit: boolean;
  is_checkout_dart: boolean;
  target_label: string | null;
  board_x?: number | null;
  board_y?: number | null;
  source_type: "match" | "training";
  created_at?: string;
};

type HeatmapPoint = {
  x: number;
  y: number;
  score: number;
  ring: string;
};

export async function GET(request: Request) {
  const authResult = await authorizeSupabaseRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const { adminClient } = getSupabaseAdminClients();
  const { user } = authResult;

  const [
    { data: profile, error: profileError },
    { data: trainings, error: trainingsError },
    accessibleMatchesResult,
    { data: allProfiles, error: allProfilesError },
    { data: allPlayerResults, error: allPlayerResultsError },
    { data: allSystemMatches, error: allSystemMatchesError },
  ] = await Promise.all([
    adminClient
      .from("profiles")
      .select("id, display_name, username, app_settings, created_at")
      .eq("id", user.id)
      .single(),
    adminClient
      .from("training_sessions")
      .select("mode, score, darts_thrown, hits, played_at")
      .eq("owner_id", user.id)
      .order("played_at", { ascending: false }),
    fetchAccessibleFinishedMatches(adminClient, user.id),
    adminClient.from("profiles").select("id, display_name"),
    adminClient
      .from("match_players")
      .select("profile_id, match_id, sets_won, legs_won, average, best_visit, is_winner")
      .not("profile_id", "is", null),
    adminClient.from("matches").select("id, owner_id, played_at, status").eq("status", "finished"),
  ]);

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  if (trainingsError) {
    return NextResponse.json({ error: trainingsError.message }, { status: 400 });
  }

  if (allProfilesError) {
    return NextResponse.json({ error: allProfilesError.message }, { status: 400 });
  }
  if (allPlayerResultsError) {
    return NextResponse.json({ error: allPlayerResultsError.message }, { status: 400 });
  }
  if (allSystemMatchesError) {
    return NextResponse.json({ error: allSystemMatchesError.message }, { status: 400 });
  }

  const profileRow = profile as ProfileRow;
  const trainingRows = (trainings ?? []) as TrainingRow[];
  const matchRows = accessibleMatchesResult.matches as MatchRow[];
  const recentMatchRows = matchRows.slice(0, 8);
  const matchIds = matchRows.map((match) => match.id);
  const matchDetailRows = accessibleMatchesResult.players as MatchDetailRow[];
  const [{ data: matchDartEvents, error: matchDartEventsError }, { data: trainingDartEvents, error: trainingDartEventsError }] =
    await Promise.all([
      matchIds.length
        ? adminClient
            .from("dart_events")
            .select("match_id, player_name, player_seat_index, visit_index, dart_index, segment_label, base_value, multiplier, ring, score, is_hit, is_checkout_dart, target_label, board_x, board_y, source_type, created_at")
            .in("match_id", matchIds)
            .eq("source_type", "match")
        : Promise.resolve({ data: [], error: null }),
      adminClient
        .from("dart_events")
        .select("match_id, player_name, player_seat_index, visit_index, dart_index, segment_label, base_value, multiplier, ring, score, is_hit, is_checkout_dart, target_label, board_x, board_y, source_type, created_at")
        .eq("owner_id", user.id)
        .eq("source_type", "training"),
    ]);

  if (matchDartEventsError) {
    return NextResponse.json({ error: matchDartEventsError.message }, { status: 400 });
  }

  if (trainingDartEventsError) {
    return NextResponse.json({ error: trainingDartEventsError.message }, { status: 400 });
  }

  const dartRows = [...((matchDartEvents ?? []) as DartEventRow[]), ...((trainingDartEvents ?? []) as DartEventRow[])];
  const userSeatByMatchId = new Map(
    matchDetailRows
      .filter((row) => row.profile_id === user.id)
      .map((row) => [row.match_id, row.seat_index] as const),
  );
  const selfMatchDartRows = dartRows.filter(
    (row) =>
      row.source_type === "match" &&
      typeof row.match_id === "string" &&
      userSeatByMatchId.get(row.match_id) === row.player_seat_index,
  );
  const selfTrainingDartRows = dartRows.filter((row) => row.source_type === "training");
  const selfDartRows = [...selfMatchDartRows, ...selfTrainingDartRows];
  const totalTrainingDarts = trainingRows.reduce((sum, row) => sum + row.darts_thrown, 0);
  const totalTrainingHits = trainingRows.reduce((sum, row) => sum + row.hits, 0);
  const allMatchesWithDetails = matchRows
    .map((match) => {
    const players = matchDetailRows.filter((row) => row.match_id === match.id);
    const winner = players.find((row) => row.is_winner)?.guest_name ?? "Unbekannt";
    const opponentEntries = players
      .filter((row) => row.profile_id !== user.id)
      .map((row) => ({
        name: row.guest_name ?? "Gast",
        profileId: row.profile_id,
        legs: row.legs_won ?? 0,
      }));
    const opponents = players
      .filter((row) => row.profile_id !== user.id)
      .map((row) => row.guest_name ?? "Gast")
      .join(", ");
    const mySeat = players.find((row) => row.profile_id === user.id) ?? null;

      return {
      id: match.id,
      played_at: match.played_at,
      mode: match.mode,
      double_out: match.double_out,
      finish_mode: match.finish_mode ?? null,
      winner,
      opponents,
      opponent_entries: opponentEntries,
      sets: players.map((row) => `${row.guest_name ?? "Gast"} ${row.sets_won}`).join(" - "),
      did_win: mySeat?.is_winner ?? false,
      player_average: Number(mySeat?.average ?? 0),
      player_best_visit: mySeat?.best_visit ?? 0,
      player_legs: mySeat?.legs_won ?? 0,
      player_sets: mySeat?.sets_won ?? 0,
      };
    })
    .filter((match) => match.opponent_entries.length > 0 || match.did_win || match.player_average > 0 || match.player_best_visit > 0);

  const recentMatchesWithDetails = recentMatchRows
    .map((match) => {
    const players = matchDetailRows.filter((row) => row.match_id === match.id);
    const winner = players.find((row) => row.is_winner)?.guest_name ?? "Unbekannt";
    const opponents = players
      .filter((row) => row.profile_id !== user.id)
      .map((row) => row.guest_name ?? "Gast")
      .join(", ");
    const mySeat = players.find((row) => row.profile_id === user.id) ?? null;

      return {
      id: match.id,
      played_at: match.played_at,
      mode: match.mode,
      double_out: match.double_out,
      finish_mode: match.finish_mode ?? null,
      winner,
      opponents,
      opponent_entries: players
        .filter((row) => row.profile_id !== user.id)
        .map((row) => ({
          name: row.guest_name ?? "Gast",
          profileId: row.profile_id,
          legs: row.legs_won ?? 0,
        })),
      sets: players.map((row) => `${row.guest_name ?? "Gast"} ${row.sets_won}`).join(" - "),
      did_win: mySeat?.is_winner ?? false,
      player_average: Number(mySeat?.average ?? 0),
      player_best_visit: mySeat?.best_visit ?? 0,
      player_legs: mySeat?.legs_won ?? 0,
      player_sets: mySeat?.sets_won ?? 0,
      };
    })
    .filter((match) => match.opponent_entries.length > 0 || match.did_win || match.player_average > 0 || match.player_best_visit > 0);

  const ownedPlayerRows = matchDetailRows.filter((row) => row.profile_id === user.id);
  const stats = {
    matchesPlayed: allMatchesWithDetails.length,
    matchesWon: allMatchesWithDetails.filter((match) => match.did_win).length,
    totalSetsWon: ownedPlayerRows.reduce((sum, row) => sum + row.sets_won, 0),
    totalLegsWon: ownedPlayerRows.reduce((sum, row) => sum + row.legs_won, 0),
    bestAverage: ownedPlayerRows.reduce((best, row) => Math.max(best, Number(row.average ?? 0)), 0),
    bestVisit: ownedPlayerRows.reduce((best, row) => Math.max(best, row.best_visit ?? 0), 0),
    trainingSessions: trainingRows.length,
    bestTrainingScore: trainingRows.reduce((best, row) => Math.max(best, row.score), 0),
    totalTrainingDarts,
    totalTrainingHits,
    winRate:
      allMatchesWithDetails.length > 0
        ? Number(((allMatchesWithDetails.filter((match) => match.did_win).length / allMatchesWithDetails.length) * 100).toFixed(1))
        : 0,
    trainingHitRate:
      totalTrainingDarts > 0 ? Number(((totalTrainingHits / totalTrainingDarts) * 100).toFixed(1)) : 0,
  };

  let rollingStreak = 0;
  let bestWinStreak = 0;
  for (const match of allMatchesWithDetails) {
    if (match.did_win) {
      rollingStreak += 1;
      bestWinStreak = Math.max(bestWinStreak, rollingStreak);
    } else {
      rollingStreak = 0;
    }
  }

  let currentWinStreak = 0;
  for (const match of allMatchesWithDetails) {
    if (!match.did_win) {
      break;
    }

    currentWinStreak += 1;
  }

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const matchesLast30Days = allMatchesWithDetails.filter((match) => new Date(match.played_at).getTime() >= thirtyDaysAgo).length;
  const trainingLast30Days = trainingRows.filter((training) => new Date(training.played_at).getTime() >= thirtyDaysAgo).length;
  const favoriteModeCounts = allMatchesWithDetails.reduce<Record<string, number>>((acc, match) => {
    acc[match.mode] = (acc[match.mode] ?? 0) + 1;
    return acc;
  }, {});
  const favoriteMode = Object.entries(favoriteModeCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "501";
  const recentTrainingRows = trainingRows.slice(0, 12);
  const recentTrainingAverageScore =
    recentTrainingRows.length > 0
      ? Number((recentTrainingRows.reduce((sum, row) => sum + row.score, 0) / recentTrainingRows.length).toFixed(1))
      : 0;
  const countedBoardThrows = selfDartRows.filter((row) => row.ring !== "unknown");
  const favoriteSegments = Object.entries(
    countedBoardThrows.reduce<Record<string, number>>((acc, row) => {
      acc[row.segment_label] = (acc[row.segment_label] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));
  const favoriteDoubles = Object.entries(
    countedBoardThrows
      .filter((row) => row.ring === "double" || row.ring === "bull")
      .reduce<Record<string, number>>((acc, row) => {
        acc[row.segment_label] = (acc[row.segment_label] ?? 0) + 1;
        return acc;
      }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([label, count]) => ({ label, count }));
  const heatmapNumbers = countedBoardThrows.reduce<Record<string, number>>((acc, row) => {
    const key =
      row.base_value === 25
        ? row.ring === "bull"
          ? "Bull"
          : "Outer Bull"
        : String(row.base_value);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const heatmapMax = Math.max(0, ...Object.values(heatmapNumbers));
  const heatmapPoints = countedBoardThrows
    .filter((row) => typeof row.board_x === "number" && typeof row.board_y === "number")
    .map((row) => ({
      x: Number(row.board_x),
      y: Number(row.board_y),
      score: row.score,
      ring: row.ring,
    }))
    .filter((point): point is HeatmapPoint => Number.isFinite(point.x) && Number.isFinite(point.y));
  const throwStats = {
    totalThrows: selfDartRows.length,
    boardThrows: countedBoardThrows.length,
    bullsHit: countedBoardThrows.filter((row) => row.ring === "bull" || row.ring === "outer-bull").length,
    doublesHit: countedBoardThrows.filter((row) => row.ring === "double" || row.ring === "bull").length,
    triplesHit: countedBoardThrows.filter((row) => row.ring === "triple").length,
    misses: selfDartRows.filter((row) => row.ring === "miss" || row.score === 0).length,
    checkoutsHit: selfDartRows.filter((row) => row.is_checkout_dart).length,
    favoriteSegment: favoriteSegments[0]?.label ?? "Noch offen",
    favoriteDouble: favoriteDoubles[0]?.label ?? "Noch offen",
  };
  const consistencyScore = Math.round(
    Math.min(
      100,
      stats.winRate * 0.45 +
        stats.trainingHitRate * 0.25 +
        Math.min(stats.bestAverage, 90) * 0.3,
    ),
  );
  const pressureScore = Math.round(
    Math.min(
      100,
      (Math.min(stats.bestVisit, 180) / 180) * 55 +
        (Math.min(stats.bestAverage, 90) / 90) * 45,
    ),
  );
  const recentForm = allMatchesWithDetails.slice(0, 5).map((match) => (match.did_win ? "W" : "L"));
  const monthlyMatches = Object.values(
    allMatchesWithDetails.reduce<Record<string, { period: string; matches: number; wins: number; average: number; averageCount: number }>>(
      (acc, match) => {
        const period = new Date(match.played_at).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
        if (!acc[period]) {
          acc[period] = { period, matches: 0, wins: 0, average: 0, averageCount: 0 };
        }

        acc[period].matches += 1;
        acc[period].wins += match.did_win ? 1 : 0;
        if (match.player_average > 0) {
          acc[period].average += match.player_average;
          acc[period].averageCount += 1;
        }
        return acc;
      },
      {},
    ),
  ).map((entry) => ({
    period: entry.period,
    matches: entry.matches,
    wins: entry.wins,
    average: entry.averageCount > 0 ? Number((entry.average / entry.averageCount).toFixed(1)) : 0,
  }));
  const monthlyTraining = Object.values(
    trainingRows.reduce<Record<string, { period: string; sessions: number; averageScore: number; totalScore: number }>>(
      (acc, training) => {
        const period = new Date(training.played_at).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
        if (!acc[period]) {
          acc[period] = { period, sessions: 0, averageScore: 0, totalScore: 0 };
        }

        acc[period].sessions += 1;
        acc[period].totalScore += training.score;
        return acc;
      },
      {},
    ),
  ).map((entry) => ({
    period: entry.period,
    sessions: entry.sessions,
    averageScore: entry.sessions > 0 ? Number((entry.totalScore / entry.sessions).toFixed(1)) : 0,
  }));
  const modeBreakdown = Object.values(
    allMatchesWithDetails.reduce<
      Record<string, { mode: string; matches: number; wins: number; averageTotal: number; averageCount: number; bestVisit: number }>
    >((acc, match) => {
      if (!acc[match.mode]) {
        acc[match.mode] = { mode: match.mode, matches: 0, wins: 0, averageTotal: 0, averageCount: 0, bestVisit: 0 };
      }

      acc[match.mode].matches += 1;
      acc[match.mode].wins += match.did_win ? 1 : 0;
      acc[match.mode].bestVisit = Math.max(acc[match.mode].bestVisit, match.player_best_visit);
      if (match.player_average > 0) {
        acc[match.mode].averageTotal += match.player_average;
        acc[match.mode].averageCount += 1;
      }
      return acc;
    }, {}),
  ).map((entry) => ({
    mode: entry.mode,
    matches: entry.matches,
    wins: entry.wins,
    average: entry.averageCount > 0 ? Number((entry.averageTotal / entry.averageCount).toFixed(1)) : 0,
    bestVisit: entry.bestVisit,
  }));
  const weeklyActivity = Array.from({ length: 12 }, (_, index) => {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (11 - index) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const period = `${weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;
    return {
      period,
      matches: allMatchesWithDetails.filter((match) => {
        const playedAt = new Date(match.played_at).getTime();
        return playedAt >= weekStart.getTime() && playedAt < weekEnd.getTime();
      }).length,
      training: trainingRows.filter((entry) => {
        const playedAt = new Date(entry.played_at).getTime();
        return playedAt >= weekStart.getTime() && playedAt < weekEnd.getTime();
      }).length,
    };
  });
  const opponentBreakdown = Object.values(
    allMatchesWithDetails.reduce<
      Record<
        string,
        {
          name: string;
          profileId: string | null;
          matches: number;
          wins: number;
          myAverageTotal: number;
          myAverageCount: number;
          bestVisit: number;
          legsFor: number;
          legsAgainst: number;
          lastPlayed: string;
        }
      >
    >((acc, match) => {
      for (const opponent of match.opponent_entries) {
        const name = opponent.name;
        const key = opponent.profileId ?? `${name}:guest`;
        if (!acc[key]) {
          acc[key] = {
            name,
            profileId: opponent.profileId,
            matches: 0,
            wins: 0,
            myAverageTotal: 0,
            myAverageCount: 0,
            bestVisit: 0,
            legsFor: 0,
            legsAgainst: 0,
            lastPlayed: match.played_at,
          };
        }

        acc[key].matches += 1;
        acc[key].wins += match.did_win ? 1 : 0;
        acc[key].legsFor += match.player_legs;
        acc[key].legsAgainst += opponent.legs;
        acc[key].bestVisit = Math.max(acc[key].bestVisit, match.player_best_visit);
        if (match.player_average > 0) {
          acc[key].myAverageTotal += match.player_average;
          acc[key].myAverageCount += 1;
        }
        if (new Date(match.played_at).getTime() > new Date(acc[key].lastPlayed).getTime()) {
          acc[key].lastPlayed = match.played_at;
        }
      }
      return acc;
    }, {}),
  )
    .map((entry) => ({
      name: entry.name,
      profileId: entry.profileId,
      matches: entry.matches,
      wins: entry.wins,
      winRate: entry.matches > 0 ? Number(((entry.wins / entry.matches) * 100).toFixed(1)) : 0,
      average: entry.myAverageCount > 0 ? Number((entry.myAverageTotal / entry.myAverageCount).toFixed(1)) : 0,
      bestVisit: entry.bestVisit,
      legsFor: entry.legsFor,
      legsAgainst: entry.legsAgainst,
      lastPlayed: entry.lastPlayed,
    }))
    .sort((left, right) => right.matches - left.matches)
    .slice(0, 8);
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthlyMatchesWindow = allMatchesWithDetails.filter((match) => new Date(match.played_at).getTime() >= thirtyDaysAgo);
  const weeklyMatchesWindow = allMatchesWithDetails.filter((match) => new Date(match.played_at).getTime() >= sevenDaysAgo);
  const monthlyTrainingWindow = trainingRows.filter((training) => new Date(training.played_at).getTime() >= thirtyDaysAgo);
  const weeklyTrainingWindow = trainingRows.filter((training) => new Date(training.played_at).getTime() >= sevenDaysAgo);
  const matchVisitScores = Object.values(
    selfMatchDartRows
      .filter((row) => typeof row.match_id === "string")
      .reduce<Record<string, { score: number; playedAt: string }>>((acc, row) => {
        const key = `${row.match_id ?? "match"}:${row.player_seat_index ?? 0}:${row.visit_index ?? 0}`;
        if (!acc[key]) {
          acc[key] = { score: 0, playedAt: row.created_at ?? "" };
        }
        acc[key].score += row.score;
        if (!acc[key].playedAt && row.created_at) {
          acc[key].playedAt = row.created_at;
        }
        return acc;
      }, {}),
  );
  const visitBuckets = [
    {
      label: "0-45",
      count: matchVisitScores.filter((visit) => visit.score >= 0 && visit.score <= 45).length,
    },
    {
      label: "46-99",
      count: matchVisitScores.filter((visit) => visit.score >= 46 && visit.score <= 99).length,
    },
    {
      label: "100+",
      count: matchVisitScores.filter((visit) => visit.score >= 100).length,
    },
    {
      label: "140+",
      count: matchVisitScores.filter((visit) => visit.score >= 140).length,
    },
    {
      label: "180",
      count: matchVisitScores.filter((visit) => visit.score === 180).length,
    },
  ];
  const monthlyVisitScores = matchVisitScores.filter((visit) =>
    visit.playedAt ? new Date(visit.playedAt).getTime() >= thirtyDaysAgo : true,
  );
  const weeklyVisitScores = matchVisitScores.filter((visit) =>
    visit.playedAt ? new Date(visit.playedAt).getTime() >= sevenDaysAgo : true,
  );
  const records = {
    weekly: {
      matches: weeklyMatchesWindow.length,
      wins: weeklyMatchesWindow.filter((match) => match.did_win).length,
      bestAverage: weeklyMatchesWindow.reduce((best, match) => Math.max(best, match.player_average), 0),
      bestVisit: weeklyMatchesWindow.reduce((best, match) => Math.max(best, match.player_best_visit), 0),
      bestTrainingScore: weeklyTrainingWindow.reduce((best, training) => Math.max(best, training.score), 0),
      topVisitScore: weeklyVisitScores.reduce((best, visit) => Math.max(best, visit.score), 0),
    },
    monthly: {
      matches: monthlyMatchesWindow.length,
      wins: monthlyMatchesWindow.filter((match) => match.did_win).length,
      bestAverage: monthlyMatchesWindow.reduce((best, match) => Math.max(best, match.player_average), 0),
      bestVisit: monthlyMatchesWindow.reduce((best, match) => Math.max(best, match.player_best_visit), 0),
      bestTrainingScore: monthlyTrainingWindow.reduce((best, training) => Math.max(best, training.score), 0),
      topVisitScore: monthlyVisitScores.reduce((best, visit) => Math.max(best, visit.score), 0),
    },
    lifetime: {
      matches: allMatchesWithDetails.length,
      wins: allMatchesWithDetails.filter((match) => match.did_win).length,
      bestAverage: stats.bestAverage,
      bestVisit: stats.bestVisit,
      bestTrainingScore: stats.bestTrainingScore,
      topVisitScore: matchVisitScores.reduce((best, visit) => Math.max(best, visit.score), 0),
    },
  };
  const achievements = [
    {
      key: "first_win",
      title: "Erster Sieg",
      description: "Hole dir deinen ersten Matchsieg in der Cloud.",
      unlocked: stats.matchesWon >= 1,
      progress: Math.min(stats.matchesWon, 1),
      target: 1,
      unit: "Siege",
      tone: "emerald",
    },
    {
      key: "ten_wins",
      title: "Win Collector",
      description: "Gewinne 10 Matches.",
      unlocked: stats.matchesWon >= 10,
      progress: Math.min(stats.matchesWon, 10),
      target: 10,
      unit: "Siege",
      tone: "emerald",
    },
    {
      key: "checkout_master",
      title: "Checkout Master",
      description: "Triff 25 Checkout-Darts.",
      unlocked: throwStats.checkoutsHit >= 25,
      progress: Math.min(throwStats.checkoutsHit, 25),
      target: 25,
      unit: "Checkouts",
      tone: "amber",
    },
    {
      key: "bull_hunter",
      title: "Bull Hunter",
      description: "Triff 50 Bulls oder Outer Bulls.",
      unlocked: throwStats.bullsHit >= 50,
      progress: Math.min(throwStats.bullsHit, 50),
      target: 50,
      unit: "Bulls",
      tone: "rose",
    },
    {
      key: "training_grinder",
      title: "Training Grinder",
      description: "Spiele 40 Trainingssessions.",
      unlocked: stats.trainingSessions >= 40,
      progress: Math.min(stats.trainingSessions, 40),
      target: 40,
      unit: "Sessions",
      tone: "fuchsia",
    },
    {
      key: "maximum_pressure",
      title: "Maximum Pressure",
      description: "Schaffe einen Best Visit von 140 oder mehr.",
      unlocked: stats.bestVisit >= 140,
      progress: Math.min(stats.bestVisit, 140),
      target: 140,
      unit: "Punkte",
      tone: "emerald",
    },
    {
      key: "hot_month",
      title: "Heisser Monat",
      description: "Gewinne 8 Matches innerhalb von 30 Tagen.",
      unlocked: records.monthly.wins >= 8,
      progress: Math.min(records.monthly.wins, 8),
      target: 8,
      unit: "Siege",
      tone: "amber",
    },
  ];
  const chronologicalWins = allMatchesWithDetails
    .filter((match) => match.did_win)
    .map((match) => match.played_at)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const chronologicalTrainings = trainingRows
    .map((training) => training.played_at)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const chronologicalCheckouts = selfDartRows
    .filter((row) => row.is_checkout_dart && row.created_at)
    .map((row) => row.created_at as string)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const chronologicalBulls = countedBoardThrows
    .filter((row) => (row.ring === "bull" || row.ring === "outer-bull") && row.created_at)
    .map((row) => row.created_at as string)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const firstMaximumPressure = allMatchesWithDetails
    .filter((match) => match.player_best_visit >= 140)
    .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime())[0]?.played_at;
  const hotMonthUnlockedAt = chronologicalWins.find((winDate, index, wins) => {
    const currentTime = new Date(winDate).getTime();
    const thirtyDayWindowStart = currentTime - 30 * 24 * 60 * 60 * 1000;
    return wins.filter((date) => {
      const time = new Date(date).getTime();
      return time >= thirtyDayWindowStart && time <= currentTime;
    }).length >= 8 && index >= 7;
  });
  const recentMilestones = [
    chronologicalWins[0]
      ? { key: "first_win", title: "Erster Sieg", unlockedAt: chronologicalWins[0], tone: "emerald" }
      : null,
    chronologicalWins[9]
      ? { key: "ten_wins", title: "Win Collector", unlockedAt: chronologicalWins[9], tone: "emerald" }
      : null,
    chronologicalCheckouts[24]
      ? { key: "checkout_master", title: "Checkout Master", unlockedAt: chronologicalCheckouts[24], tone: "amber" }
      : null,
    chronologicalBulls[49]
      ? { key: "bull_hunter", title: "Bull Hunter", unlockedAt: chronologicalBulls[49], tone: "rose" }
      : null,
    chronologicalTrainings[39]
      ? { key: "training_grinder", title: "Training Grinder", unlockedAt: chronologicalTrainings[39], tone: "fuchsia" }
      : null,
    firstMaximumPressure
      ? { key: "maximum_pressure", title: "Maximum Pressure", unlockedAt: firstMaximumPressure, tone: "emerald" }
      : null,
    hotMonthUnlockedAt
      ? { key: "hot_month", title: "Heisser Monat", unlockedAt: hotMonthUnlockedAt, tone: "amber" }
      : null,
  ]
    .filter((milestone): milestone is { key: string; title: string; unlockedAt: string; tone: string } => Boolean(milestone))
    .sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime())
    .slice(0, 3);
  const highlightTitle =
    stats.matchesPlayed === 0 && stats.trainingSessions === 0
      ? "Noch in der Einspielphase"
      : stats.matchesPlayed === 0
        ? stats.trainingHitRate >= 55
          ? "Practice Machine"
          : "Training laeuft an"
        : stats.winRate >= 65
          ? "Match Closer"
          : stats.trainingHitRate >= 55
            ? "Practice Machine"
            : stats.bestAverage >= 60
              ? "Scoring Engine"
              : "Steady Builder";
  const highlightReason =
    stats.matchesPlayed === 0 && stats.trainingSessions === 0
      ? "Sobald dein erstes Match oder Training gespeichert ist, fuellt sich dein Profil mit echten Langzeitdaten."
      : stats.matchesPlayed === 0
        ? stats.trainingHitRate >= 55
          ? "Deine ersten Trainingsdaten sehen schon erstaunlich sauber aus."
          : "Dein Profil sammelt gerade erst Trainingsdaten fuer ein klares Bild."
        : stats.winRate >= 65
          ? "Deine Siegquote ist gerade richtig stark."
          : stats.trainingHitRate >= 55
            ? "Deine Trainingsdaten zeigen saubere Wiederholbarkeit."
            : stats.bestAverage >= 60
              ? "Dein bestes Average zeigt echtes Scoring-Potenzial."
              : "Du baust dir gerade eine stabile Match-Basis auf.";
  const profileNameMap = new Map(
    ((allProfiles ?? []) as Array<{ id: string; display_name: string }>).map((entry) => [entry.id, entry.display_name]),
  );
  const systemMatchMap = new Map(
    ((allSystemMatches ?? []) as Array<{ id: string; owner_id: string; played_at: string }>).map((entry) => [entry.id, entry.played_at]),
  );
  const systemMatchOwnerMap = new Map(
    ((allSystemMatches ?? []) as Array<{ id: string; owner_id: string; played_at: string }>).map((entry) => [entry.id, entry.owner_id]),
  );
  const seasonWindows = {
    year: new Date(new Date().getFullYear(), 0, 1).getTime(),
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
    last30: thirtyDaysAgo,
  };
  const seasonalLeaderboards = Object.fromEntries(
    Object.entries(seasonWindows).map(([key, cutoff]) => {
      const filtered = ((allPlayerResults ?? []) as MatchPlayerRow[]).filter((row) => {
        const playedAt = row.match_id ? systemMatchMap.get(row.match_id) : null;
        const ownerId = row.match_id ? systemMatchOwnerMap.get(row.match_id) : null;
        return row.profile_id && playedAt && ownerId ? row.profile_id === ownerId && new Date(playedAt).getTime() >= cutoff : false;
      });
      const byPlayer = Object.values(
        filtered.reduce<
          Record<
            string,
            {
              profileId: string;
              name: string;
              matches: number;
              wins: number;
              averageTotal: number;
              averageCount: number;
              bestVisit: number;
            }
          >
        >((acc, row) => {
          const profileId = row.profile_id ?? "";
          if (!profileId) {
            return acc;
          }
          if (!acc[profileId]) {
            acc[profileId] = {
              profileId,
              name: profileNameMap.get(profileId) ?? "Spieler",
              matches: 0,
              wins: 0,
              averageTotal: 0,
              averageCount: 0,
              bestVisit: 0,
            };
          }
          acc[profileId].matches += 1;
          acc[profileId].wins += row.is_winner ? 1 : 0;
          if ((row.average ?? 0) > 0) {
            acc[profileId].averageTotal += Number(row.average ?? 0);
            acc[profileId].averageCount += 1;
          }
          acc[profileId].bestVisit = Math.max(acc[profileId].bestVisit, row.best_visit ?? 0);
          return acc;
        }, {}),
      ).map((entry) => ({
        profileId: entry.profileId,
        name: entry.name,
        matches: entry.matches,
        wins: entry.wins,
        winRate: entry.matches > 0 ? Number(((entry.wins / entry.matches) * 100).toFixed(1)) : 0,
        average: entry.averageCount > 0 ? Number((entry.averageTotal / entry.averageCount).toFixed(1)) : 0,
        bestVisit: entry.bestVisit,
        isCurrentUser: entry.profileId === user.id,
      }));

      return [
        key,
        {
          wins: [...byPlayer].sort((left, right) => right.wins - left.wins || right.matches - left.matches).slice(0, 8),
          winRate: [...byPlayer]
            .filter((entry) => entry.matches >= 3)
            .sort((left, right) => right.winRate - left.winRate || right.matches - left.matches)
            .slice(0, 8),
          average: [...byPlayer]
            .filter((entry) => entry.average > 0)
            .sort((left, right) => right.average - left.average || right.matches - left.matches)
            .slice(0, 8),
        },
      ];
    }),
  );
  const checkoutVisits = Object.values(
    selfMatchDartRows.reduce<
      Record<
        string,
        {
          matchId: string;
          visitIndex: number;
          playedAt: string;
          route: string[];
          total: number;
          isCheckout: boolean;
          finishLabel: string | null;
        }
      >
    >((acc, row) => {
      if (!row.match_id) {
        return acc;
      }
      const key = `${row.match_id}:${row.visit_index ?? 0}`;
      if (!acc[key]) {
        acc[key] = {
          matchId: row.match_id,
          visitIndex: row.visit_index ?? 0,
          playedAt: row.created_at ?? "",
          route: [],
          total: 0,
          isCheckout: false,
          finishLabel: null,
        };
      }
      acc[key].route[row.dart_index ?? acc[key].route.length] = row.segment_label;
      acc[key].total += row.score;
      if (row.created_at && !acc[key].playedAt) {
        acc[key].playedAt = row.created_at;
      }
      if (row.is_checkout_dart) {
        acc[key].isCheckout = true;
        acc[key].finishLabel = row.segment_label;
      }
      return acc;
    }, {}),
  )
    .map((entry) => ({
      ...entry,
      route: entry.route.filter(Boolean),
    }))
    .filter((entry) => entry.isCheckout);
  const favoriteCheckoutRouteEntry = Object.entries(
    checkoutVisits.reduce<Record<string, number>>((acc, entry) => {
      const key = entry.route.join(" - ");
      if (!key) {
        return acc;
      }
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((left, right) => right[1] - left[1])[0];
  const favoriteCheckoutFinishEntry = Object.entries(
    checkoutVisits.reduce<Record<string, number>>((acc, entry) => {
      const key = entry.finishLabel ?? "Unbekannt";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((left, right) => right[1] - left[1])[0];
  const checkoutInsights = {
    total: checkoutVisits.length,
    bestCheckout: checkoutVisits.reduce((best, entry) => Math.max(best, entry.total), 0),
    averageCheckout:
      checkoutVisits.length > 0
        ? Number((checkoutVisits.reduce((sum, entry) => sum + entry.total, 0) / checkoutVisits.length).toFixed(1))
        : 0,
    favoriteRoute: favoriteCheckoutRouteEntry?.[0] ?? "Noch kein Checkout",
    favoriteFinish: favoriteCheckoutFinishEntry?.[0] ?? "Noch offen",
    byRange: [
      { label: "1-40", count: checkoutVisits.filter((entry) => entry.total <= 40).length },
      { label: "41-80", count: checkoutVisits.filter((entry) => entry.total >= 41 && entry.total <= 80).length },
      { label: "81-120", count: checkoutVisits.filter((entry) => entry.total >= 81 && entry.total <= 120).length },
      { label: "121+", count: checkoutVisits.filter((entry) => entry.total >= 121).length },
    ],
    recent: checkoutVisits
      .sort((left, right) => new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime())
      .slice(0, 6)
      .map((entry) => ({
        route: entry.route.join(" - "),
        total: entry.total,
        finishLabel: entry.finishLabel ?? "Unbekannt",
        playedAt: entry.playedAt,
      })),
  };
  const rivalryInsights = {
    closest: [...opponentBreakdown]
      .filter((entry) => entry.matches >= 2)
      .sort(
        (left, right) =>
          Math.abs(left.legsFor - left.legsAgainst) - Math.abs(right.legsFor - right.legsAgainst) ||
          right.matches - left.matches,
      )
      .slice(0, 5)
      .map((entry) => ({
        ...entry,
        legDiff: entry.legsFor - entry.legsAgainst,
      })),
    toughest: [...opponentBreakdown]
      .filter((entry) => entry.matches >= 2)
      .sort((left, right) => left.winRate - right.winRate || right.matches - left.matches)
      .slice(0, 5)
      .map((entry) => ({
        ...entry,
        legDiff: entry.legsFor - entry.legsAgainst,
      })),
    bestMatchups: [...opponentBreakdown]
      .filter((entry) => entry.matches >= 2)
      .sort((left, right) => right.winRate - left.winRate || right.matches - left.matches)
      .slice(0, 5)
      .map((entry) => ({
        ...entry,
        legDiff: entry.legsFor - entry.legsAgainst,
      })),
  };
  const throwPatternTimeline = Object.values(
    selfDartRows.reduce<
      Record<
        string,
        {
          period: string;
          triples: number;
          doubles: number;
          bulls: number;
          checkouts: number;
          misses: number;
        }
      >
    >((acc, row) => {
      const stamp = row.created_at ? new Date(row.created_at) : null;
      const period = stamp ? stamp.toLocaleDateString("de-DE", { month: "short", year: "2-digit" }) : "Unbekannt";
      if (!acc[period]) {
        acc[period] = { period, triples: 0, doubles: 0, bulls: 0, checkouts: 0, misses: 0 };
      }
      if (row.ring === "triple") {
        acc[period].triples += 1;
      }
      if (row.ring === "double") {
        acc[period].doubles += 1;
      }
      if (row.ring === "bull" || row.ring === "outer-bull") {
        acc[period].bulls += 1;
      }
      if (row.ring === "miss" || row.score === 0) {
        acc[period].misses += 1;
      }
      if (row.is_checkout_dart) {
        acc[period].checkouts += 1;
      }
      return acc;
    }, {}),
  );

  return NextResponse.json({
    profile: profileRow,
    stats,
    recentTraining: trainingRows.slice(0, 12),
    trainingHistory: trainingRows,
    matchHistory: allMatchesWithDetails,
    recentMatches: recentMatchesWithDetails,
    insights: {
      favoriteMode,
      matchesLast30Days,
      trainingLast30Days,
      recentTrainingAverageScore,
      currentWinStreak,
      bestWinStreak,
      recentForm,
      consistencyScore,
      pressureScore,
      highlightTitle,
      highlightReason,
      throwStats,
      favoriteSegments,
      favoriteDoubles,
      heatmap: {
        numbers: heatmapNumbers,
        max: heatmapMax,
        points: heatmapPoints,
        preciseCount: heatmapPoints.length,
      },
      monthlyMatches,
      monthlyTraining,
      modeBreakdown,
      visitBuckets,
      weeklyActivity,
      opponentBreakdown,
      checkoutInsights,
      rivalryInsights,
      throwPatternTimeline,
      records,
      achievements,
      recentMilestones,
      seasonalLeaderboards,
    },
  });
}
