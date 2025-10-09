import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/app/api/_helpers/auth';
import { enforceCSRF } from '@/lib/security/csrf';
import { jsonError, jsonSuccess } from '@/app/api/_helpers/responses';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    
    // Get user preferences
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      return jsonError('Failed to fetch preferences', { status: 500 });
    }

    const preferencePayload = preferences
      ? {
          timezone: preferences.timezone,
          dateFormat: preferences.date_format,
          timeFormat: preferences.time_format,
          weekStartsOn: preferences.week_starts_on,
          notificationsEnabled: preferences.notifications_enabled,
          emailNotifications: preferences.email_notifications,
          taskReminders: preferences.task_reminders,
          calendarDefaultView: preferences.calendar_default_view,
          theme: preferences.theme,
          language: preferences.language,
        }
      : null;

    return jsonSuccess({ preferences: preferencePayload }, {
      legacy: { preferences: preferencePayload },
    });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    const body = await request.json();
    
    // Create preferences with snake_case fields for database
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .insert({
        user_id: user.id,
        timezone: body.timezone || 'America/New_York',
        date_format: body.dateFormat || 'MM/DD/YYYY',
        time_format: body.timeFormat || '12h',
        week_starts_on: body.weekStartsOn || 0,
        notifications_enabled: body.notificationsEnabled ?? true,
        email_notifications: body.emailNotifications ?? true,
        task_reminders: body.taskReminders ?? true,
        calendar_default_view: body.calendarDefaultView || 'month',
        theme: body.theme || 'dark',
        language: body.language || 'en'
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return GET(request);
      }
      return jsonError('Failed to create preferences', { status: 500 });
    }

    const preferencePayload = {
      timezone: preferences.timezone,
      dateFormat: preferences.date_format,
      timeFormat: preferences.time_format,
      weekStartsOn: preferences.week_starts_on,
      notificationsEnabled: preferences.notifications_enabled,
      emailNotifications: preferences.email_notifications,
      taskReminders: preferences.task_reminders,
      calendarDefaultView: preferences.calendar_default_view,
      theme: preferences.theme,
      language: preferences.language,
    };

    return jsonSuccess({ preferences: preferencePayload }, {
      status: 201,
      legacy: { preferences: preferencePayload },
    });
  } catch (error) {
    console.error('Error creating preferences:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const csrfError = await enforceCSRF(request);
  if (csrfError) return csrfError;

  try {
    const authResult = await requireUser(request, { enforceCsrf: false });
    if (authResult instanceof Response) {
      return authResult;
    }

    const { user, supabase } = authResult;
    const body = await request.json();
    
    // Normalize incoming fields to DB shape
    const toDbShape = (src: any) => {
      const out: any = {};
      if (src.timezone !== undefined) out.timezone = src.timezone;
      if (src.dateFormat !== undefined) out.date_format = src.dateFormat;
      if (src.timeFormat !== undefined) out.time_format = src.timeFormat;
      if (src.weekStartsOn !== undefined) out.week_starts_on = src.weekStartsOn;
      if (src.notificationsEnabled !== undefined) out.notifications_enabled = src.notificationsEnabled;
      if (src.emailNotifications !== undefined) out.email_notifications = src.emailNotifications;
      if (src.taskReminders !== undefined) out.task_reminders = src.taskReminders;
      if (src.calendarDefaultView !== undefined) out.calendar_default_view = src.calendarDefaultView;
      if (src.theme !== undefined) out.theme = src.theme;
      if (src.language !== undefined) out.language = src.language;
      return out;
    };

    // Check if a preferences row exists
    const { data: existing, error: fetchErr } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    let preferences: any = null;
    if (!existing || fetchErr) {
      // Create with defaults + provided values
      const payload = {
        user_id: user.id,
        timezone: body.timezone || 'America/New_York',
        date_format: body.dateFormat || 'MM/DD/YYYY',
        time_format: body.timeFormat || '12h',
        week_starts_on: body.weekStartsOn ?? 0,
        notifications_enabled: body.notificationsEnabled ?? true,
        email_notifications: body.emailNotifications ?? true,
        task_reminders: body.taskReminders ?? true,
        calendar_default_view: body.calendarDefaultView || 'month',
        theme: body.theme || 'dark',
        language: body.language || 'en'
      };
      const { data: created, error: createErr } = await supabase
        .from('user_preferences')
        .insert(payload)
        .select()
        .single();
        if (createErr) {
          console.error('[Preferences] Create failed:', createErr);
          return jsonError('Failed to update preferences', { status: 500 });
      }
      preferences = created;
    } else {
      // Update only provided fields
      const updates = toDbShape(body);
      if (Object.keys(updates).length === 0) {
        preferences = existing;
      } else {
        const { data: updated, error: updateErr } = await supabase
          .from('user_preferences')
          .update(updates)
          .eq('user_id', user.id)
          .select()
          .single();
        if (updateErr) {
          console.error('[Preferences] Update failed:', updateErr);
          return jsonError('Failed to update preferences', { status: 500 });
        }
        preferences = updated;
      }
    }

    const preferencePayload = {
      timezone: preferences.timezone,
      dateFormat: preferences.date_format,
      timeFormat: preferences.time_format,
      weekStartsOn: preferences.week_starts_on,
      notificationsEnabled: preferences.notifications_enabled,
      emailNotifications: preferences.email_notifications,
      taskReminders: preferences.task_reminders,
      calendarDefaultView: preferences.calendar_default_view,
      theme: preferences.theme,
      language: preferences.language,
    };

    return jsonSuccess({ preferences: preferencePayload }, {
      legacy: { preferences: preferencePayload },
    });
  } catch (error) {
    console.error('Error updating preferences:', error);
    return jsonError('Internal server error', { status: 500 });
  }
}
