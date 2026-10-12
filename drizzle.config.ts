import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "mysql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
})
