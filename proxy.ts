import { clerkMiddleware } from "@clerk/nextjs/server";

// Establishes Clerk's auth context for every request. Protection itself
// happens at the resource level, not via middleware path matching —
// Clerk's `createRouteMatcher`-based middleware protection is deprecated
// in favor of this. See app/(app)/layout.tsx (redirects unauthenticated
// visitors to /sign-in for every page under it) and the explicit auth()
// checks in each app/api/* route handler (401 when signed out).
export const proxy = clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
