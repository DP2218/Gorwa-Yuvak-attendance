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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Not signed in as admin' }, { status: 401 });
  }

  const { id: rawId } = await params;
  const groupId = Number(rawId);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    // 1. Verify default group exists
    const { data: group, error: groupError } = await db()
      .from('groups')
      .select('id, code')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 500 });
    }
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // 2. Validate target group if overridden in body
    let finalGroupId = groupId;
    const rawTargetGroupId = body.groupId !== undefined ? body.groupId : body.group_id;
    if (rawTargetGroupId !== undefined && rawTargetGroupId !== null) {
      const numTarget = Number(rawTargetGroupId);
      if (!Number.isInteger(numTarget) || numTarget <= 0) {
        return NextResponse.json({ error: 'Invalid destination group ID' }, { status: 400 });
      }
      const { data: targetGroup } = await db()
        .from('groups')
        .select('id')
        .eq('id', numTarget)
        .maybeSingle();
      if (!targetGroup) {
        return NextResponse.json({ error: 'Destination group does not exist' }, { status: 400 });
      }
      finalGroupId = numTarget;
    }

    // 3. Validate Name
    const rawName = typeof body.name === 'string' ? body.name : '';
    const cleanedName = rawName.replace(/\s+/g, ' ').trim();
    if (cleanedName.length < 2 || cleanedName.length > 120) {
      return NextResponse.json({ error: 'Name is required (2 to 120 characters)' }, { status: 400 });
    }

    // 4. Validate Form ID
    const rawFormId = body.formId !== undefined ? body.formId : body.form_id;
    const formId = typeof rawFormId === 'string' && rawFormId.trim()
      ? rawFormId.trim().slice(0, 50)
      : null;

    // 5. Validate Birth Date
    let birthDate: string | null = null;
    const rawBirthDate = body.birthDate !== undefined ? body.birthDate : body.birth_date;
    if (rawBirthDate) {
      const parsed = parseBirthDate(rawBirthDate);
      if (parsed.error) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      birthDate = parsed.isoDate;
    }

    // 6. Validate Address
    const address = typeof body.address === 'string' && body.address.trim()
      ? body.address.trim().slice(0, 500)
      : null;

    // 7. Validate Mobile
    let mobile: string | null = null;
    const rawMobile = body.mobile !== undefined ? body.mobile : undefined;
    if (rawMobile) {
      const mobileDigits = cleanDigits(rawMobile);
      if (mobileDigits) {
        if (mobileDigits.length !== 10) {
          return NextResponse.json({ error: 'Mobile number must be exactly 10 digits' }, { status: 400 });
        }
        // Duplicate mobile check
        const { data: duplicates } = await db()
          .from('yuvaks')
          .select('id, name, group_id')
          .eq('mobile', mobileDigits);

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
        mobile = mobileDigits;
      }
    }

    // 8. Validate WhatsApp
    let whatsapp: string | null = null;
    const rawWhatsapp = body.whatsapp !== undefined ? body.whatsapp : undefined;
    if (rawWhatsapp) {
      const whatsappDigits = cleanDigits(rawWhatsapp);
      if (whatsappDigits) {
        if (whatsappDigits.length !== 10) {
          return NextResponse.json({ error: 'WhatsApp number must be exactly 10 digits' }, { status: 400 });
        }
        whatsapp = whatsappDigits;
      }
    }

    // 9. Validate Home Phone
    let homePhone: string | null = null;
    const rawHomePhone = body.homePhone !== undefined ? body.homePhone : body.home_phone;
    if (rawHomePhone) {
      const homeDigits = cleanDigits(rawHomePhone);
      if (homeDigits) {
        if (homeDigits.length !== 10) {
          return NextResponse.json({ error: 'Home phone must be exactly 10 digits' }, { status: 400 });
        }
        homePhone = homeDigits;
      }
    }

    // 10. Validate Education
    const education = typeof body.education === 'string' && body.education.trim()
      ? body.education.trim().slice(0, 200)
      : null;

    // 11. Determine next serial number in the target group
    const { data: maxRow } = await db()
      .from('yuvaks')
      .select('serial_no')
      .eq('group_id', finalGroupId)
      .order('serial_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSerialNo = (maxRow?.serial_no ?? 0) + 1;

    // 12. Insert yuvak (attempt with updated_at, fallback without)
    const newRecord: Record<string, unknown> = {
      group_id: finalGroupId,
      serial_no: nextSerialNo,
      form_id: formId,
      name: cleanedName,
      birth_date: birthDate,
      address,
      mobile,
      whatsapp,
      home_phone: homePhone,
      education,
      source: 'added',
    };

    let insertedYuvak: unknown = null;
    const nowIso = new Date().toISOString();

    const { data: withTsData, error: withTsError } = await db()
      .from('yuvaks')
      .insert({ ...newRecord, updated_at: nowIso })
      .select('*')
      .single();

    if (withTsError) {
      const { data: fallbackData, error: fallbackError } = await db()
        .from('yuvaks')
        .insert(newRecord)
        .select('*')
        .single();

      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
      insertedYuvak = fallbackData;
    } else {
      insertedYuvak = withTsData;
    }

    try {
      revalidatePath('/', 'layout');
    } catch {
      // safe fallback if outside normal request context
    }

    return NextResponse.json({ ok: true, yuvak: insertedYuvak }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add yuvak';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
