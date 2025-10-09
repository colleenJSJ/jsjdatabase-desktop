import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyPersonFilter } from '@/app/api/_helpers/apply-person-filter';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ results: [] });

    const q = (request.nextUrl.searchParams.get('q') || '').trim();
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '6', 10);
    const selectedPerson = request.nextUrl.searchParams.get('selected_person') || undefined;
    if (!q || q.length < 2) return NextResponse.json({ results: [] });

    const results: any[] = [];

    // Contacts
    try {
      let cq = supabase
        .from('contacts_unified')
        .select('*')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%,notes.ilike.%${q}%`)
        .limit(limit);
      const { data: cdata } = await cq;
      (cdata || []).forEach((c: any) => results.push({
        id: c.id, type: 'contact', title: c.name,
        subtitle: c.email || c.company || '', badge: 'Contacts',
        path: '/contacts', action: { open: 'contact', id: c.id },
        score: 1
      }));
    } catch {}

    // Travel Details
    try {
      let tq: any = supabase
        .from('travel_details')
        .select('id,type,airline,flight_number,departure_airport,arrival_airport,departure_location,arrival_location,travel_date,provider')
        .or(`airline.ilike.%${q}%,flight_number.ilike.%${q}%,provider.ilike.%${q}%,departure_airport.ilike.%${q}%,arrival_airport.ilike.%${q}%,departure_location.ilike.%${q}%,arrival_location.ilike.%${q}%`)
        .limit(limit);
      const { data: tdata } = await tq;
      (tdata || []).forEach((d: any) => {
        const title = d.type === 'flight'
          ? `Flight ${d.flight_number || ''}`.trim()
          : `${String(d.type).replace('_',' ')} - ${d.provider || ''}`.trim();
        const subtitle = d.departure_airport || d.departure_location
          ? `${d.departure_airport || d.departure_location} → ${d.arrival_airport || d.arrival_location}`
          : d.travel_date || '';
        results.push({
          id: d.id, type: 'travel_detail', title, subtitle, badge: 'Travel', path: '/travel',
          action: { open: 'travel_detail', id: d.id }, score: 1
        });
      });
    } catch {}

    // Calendar Events (basic)
    try {
      let eq = supabase
        .from('calendar_events')
        .select('*')
        .or(`title.ilike.%${q}%,description.ilike.%${q}%,location.ilike.%${q}%`)
        .limit(limit);
      // Apply person filter
      eq = await applyPersonFilter({ query: eq, selectedPerson, userId: user.id, module: 'calendar', columnName: 'attendees', isAdmin: true });
      const { data: edata } = await eq;
      (edata || []).forEach((e: any) => results.push({
        id: e.id, type: 'calendar_event', title: e.title,
        subtitle: e.location || e.category, badge: 'Calendar', path: '/calendar',
        action: { open: 'calendar_event', id: e.id }, score: 0.9
      }));
    } catch {}

    // Tasks
    try {
      let tq = supabase
        .from('tasks')
        .select('id,title,description,due_date,category')
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(limit);
      const { data: tdata } = await tq;
      (tdata || []).forEach((t: any) => {
        const subtitle = t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString()}` : (t.category || '');
        results.push({
          id: t.id, type: 'task', title: t.title, subtitle, badge: 'Tasks', path: '/tasks',
          action: { open: 'task', id: t.id }, score: 0.9
        });
      });
    } catch {}

    // Academics: contacts
    try {
      const aq = await supabase
        .from('j3_academics_contacts')
        .select('id,contact_name,role,email,phone')
        .or(`contact_name.ilike.%${q}%,role.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(limit);
      (aq.data || []).forEach((c: any) => results.push({
        id: c.id, type: 'academic_contact', title: c.contact_name, subtitle: c.role || c.email || c.phone || '',
        badge: 'Academics', path: '/j3-academics', action: { open: 'academic_contact', id: c.id }, score: 0.85
      }));
    } catch {}

    // Academics: events
    try {
      const eq2 = await supabase
        .from('j3_academics_events')
        .select('id,event_title,location,event_date')
        .or(`event_title.ilike.%${q}%,location.ilike.%${q}%`)
        .limit(limit);
      (eq2.data || []).forEach((e: any) => results.push({
        id: e.id, type: 'academic_event', title: e.event_title, subtitle: e.location || new Date(e.event_date).toLocaleString(),
        badge: 'Academics', path: '/j3-academics', action: { open: 'academic_event', id: e.id }, score: 0.85
      }));
    } catch {}

    // Documents
    try {
      const dq = await supabase
        .from('documents')
        .select('id,title,category,description,source_page')
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(limit);
      (dq.data || []).forEach((d: any) => results.push({
        id: d.id, type: 'document', title: d.title || 'Document', subtitle: d.category || d.source_page || '',
        badge: 'Documents', path: '/documents', action: { open: 'document', id: d.id }, score: 0.7
      }));
    } catch {}

    // Passwords
    try {
      const pw = await supabase
        .from('passwords')
        .select('id,service_name,title,username,url')
        .or(`service_name.ilike.%${q}%,title.ilike.%${q}%,username.ilike.%${q}%,url.ilike.%${q}%`)
        .limit(limit);
      (pw.data || []).forEach((p: any) => {
        const title = p.service_name || p.title || 'Password';
        const subtitle = p.username || p.url || '';
        results.push({
          id: p.id,
          type: 'password',
          title,
          subtitle,
          badge: 'Passwords',
          path: '/passwords',
          action: { open: 'password', id: p.id },
          score: 0.95
        });
      });
    } catch {}

    // Portals
    try {
      const pq = await supabase
        .from('portals')
        .select('id,portal_name,provider_name,portal_type')
        .or(`portal_name.ilike.%${q}%,provider_name.ilike.%${q}%`)
        .limit(limit);
      (pq.data || []).forEach((p: any) => results.push({
        id: p.id, type: 'portal', title: p.portal_name || p.provider_name || 'Portal', subtitle: p.portal_type,
        badge: 'Portals', path: p.portal_type === 'academic' ? '/j3-academics' : p.portal_type === 'pet' ? '/pets' : '/health',
        score: 0.65
      }));
    } catch {}

    // Simple rank/order by score
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ results: [] });
  }
}
