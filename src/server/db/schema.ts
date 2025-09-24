import type { AssistantModelMessage, ToolModelMessage, UserModelMessage } from "ai";
import { relations, sql } from "drizzle-orm";
import { index, pgTableCreator, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `focusa_remind_${name}`);

const idMixin = {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
}
const createdAtMixin = {
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}
const updatedAtMixin = {
  updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(() => new Date()),
}

interface UserMetadata {
  name: string;
  language: string;
  timezone: string;
  summary: string; // summary of user's goals and priorities
}

export const users = createTable("user", (d) => ({
  ...idMixin,
  platform: d.text({ enum: ['telegram'] }).notNull(),
  identifier: d.varchar({ length: 255 }).notNull(),
  metadata: d.jsonb().$type<UserMetadata>(),
  ...createdAtMixin,
  ...updatedAtMixin,
}), t => ([
  uniqueIndex("user_platform_identifier_idx").on(t.platform, t.identifier),
]));

export const usersRelations = relations(users, ({ many }) => ({
  messages: many(messages),
  //accounts: many(accounts),
}));

export type User = typeof users.$inferSelect;

export const messages = createTable("message", (d) => ({
  ...idMixin,
  userId: d.uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sentAt: timestamp("sent_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  role: d.text({ enum: ['user', 'assistant', 'tool'] }).notNull(),
  tokenCount: d.integer("token_count").notNull().default(0), // number of tokens in the message
  content: d.jsonb().$type<UserModelMessage | AssistantModelMessage | ToolModelMessage>().notNull(),
}), t => [
  index("message_user_sentat_idx").on(t.userId, t.sentAt),
]);

export const messagesRelations = relations(messages, ({ one }) => ({
  user: one(users, { fields: [messages.userId], references: [users.id] }),
}));


// import { type AdapterAccount } from "next-auth/adapters";
// export const accounts = createTable(
//   "account",
//   (d) => ({
//     userId: d
//       .varchar({ length: 255 })
//       .notNull()
//       .references(() => users.id),
//     type: d.varchar({ length: 255 }).$type<AdapterAccount["type"]>().notNull(),
//     provider: d.varchar({ length: 255 }).notNull(),
//     providerAccountId: d.varchar({ length: 255 }).notNull(),
//     refresh_token: d.text(),
//     access_token: d.text(),
//     expires_at: d.integer(),
//     token_type: d.varchar({ length: 255 }),
//     scope: d.varchar({ length: 255 }),
//     id_token: d.text(),
//     session_state: d.varchar({ length: 255 }),
//   }),
//   (t) => [
//     primaryKey({ columns: [t.provider, t.providerAccountId] }),
//     index("account_user_id_idx").on(t.userId),
//   ],
// );

// export const accountsRelations = relations(accounts, ({ one }) => ({
//   user: one(users, { fields: [accounts.userId], references: [users.id] }),
// }));

// export const sessions = createTable(
//   "session",
//   (d) => ({
//     sessionToken: d.varchar({ length: 255 }).notNull().primaryKey(),
//     userId: d
//       .varchar({ length: 255 })
//       .notNull()
//       .references(() => users.id),
//     expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
//   }),
//   (t) => [index("t_user_id_idx").on(t.userId)],
// );

// export const sessionsRelations = relations(sessions, ({ one }) => ({
//   user: one(users, { fields: [sessions.userId], references: [users.id] }),
// }));

// export const verificationTokens = createTable(
//   "verification_token",
//   (d) => ({
//     identifier: d.varchar({ length: 255 }).notNull(),
//     token: d.varchar({ length: 255 }).notNull(),
//     expires: d.timestamp({ mode: "date", withTimezone: true }).notNull(),
//   }),
//   (t) => [primaryKey({ columns: [t.identifier, t.token] })],
// );
