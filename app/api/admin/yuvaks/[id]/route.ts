import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdmin } from '@/lib/auth';
import { db } from '@/lib/supabase';
import { todayIST } from '@/lib/dates';

export const dynamic = 'force-dynamic';

function cleanDigits(val: unknown): string | null {
  if (typeof val !== 'string' && typeof val !== 'number') return null;
  const digits = String(val).replace(/\D/g, '');
  return digits || null;
}

function parseBirthDate(val: unknown): { isoDate: string | null; error?: string } {
  if (!val || typeof val !== 'string' || !val.trim()) {
    return { isoDate: null };
  }
  const s = val.trim();
  let iso = '';
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    iso = s;
  } else {
    const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmyMatch) {
      iso = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }
  }

  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { isoDate: null, error: 'Invalid birth date format. Use dd-mm-yyyy or yyyy-mm-dd' };
  }

  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { isoDate: null, error: 'Invalid birth date' };
  }

  const today = todayIST();
  if (iso > today) {
    return { isoDate: null, error: 'Birth date cannot be in the future' };
  }

  return { isoDate: iso };
}

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
    return NextResponse.json({ error: 'Invalid yuvak ID' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // 1. Verify yuvak exists
    const { data: existingYuvak, error: findError } = await db()
      .from('yuvaks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }
    if (!existingYuvak) {
      return NextResponse.json({ error: 'Yuvak not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    // Name
    const rawName = body.name !== undefined ? body.name : undefined;
    if (rawName !== undefined) {
      if (typeof rawName !== 'string') {
        return NextResponse.json({ error: 'Name must be a string' }, { status: 400 });
      }
      const cleanedName = rawName.replace(/\s+/g, ' ').trim();
      if (cleanedName.length < 2 || cleanedName.length > 120) {
        return NextResponse.json({ error: 'Name is required (2 to 120 characters)' }, { status: 400 });
      }
      updates.name = cleanedName;
    }

    // Form ID
    const rawFormId = body.formId !== undefined ? body.formId : body.form_id;
    if (rawFormId !== undefined) {
      updates.form_id = typeof rawFormId === 'string' && rawFormId.trim()
        ? rawFormId.trim().slice(0, 50)
        : null;
    }

    // Birth Date
    const rawBirthDate = body.birthDate !== undefined ? body.birthDate : body.birth_date;
    if (rawBirthDate !== undefined) {
      if (!rawBirthDate || (typeof rawBirthDate === 'string' && !rawBirthDate.trim())) {
        updates.birth_date = null;
      } else {
        const parsed = parseBirthDate(rawBirthDate);
        if (parsed.error) {
          return NextResponse.json({ error: parsed.error }, { status: 400 });
        }
        updates.birth_date = parsed.isoDate;
      }
    }

    // Address
    const rawAddress = body.address !== undefined ? body.address : undefined;
    if (rawAddress !== undefined) {
      updates.address = typeof rawAddress === 'string' && rawAddress.trim()
        ? rawAddress.trim().slice(0, 500)
        : null;
    }

    // Mobile
    const rawMobile = body.mobile !== undefined ? body.mobile : undefined;
    if (rawMobile !== undefined) {
      const mobileDigits = cleanDigits(rawMobile);
      if (mobileDigits) {
        if (mobileDigits.length !== 10) {
          return NextResponse.json({ error: 'Mobile number must be exactly 10 digits' }, { status: 400 });
        }
        // Duplicate mobile check
        const { data: duplicates } = await db()
          .from('yuvaks')
          .select('id, name, group_id')
          .eq('mobile', mobileDigits)
          .neq('id', id);

        if (duplicates && duplicates.length > 0 && !body.overrideDuplicateMobile) {
          const dup = duplicates[0];
          let groupCode = 'other group';
          if (dup.group_id) {
            const { data: g } = await db().from('groups').select('code').eq('id', dup.group_id).maybeSingle();
            if (g?.code) groupCode = g.code;
          }
          return NextResponse.json(
            {
              warning: `Mobile number ${mobileDigits} is already registered for ${dup.name} (${groupCode}).`,
              duplicateYuvak: { id: dup.id, name: dup.name, groupCode },
              canOverride: true,
            },
            { status: 409 }
          );
        }
        updates.mobile = mobileDigits;
      } else {
        updates.mobile = null;
      }
    }

    // WhatsApp
    const rawWhatsapp = body.whatsapp !== undefined ? body.whatsapp : undefined;
    if (rawWhatsapp !== undefined) {
      const whatsappDigits = cleanDigits(rawWhatsapp);
      if (whatsappDigits) {
        if (whatsappDigits.length !== 10) {
          return NextResponse.json({ error: 'WhatsApp number must be exactly 10 digits' }, { status: 400 });
        }
        updates.whatsapp = whatsappDigits;
      } else {
        updates.whatsapp = null;
      }
    }

    // Home Phone
    const rawHomePhone = body.homePhone !== undefined ? body.homePhone : body.home_phone;
    if (rawHomePhone !== undefined) {
      const homeDigits = cleanDigits(rawHomePhone);
      if (homeDigits) {
        if (homeDigits.length !== 10) {
          return NextResponse.json({ error: 'Home phone must be exactly 10 digits' }, { status: 400 });
        }
        updates.home_phone = homeDigits;
      } else {
        updates.home_phone = null;
      }
    }

    // Education
    const rawEducation = body.education !== undefined ? body.education : undefined;
    if (rawEducation !== undefined) {
      updates.education = typeof rawEducation === 'string' && rawEducation.trim()
        ? rawEducation.trim().slice(0, 200)
        : null;
    }

    // Group ID (move yuvak)
    const rawGroupId = body.groupId !== undefined ? body.groupId : body.group_id;
    if (rawGroupId !== undefined) {
      const targetGroupId = rawGroupId === null ? null : Number(rawGroupId);
      if (targetGroupId !== null) {
        if (!Number.isInteger(targetGroupId) || targetGroupId <= 0) {
          return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 });
        }
        const { data: targetGroup } = await db()
          .from('groups')
          .select('id, code')
          .eq('id', targetGroupId)
          .maybeSingle();

        if (!targetGroup) {
          return NextResponse.json({ error: 'Selected group does not exist' }, { status: 400 });
        }
        updates.group_id = targetGroupId;
      } else {
        // null group_id moves to NEW
        const { data: newGroup } = await db()
          .from('groups')
          .select('id')
          .eq('code', 'NEW')
          .maybeSingle();
        updates.group_id = newGroup?.id ?? null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, yuvak: existingYuvak });
    }

    // Attempt update with updated_at; fallback without updated_at if column not present yet
    let updatedYuvak: unknown = null;
    const nowIso = new Date().toISOString();

    const { data: withTsData, error: withTsError } = await db()
      .from('yuvaks')
      .update({ ...updates, updated_at: nowIso })
      .eq('id', id)
      .select('*')
      .single();

    if (withTsError) {
      const { data: fallbackData, error: fallbackError } = await db()
        .from('yuvaks')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
      updatedYuvak = fallbackData;
    } else {
      updatedYuvak = withTsData;
    }

    try {
      revalidatePath('/', 'layout');
    } catch {
      // safe fallback if outside normal request context
    }

    return NextResponse.json({ ok: true, yuvak: updatedYuvak });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update yuvak';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
