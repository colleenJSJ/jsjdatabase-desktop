import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enforceCSRF } from '@/lib/security/csrf';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: items, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Transform database schema to frontend schema
    const transformedItems = (items || []).map(item => ({
      id: item.id,
      name: item.name,
      category: item.category || 'other',
      location: item.location_details || 'other', // Using location_details for now
      value: item.current_value || item.purchase_price,
      purchase_date: item.purchase_date,
      description: item.description,
      serial_number: item.serial_number,
      photo_url: item.photo_urls?.[0] || null, // Take first photo if array
      notes: item.notes,
      created_at: item.created_at
    }));

    return NextResponse.json({ items: transformedItems });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch inventory items' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const supabase = await createClient();
    const body = await request.json();

    // Transform frontend schema to database schema
    const dbItem = {
      name: body.name,
      category: body.category,
      location_details: body.location, // Store location as text for now
      purchase_date: body.purchase_date || null,
      purchase_price: body.value ? parseFloat(body.value) : null,
      current_value: body.value ? parseFloat(body.value) : null,
      description: body.description || null,
      serial_number: body.serial_number || null,
      photo_urls: body.photo_url ? [body.photo_url] : [],
      notes: body.notes || null,
      quantity: 1,
      condition: 'good',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: item, error } = await supabase
      .from('inventory')
      .insert(dbItem)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Transform back to frontend schema
    const transformedItem = {
      id: item.id,
      name: item.name,
      category: item.category || 'other',
      location: item.location_details || 'other',
      value: item.current_value || item.purchase_price,
      purchase_date: item.purchase_date,
      description: item.description,
      serial_number: item.serial_number,
      photo_url: item.photo_urls?.[0] || null,
      notes: item.notes,
      created_at: item.created_at
    };

    return NextResponse.json({ item: transformedItem });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create inventory item' },
      { status: 500 }
    );
  }
}