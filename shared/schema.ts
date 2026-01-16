export * from "./models/auth";
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export const calendars = pgTable("calendars", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  color: text("color").default("#3b82f6"),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  // CalDAV-specific properties (Apple Calendar extension)
  caldavOrder: integer("caldav_order"),
  caldavColor: text("caldav_color"),
});

export const calendarShares = pgTable("calendar_shares", {
  id: serial("id").primaryKey(),
  calendarId: integer("calendar_id").notNull().references(() => calendars.id),
  userId: varchar("user_id").references(() => users.id),
  email: text("email").notNull(),
  role: text("role", { enum: ["admin"] }).notNull().default("admin"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const caldavShares = pgTable("caldav_shares", {
  id: serial("id").primaryKey(),
  calendarId: integer("calendar_id").notNull().references(() => calendars.id),
  username: text("username").notNull(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  calendarId: integer("calendar_id").notNull().references(() => calendars.id),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  color: text("color"),
  recurrence: jsonb("recurrence"), // { freq: 'daily'|'weekly'|'monthly', interval: 1, byDay: ['MO', 'TU'], byMonthDay: 15 }
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const calendarsRelations = relations(calendars, ({ one, many }) => ({
  owner: one(users, {
    fields: [calendars.ownerId],
    references: [users.id],
  }),
  events: many(events),
  shares: many(calendarShares),
  caldavShares: many(caldavShares),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  calendar: one(calendars, {
    fields: [events.calendarId],
    references: [calendars.id],
  }),
  creator: one(users, {
    fields: [events.createdBy],
    references: [users.id],
  }),
}));

export const caldavSharesRelations = relations(caldavShares, ({ one }) => ({
  calendar: one(calendars, {
    fields: [caldavShares.calendarId],
    references: [calendars.id],
  }),
}));

export const calendarSharesRelations = relations(calendarShares, ({ one }) => ({
  calendar: one(calendars, {
    fields: [calendarShares.calendarId],
    references: [calendars.id],
  }),
  user: one(users, {
    fields: [calendarShares.userId],
    references: [users.id],
  }),
}));

// Schemas
export const insertCalendarSchema = createInsertSchema(calendars).omit({ id: true, createdAt: true, ownerId: true });
export const insertEventSchema = createInsertSchema(events)
  .omit({ id: true, createdAt: true, createdBy: true })
  .extend({
    startTime: z.union([z.date(), z.string().pipe(z.coerce.date())]),
    endTime: z.union([z.date(), z.string().pipe(z.coerce.date())]),
  });
export const insertShareSchema = createInsertSchema(calendarShares).omit({ id: true, createdAt: true });
export const insertCaldavShareSchema = createInsertSchema(caldavShares).omit({ id: true, createdAt: true });

// Types
export type Calendar = typeof calendars.$inferSelect;
export type InsertCalendar = z.infer<typeof insertCalendarSchema>;
export type Event = typeof events.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type CalendarShare = typeof calendarShares.$inferSelect;
export type InsertShare = z.infer<typeof insertShareSchema>;
export type CaldavShare = typeof caldavShares.$inferSelect;
export type InsertCaldavShare = z.infer<typeof insertCaldavShareSchema>;

// API Types
export type CreateCalendarRequest = InsertCalendar;
export type CreateEventRequest = InsertEvent;
export type UpdateEventRequest = Partial<InsertEvent>;
export type ShareCalendarRequest = { email: string };
