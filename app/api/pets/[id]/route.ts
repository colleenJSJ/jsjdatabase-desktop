import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Update pet in family_members table
    const { data: pet, error } = await supabase
      .from('family_members')
      .update(body)
      .eq('id', id)
      .eq('type', 'pet') // Ensure we're only updating pets
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ pet });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update pet' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();

    // Delete pet from family_members table
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('id', id)
      .eq('type', 'pet'); // Ensure we're only deleting pets

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete pet' },
      { status: 500 }
    );
  }
}