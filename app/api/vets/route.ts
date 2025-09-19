import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncVetToContacts } from '@/app/api/_helpers/contact-sync';

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Fetch vets with their associated pets through the junction table
    const { data: vets, error } = await supabase
      .from('vets')
      .select(`
        *,
        vet_pets(
          pet_id,
          is_primary,
          pet:family_members!pet_id(
            id,
            name,
            species,
            breed
          )
        )
      `)
      .order('name', { ascending: true });

    if (error) {
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        return NextResponse.json({ vets: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Transform the data to include pets array for backward compatibility
    const transformedVets = vets?.map(vet => ({
      ...vet,
      pets: vet.vet_pets?.map((vp: any) => vp.pet_id) || []
    })) || [];

    return NextResponse.json({ vets: transformedVets });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch vets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Extract pets array from body
    const { pets, ...vetData } = body;

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create vet record (without pets array)
    const { data: vet, error } = await supabase
      .from('vets')
      .insert({ ...vetData, created_by: user.id })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // If pets were provided, create junction table entries
    if (vet && pets && pets.length > 0) {
      const vetPetEntries = pets.map((petId: string, index: number) => ({
        vet_id: vet.id,
        pet_id: petId,
        is_primary: index === 0 // First pet is primary
      }));

      await supabase
        .from('vet_pets')
        .insert(vetPetEntries);
    }

    // Sync to unified contacts table
    await syncVetToContacts({
      ...vet,
      pets: pets || []
    });

    // Return vet with pets array for backward compatibility
    return NextResponse.json({ vet: { ...vet, pets: pets || [] } });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create vet' },
      { status: 500 }
    );
  }
}