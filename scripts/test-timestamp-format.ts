import { createClient } from '@supabase/supabase-js';

const url = 'https://xupkvtszrobsmxeplvhi.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1cGt2dHN6cm9ic214ZXBsdmhpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTAyMTEyMSwiZXhwIjoyMDcwNTk3MTIxfQ.nGDMYd0Snj8bviuG3BKXb8IPLdXLJAAHxeJr6DTDP0o';

const sb = createClient(url, key);

(async () => {
  const { data } = await sb
    .from('calendar_events')
    .select('title,start_time,end_time,timezone')
    .ilike('title','%DnD%')
    .limit(1);

  console.log('=== RAW DATA FROM SUPABASE CLIENT ===');
  console.log(JSON.stringify(data, null, 2));

  if (data && data.length > 0) {
    console.log('\n=== TYPE CHECKS ===');
    console.log('typeof start_time:', typeof data[0].start_time);
    console.log('start_time value:', data[0].start_time);
    console.log('Has +00 suffix?', data[0].start_time.includes('+00'));
    console.log('Has Z suffix?', data[0].start_time.includes('Z'));
    console.log('Has offset regex match?', /(Z|[+-]\d{2}:?\d{2})$/i.test(data[0].start_time));
  }
})();
