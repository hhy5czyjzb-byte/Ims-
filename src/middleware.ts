import { withAuth } from "next-auth/middleware";

// Alles achter login, behalve de loginpagina, auth-routes en statische bestanden.
export default withAuth({ pages: { signIn: "/login" } });

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|brand|favicon.ico).*)"],
};
