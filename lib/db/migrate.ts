import path from "node:path"
import { migrate } from "drizzle-orm/mysql2/migrator"
import type { Db } from "./client"

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") })
}
