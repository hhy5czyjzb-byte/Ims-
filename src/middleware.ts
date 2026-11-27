import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import { isLocalHost, localMode } from "@/lib/env";

const authMiddleware = withAuth({ pages: { signIn: "/login" } });

/**
 * - Lokale modus (fase 1): geen inlog, maar alleen bereikbaar via localhost.
 * - Microsoft 365-modus: alles achter login, behalve de loginpagina.
 */
export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (localMode) {
    if (!isLocalHost(req.headers.get("host"))) {
      return new NextResponse(
        "De lokale modus (zonder inloggen) is alleen bereikbaar via localhost. Koppel Microsoft 365 om de app op een server te gebruiken.",
        {
          status: 403,
          headers: { "content-type": "text/plain; charset=utf-8" },
        },
      );
    }
    if (req.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (req.nextUrl.pathname === "/login") return NextResponse.next();
  return authMiddleware(req as NextRequestWithAuth, event);
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|brand|favicon.ico).*)"],
  // Node.js-runtime: leest de instellingen (.env) tijdens het draaien, niet bij het bouwen.
  runtime: "nodejs",
};
