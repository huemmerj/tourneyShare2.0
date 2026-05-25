import { NextRequest, NextResponse } from "next/server";

const authRoutes = ["/sign-in", "/sign-up"];
const protectedRoutes = ["/dashboard", "/profile"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("better-auth.session_token");

  if (hasSession && authRoutes.some((r) => pathname.startsWith(r))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!hasSession && protectedRoutes.some((r) => pathname.startsWith(r))) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/sign-in", "/sign-up", "/dashboard/:path*", "/profile/:path*"],
};
