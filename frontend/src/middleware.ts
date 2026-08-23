import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// NOTE: This middleware decodes the JWT payload (base64) purely to pick a
// redirect target for UX — it does NOT verify the signature and is not a
// security boundary. Every backend route independently re-authenticates the
// cookie and enforces role checks server-side (see app/core/security.py),
// so a forged/expired token here only affects which page a user is bounced
// to, never what data or actions they can actually reach.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('access_token')?.value;

  // If trying to access protected paths
  if (pathname.startsWith('/admin') || pathname.startsWith('/employee')) {
    if (!accessToken) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      // Base64 decode JWT payload to read role for client redirection routing
      const payloadBase64 = accessToken.split('.')[1];
      const payload = JSON.parse(atob(payloadBase64));
      const role = payload.role;

      if (pathname.startsWith('/admin') && role !== 'Admin') {
        return NextResponse.redirect(new URL('/employee/dashboard', request.url));
      }

      if (pathname.startsWith('/employee') && role !== 'Employee') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
    } catch {
      // Invalid/expired token
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('access_token');
      response.cookies.delete('refresh_token');
      return response;
    }
  }

  // Redirect authenticated users from login or root to appropriate dashboard
  if (pathname === '/login' || pathname === '/') {
    if (accessToken) {
      try {
        const payloadBase64 = accessToken.split('.')[1];
        const payload = JSON.parse(atob(payloadBase64));
        if (payload.role === 'Admin') {
          return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        } else {
          return NextResponse.redirect(new URL('/employee/dashboard', request.url));
        }
      } catch {
        // ignore and let load login page
      }
    } else if (pathname === '/') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/employee/:path*', '/login', '/'],
};
