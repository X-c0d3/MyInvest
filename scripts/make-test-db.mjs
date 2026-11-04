// Copies the real database to data/test.db and gives one user a throwaway password,
// so UI changes can be checked against realistic data without touching data/myinvest.db.
//
//   node scripts/make-test-db.mjs [userId=1]
//   npm run build && DATABASE_PATH=data/test.db npx next start -p 3001
//
// Delete data/test.db* when done. data/ is gitignored.
import crypto from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const userId = Number(process.argv[2] ?? 1);
const source = path.join(root, "data", "myinvest.db");
const target = path.join(root, "data", "test.db");

await new Database(source, { readonly: true, fileMustExist: true }).backup(
  target,
);

const db = new Database(target);
const user = db.prepare("SELECT username FROM users WHERE id = ?").get(userId);
if (!user) throw new Error(`no user with id ${userId} in ${source}`);

const password = crypto.randomBytes(10).toString("hex");
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
  `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`,
  userId,
);
db.prepare("DELETE FROM sessions").run();
db.close();

console.log(`test copy: ${path.relative(root, target)}`);
console.log(`login:     ${user.username} / ${password}  (this copy only)`);
