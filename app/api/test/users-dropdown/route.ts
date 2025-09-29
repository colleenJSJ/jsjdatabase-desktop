import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    // Simulate what the tasks page does - call the auth/users endpoint
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.getAll()
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3007'}/api/auth/users`, {
      headers: {
        'Cookie': cookieHeader,
      },
    });
    
    const data = await response.json();
    
    // Check for Susan
    const susan = data.users?.find((u: any) => u.name?.toLowerCase().includes('susan'));
    
    return NextResponse.json({
      statusCode: response.status,
      totalUsers: data.users?.length || 0,
      susanFound: !!susan,
      susanData: susan,
      allUserNames: data.users?.map((u: any) => u.name) || [],
      rawResponse: data,
    });
    
  } catch (error) {

    return NextResponse.json({ 
      error: 'Failed to test', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}