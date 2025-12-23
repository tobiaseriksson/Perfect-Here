import type { Express } from "express";
import type { Server } from "http";
import { createServer } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // Helper to check calendar access
  async function checkCalendarAccess(userId: string, calendarId: number, requiredRole: 'owner' | 'admin' | 'viewer' = 'viewer') {
    const calendar = await storage.getCalendar(calendarId);
    if (!calendar) return { allowed: false, error: 'Calendar not found' };

    if (calendar.ownerId === userId) return { allowed: true, role: 'owner' };

    const shares = await storage.getCalendarShares(calendarId);
    const userShare = shares.find(s => s.userId === userId || s.email === (req.user as any).claims?.email);

    if (!userShare) return { allowed: false, error: 'Access denied' };

    if (requiredRole === 'owner') return { allowed: false, error: 'Ownership required' };
    if (requiredRole === 'admin' && userShare.role !== 'admin') return { allowed: false, error: 'Admin access required' };

    return { allowed: true, role: userShare.role };
  }

  // Calendars
  app.get(api.calendars.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    let calendars = await storage.getCalendars(userId);

    if (calendars.length === 0) {
      // Create default calendar
      const defaultCalendar = await storage.createCalendar({
        title: "Personal",
        description: "My personal calendar",
        color: "#3b82f6",
        ownerId: userId
      });
      calendars = [{ ...defaultCalendar, role: 'owner' }];
    }

    res.json(calendars);
  });

  app.post(api.calendars.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.calendars.create.input.parse(req.body);
      const userId = (req.user as any).claims.sub;
      const calendar = await storage.createCalendar({ ...input, ownerId: userId });
      res.status(201).json(calendar);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.calendars.get.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const calendarId = Number(req.params.id);
    const access = await checkCalendarAccess(userId, calendarId);

    if (!access.allowed) {
      return res.status(404).json({ message: access.error });
    }

    const calendar = await storage.getCalendar(calendarId);
    res.json(calendar);
  });

  app.put(api.calendars.update.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const calendarId = Number(req.params.id);
    const access = await checkCalendarAccess(userId, calendarId, 'admin'); // Owner or admin can update? Usually owner or admin.

    if (!access.allowed) {
      return res.status(404).json({ message: access.error });
    }

    try {
      const input = api.calendars.update.input.parse(req.body);
      const updated = await storage.updateCalendar(calendarId, input);
      res.json(updated);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.calendars.delete.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const calendarId = Number(req.params.id);
    const access = await checkCalendarAccess(userId, calendarId, 'owner'); // Only owner can delete

    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    await storage.deleteCalendar(calendarId);
    res.status(204).send();
  });

  app.post(api.calendars.share.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const calendarId = Number(req.params.id);
    const access = await checkCalendarAccess(userId, calendarId, 'admin');

    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    try {
      const input = api.calendars.share.input.parse(req.body);
      // Check if user exists with this email to link userId immediately (optional but good)
      // For now, we just store email.
      // Ideally we should lookup user by email from authStorage but we might not have email lookup easily or user might not exist.
      
      const share = await storage.shareCalendar({
        calendarId,
        email: input.email,
        role: input.role,
        userId: null // We'd populate this if we could lookup the user
      });
      res.status(201).json(share);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });


  // Events
  app.get(api.events.list.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const input = api.events.list.input.optional().parse(req.query); // Parse query params

    const events = await storage.getEvents({
      calendarId: input?.calendarId,
      startDate: input?.startDate ? new Date(input.startDate) : undefined,
      endDate: input?.endDate ? new Date(input.endDate) : undefined,
      userId // If calendarId is null, this will fetch all accessible events
    });
    res.json(events);
  });

  app.post(api.events.create.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    try {
      const input = api.events.create.input.parse(req.body);
      const access = await checkCalendarAccess(userId, input.calendarId, 'admin'); // or viewer? usually viewers can't create. Spec doesn't say. Assume admin/owner.
      // Wait, "shared calendars automatically appear for all admin users". Viewers probably just view.
      
      if (!access.allowed) {
        return res.status(403).json({ message: access.error });
      }

      const event = await storage.createEvent({ ...input, createdBy: userId });
      res.status(201).json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.events.update.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const eventId = Number(req.params.id);
    const event = await storage.getEvent(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const access = await checkCalendarAccess(userId, event.calendarId, 'admin');
    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    try {
      const input = api.events.update.input.parse(req.body);
      const updated = await storage.updateEvent(eventId, input);
      res.json(updated);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.events.delete.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const eventId = Number(req.params.id);
    const event = await storage.getEvent(eventId);

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const access = await checkCalendarAccess(userId, event.calendarId, 'admin');
    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    await storage.deleteEvent(eventId);
    res.status(204).send();
  });

  return httpServer;
}
