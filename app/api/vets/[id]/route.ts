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
    
    // Extract pets array from body
    const { pets, ...vetData } = body;
    
    // Update vet record (without pets array)
    const { data: vet, error } = await supabase
      .from('vets')
      .update(vetData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Update pet associations if pets array was provided
    if (pets !== undefined) {
      // Delete existing associations
      await supabase
        .from('vet_pets')
        .delete()
        .eq('vet_id', id);

      // Create new associations
      if (pets && pets.length > 0) {
        const vetPetEntries = pets.map((petId: string, index: number) => ({
          vet_id: id,
          pet_id: petId,
          is_primary: index === 0 // First pet is primary
        }));

        await supabase
          .from('vet_pets')
          .insert(vetPetEntries);
      }
    }

    // Return vet with pets array for backward compatibility
    return NextResponse.json({ vet: { ...vet, pets: pets || [] } });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update vet' },
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
    
    const { error } = await supabase
      .from('vets')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete vet' },
      { status: 500 }
    );
  }
}