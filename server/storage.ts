import {
  calendars, events, calendarShares,
  type Calendar, type InsertCalendar,
  type Event, type InsertEvent,
  type CalendarShare, type InsertShare,
  users, type User
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, gte, lte } from "drizzle-orm";

export interface IStorage {
  // Calendars
  getCalendars(userId: string): Promise<(Calendar & { role: string })[]>;
  createCalendar(calendar: InsertCalendar): Promise<Calendar>;
  getCalendar(id: number): Promise<Calendar | undefined>;
  updateCalendar(id: number, updates: Partial<InsertCalendar>): Promise<Calendar>;
  deleteCalendar(id: number): Promise<void>;

  // Shares
  shareCalendar(share: InsertShare): Promise<CalendarShare>;
  getCalendarShares(calendarId: number): Promise<CalendarShare[]>;
  getCalendarShareByEmail(calendarId: number, email: string): Promise<CalendarShare | undefined>;
  deleteShare(shareId: number): Promise<void>;

  // Events
  getEvents(params: { calendarId?: number, startDate?: Date, endDate?: Date, userId?: string }): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, updates: Partial<InsertEvent>): Promise<Event>;
  deleteEvent(id: number): Promise<void>;
  getEvent(id: number): Promise<Event | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getCalendars(userId: string): Promise<(Calendar & { role: string })[]> {
    // Get owned calendars
    const owned = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
    const ownedWithRole = owned.map(c => ({ ...c, role: 'owner' }));

    // Get shared calendars
    const shared = await db
      .select({
        calendar: calendars,
        share: calendarShares
      })
      .from(calendarShares)
      .innerJoin(calendars, eq(calendarShares.calendarId, calendars.id))
      .where(eq(calendarShares.userId, userId));

    const sharedWithRole = shared.map(({ calendar, share }) => ({
      ...calendar,
      role: share.role
    }));

    return [...ownedWithRole, ...sharedWithRole];
  }

  async createCalendar(calendar: InsertCalendar): Promise<Calendar> {
    const [newCalendar] = await db.insert(calendars).values(calendar).returning();
    return newCalendar;
  }

  async getCalendar(id: number): Promise<Calendar | undefined> {
    const [calendar] = await db.select().from(calendars).where(eq(calendars.id, id));
    return calendar;
  }

  async updateCalendar(id: number, updates: Partial<InsertCalendar>): Promise<Calendar> {
    const [updated] = await db.update(calendars).set(updates).where(eq(calendars.id, id)).returning();
    return updated;
  }

  async deleteCalendar(id: number): Promise<void> {
    // Delete related shares and events first (or rely on cascade if configured, but let's be explicit/safe)
    await db.delete(calendarShares).where(eq(calendarShares.calendarId, id));
    await db.delete(events).where(eq(events.calendarId, id));
    await db.delete(calendars).where(eq(calendars.id, id));
  }

  async shareCalendar(share: InsertShare): Promise<CalendarShare> {
    const [newShare] = await db.insert(calendarShares).values(share).returning();
    return newShare;
  }

  async getCalendarShareByEmail(calendarId: number, email: string): Promise<CalendarShare | undefined> {
    const [share] = await db.select().from(calendarShares).where(
      and(eq(calendarShares.calendarId, calendarId), eq(calendarShares.email, email))
    );
    return share;
  }

  async getCalendarShares(calendarId: number): Promise<CalendarShare[]> {
    return await db.select().from(calendarShares).where(eq(calendarShares.calendarId, calendarId));
  }

  async deleteShare(shareId: number): Promise<void> {
    await db.delete(calendarShares).where(eq(calendarShares.id, shareId));
  }

  async getEvents(params: { calendarId?: number, startDate?: Date, endDate?: Date, userId?: string }): Promise<Event[]> {
    let conditions = [];

    if (params.calendarId) {
      conditions.push(eq(events.calendarId, params.calendarId));
    } else if (params.userId) {
      // If no specific calendar requested, get all events from calendars the user has access to
      const userCalendars = await this.getCalendars(params.userId);
      const calendarIds = userCalendars.map(c => c.id);
      if (calendarIds.length === 0) return [];
      conditions.push(or(...calendarIds.map(id => eq(events.calendarId, id))));
    }

    if (params.startDate) {
      conditions.push(gte(events.endTime, params.startDate)); // Events that end after start date
    }
    if (params.endDate) {
      conditions.push(lte(events.startTime, params.endDate)); // Events that start before end date
    }

    return await db.select().from(events).where(and(...conditions));
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async updateEvent(id: number, updates: Partial<InsertEvent>): Promise<Event> {
    const [updated] = await db.update(events).set(updates).where(eq(events.id, id)).returning();
    return updated;
  }

  async deleteEvent(id: number): Promise<void> {
    await db.delete(events).where(eq(events.id, id));
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }
}

export const storage = new DatabaseStorage();
