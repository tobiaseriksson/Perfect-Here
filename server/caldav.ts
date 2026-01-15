import { Router, Request, Response, NextFunction, text } from "express";
import { storage } from "./storage";
import type { Calendar, Event, CaldavShare } from "@shared/schema";

const router = Router();

// Parse raw XML/text body for CalDAV requests
router.use(text({ type: ["application/xml", "text/xml", "text/plain", "*/*"] }));

const DAV_NS = "DAV:";
const CALDAV_NS = "urn:ietf:params:xml:ns:caldav";
const CS_NS = "http://calendarserver.org/ns/";

interface AuthenticatedRequest extends Request {
  caldavShare?: CaldavShare;
  calendar?: Calendar;
}

function parseBasicAuth(req: Request): { username: string; password: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return null;
  }
  const credentials = Buffer.from(authHeader.slice(6), "base64").toString();
  const colonIndex = credentials.indexOf(":");
  if (colonIndex === -1) return null;
  return {
    username: credentials.substring(0, colonIndex),
    password: credentials.substring(colonIndex + 1)
  };
}

router.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const auth = parseBasicAuth(req);
  const username = auth?.username || "(no auth)";
  const httpVersion = req.httpVersion;
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toLocaleTimeString();
    let logLine = `${timestamp} [caldav] HTTP/${httpVersion} ${req.method} ${req.path} ${res.statusCode} in ${duration}ms :: user=${username}`;
    
    // Log request body if present
    if (req.body && typeof req.body === 'string' && req.body.length > 0) {
      // Truncate very long bodies (e.g., limit to first 500 chars)
      const bodyPreview = req.body;
      logLine += ` :: body=${bodyPreview.replace(/\n/g, '\\n')}`;
    }
    
    console.log(logLine);
  });
  
  next();
});

async function caldavAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const auth = parseBasicAuth(req);
  if (!auth) {
    res.setHeader("WWW-Authenticate", 'Basic realm="GlassCal CalDAV"');
    return res.status(401).send(xmlError("Authentication required"));
  }

  // Try to find the share by username first (for principal discovery)
  let caldavShare = await storage.getCaldavShareByUsername(auth.username);

  // If not found by username, maybe it's a path-based auth with calendar ID
  if (!caldavShare && req.params.id) {
    const calendarId = Number(req.params.id);
    if (!isNaN(calendarId)) {
      caldavShare = await storage.getCaldavShare(calendarId);
    }
  }

  if (!caldavShare || caldavShare.password !== auth.password || (caldavShare.username !== auth.username && !req.params.id)) {
     res.setHeader("WWW-Authenticate", 'Basic realm="GlassCal CalDAV"');
     return res.status(401).send(xmlError("Invalid credentials"));
  }

  req.caldavShare = caldavShare;
  req.calendar = await storage.getCalendar(caldavShare.calendarId);
  next();
}

