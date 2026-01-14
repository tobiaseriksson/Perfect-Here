import type { Express } from "express";
import type { Server } from "http";
import { createServer } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { authStorage } from "./replit_integrations/auth/storage";
import caldavRouter from "./caldav";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // CalDAV routes
  app.use("/caldav", caldavRouter);

  // .well-known redirect for CalDAV discovery
  app.get("/.well-known/caldav", (req, res) => {
    res.redirect(301, "/caldav/");
  });

  // Helper to check calendar access
  async function checkCalendarAccess(userId: string, userEmail: string | undefined, calendarId: number, requiredRole: 'owner' | 'admin' | 'viewer' = 'viewer') {
    const calendar = await storage.getCalendar(calendarId);
    if (!calendar) return { allowed: false, error: 'Calendar not found' };

    if (calendar.ownerId === userId) return { allowed: true, role: 'owner' };

    const shares = await storage.getCalendarShares(calendarId);
    const userShare = shares.find(s => s.userId === userId || (userEmail && s.email === userEmail));

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
    const userEmail = (req.user as any).claims?.email;
    const access = await checkCalendarAccess(userId, userEmail, calendarId);

    if (!access.allowed) {
      return res.status(404).json({ message: access.error });
    }

    const calendar = await storage.getCalendar(calendarId);
    res.json(calendar);
  });

  app.put(api.calendars.update.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const calendarId = Number(req.params.id);
    const userEmail = (req.user as any).claims?.email;
    const access = await checkCalendarAccess(userId, userEmail, calendarId, 'admin'); // Owner or admin can update? Usually owner or admin.

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
    const userEmail = (req.user as any).claims?.email;
    const access = await checkCalendarAccess(userId, userEmail, calendarId, 'owner'); // Only owner can delete

    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    await storage.deleteCalendar(calendarId);
    res.status(204).send();
  });

  app.post(api.calendars.share.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userEmail = (req.user as any).claims.email;
    const calendarId = Number(req.params.id);
    const access = await checkCalendarAccess(userId, userEmail, calendarId, 'owner');

    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    try {
      const input = api.calendars.share.input.parse(req.body);
      const calendar = await storage.getCalendar(calendarId);
      
      const share = await storage.shareCalendar({
        calendarId,
        email: input.email,
        role: "admin",
        userId: null
      });

      // Send email notification
      await sendShareEmail(input.email, calendar?.title || 'Calendar', userEmail);
      
      res.status(201).json(share);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // CalDAV sharing endpoint
  app.get(api.calendars.caldavShare.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const calendarId = Number(req.params.id);
    const userEmail = (req.user as any).claims?.email;
    const access = await checkCalendarAccess(userId, userEmail, calendarId, 'owner');

    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    try {
      const share = await storage.getCaldavShare(calendarId);
      const caldavUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/caldav/calendars/${calendarId}`;

      if (!share) {
        return res.json(null);
      }

      res.json({
        caldavUrl,
        username: share.username,
        password: share.password
      });
    } catch (err) {
      console.error("CalDAV get share error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.calendars.updateCaldavShare.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const calendarId = Number(req.params.id);
    const userEmail = (req.user as any).claims?.email;
    const access = await checkCalendarAccess(userId, userEmail, calendarId, 'owner');

    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    try {
      const { username, password } = api.calendars.updateCaldavShare.input.parse(req.body);
      let share = await storage.getCaldavShare(calendarId);

      if (share) {
        share = await storage.updateCaldavShare(calendarId, { username, password });
      } else {
        share = await storage.createCaldavShare({ calendarId, username, password });
      }

      const caldavUrl = `${process.env.BASE_URL || 'http://localhost:5000'}/caldav/calendars/${calendarId}`;

      res.json({
        caldavUrl,
        username: share.username,
        password: share.password
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("CalDAV update share error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.calendars.shares.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const calendarId = Number(req.params.id);
    const userEmail = (req.user as any).claims?.email;
    const access = await checkCalendarAccess(userId, userEmail, calendarId, 'owner');

    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    const shares = await storage.getCalendarShares(calendarId);
    res.json(shares);
  });

  app.delete(api.calendars.deleteShare.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const calendarId = Number(req.params.id);
    const shareId = Number(req.params.shareId);
    const userEmail = (req.user as any).claims?.email;
    const access = await checkCalendarAccess(userId, userEmail, calendarId, 'owner');

    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    await storage.deleteShare(shareId);
    res.status(204).send();
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
      
      // Validate end time is at least 5 minutes after start time
      const startTime = new Date(input.startTime);
      const endTime = new Date(input.endTime);
      const minDuration = 5 * 60 * 1000; // 5 minutes in ms
      if (endTime.getTime() - startTime.getTime() < minDuration) {
        return res.status(400).json({ message: "Event must be at least 5 minutes long" });
      }
      
      const userEmail = (req.user as any).claims?.email;
      const access = await checkCalendarAccess(userId, userEmail, input.calendarId, 'admin');
      
      if (!access.allowed) {
        return res.status(403).json({ message: access.error });
      }

      const event = await storage.createEvent({
        ...input,
        startTime,
        endTime,
        createdBy: userId
      });
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

    const userEmail = (req.user as any).claims?.email;
    const access = await checkCalendarAccess(userId, userEmail, event.calendarId, 'admin');
    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    try {
      const input = api.events.update.input.parse(req.body);
      const updateData = { ...input };
      if (updateData.startTime) updateData.startTime = new Date(updateData.startTime);
      if (updateData.endTime) updateData.endTime = new Date(updateData.endTime);
      
      // Validate end time is at least 5 minutes after start time
      const finalStartTime = updateData.startTime || event.startTime;
      const finalEndTime = updateData.endTime || event.endTime;
      const minDuration = 5 * 60 * 1000; // 5 minutes in ms
      if (new Date(finalEndTime).getTime() - new Date(finalStartTime).getTime() < minDuration) {
        return res.status(400).json({ message: "Event must be at least 5 minutes long" });
      }
      
      const updated = await storage.updateEvent(eventId, updateData);
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

    const userEmail = (req.user as any).claims?.email;
    const access = await checkCalendarAccess(userId, userEmail, event.calendarId, 'admin');
    if (!access.allowed) {
      return res.status(403).json({ message: access.error });
    }

    await storage.deleteEvent(eventId);
    res.status(204).send();
  });

  // 404 catch-all for non-existing API routes (not frontend routes handled by Vite)
  app.use("/api/*", (req, res) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${timestamp} [express] 404 ${req.method} ${req.originalUrl} :: Route not found`);
    res.status(404).json({ message: "Not found" });
  });

  app.use("/caldav/*", (req, res) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`${timestamp} [caldav] 404 ${req.method} ${req.originalUrl} :: Route not found`);
    res.status(404).send(`<?xml version="1.0" encoding="utf-8"?><error xmlns="DAV:">Not found</error>`);
  });

  return httpServer;
}

