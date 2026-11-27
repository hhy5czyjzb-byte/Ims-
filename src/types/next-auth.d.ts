import type { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: { id: string; name: string; email: string; role: Role };
    error?: "RefreshTokenError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: Role;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: "RefreshTokenError";
  }
}
