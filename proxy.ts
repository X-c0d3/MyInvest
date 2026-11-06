import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: real authorization happens in requireUser() next to the data.
const PUBLIC_PATHS = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("myinvest_session");
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname);
  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Static assets and the app icons must load on the login page too (no session yet).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)",
  ],
};
