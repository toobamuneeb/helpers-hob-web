// GET /api/providers/availability/[providerId] - Fetch provider availability
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  try {
    const { providerId } = await params;

    // Fetch availability from database
    const { data: slots, error } = await supabaseAdmin
      .from('provider_availability')
      .select('*')
      .eq('provider_id', providerId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch availability' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        slots: slots || [],
      },
    });
  } catch (error: any) {
    console.error('Error fetching availability:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
