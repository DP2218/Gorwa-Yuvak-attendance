import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { getAllYuvaks } from '@/lib/data';
import { nameKey } from '@/lib/csv';

export const dynamic = 'force-dynamic';

// POST { name, group_id, birth_date?, mobile?, address?, education? }
// Adds a yuvak that is not in the Excel master list. Stored in Supabase with source = 'added'.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  const groupId = body?.group_id === null || body?.group_id === undefined ? null : Number(body.group_id);
  const clean = (v: unknown, max = 200) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  const mobile = clean(body?.mobile, 20)?.replace(/\D/g, '') || null;

  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: 'Name is required (2 to 120 characters)' }, { status: 400 });
  }
  if (mobile && (mobile.length < 10 || mobile.length > 13)) {
    return NextResponse.json({ error: 'Mobile should be 10 digits' }, { status: 400 });
  }

  // Duplicate check across every group, so the same person is not entered twice
  const key = nameKey(name);
  const existing = (await getAllYuvaks()).find((y) => nameKey(y.name) === key);
  if (existing) {
    const { data: g } = await db().from('groups').select('code').eq('id', existing.group_id ?? -1).maybeSingle();
    return NextResponse.json(
      { error: `"${existing.name}" is already in the list${g ? ` (${g.code})` : ''}. Mark them there instead.`, existing: { id: existing.id, name: existing.name, group_code: g?.code ?? null } },
      { status: 409 }
    );
  }

  let targetGroup = groupId;
  if (targetGroup === null) {
    const { data: g } = await db().from('groups').select('id').eq('code', 'NEW').maybeSingle();
    targetGroup = g?.id ?? null;
  }

  const { data, error } = await db()
    .from('yuvaks')
    .insert({
      group_id: targetGroup,
      name,
      birth_date: clean(body?.birth_date, 20),
      mobile,
      address: clean(body?.address, 300),
      education: clean(body?.education, 100),
      source: 'added',
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ yuvak: data }, { status: 201 });
}
