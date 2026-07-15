// POST /api/providers/availability - Create/Update provider availability
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const POST = requireAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { provider_id, slots } = body;

    // Validate provider_id matches authenticated user
    if (provider_id !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Validate slots array
    if (!Array.isArray(slots)) {
      return NextResponse.json(
        { success: false, error: 'Slots must be an array' },
        { status: 400 }
      );
    }

    // Validate each slot
    for (const slot of slots) {
      const { day_of_week, start_time, end_time } = slot;

      // Validate day_of_week
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      if (!validDays.includes(day_of_week)) {
        return NextResponse.json(
          { success: false, error: `Invalid day_of_week: ${day_of_week}` },
          { status: 400 }
        );
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
        return NextResponse.json(
          { success: false, error: 'Time must be in HH:MM format (00:00-23:59)' },
          { status: 400 }
        );
      }

      // Validate start_time < end_time
      const [startHour, startMin] = start_time.split(':').map(Number);
      const [endHour, endMin] = end_time.split(':').map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes >= endMinutes) {
        return NextResponse.json(
          { success: false, error: 'start_time must be before end_time' },
          { status: 400 }
        );
      }
    }

    // Delete existing availability for this provider
    await supabaseAdmin
      .from('provider_availability')
      .delete()
      .eq('provider_id', provider_id);

    // Insert new slots (if any)
    if (slots.length > 0) {
      const slotsToInsert = slots.map((slot: any) => ({
        provider_id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
      }));

      const { data: insertedSlots, error: insertError } = await supabaseAdmin
        .from('provider_availability')
        .insert(slotsToInsert)
        .select();

      if (insertError) {
        console.error('Insert error:', insertError);
        return NextResponse.json(
          { success: false, error: 'Failed to save availability' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          data: { slots: insertedSlots },
        },
        { status: 201 }
      );
    }

    // No slots to insert (cleared availability)
    return NextResponse.json(
      {
        success: true,
        data: { slots: [] },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error saving availability:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
});
