import { drizzle, type MySql2Database } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import { getEnv } from "@/lib/env"
import * as schema from "./schema"

export type Db = MySql2Database<typeof schema>

export function createDb(url: string): { db: Db; pool: mysql.Pool } {
  const pool = mysql.createPool({ uri: url, timezone: "Z" })

  // Toda conexão nova fixa a sessão em UTC, para que NOW(3) seja UTC.
  // O comando entra na fila da conexão antes de qualquer consulta do chamador.
  pool.pool.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'", (error) => {
      if (error) connection.destroy()
    })
  })

  const db = drizzle(pool, { schema, mode: "default" })
  return { db, pool }
}

type Singleton = { url: string; db: Db }

// Guardado em globalThis para o hot reload do Next em dev não criar um pool por recarga.
const globalForDb = globalThis as typeof globalThis & { __tamiDb?: Singleton }

export function getDb(): Db {
  const url = getEnv().DATABASE_URL
  if (globalForDb.__tamiDb?.url !== url) {
    globalForDb.__tamiDb = { url, db: createDb(url).db }
  }
  return globalForDb.__tamiDb.db
}
