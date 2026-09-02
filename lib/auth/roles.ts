import type { UserRole } from "./users";

// Definizione dei ruoli e delle risorse protette.
// La mappa risorsa -> ruoli consentiti è il punto unico di verità
// per le guard server-side (API routes).

export const ROLES: UserRole[] = ["admin", "designer", "viewer"];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Amministratore",
  designer: "Designer",
  viewer: "Visualizzatore",
};

// Risorse protette e ruoli che possono accedervi
export const RESOURCE_ROLES: Record<string, UserRole[]> = {
  // Generazione render: tutti gli utenti autenticati
  "generate": ["admin", "designer", "viewer"],
  // Ingest catalogo (OCR + pipeline): solo admin e designer
  "ingest": ["admin", "designer"],
  // Estrazione catalogo: solo admin e designer
  "extract": ["admin", "designer"],
  // Gestione utenti: solo admin
  "users": ["admin"],
};

export function canAccess(
  role: UserRole | undefined,
  resource: keyof typeof RESOURCE_ROLES
): boolean {
  if (!role) return false;
  return RESOURCE_ROLES[resource].includes(role);
}