function xmlError(message: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<error xmlns="DAV:">${escapeXml(message)}</error>`;
}

function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Parse requested properties from REPORT request body
function parseRequestedProperties(body: string): {
  requested: Set<string>;
  hasScheduleTag: boolean;
  hasCreatedBy: boolean;
  hasUpdatedBy: boolean;
} {
  const requested = new Set<string>();
  let hasScheduleTag = false;
  let hasCreatedBy = false;
  let hasUpdatedBy = false;
  
  if (!body) {
    // Default properties if none specified
    requested.add('getetag');
    requested.add('calendar-data');
    return { requested, hasScheduleTag, hasCreatedBy, hasUpdatedBy };
  }
  
  // Look for <prop> section in the XML body
  const propMatch = body.match(/<[^:]*:prop[^>]*>([\s\S]*?)<\/[^:]*:prop>/i);
  if (!propMatch) {
    // If no <prop> found, default to common properties
    requested.add('getetag');
    requested.add('calendar-data');
    return { requested, hasScheduleTag, hasCreatedBy, hasUpdatedBy };
  }
  
  const propContent = propMatch[1];
  const bodyLower = propContent.toLowerCase();
  
  // Check for DAV properties (getetag, etc.)
  if (bodyLower.match(/<[^:]*:getetag[^>]*\/?>/i) || bodyLower.includes('getetag')) {
    requested.add('getetag');
  }
  
  // Check for CalDAV properties (calendar-data, schedule-tag)
  if (bodyLower.match(/<[^:]*:calendar-data[^>]*\/?>/i) || bodyLower.includes('calendar-data')) {
    requested.add('calendar-data');
  }
  if (bodyLower.match(/<[^:]*:schedule-tag[^>]*\/?>/i) || bodyLower.includes('schedule-tag')) {
    hasScheduleTag = true;
  }
  
  // Check for CalendarServer properties (created-by, updated-by)
  if (bodyLower.match(/<[^:]*:created-by[^>]*\/?>/i) || bodyLower.includes('created-by')) {
    hasCreatedBy = true;
  }
  if (bodyLower.match(/<[^:]*:updated-by[^>]*\/?>/i) || bodyLower.includes('updated-by')) {
    hasUpdatedBy = true;
  }
  
  // If no properties found in prop section, default to getetag and calendar-data
  if (requested.size === 0) {
    requested.add('getetag');
    requested.add('calendar-data');
  }
  
  return { requested, hasScheduleTag, hasCreatedBy, hasUpdatedBy };
}

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

function escapeICS(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

function generateEventICS(event: Event, calendarId: number): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `event-${event.id}@glasscal.local`;

  let ics = "BEGIN:VCALENDAR\r\n";
  ics += "VERSION:2.0\r\n";
  ics += "PRODID:-//GlassCal//CalDAV//EN\r\n";
  ics += "CALSCALE:GREGORIAN\r\n";
  ics += "BEGIN:VEVENT\r\n";
  ics += `UID:${uid}\r\n`;
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
  ics += "END:VCALENDAR\r\n";
  return ics;
}

function generateFullCalendarICS(calendar: Calendar, events: Event[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  let ics = "BEGIN:VCALENDAR\r\n";
  ics += "VERSION:2.0\r\n";
  ics += "PRODID:-//GlassCal//CalDAV//EN\r\n";
  ics += `X-WR-CALNAME:${escapeICS(calendar.title)}\r\n`;
  if (calendar.description) {
    ics += `X-WR-CALDESC:${escapeICS(calendar.description)}\r\n`;
  }
  ics += "X-WR-TIMEZONE:UTC\r\n";
  ics += "CALSCALE:GREGORIAN\r\n";
  ics += "METHOD:PUBLISH\r\n";

  for (const event of events) {
    const uid = `event-${event.id}@glasscal.local`;
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${uid}\r\n`;
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

function generateEtag(calendar: Calendar, events: Event[]): string {
  const data = JSON.stringify({ 
    calendarId: calendar.id, 
    eventCount: events.length,
    lastEventId: events[events.length - 1]?.id || 0
  });
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `"${Math.abs(hash).toString(16)}"`;
}

router.options("/", caldavAuth, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, REPORT");
  res.setHeader("DAV", "1, 2, calendar-access");
  res.setHeader("Content-Length", "0");
  res.status(200).end();
});

router.all("/", caldavAuth, async (req: AuthenticatedRequest, res: Response) => {
  const method = req.method.toUpperCase();
  const calendar = req.calendar!;
  const calendarId = calendar.id;
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  if (method === "PROPFIND") {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}" xmlns:C="${CALDAV_NS}">
  <D:response>
    <D:href>${baseUrl}/caldav/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:current-user-principal>
          <D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href>
        </D:current-user-principal>
        <C:calendar-home-set>
          <D:href>${baseUrl}/caldav/calendars/${calendarId}/</D:href>
        </C:calendar-home-set>
        <D:owner><D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href></D:owner>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  if (method === "POST") {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
  <D:response>
    <D:href>${baseUrl}/caldav/</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  res.status(501).send(xmlError(`Method ${method} not implemented`));
});

router.options("/principals/", caldavAuth, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, REPORT");
  res.setHeader("DAV", "1, 2, calendar-access");
  res.setHeader("Content-Length", "0");
  res.status(200).end();
});

router.all("/principals/", caldavAuth, async (req: AuthenticatedRequest, res: Response) => {
  const method = req.method.toUpperCase();
  const calendar = req.calendar!;
  const calendarId = calendar.id;
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  if (method === "PROPFIND") {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}" xmlns:C="${CALDAV_NS}">
  <D:response>
    <D:href>${baseUrl}/caldav/principals/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:displayname>Calendar User</D:displayname>
        <C:calendar-home-set>
          <D:href>${baseUrl}/caldav/calendars/${calendarId}/</D:href>
        </C:calendar-home-set>
        <D:current-user-principal>
          <D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href>
        </D:current-user-principal>
        <D:owner><D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href></D:owner>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  if (method === "POST") {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
  <D:response>
    <D:href>${baseUrl}/caldav/principals/</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  res.status(501).send(xmlError(`Method ${method} not implemented`));
});

router.options("/calendars/:id", caldavAuth, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, REPORT");
  res.setHeader("DAV", "1, 2, calendar-access");
  res.setHeader("Content-Length", "0");
  res.status(200).end();
});

