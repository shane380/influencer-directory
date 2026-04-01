import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const hostname = request.headers.get('host') || '';

  // creators.namaclo.com: redirect root and /login to creator login
  if (hostname === 'creators.namaclo.com' && (pathname === '/' || pathname === '/login')) {
    return NextResponse.redirect('https://creators.namaclo.com/creator/login');
  }

  // Vercel URL: bounce creators to creators.namaclo.com
  if (hostname === 'influencer-directory-self.vercel.app' && user?.user_metadata?.role === 'creator') {
    return NextResponse.redirect('https://creators.namaclo.com/creator/dashboard');
  }

  // Public routes — no auth required
  if (
    pathname.startsWith('/api/shopify/webhooks') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/admin/payments/generate') ||
    pathname.startsWith('/api/shopify/affiliate-orders') ||
    pathname.startsWith('/api/shopify/auth') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/api/creators/signup') ||
    pathname.startsWith('/creator/login') ||
    pathname.startsWith('/unsubscribe') ||
    pathname.startsWith('/api/unsubscribe') ||
    pathname.startsWith('/reset-password')
  ) {
    return supabaseResponse;
  }

  const userRole = user?.user_metadata?.role;
  const isCreator = userRole === 'creator';

  // Creator routes — redirect to /creator/login if no session
  if (pathname.startsWith('/creator')) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/creator/login';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Role-based route siloing
  if (isCreator && !pathname.startsWith('/creator') && !pathname.startsWith('/reset-password') && !pathname.startsWith('/api/creator') && !pathname.startsWith('/api/meta') && !pathname.startsWith('/api/r2/presign') && !pathname.startsWith('/api/shopify/products') && !pathname.startsWith('/login')) {
    return NextResponse.redirect('https://creators.namaclo.com');
  }
  if (userRole === 'admin' && pathname.startsWith('/creator')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // All other protected routes — redirect to /login if no session
  if (!user && !pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If user is logged in and trying to access login page
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
