import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Protezione delle rotte a livello di pagina.
// Nota: il middleware NON è sufficiente — ogni API route deve
// verificare la sessione server-side (difesa in profondità).

const PUBLIC_ROUTES = ["/login"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  // Rotte pubbliche: login e asset statici
  if (PUBLIC_ROUTES.some((r) => nextUrl.pathname.startsWith(r))) {
    // Se già autenticato e va al login, redirect alla home
    if (isLoggedIn && nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/interior-poc", nextUrl));
    }
    return NextResponse.next();
  }

  // API routes: gestite dalle guard server-side nelle route stesse.
  // Il middleware lascia passare e le route restituiscono 401/403 JSON.
  if (nextUrl.pathname.includes("/api/")) {
    return NextResponse.next();
  }

  // Tutto il resto richiede autenticazione
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Esclude asset statici e file Next interni
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};