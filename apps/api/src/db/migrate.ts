import { migrate } from 'drizzle-orm/bun-sql/migrator'
import { db } from '.'

await migrate(db, { migrationsFolder: './drizzle' })
await db.$client.close()
