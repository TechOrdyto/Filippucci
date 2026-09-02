import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { findUserByEmail } from "@/lib/auth/users";
import { verifyPassword } from "@/lib/auth/password";
import type { UserRole } from "@/lib/auth/users";

// Configurazione Auth.js (NextAuth v5).
// Oggi: CredentialsProvider con utenti hardcoded (nessun DB).
// Domani: aggiungere qui il provider OIDC (Keycloak, Auth0, Azure AD, Cognito)
// e il ruolo arriverà dai claim del token — nessun cambiamento al resto del codice.

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 giorni
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const user = findUserByEmail(email);
        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    // Inietta il ruolo nel token JWT
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: UserRole }).role ?? "viewer";
        token.id = user.id;
      }
      return token;
    },
    // Espone il ruolo nella sessione (server e client)
    session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as UserRole) ?? "viewer";
        session.user.id = (token.id as string) ?? "";
      }
      return session;
    },
  },
});