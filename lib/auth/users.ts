// Utenti della PoC — SOLO SERVER-SIDE.
// Mai importare questo file in componenti client.
// Quando arriverà l'identity provider, questo file verrà sostituito
// dal mapping identità -> ruolo proveniente dai claim del token OIDC.

export type UserRole = "admin" | "designer" | "viewer";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string; // bcrypt (cost 12), mai password in chiaro
}

// Hash generati con bcrypt (cost 12) — vedi scripts/hash-password.mjs
export const users: AppUser[] = [
  {
    id: "u-admin",
    email: "admin@filippucci.it",
    name: "Admin",
    role: "admin",
    passwordHash:
      "$2b$12$KP6cW6faVDNMuDyaUXhXvOONrddMO4A.NOGlPNgogTkMGZPnu0LTy",
  },
  {
    id: "u-designer",
    email: "designer@filippucci.it",
    name: "Designer",
    role: "designer",
    passwordHash:
      "$2b$12$ySHA7bptumPNvtYW8/9GdOTXgt04ZGlWgLO7iM9a1BaLl/5wI.sPu",
  },
  {
    id: "u-viewer",
    email: "viewer@filippucci.it",
    name: "Viewer",
    role: "viewer",
    passwordHash:
      "$2b$12$K6f47NNUVpRX7kkBYKyWb.Y5Ronygf0wvrVaMy6E8E0K7hT3FPDfO",
  },
];

export function findUserByEmail(email: string): AppUser | undefined {
  return users.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase()
  );
}