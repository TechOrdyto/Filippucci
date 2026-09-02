#!/usr/bin/env node
/**
 * Genera hash bcrypt per gli utenti della PoC.
 * Uso: node scripts/hash-password.mjs <password>
 * Output: l'hash da incollare in lib/auth/users.ts
 */
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Uso: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log(hash);