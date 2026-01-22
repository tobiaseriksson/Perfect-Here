import {
  calendars, events, calendarShares, caldavShares,
  type Calendar, type InsertCalendar,
  type Event, type InsertEvent,
  type CalendarShare, type InsertShare,
  type CaldavShare, type InsertCaldavShare,
  users, type User
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, gte, lte } from "drizzle-orm";

export interface IStorage {
  // Calendars
  getCalendars(userId: string, email?: string): Promise<(Calendar & { role: string })[]>;
  createCalendar(calendar: InsertCalendar): Promise<Calendar>;
  getCalendar(id: number): Promise<Calendar | undefined>;
  updateCalendar(id: number, updates: Partial<InsertCalendar>): Promise<Calendar>;
  deleteCalendar(id: number): Promise<void>;

  // Shares
  shareCalendar(share: InsertShare): Promise<CalendarShare>;
  getCalendarShares(calendarId: number): Promise<CalendarShare[]>;
  getCalendarShareByEmail(calendarId: number, email: string): Promise<CalendarShare | undefined>;
  deleteShare(shareId: number): Promise<void>;

  // CalDAV Shares
  getCaldavShare(calendarId: number): Promise<CaldavShare | undefined>;
  getCaldavShareByUsername(username: string): Promise<CaldavShare | undefined>;
  createCaldavShare(share: InsertCaldavShare): Promise<CaldavShare>;
  updateCaldavShare(calendarId: number, updates: Partial<InsertCaldavShare>): Promise<CaldavShare>;
  deleteCaldavShare(calendarId: number): Promise<void>;

  // Events
  getEvents(params: { calendarId?: number, startDate?: Date, endDate?: Date, userId?: string, email?: string }): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, updates: Partial<InsertEvent>): Promise<Event>;
  deleteEvent(id: number): Promise<void>;
  getEvent(id: number): Promise<Event | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getCalendars(userId: string, email?: string): Promise<(Calendar & { role: string })[]> {
    // Get owned calendars
    const owned = await db.select().from(calendars).where(eq(calendars.ownerId, userId));
    const ownedWithRole = owned.map(c => ({ ...c, role: 'owner' }));

    // Get shared calendars
    let sharedQuery = db
      .select({
        calendar: calendars,
        share: calendarShares
      })
      .from(calendarShares)
      .innerJoin(calendars, eq(calendarShares.calendarId, calendars.id));

    const sharedConditions = [eq(calendarShares.userId, userId)];
    if (email) {
      sharedConditions.push(eq(calendarShares.email, email));
    }

    const shared = await sharedQuery.where(or(...sharedConditions));

    const sharedWithRole = shared.map(({ calendar, share }) => ({
      ...calendar,
      role: share.role
    }));

    // Deduplicate calendars (a user might be shared by both ID and email)
    const allCalendars = new Map<number, Calendar & { role: string }>();
    ownedWithRole.forEach(c => allCalendars.set(c.id, c));
    sharedWithRole.forEach(c => {
      if (!allCalendars.has(c.id)) {
        allCalendars.set(c.id, c);
      }
    });

    return Array.from(allCalendars.values());
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
    // CRITICAL: Always update updatedAt timestamp for persistent ETag/CTag
    const [updated] = await db.update(calendars)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(calendars.id, id))
      .returning();
    return updated;
  }

  async deleteCalendar(id: number): Promise<void> {
    // Delete related shares and events first (or rely on cascade if configured, but let's be explicit/safe)
    await db.delete(calendarShares).where(eq(calendarShares.calendarId, id));
    await db.delete(caldavShares).where(eq(caldavShares.calendarId, id));
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

  async getCaldavShare(calendarId: number): Promise<CaldavShare | undefined> {
    const [share] = await db.select().from(caldavShares).where(eq(caldavShares.calendarId, calendarId));
    return share;
  }

  async getCaldavShareByUsername(username: string): Promise<CaldavShare | undefined> {
    const [share] = await db.select().from(caldavShares).where(eq(caldavShares.username, username));
    return share;
  }

  async createCaldavShare(share: InsertCaldavShare): Promise<CaldavShare> {
    const [newShare] = await db.insert(caldavShares).values(share).returning();
    return newShare;
  }

  async updateCaldavShare(calendarId: number, updates: Partial<InsertCaldavShare>): Promise<CaldavShare> {
    const [updated] = await db.update(caldavShares).set(updates).where(eq(caldavShares.calendarId, calendarId)).returning();
    return updated;
  }

  async deleteCaldavShare(calendarId: number): Promise<void> {
    await db.delete(caldavShares).where(eq(caldavShares.calendarId, calendarId));
  }

  async getEvents(params: { calendarId?: number, startDate?: Date, endDate?: Date, userId?: string, email?: string }): Promise<Event[]> {
    let conditions = [];

    if (params.calendarId) {
      conditions.push(eq(events.calendarId, params.calendarId));
    } else if (params.userId) {
      // If no specific calendar requested, get all events from calendars the user has access to
      const userCalendars = await this.getCalendars(params.userId, params.email);
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
    // CRITICAL: Update calendar's updatedAt when event is created (for CTag)
    const [newEvent] = await db.insert(events).values(event).returning();
    // Update parent calendar's updatedAt timestamp
    await db.update(calendars)
      .set({ updatedAt: new Date() })
      .where(eq(calendars.id, newEvent.calendarId));
    return newEvent;
  }

  async updateEvent(id: number, updates: Partial<InsertEvent>): Promise<Event> {
    // CRITICAL: Update event's updatedAt and parent calendar's updatedAt (for ETag/CTag)
    const [updated] = await db.update(events)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(events.id, id))
      .returning();
    // Update parent calendar's updatedAt timestamp
    await db.update(calendars)
      .set({ updatedAt: new Date() })
      .where(eq(calendars.id, updated.calendarId));
    return updated;
  }

  async deleteEvent(id: number): Promise<void> {
    // CRITICAL: Get calendarId before deletion to update calendar's updatedAt
    const event = await this.getEvent(id);
    if (event) {
      await db.delete(events).where(eq(events.id, id));
      // Update parent calendar's updatedAt timestamp
      await db.update(calendars)
        .set({ updatedAt: new Date() })
        .where(eq(calendars.id, event.calendarId));
    } else {
      await db.delete(events).where(eq(events.id, id));
    }
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }
}

export const storage = new DatabaseStorage();
