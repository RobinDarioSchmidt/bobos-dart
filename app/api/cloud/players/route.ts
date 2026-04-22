import { NextResponse } from "next/server";
import { getSupabaseAdminClients } from "@/lib/supabase-admin";
import { authorizeSupabaseRequest } from "@/lib/server/request-auth";

type ProfilePresenceRow = {
  id: string;
  display_name: string;
  updated_at: string;
};

export async function GET(request: Request) {
  const authResult = await authorizeSupabaseRequest(request);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: 403 });
  }

  const { adminClient } = getSupabaseAdminClients();
  const now = new Date();
  const activeCutoff = now.getTime() - 30 * 60 * 1000;

  const { error: pingError } = await adminClient
    .from("profiles")
    .update({ updated_at: now.toISOString() })
    .eq("id", authResult.user.id);

  if (pingError) {
    return NextResponse.json({ error: pingError.message }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from("profiles")
    .select("id, display_name, updated_at")
    .neq("id", authResult.user.id)
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const players = ((data ?? []) as ProfilePresenceRow[])
    .map((player) => {
      const lastSeenAt = player.updated_at;
      const isActive = new Date(lastSeenAt).getTime() >= activeCutoff;

      return {
        id: player.id,
        displayName: player.display_name,
        lastSeenAt,
        isActive,
      };
    })
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ players });
}