router.get("/calendars/:id", caldavAuth, async (req: AuthenticatedRequest, res: Response) => {
  const calendar = req.calendar!;
  const events = await storage.getEvents({ calendarId: calendar.id, userId: undefined });
  const ics = generateFullCalendarICS(calendar, events);
  const etag = generateEtag(calendar, events);

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("ETag", etag);
  res.send(ics);
});

router.all("/calendars/:id", caldavAuth, async (req: AuthenticatedRequest, res: Response) => {
  const method = req.method.toUpperCase();
  const calendar = req.calendar!;
  const calendarId = calendar.id;
  const depth = req.headers.depth || "0";
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  if (method === "PROPFIND") {
    const events = await storage.getEvents({ calendarId, userId: undefined });
    const etag = generateEtag(calendar, events);

    let xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}" xmlns:C="${CALDAV_NS}" xmlns:CS="${CS_NS}">
  <D:response>
    <D:href>${baseUrl}/caldav/calendars/${calendarId}/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:resourcetype><C:calendar/></D:resourcetype>
        <D:displayname>${escapeXml(calendar.title)}</D:displayname>
        <D:getetag>${etag}</D:getetag>
        <D:getcontenttype>text/calendar; component=vevent</D:getcontenttype>
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/>
        </C:supported-calendar-component-set>
        <C:calendar-description>${escapeXml(calendar.description || " ")}</C:calendar-description>
        <CS:getctag>${etag}</CS:getctag>
        <D:sync-token>urn:uuid:${calendarId}-${etag.replace(/"/g, "")}</D:sync-token>
        <D:current-user-principal>
          <D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href>
        </D:current-user-principal>
        <D:owner><D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href></D:owner>
        <C:calendar-home-set>
          <D:href>${baseUrl}/caldav/calendars/${calendarId}/</D:href>
        </C:calendar-home-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;

    if (depth === "1") {
      for (const event of events) {
        const eventEtag = `"event-${event.id}-${new Date(event.startTime).getTime()}"`;
        xml += `
  <D:response>
    <D:href>${baseUrl}/caldav/calendars/${calendarId}/event-${event.id}.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>${eventEtag}</D:getetag>
        <D:getcontenttype>text/calendar; component=vevent</D:getcontenttype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
      }
    }

    xml += `
</D:multistatus>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  if (method === "REPORT") {
    const body = typeof req.body === 'string' ? req.body : '';
    const bodyLower = body.toLowerCase();
    
    // Check if this is a free-busy-query (case-insensitive, namespace-aware)
    if (bodyLower.includes('free-busy-query') || bodyLower.includes('freebusy')) {
      // Return empty free-busy response
      const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<C:schedule-response xmlns:D="${DAV_NS}" xmlns:C="${CALDAV_NS}">
  <C:response>
    <C:recipient>
      <D:href>mailto:unknown@example.com</D:href>
    </C:recipient>
    <C:request-status>2.0;Success</C:request-status>
    <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//GlassCal//CalDAV//EN
CALSCALE:GREGORIAN
METHOD:REPLY
BEGIN:VFREEBUSY
DTSTAMP:${now}
UID:freebusy-${calendarId}@glasscal.local
END:VFREEBUSY
END:VCALENDAR</C:calendar-data>
  </C:response>
</C:schedule-response>`;
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.status(200).send(xml);
      return;
    }
    
    const events = await storage.getEvents({ calendarId, userId: undefined });
    const { requested, hasScheduleTag, hasCreatedBy, hasUpdatedBy } = parseRequestedProperties(body);
    const hasUnsupportedProps = hasScheduleTag || hasCreatedBy || hasUpdatedBy;

    let xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}" xmlns:C="${CALDAV_NS}" xmlns:CS="${CS_NS}">`;

    for (const event of events) {
      const eventIcs = generateEventICS(event, calendarId);
      const eventEtag = `"event-${event.id}-${new Date(event.startTime).getTime()}"`;
      const relativeHref = `/caldav/calendars/${calendarId}/event-${event.id}.ics`;
      
      xml += `
  <D:response>
    <D:href>${relativeHref}</D:href>`;
      
      // First propstat: supported properties (200 OK)
      xml += `
    <D:propstat>
      <D:prop>`;
      
      if (requested.has('getetag')) {
        xml += `
        <D:getetag>${eventEtag}</D:getetag>`;
      }
      if (requested.has('calendar-data')) {
        xml += `
        <C:calendar-data><![CDATA[${eventIcs}]]></C:calendar-data>`;
      }
      
      xml += `
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>`;
      
      // Second propstat: unsupported properties (404 Not Found)
      if (hasUnsupportedProps) {
        xml += `
    <D:propstat>
      <D:prop>`;
        
        if (hasScheduleTag) {
          xml += `
        <C:schedule-tag />`;
        }
        if (hasCreatedBy) {
          xml += `
        <CS:created-by />`;
        }
        if (hasUpdatedBy) {
          xml += `
        <CS:updated-by />`;
        }
        
        xml += `
      </D:prop>
      <D:status>HTTP/1.1 404 Not Found</D:status>
    </D:propstat>`;
      }
      
      xml += `
  </D:response>`;
    }

    xml += `
</D:multistatus>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  if (method === "PROPPATCH") {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
  <D:response>
    <D:href>${baseUrl}/caldav/calendars/${calendarId}/</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  if (method === "POST") {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
  <D:response>
    <D:href>${baseUrl}/caldav/calendars/${calendarId}/</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  if (method === "PUT" || method === "DELETE") {
    // Return 200 OK as no-op for read-only calendar (macOS compatibility)
    res.setHeader("Content-Length", "0");
    res.status(200).end();
    return;
  }

  res.status(501).send(xmlError(`Method ${method} not implemented`));
});

router.all("/principals/:id", caldavAuth, async (req: AuthenticatedRequest, res: Response) => {
  const method = req.method.toUpperCase();
  const calendar = req.calendar!;
  const calendarId = calendar.id;
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  if (method === "OPTIONS") {
    res.setHeader("Allow", "OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND, PROPPATCH, REPORT");
    res.setHeader("DAV", "1, 2, calendar-access");
    res.setHeader("Content-Length", "0");
    res.status(200).end();
    return;
  }

  if (method === "PROPFIND") {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}" xmlns:C="${CALDAV_NS}">
  <D:response>
    <D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:principal/></D:resourcetype>
        <D:displayname>Calendar User</D:displayname>
        <C:calendar-home-set>
          <D:href>${baseUrl}/caldav/calendars/${calendarId}/</D:href>
        </C:calendar-home-set>
        <D:current-user-principal>
          <D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href>
        </D:current-user-principal>
        <D:owner><D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href></D:owner>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  if (method === "POST") {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="${DAV_NS}">
  <D:response>
    <D:href>${baseUrl}/caldav/principals/${calendarId}/</D:href>
    <D:propstat>
      <D:prop/>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  res.status(501).send(xmlError(`Method ${method} not implemented`));
});

// Schedule inbox/outbox for CalDAV scheduling (no-op handlers)
router.all(["/schedule-inbox", "/schedule-inbox/"], caldavAuth, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Content-Length", "0");
  res.status(200).end();
});

router.all(["/schedule-outbox", "/schedule-outbox/"], caldavAuth, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Content-Length", "0");
  res.status(200).end();
});

router.all(["/calendars/:id/schedule-inbox", "/calendars/:id/schedule-inbox/"], caldavAuth, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Content-Length", "0");
  res.status(200).end();
});

router.all(["/calendars/:id/schedule-outbox", "/calendars/:id/schedule-outbox/"], caldavAuth, (req: AuthenticatedRequest, res: Response) => {
  res.setHeader("Content-Length", "0");
  res.status(200).end();
});

router.get("/calendars/:id/event-:eventId.ics", caldavAuth, async (req: AuthenticatedRequest, res: Response) => {
  const calendar = req.calendar!;
  const eventId = Number(req.params.eventId);
  
  const event = await storage.getEvent(eventId);
  if (!event || event.calendarId !== calendar.id) {
    return res.status(404).send(xmlError("Event not found"));
  }

  const ics = generateEventICS(event, calendar.id);
  const etag = `"event-${event.id}-${new Date(event.startTime).getTime()}"`;

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("ETag", etag);
  res.send(ics);
});

export default router;
