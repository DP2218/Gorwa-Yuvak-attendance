import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth';
import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Protect route with admin authentication
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Not signed in as admin' }, { status: 401 });
  }

  // 2. Validate ID input
  const { id: rawId } = await params;
  const id = Number(rawId);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid yuvak ID' }, { status: 400 });
  }

  try {
    // 3. Check if yuvak exists
    const { data: yuvak, error: findError } = await db()
      .from('yuvaks')
      .select('id, name, group_id')
      .eq('id', id)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    if (!yuvak) {
      return NextResponse.json({ error: 'Yuvak not found' }, { status: 404 });
    }

    // 4. Delete attendance rows for this yuvak (ensures zero orphan records even without FK cascade)
    const { error: attendanceError } = await db()
      .from('attendance')
      .delete()
      .eq('yuvak_id', id);

    if (attendanceError) {
      return NextResponse.json({ error: attendanceError.message }, { status: 500 });
    }

    // 5. Delete the yuvak record
    const { error: deleteError } = await db()
      .from('yuvaks')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 6. Invalidate server cache across home, group pages, and admin dashboard
    try {
      revalidatePath('/', 'layout');
    } catch {
      // safe fallback if outside normal request context
    }

    return NextResponse.json({
      ok: true,
      deletedId: id,
      name: yuvak.name,
      groupId: yuvak.group_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete yuvak';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