// Helper function to generate iCalendar format
function generateICS(calendar: any, events: any[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const calendarId = `calendar-${calendar.id}@glassical.local`;
  
  let ics = "BEGIN:VCALENDAR\r\n";
  ics += "VERSION:2.0\r\n";
  ics += "PRODID:-//GlassCal//Calendar//EN\r\n";
  ics += `X-WR-CALNAME:${escapeICS(calendar.title)}\r\n`;
  ics += `X-WR-CALDESC:${escapeICS(calendar.description || "")}\r\n`;
  ics += `X-WR-TIMEZONE:UTC\r\n`;
  ics += "CALSCALE:GREGORIAN\r\n";

  // Add events
  for (const event of events) {
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${event.id}-${calendarId}\r\n`;
    ics += `DTSTAMP:${now}\r\n`;
    ics += `DTSTART:${formatICSDate(event.startTime)}\r\n`;
    ics += `DTEND:${formatICSDate(event.endTime)}\r\n`;
    ics += `SUMMARY:${escapeICS(event.title)}\r\n`;
    
    if (event.description) {
      ics += `DESCRIPTION:${escapeICS(event.description)}\r\n`;
    }
    if (event.location) {
      ics += `LOCATION:${escapeICS(event.location)}\r\n`;
    }
    
    ics += "END:VEVENT\r\n";
  }

  ics += "END:VCALENDAR\r\n";
  return ics;
}

// Helper to format date for iCalendar (YYYYMMDDTHHMMSSZ)
function formatICSDate(date: Date): string {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  const seconds = String(d.getUTCSeconds()).padStart(2, "0");
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

// Helper to escape special characters in iCalendar format
function escapeICS(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

// Helper to generate random password
function generateRandomPassword(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Helper to send share email notification
async function sendShareEmail(recipientEmail: string, calendarName: string, senderEmail: string): Promise<void> {
  // This is a placeholder for email sending. In production, use SendGrid, Resend, or another service.
  // For now, we log the email that would be sent.
  const appUrl = process.env.BASE_URL || 'http://localhost:5000';
  const emailContent = `
    Hi,

    ${senderEmail} has shared the "${calendarName}" calendar with you!

    To access the calendar, please click the link below and log in to GlassCal:
    ${appUrl}/login

    Once logged in, you'll have full admin access to manage events in the "${calendarName}" calendar.

    Best regards,
    GlassCal Team
  `;

  console.log(`📧 EMAIL NOTIFICATION:\nTo: ${recipientEmail}\n\n${emailContent}`);
  
  // TODO: Integrate with SendGrid, Resend, or another email service
  // Example with SendGrid (requires SENDGRID_API_KEY environment variable):
  // const sgMail = require('@sendgrid/mail');
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // await sgMail.send({
  //   to: recipientEmail,
  //   from: process.env.SENDER_EMAIL || 'noreply@glassical.local',
  //   subject: `${senderEmail} shared "${calendarName}" with you`,
  //   html: emailContent
  // });
}
