import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Not signed in as admin' }, { status: 401 });
  }

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const rawLeader = body.leaderName !== undefined ? body.leaderName : body.leader_name;
  if (rawLeader === undefined) {
    return NextResponse.json({ error: 'Missing leaderName field' }, { status: 400 });
  }

  const leaderName = typeof rawLeader === 'string'
    ? rawLeader.replace(/\s+/g, ' ').trim() || null
    : null;

  if (leaderName && leaderName.length > 150) {
    return NextResponse.json({ error: 'Leader name cannot exceed 150 characters' }, { status: 400 });
  }

  try {
    const { data: existingGroup, error: findError } = await db()
      .from('groups')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }
    if (!existingGroup) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Attempt update with updated_at; fallback without updated_at if column doesn't exist yet
    let updatedGroup: unknown = null;
    const nowIso = new Date().toISOString();

    const { data: withTsData, error: withTsError } = await db()
      .from('groups')
      .update({ leader_name: leaderName, updated_at: nowIso })
      .eq('id', id)
      .select('*')
      .single();

    if (withTsError) {
      // Fallback if updated_at column is not yet migrated in Supabase
      const { data: fallbackData, error: fallbackError } = await db()
        .from('groups')
        .update({ leader_name: leaderName })
        .eq('id', id)
        .select('*')
        .single();

      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
      updatedGroup = fallbackData;
    } else {
      updatedGroup = withTsData;
    }

    try {
      revalidatePath('/', 'layout');
    } catch {
      // safe fallback if outside normal request context
    }

    return NextResponse.json({ ok: true, group: updatedGroup });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update group leader';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
