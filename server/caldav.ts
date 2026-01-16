import { Router, Request, Response, NextFunction, text } from "express";
import { storage } from "./storage";
import type { Calendar, Event, CaldavShare } from "@shared/schema";

const router = Router();

// Parse raw XML/text body for CalDAV requests
router.use(text({ type: ["application/xml", "text/xml", "text/plain", "*/*"] }));

// WebDAV namespace constants
// IMPORTANT: When using C: prefix in XML responses, it MUST always be mapped to CALDAV_NS
// When using CS: prefix, it MUST always be mapped to CS_NS
// All multistatus elements that use C: or CS: prefixes must declare these namespaces
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
  
  // Capture response body
  let responseBody: string | undefined = undefined;
  const originalSend = res.send;
  const originalEnd = res.end;
  
  res.send = function(body?: any) {
    if (body !== undefined && !responseBody) {
      if (typeof body === 'string') {
        responseBody = body;
      } else if (Buffer.isBuffer(body)) {
        responseBody = body.toString('utf8');
      } else {
        try {
          responseBody = JSON.stringify(body);
        } catch (e) {
          responseBody = String(body);
        }
      }
    }
    return originalSend.call(this, body);
  };
  
  res.end = function(chunk?: any, encoding?: any) {
    if (chunk !== undefined && !responseBody) {
      if (typeof chunk === 'string') {
        responseBody = chunk;
      } else if (Buffer.isBuffer(chunk)) {
        responseBody = chunk.toString('utf8');
      } else {
        responseBody = String(chunk);
      }
    }
    return originalEnd.call(this, chunk, encoding);
  };
  
  res.on("finish", () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toLocaleTimeString();
    // Use full path including mount point (req.baseUrl + req.path)
    // req.baseUrl is "/caldav" when router is mounted at /caldav
    // req.path is relative to mount point (e.g., "/principals/1/")
    const fullPath = req.baseUrl + req.path;
    let logLine = `${timestamp} [caldav] HTTP/${httpVersion} ${req.method} ${fullPath} ${res.statusCode} in ${duration}ms :: user=${username}`;
    
    // Log request headers (filter out sensitive headers)
    const headersToLog: Record<string, string | string[]> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    Object.keys(req.headers).forEach(key => {
      const headerValue = req.headers[key];
      if (headerValue !== undefined) {
        if (!sensitiveHeaders.includes(key.toLowerCase())) {
          headersToLog[key] = headerValue;
        } else {
          headersToLog[key] = '[REDACTED]';
        }
      }
    });
    if (Object.keys(headersToLog).length > 0) {
      logLine += ` :: headers=${JSON.stringify(headersToLog)}`;
    }
    
    // Log request body if present
    if (req.body && typeof req.body === 'string' && req.body.length > 0) {
      logLine += ` :: reqBody=${req.body}`;
    }
    
    // Log response body if present
    if (responseBody && responseBody.length > 0) {
      // Truncate very long response bodies (limit to first 1000 chars)
      const responsePreview = responseBody;
      logLine += ` :: resBody=${responseBody}`;
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

// Parse calendar-multiget query to extract requested hrefs
function parseMultigetHrefs(body: string): string[] {
  const hrefs: string[] = [];
  if (!body) return hrefs;
  
  // Look for href elements in the multiget request
  // Pattern matches: <D:href>...</D:href> or <A:href>...</A:href> etc.
  const hrefRegex = /<[^:>]*:href[^>]*>([^<]+)<\/[^:>]*:href>/gi;
  let match;
  
  while ((match = hrefRegex.exec(body)) !== null) {
    const href = match[1].trim();
    if (href && !href.startsWith('mailto:')) {
      // Extract relative path (remove base URL if present)
      const relativeHref = href.replace(/^https?:\/\/[^\/]+/, '');
      hrefs.push(relativeHref);
    }
  }
  
  return hrefs;
}

// Extract DAV namespace prefix from request XML
// macOS sometimes uses A: instead of D: for DAV namespace
function extractDavPrefix(body: string): string {
  if (!body) return 'D'; // Default
  
  // Look for DAV namespace declarations: xmlns:D="DAV:" or xmlns:A="DAV:"
  const davNsMatch = body.match(/xmlns:([^=]+)="DAV:"/i);
  if (davNsMatch) {
    return davNsMatch[1];
  }
  
  // Also check actual property usage (e.g., <A:prop>, <A:getetag>)
  const propMatch = body.match(/<([A-Z]+):prop[^>]*>/i);
  if (propMatch) {
    return propMatch[1];
  }
  
  return 'D'; // Default
}

// Extract namespace prefixes from request XML to match client's namespace usage
// CRITICAL: Must match the exact prefixes used in the request to avoid RFC violations
function extractNamespacePrefixes(body: string): { caldavPrefix: string; csPrefix: string } {
  let caldavPrefix = 'C'; // Default
  let csPrefix = 'CS'; // Default
  
  if (!body) return { caldavPrefix, csPrefix };
  
  // Look for namespace declarations in the XML
  // Pattern: xmlns:C="urn:ietf:params:xml:ns:caldav" or xmlns:CS="http://calendarserver.org/ns/"
  const caldavNsMatch = body.match(/xmlns:([^=]+)="urn:ietf:params:xml:ns:caldav"/i);
  if (caldavNsMatch) {
    caldavPrefix = caldavNsMatch[1];
  }
  
  const csNsMatch = body.match(/xmlns:([^=]+)="http:\/\/calendarserver\.org\/ns\/"/i);
  if (csNsMatch) {
    csPrefix = csNsMatch[1];
  }
  
  // Also check actual property usage in the request to detect prefix conflicts
  // If client uses C: for calendarserver properties, detect it from actual tags
  if (body.match(/<C:created-by|<C:updated-by/i) && !body.match(/xmlns:C="urn:ietf:params:xml:ns:caldav"/i)) {
    // Client is using C: for calendarserver properties
    csPrefix = 'C';
    // Try to find what prefix they use for CalDAV
    const altCaldavMatch = body.match(/<([A-Z]+):calendar-data|<([A-Z]+):schedule-tag/i);
    if (altCaldavMatch) {
      caldavPrefix = altCaldavMatch[1] || altCaldavMatch[2] || 'C';
    }
  }
  
  return { caldavPrefix, csPrefix };
}

// Parse properties being set in PROPPATCH request body
// Returns: { properties: Array<{name: string, namespace: string, prefix: string, value: string}> }
function parseProppatchProperties(body: string): { properties: Array<{name: string, namespace: string, prefix: string, value: string}> } {
  const properties: Array<{name: string, namespace: string, prefix: string, value: string}> = [];
  
  if (!body) return { properties };
  
  // PROPPATCH structure: <D:propertyupdate><D:set><D:prop><property>value</property></D:prop></D:set></D:propertyupdate>
  // Extract all properties from <D:set><D:prop>...</D:prop></D:set> blocks
  const setMatch = body.match(/<[^:>]*:set[^>]*>([\s\S]*?)<\/[^:>]*:set>/i);
  if (!setMatch) return { properties };
  
  const propMatch = setMatch[1].match(/<[^:>]*:prop[^>]*>([\s\S]*?)<\/[^:>]*:prop>/i);
  if (!propMatch) return { properties };
  
  const propContent = propMatch[1];
  
  // Extract namespace declarations to map prefixes to URIs
  const namespaceMap: Record<string, string> = {};
  const nsRegex = /xmlns:([^=]+)="([^"]+)"/g;
  let nsMatch;
  while ((nsMatch = nsRegex.exec(body)) !== null) {
    namespaceMap[nsMatch[1]] = nsMatch[2];
  }
  
  // Extract all property elements with their prefixes
  // Pattern: <prefix:property>value</prefix:property> or <prefix:property/>
  const propertyRegex = /<([^:>]+):([a-zA-Z0-9-]+)[^>]*(?:\/>|>([\s\S]*?)<\/\1:\2>)/g;
  let match;
  while ((match = propertyRegex.exec(propContent)) !== null) {
    const prefix = match[1];
    const name = match[2];
    const value = match[3] || '';
    const namespace = namespaceMap[prefix] || '';
    
    properties.push({ name, namespace, prefix, value });
  }
  
  return { properties };
}

// Parse requested properties from PROPFIND request body
// This function extracts property names from XML tags, handling namespace prefixes (D:, A:, C:, CS:, etc.)
// Returns both the normalized property names (for lookup) and the original case mapping (for response)
function parsePropfindProperties(body: string): { requested: Set<string>; originalCase: Map<string, string> } {
  const requested = new Set<string>();
  const originalCase = new Map<string, string>(); // Maps normalized name -> original case from request
  
  if (!body) {
    return { requested, originalCase };
  }
  
  // Look for <prop> section in the XML body (handle any namespace prefix)
  const propMatch = body.match(/<[^:>]*:prop[^>]*>([\s\S]*?)<\/[^:>]*:prop>/i);
  if (!propMatch) {
    return { requested, originalCase };
  }
  
  const propContent = propMatch[1];
  
  // Map of property names we recognize (normalized lowercase -> our internal name)
  const propertyMap: Record<string, string> = {
    'resourcetype': 'resourcetype',
    'getetag': 'getetag',
    'getcontenttype': 'getcontenttype',
    'displayname': 'displayname',
    'current-user-principal': 'current-user-principal',
    'current-user-privilege-set': 'current-user-privilege-set', // Thunderbird requires this for write/sync mode
    'supported-report-set': 'supported-report-set', // Thunderbird requires this for sync mode
    'owner': 'owner',
    'sync-token': 'sync-token',
    'principal-url': 'principal-url', // macOS Calendar sometimes requests this (case-sensitive: principal-URL)
    'calendar-home-set': 'calendar-home-set',
    'calendar-description': 'calendar-description',
    'supported-calendar-component-set': 'supported-calendar-component-set',
    'email-address-set': 'email-address-set', // macOS Calendar requests this for principal resources
    'getctag': 'getctag',
    'schedule-tag': 'schedule-tag',
    'created-by': 'created-by',
    'updated-by': 'updated-by',
  };
  
  // Extract all property tags preserving exact case
  // Pattern matches: <prefix:property-name/> or <prefix:property-name></prefix:property-name>
  // This is namespace-agnostic - it will match D:, A:, C:, CS:, or any other prefix
  // CRITICAL: We capture the exact case from the XML tag
  const propertyTagRegex = /<[^:>]*:([a-zA-Z0-9-]+)[^>]*(?:\/>|>[\s\S]*?<\/[^:>]*:\1>)/gi;
  let match;
  
  while ((match = propertyTagRegex.exec(propContent)) !== null) {
    const originalName = match[1]; // Preserve exact case from XML
    const normalizedName = originalName.toLowerCase();
    
    // Store the original case mapping
    originalCase.set(normalizedName, originalName);
    
    if (propertyMap[normalizedName]) {
      requested.add(propertyMap[normalizedName]);
    } else {
      // Unknown property - add normalized name so we can return 404 for it
      requested.add(normalizedName);
    }
  }
  
  // Fallback: if regex didn't match anything, try simpler pattern matching
  if (requested.size === 0) {
    const bodyLower = propContent.toLowerCase();
    for (const [localName, internalName] of Object.entries(propertyMap)) {
      // Match property names in tags (handles various formats)
      const pattern = new RegExp(`<[^:>]*:([a-zA-Z0-9-]*${localName.replace(/-/g, '[-_]?')}[a-zA-Z0-9-]*)[^>]*(?:/>|>)`, 'i');
      const fallbackMatch = propContent.match(pattern);
      if (fallbackMatch) {
        const originalName = fallbackMatch[1];
        const normalizedName = originalName.toLowerCase();
        originalCase.set(normalizedName, originalName);
        requested.add(internalName);
      } else if (bodyLower.includes(localName)) {
        // Last resort: use lowercase version
        originalCase.set(localName, localName);
        requested.add(internalName);
      }
    }
  }
  
  return { requested, originalCase };
}

// Helper function to format unsupported properties in 404 propstat blocks
// Returns the XML string for a property with the correct namespace prefix
// CRITICAL: Uses originalCase to preserve exact case from request (e.g., principal-URL vs principal-url)
function formatUnsupportedProperty(prop: string, originalCase?: Map<string, string>): string {
  // Get the original case from the request, or use normalized version
  const normalizedProp = prop.toLowerCase();
  const originalProp = originalCase?.get(normalizedProp) || prop;
  
  // Handle properties with proper namespaces based on property name (use normalized for lookup)
  if (normalizedProp.startsWith('calendar-') || normalizedProp === 'supported-calendar-component-set' || 
      normalizedProp === 'schedule-tag' || normalizedProp === 'email-address-set') {
    return `<C:${originalProp} />`;
  } else if (normalizedProp === 'getctag' || normalizedProp === 'created-by' || normalizedProp === 'updated-by') {
    return `<CS:${originalProp} />`;
  } else {
    // Default to DAV namespace for unknown properties (like principal-URL, etc.)
    // CRITICAL: Use original case (principal-URL) not normalized (principal-url)
    return `<D:${originalProp} />`;
  }
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

// CRITICAL: Generate CTag (Calendar Tag) using persistent timestamp
// CTag must be stable across server restarts and change only when content changes
// Uses calendar.updatedAt timestamp which is updated whenever events are added/modified/deleted
function generateCTag(calendar: Calendar): string {
  // Use calendar's updatedAt timestamp (persistent in database)
  // This ensures the CTag is stable across server restarts
  // The timestamp changes only when events are added/modified/deleted (via storage methods)
  const timestamp = calendar.updatedAt 
    ? new Date(calendar.updatedAt).getTime() 
    : calendar.createdAt 
      ? new Date(calendar.createdAt).getTime() 
      : Date.now();
  
  // Convert timestamp to hex string for consistent format
  // Use quotes for "Strong ETag" (RFC 4918)
  return `"${timestamp.toString(16)}"`;
}

// Generate ETag for calendar collection (folder)
// CRITICAL: This must be DIFFERENT from CTag to avoid Thunderbird cache conflicts
// Collection ETag represents the folder structure, not the content
// Uses calendar creation time (stable, doesn't change when events change)
function generateCollectionETag(calendar: Calendar): string {
  // Use calendar creation time (stable, doesn't change)
  // This is different from CTag which uses updatedAt
  const timestamp = calendar.createdAt 
    ? new Date(calendar.createdAt).getTime() 
    : Date.now();
  
  // Add a prefix to ensure it's different from CTag
  // Convert to hex and use quotes for "Strong ETag"
  return `"c${timestamp.toString(16)}"`;
}

// Generate ETag for individual event resource
// CRITICAL: Must be stable across server restarts
// Uses event's updatedAt timestamp (persistent in database)
function generateEventETag(event: Event): string {
  // Use event's updatedAt timestamp (persistent in database)
  // This ensures the ETag is stable across server restarts
  const timestamp = event.updatedAt 
    ? new Date(event.updatedAt).getTime() 
    : event.createdAt 
      ? new Date(event.createdAt).getTime() 
      : Date.now();
  
  // Format: "event-{id}-{timestamp}" for uniqueness
  // Use quotes for "Strong ETag" (RFC 4918)
  return `"event-${event.id}-${timestamp.toString(16)}"`;
}

// Legacy function name for backward compatibility (now generates CTag)
function generateEtag(calendar: Calendar, events: Event[]): string {
  return generateCTag(calendar);
}

// CRITICAL: OPTIONS handler for capability discovery
// macOS and other clients send OPTIONS to /caldav/ to discover server capabilities
// This MUST return 200 OK with DAV header, not 401 or 404
// OPTIONS requests for capability discovery don't require authentication
router.options("/", (req: Request, res: Response) => {
  res.setHeader("Allow", "GET, HEAD, OPTIONS, PROPFIND, REPORT, PUT, DELETE");
  res.setHeader("DAV", "1, 2, calendar-access, addressbook");
  res.setHeader("Content-Length", "0");
  res.status(200).end();
});

router.all("/", caldavAuth, async (req: AuthenticatedRequest, res: Response) => {
  const method = req.method.toUpperCase();
  const calendar = req.calendar!;
  const calendarId = calendar.id;
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  if (method === "PROPFIND") {
    const body = typeof req.body === 'string' ? req.body : '';
    const { requested, originalCase } = parsePropfindProperties(body);
    // CRITICAL: Extract DAV namespace prefix from request (macOS uses A: instead of D:)
    const davPrefix = extractDavPrefix(body);
    // CRITICAL: Match the exact path from request (preserve trailing slash)
    const relativeHref = req.path.endsWith('/') ? `/caldav/` : `/caldav`;
    
    // CRITICAL: Principal URL must match exactly what's configured in routing
    // We have routes for /principals/:id and /principals/:id/:subId
    // Use the simple /principals/:id/ format for consistency
    const principalHref = `/caldav/principals/${calendarId}/`;
    
    let xml = `<?xml version="1.0" encoding="utf-8"?>
<${davPrefix}:multistatus xmlns:${davPrefix}="${DAV_NS}" xmlns:C="${CALDAV_NS}" xmlns:CS="${CS_NS}">
  <${davPrefix}:response>
    <${davPrefix}:href>${relativeHref}</${davPrefix}:href>`;
    
    // Build propstat for requested properties
    const supportedProps: string[] = [];
    const unsupportedProps: string[] = [];
    
    // If no properties requested, return empty response or default to resourcetype
    if (requested.size === 0) {
      requested.add('resourcetype');
    }
    
    if (requested.has('resourcetype')) {
      supportedProps.push('resourcetype');
    }
    if (requested.has('current-user-principal')) {
      supportedProps.push('current-user-principal');
    }
    if (requested.has('calendar-home-set')) {
      supportedProps.push('calendar-home-set');
    }
    if (requested.has('owner')) {
      supportedProps.push('owner');
    }
    
    // Add unsupported properties to 404 list
    requested.forEach(prop => {
      if (!supportedProps.includes(prop) && prop !== 'resourcetype') {
        unsupportedProps.push(prop);
      }
    });
    
    // First propstat: supported properties (200 OK)
    if (supportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      if (supportedProps.includes('resourcetype')) {
        xml += `
        <${davPrefix}:resourcetype><${davPrefix}:collection/></${davPrefix}:resourcetype>`;
      }
      if (supportedProps.includes('current-user-principal')) {
        // CRITICAL: Use consistent principal URL that matches routing
        xml += `
        <${davPrefix}:current-user-principal>
          <${davPrefix}:href>${principalHref}</${davPrefix}:href>
        </${davPrefix}:current-user-principal>`;
      }
      if (supportedProps.includes('calendar-home-set')) {
        xml += `
        <C:calendar-home-set>
          <${davPrefix}:href>${relativeHref}calendars/${calendarId}/</${davPrefix}:href>
        </C:calendar-home-set>`;
      }
      if (supportedProps.includes('owner')) {
        xml += `
        <${davPrefix}:owner><${davPrefix}:href>${principalHref}</${davPrefix}:href></${davPrefix}:owner>`;
      }
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    // Second propstat: unsupported properties (404 Not Found)
    if (unsupportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      unsupportedProps.forEach(prop => {
        const propXml = formatUnsupportedProperty(prop, originalCase);
        const propXmlWithPrefix = propXml.replace(/<D:/g, `<${davPrefix}:`).replace(/<\/D:/g, `</${davPrefix}:`);
        xml += `
        ${propXmlWithPrefix}`;
      });
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 404 Not Found</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    xml += `
  </${davPrefix}:response>
</${davPrefix}:multistatus>`;

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
    const body = typeof req.body === 'string' ? req.body : '';
    const { requested, originalCase } = parsePropfindProperties(body);
    // CRITICAL: Extract DAV namespace prefix from request (macOS uses A: instead of D:)
    const davPrefix = extractDavPrefix(body);
    // CRITICAL: Match the exact path from request (preserve trailing slash)
    const relativeHref = req.path.endsWith('/') ? `/caldav/principals/` : `/caldav/principals`;
    
    // CRITICAL: Principal URL must match exactly what's configured in routing
    const principalHref = `/caldav/principals/${calendarId}/`;
    
    // If no properties requested, default to resourcetype
    if (requested.size === 0) {
      requested.add('resourcetype');
    }
    
    let xml = `<?xml version="1.0" encoding="utf-8"?>
<${davPrefix}:multistatus xmlns:${davPrefix}="${DAV_NS}" xmlns:C="${CALDAV_NS}" xmlns:CS="${CS_NS}">
  <${davPrefix}:response>
    <${davPrefix}:href>${relativeHref}</${davPrefix}:href>`;
    
    const supportedProps: string[] = [];
    const unsupportedProps: string[] = [];
    
    if (requested.has('resourcetype')) {
      supportedProps.push('resourcetype');
    }
    if (requested.has('displayname')) {
      supportedProps.push('displayname');
    }
    if (requested.has('calendar-home-set')) {
      supportedProps.push('calendar-home-set');
    }
    if (requested.has('current-user-principal')) {
      supportedProps.push('current-user-principal');
    }
    if (requested.has('owner')) {
      supportedProps.push('owner');
    }
    
    requested.forEach(prop => {
      if (!supportedProps.includes(prop)) {
        unsupportedProps.push(prop);
      }
    });
    
    if (supportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      if (supportedProps.includes('resourcetype')) {
        xml += `
        <${davPrefix}:resourcetype><${davPrefix}:collection/></${davPrefix}:resourcetype>`;
      }
      if (supportedProps.includes('displayname')) {
        xml += `
        <${davPrefix}:displayname>Calendar User</${davPrefix}:displayname>`;
      }
      if (supportedProps.includes('calendar-home-set')) {
        xml += `
        <C:calendar-home-set>
          <${davPrefix}:href>${relativeHref.replace('/principals/', '/calendars/')}${calendarId}/</${davPrefix}:href>
        </C:calendar-home-set>`;
      }
      if (supportedProps.includes('current-user-principal')) {
        // CRITICAL: Use consistent principal URL that matches routing
        xml += `
        <${davPrefix}:current-user-principal>
          <${davPrefix}:href>${principalHref}</${davPrefix}:href>
        </${davPrefix}:current-user-principal>`;
      }
      if (supportedProps.includes('owner')) {
        xml += `
        <${davPrefix}:owner><${davPrefix}:href>${principalHref}</${davPrefix}:href></${davPrefix}:owner>`;
      }
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    if (unsupportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      unsupportedProps.forEach(prop => {
        const propXml = formatUnsupportedProperty(prop, originalCase);
        const propXmlWithPrefix = propXml.replace(/<D:/g, `<${davPrefix}:`).replace(/<\/D:/g, `</${davPrefix}:`);
        xml += `
        ${propXmlWithPrefix}`;
      });
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 404 Not Found</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    xml += `
  </${davPrefix}:response>
</${davPrefix}:multistatus>`;

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

// CRITICAL: OPTIONS handler for /calendars/ parent directory
// Thunderbird checks this to verify DAV compliance and permissions for auto-discovery
// This route must come BEFORE /calendars/:id to ensure proper matching
// Handle both with and without trailing slash for compatibility
router.options(["/calendars", "/calendars/"], (req: Request, res: Response) => {
  // OPTIONS for discovery doesn't require authentication (like root OPTIONS)
  res.setHeader("Allow", "OPTIONS, GET, HEAD, PROPFIND, REPORT");
  res.setHeader("DAV", "1, 2, calendar-access, addressbook");
  res.setHeader("Content-Length", "0");
  res.status(200).end();
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
    const body = typeof req.body === 'string' ? req.body : '';
    const { requested, originalCase } = parsePropfindProperties(body);
    // CRITICAL: Use persistent timestamps from database for stable ETags/CTags
    // CTag uses calendar.updatedAt (changes when events change)
    // Collection ETag uses calendar.createdAt (stable, different from CTag)
    const ctag = generateCTag(calendar); // Uses calendar.updatedAt - changes when events change
    const collectionEtag = generateCollectionETag(calendar); // Uses calendar.createdAt - stable
    
    // CRITICAL: Extract DAV namespace prefix from request (macOS uses A: instead of D:)
    const davPrefix = extractDavPrefix(body);
    
    // CRITICAL: Handle prefer: return=minimal header (RFC 7240)
    const preferHeader = req.headers.prefer || req.headers['prefer'];
    if (preferHeader && typeof preferHeader === 'string' && preferHeader.toLowerCase().includes('return=minimal')) {
      res.setHeader("Preference-Applied", "return=minimal");
    }
    
    // CRITICAL: Match the exact path from request (preserve trailing slash)
    const relativeHref = req.path.endsWith('/') ? `/caldav/calendars/${calendarId}/` : `/caldav/calendars/${calendarId}`;
    
    // CRITICAL: Principal URL must match exactly what's configured in routing
    // Use the simple /principals/:id/ format for consistency
    const principalHref = `/caldav/principals/${calendarId}/`;
    
    // If no properties requested, default to resourcetype
    if (requested.size === 0) {
      requested.add('resourcetype');
    }

    let xml = `<?xml version="1.0" encoding="utf-8"?>
<${davPrefix}:multistatus xmlns:${davPrefix}="${DAV_NS}" xmlns:C="${CALDAV_NS}" xmlns:CS="${CS_NS}">
  <${davPrefix}:response>
    <${davPrefix}:href>${relativeHref}</${davPrefix}:href>`;
    
    const supportedProps: string[] = [];
    const unsupportedProps: string[] = [];
    
    if (requested.has('resourcetype')) {
      supportedProps.push('resourcetype');
    }
    // CRITICAL: Collections can return getetag, but it must be DIFFERENT from getctag
    // getctag changes when events change (for refresh detection)
    // getetag is stable for the collection structure (prevents cache conflicts)
    if (requested.has('getetag')) {
      supportedProps.push('getetag');
    }
    // CRITICAL: macOS/Thunderbird relies on getctag for calendar refresh detection
    // getctag MUST change when ANY event is added, modified, or deleted
    if (requested.has('getctag')) {
      supportedProps.push('getctag');
    }
    // CRITICAL: Collections don't have getcontenttype - move to unsupportedProps
    // Some servers return 404 for this property on collections
    if (requested.has('getcontenttype')) {
      unsupportedProps.push('getcontenttype');
    }
    if (requested.has('displayname')) {
      supportedProps.push('displayname');
    }
    if (requested.has('sync-token')) {
      supportedProps.push('sync-token');
    }
    if (requested.has('calendar-description')) {
      supportedProps.push('calendar-description');
    }
    if (requested.has('supported-calendar-component-set')) {
      supportedProps.push('supported-calendar-component-set');
    }
    if (requested.has('current-user-principal')) {
      supportedProps.push('current-user-principal');
    }
    if (requested.has('owner')) {
      supportedProps.push('owner');
    }
    if (requested.has('calendar-home-set')) {
      supportedProps.push('calendar-home-set');
    }
    // CRITICAL: Thunderbird requires these for write/sync mode
    if (requested.has('current-user-privilege-set')) {
      supportedProps.push('current-user-privilege-set');
    }
    if (requested.has('supported-report-set')) {
      supportedProps.push('supported-report-set');
    }
    
    // Add remaining requested properties to unsupportedProps (avoid duplicates)
    requested.forEach(prop => {
      if (!supportedProps.includes(prop) && !unsupportedProps.includes(prop)) {
        unsupportedProps.push(prop);
      }
    });
    
    // First propstat: supported properties (200 OK)
    // Order: DAV properties first (resourcetype, getetag), then others
    // Note: getcontenttype is NOT included for collections (moved to unsupportedProps)
    if (supportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      // DAV properties (in common order)
      if (supportedProps.includes('resourcetype')) {
        xml += `
        <${davPrefix}:resourcetype>
          <${davPrefix}:collection/>
          <C:calendar/>
        </${davPrefix}:resourcetype>`;
      }
      // CRITICAL: Collection getetag must be DIFFERENT from getctag to avoid cache conflicts
      // getetag is stable (represents collection structure), getctag changes with content
      if (supportedProps.includes('getetag')) {
        xml += `
        <${davPrefix}:getetag>${collectionEtag}</${davPrefix}:getetag>`;
      }
      if (supportedProps.includes('displayname')) {
        xml += `
        <${davPrefix}:displayname>${escapeXml(calendar.title)}</${davPrefix}:displayname>`;
      }
      if (supportedProps.includes('sync-token')) {
        // sync-token should change when content changes, so use ctag
        xml += `
        <${davPrefix}:sync-token>urn:uuid:${calendarId}-${ctag.replace(/"/g, "")}</${davPrefix}:sync-token>`;
      }
      if (supportedProps.includes('current-user-principal')) {
        // CRITICAL: Use consistent principal URL that matches routing
        xml += `
        <${davPrefix}:current-user-principal>
          <${davPrefix}:href>${principalHref}</${davPrefix}:href>
        </${davPrefix}:current-user-principal>`;
      }
      if (supportedProps.includes('owner')) {
        xml += `
        <${davPrefix}:owner><${davPrefix}:href>${principalHref}</${davPrefix}:href></${davPrefix}:owner>`;
      }
      
      // CalDAV properties
      if (supportedProps.includes('calendar-description')) {
        xml += `
        <C:calendar-description>${escapeXml(calendar.description || " ")}</C:calendar-description>`;
      }
      if (supportedProps.includes('supported-calendar-component-set')) {
        xml += `
        <C:supported-calendar-component-set>
          <C:comp name="VEVENT"/>
        </C:supported-calendar-component-set>`;
      }
      if (supportedProps.includes('calendar-home-set')) {
        xml += `
        <C:calendar-home-set>
          <${davPrefix}:href>${relativeHref}</${davPrefix}:href>
        </C:calendar-home-set>`;
      }
      
      // CRITICAL: Thunderbird requires current-user-privilege-set for write/sync mode
      // All privileges must be in a single <D:privilege> element, including D:all
      if (supportedProps.includes('current-user-privilege-set')) {
        xml += `
        <${davPrefix}:current-user-privilege-set>
          <${davPrefix}:privilege>
            <${davPrefix}:read/>
            <${davPrefix}:write/>
            <${davPrefix}:all/>
          </${davPrefix}:privilege>
        </${davPrefix}:current-user-privilege-set>`;
      }
      
      // CRITICAL: Thunderbird requires supported-report-set for sync mode
      if (supportedProps.includes('supported-report-set')) {
        xml += `
        <${davPrefix}:supported-report-set>
          <${davPrefix}:supported-report>
            <${davPrefix}:report>
              <C:calendar-multiget/>
            </${davPrefix}:report>
          </${davPrefix}:supported-report>
          <${davPrefix}:supported-report>
            <${davPrefix}:report>
              <C:calendar-query/>
            </${davPrefix}:report>
          </${davPrefix}:supported-report>
        </${davPrefix}:supported-report-set>`;
      }
      
      // CalendarServer properties
      // CRITICAL: getctag MUST change when events change (for Thunderbird refresh detection)
      if (supportedProps.includes('getctag')) {
        xml += `
        <CS:getctag>${ctag}</CS:getctag>`;
      }
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    // Second propstat: unsupported properties (404 Not Found)
    // CRITICAL: Collections don't have getcontenttype - return 404 for it
    if (unsupportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      unsupportedProps.forEach(prop => {
        // Replace D: prefix in formatUnsupportedProperty output with davPrefix
        const propXml = formatUnsupportedProperty(prop, originalCase);
        const propXmlWithPrefix = propXml.replace(/<D:/g, `<${davPrefix}:`).replace(/<\/D:/g, `</${davPrefix}:`);
        xml += `
        ${propXmlWithPrefix}`;
      });
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 404 Not Found</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    xml += `
  </${davPrefix}:response>`;

    if (depth === "1") {
      // Fetch events for Depth 1 PROPFIND (list all events in calendar)
      const events = await storage.getEvents({ calendarId, userId: undefined });
      for (const event of events) {
        // CRITICAL: Use persistent ETag from database (stable across restarts)
        const eventEtag = generateEventETag(event);
        const eventRelativeHref = `${relativeHref}event-${event.id}.ics`;
        
        xml += `
  <${davPrefix}:response>
    <${davPrefix}:href>${eventRelativeHref}</${davPrefix}:href>`;
        
        const eventSupportedProps: string[] = [];
        const eventUnsupportedProps: string[] = [];
        
        if (requested.has('getetag')) {
          eventSupportedProps.push('getetag');
        }
        if (requested.has('getcontenttype')) {
          eventSupportedProps.push('getcontenttype');
        }
        
        requested.forEach(prop => {
          if (!eventSupportedProps.includes(prop) && prop !== 'resourcetype' && prop !== 'displayname' && 
              prop !== 'sync-token' && prop !== 'calendar-description' && prop !== 'supported-calendar-component-set' &&
              prop !== 'getctag' && prop !== 'current-user-principal' && prop !== 'owner' && prop !== 'calendar-home-set') {
            if (!eventUnsupportedProps.includes(prop)) {
              eventUnsupportedProps.push(prop);
            }
          }
        });
        
        if (eventSupportedProps.length > 0) {
    xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
          
          if (eventSupportedProps.includes('getetag')) {
            xml += `
        <${davPrefix}:getetag>${eventEtag}</${davPrefix}:getetag>`;
          }
          if (eventSupportedProps.includes('getcontenttype')) {
            xml += `
        <${davPrefix}:getcontenttype>text/calendar; component=vevent</${davPrefix}:getcontenttype>`;
          }
          
          xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
        }
        
        if (eventUnsupportedProps.length > 0) {
          xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
          
          eventUnsupportedProps.forEach(prop => {
            const propXml = formatUnsupportedProperty(prop, originalCase);
            const propXmlWithPrefix = propXml.replace(/<D:/g, `<${davPrefix}:`).replace(/<\/D:/g, `</${davPrefix}:`);
            xml += `
        ${propXmlWithPrefix}`;
          });
          
          xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 404 Not Found</${davPrefix}:status>
    </${davPrefix}:propstat>`;
        }
        
        xml += `
  </${davPrefix}:response>`;
      }
    }

    xml += `
</${davPrefix}:multistatus>`;

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
    
    // Check if this is a calendar-multiget query
    const isMultiget = bodyLower.includes('calendar-multiget') || bodyLower.includes('multiget');
    const { requested, hasScheduleTag, hasCreatedBy, hasUpdatedBy } = parseRequestedProperties(body);
    const hasUnsupportedProps = hasScheduleTag || hasCreatedBy || hasUpdatedBy;
    
    // CRITICAL: Extract DAV namespace prefix from request (macOS uses A: instead of D:)
    const davPrefix = extractDavPrefix(body);
    
    // Extract namespace prefixes from request to match client's usage
    const { caldavPrefix, csPrefix } = extractNamespacePrefixes(body);
    
    // Build namespace declarations - handle prefix conflicts
    // If client uses same prefix for both namespaces, we need to use different ones in response
    let namespaceDecls = `xmlns:${davPrefix}="${DAV_NS}"`;
    let caldavPropPrefix = caldavPrefix;
    let csPropPrefix = csPrefix;
    
    if (caldavPrefix === csPrefix && caldavPrefix === 'C') {
      // Client uses C: for calendarserver - use C: for CalDAV, CS: for CalendarServer
      namespaceDecls += ` xmlns:C="${CALDAV_NS}" xmlns:CS="${CS_NS}"`;
      caldavPropPrefix = 'C';
      csPropPrefix = 'CS';
    } else {
      // Use the prefixes the client specified
      namespaceDecls += ` xmlns:${caldavPrefix}="${CALDAV_NS}"`;
      if (csPrefix !== caldavPrefix) {
        namespaceDecls += ` xmlns:${csPrefix}="${CS_NS}"`;
      } else {
        // Same prefix conflict - use CS: for CalendarServer
        namespaceDecls += ` xmlns:CS="${CS_NS}"`;
        csPropPrefix = 'CS';
      }
    }

    let xml = `<?xml version="1.0" encoding="utf-8"?>
<${davPrefix}:multistatus ${namespaceDecls}>`;

    if (isMultiget) {
      // Calendar-multiget: return responses for ALL requested hrefs
      const requestedHrefs = parseMultigetHrefs(body);
      const events = await storage.getEvents({ calendarId, userId: undefined });
      
      // Create a map of event ID -> event for quick lookup
      const eventMap = new Map<number, Event>();
      events.forEach(event => {
        eventMap.set(event.id, event);
      });
      
      // Process each requested href
      for (const requestedHref of requestedHrefs) {
        // Extract event ID from href (e.g., /caldav/calendars/1/event-2.ics -> 2)
        const eventIdMatch = requestedHref.match(/event-(\d+)\.ics$/);
        const eventId = eventIdMatch ? Number(eventIdMatch[1]) : null;
        
        xml += `
  <${davPrefix}:response>
    <${davPrefix}:href>${requestedHref}</${davPrefix}:href>`;
        
        if (eventId && eventMap.has(eventId)) {
          // Event exists - return 200 OK with properties
          const event = eventMap.get(eventId)!;
          const eventIcs = generateEventICS(event, calendarId);
          // CRITICAL: Use persistent ETag from database (stable across restarts)
          const eventEtag = generateEventETag(event);
          
          // CRITICAL: Always include getetag when calendar-data is returned (required for caching)
          // Thunderbird needs the ETag to cache events - without it, it will re-download forever
          const includeCalendarData = requested.has('calendar-data');
          const includeGetetag = requested.has('getetag') || includeCalendarData;
          
          // CRITICAL: Ensure eventEtag is always a valid string
          if (!eventEtag || typeof eventEtag !== 'string') {
            console.error(`[caldav] Invalid eventEtag for event ${event.id}:`, eventEtag);
          }
          
          // CRITICAL: Build prop content ensuring proper XML structure
          // Order matters: getetag must come before calendar-data
          // Build XML carefully to avoid corruption from nested template literals
          xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
          
          // CRITICAL: Always output getetag FIRST if it should be included
          // This ensures Thunderbird can cache the event properly
          if (includeGetetag) {
            xml += `
        <${davPrefix}:getetag>${eventEtag}</${davPrefix}:getetag>`;
          }
          // CRITICAL: Always output calendar-data if requested
          if (includeCalendarData) {
            xml += `
        <${caldavPropPrefix}:calendar-data><![CDATA[${eventIcs}]]></${caldavPropPrefix}:calendar-data>`;
          }
          
          xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
          
          // Unsupported properties (404 Not Found) - use same namespace prefixes as request
          if (hasUnsupportedProps) {
            xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
            
            if (hasScheduleTag) {
              xml += `
        <${caldavPropPrefix}:schedule-tag />`;
            }
            if (hasCreatedBy) {
              xml += `
        <${csPropPrefix}:created-by />`;
            }
            if (hasUpdatedBy) {
              xml += `
        <${csPropPrefix}:updated-by />`;
            }
            
            xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 404 Not Found</${davPrefix}:status>
    </${davPrefix}:propstat>`;
          }
        } else {
          // Event doesn't exist - return 404 Not Found
          // CRITICAL: Must return proper 404 response for missing events
          xml += `
    <${davPrefix}:status>HTTP/1.1 404 Not Found</${davPrefix}:status>`;
        }
        
        xml += `
  </${davPrefix}:response>`;
      }
    } else {
      // Regular calendar-query: return all events
      const events = await storage.getEvents({ calendarId, userId: undefined });

    for (const event of events) {
      const eventIcs = generateEventICS(event, calendarId);
      // CRITICAL: Use persistent ETag from database (stable across restarts)
      const eventEtag = generateEventETag(event);
        const relativeHref = `/caldav/calendars/${calendarId}/event-${event.id}.ics`;
        
      xml += `
  <${davPrefix}:response>
    <${davPrefix}:href>${relativeHref}</${davPrefix}:href>`;
        
        // First propstat: supported properties (200 OK)
        xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
        
        // CRITICAL: Always include getetag when calendar-data is returned (required for caching)
        // Thunderbird needs the ETag to cache events - without it, it will re-download forever
        // MUST include getetag if either:
        // 1. getetag was explicitly requested, OR
        // 2. calendar-data is being returned (Thunderbird requires ETag with calendar-data)
        const includeCalendarData = requested.has('calendar-data');
        const includeGetetag = requested.has('getetag') || includeCalendarData;
        
        // CRITICAL: Always output getetag first if it should be included
        if (includeGetetag) {
          xml += `
        <${davPrefix}:getetag>${eventEtag}</${davPrefix}:getetag>`;
        }
        // CRITICAL: Always output calendar-data if requested
        if (includeCalendarData) {
          xml += `
        <${caldavPropPrefix}:calendar-data><![CDATA[${eventIcs}]]></${caldavPropPrefix}:calendar-data>`;
        }
        
        xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
        
        // Second propstat: unsupported properties (404 Not Found) - use same namespace prefixes
        if (hasUnsupportedProps) {
          xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
          
          if (hasScheduleTag) {
            xml += `
        <${caldavPropPrefix}:schedule-tag />`;
          }
          if (hasCreatedBy) {
            xml += `
        <${csPropPrefix}:created-by />`;
          }
          if (hasUpdatedBy) {
            xml += `
        <${csPropPrefix}:updated-by />`;
          }
          
          xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 404 Not Found</${davPrefix}:status>
    </${davPrefix}:propstat>`;
        }
        
        xml += `
  </${davPrefix}:response>`;
      }
    }

    xml += `
</${davPrefix}:multistatus>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
    return;
  }

  if (method === "PROPPATCH") {
    const body = typeof req.body === 'string' ? req.body : '';
    const { properties } = parseProppatchProperties(body);
    
    // CRITICAL: Extract DAV namespace prefix from request (macOS uses A: instead of D:)
    const davPrefix = extractDavPrefix(body);
    
    // CRITICAL: Match the exact path from request (preserve trailing slash)
    // Use relative URI (path-absolute) to match PROPFIND responses
    const relativeHref = req.path.endsWith('/') ? `/caldav/calendars/${calendarId}/` : `/caldav/calendars/${calendarId}`;
    
    // Extract Apple namespace prefix from request
    // macOS uses D: for Apple namespace, but we'll use APPLE: to avoid conflict
    let applePrefix = 'D';
    const appleNsMatch = body.match(/xmlns:([^=]+)="http:\/\/apple\.com\/ns\/ical\/"/i);
    if (appleNsMatch) {
      applePrefix = appleNsMatch[1];
    }
    
    // Separate supported and unsupported properties
    // We don't support Apple's calendar-order extension
    const supportedProps: typeof properties = [];
    const unsupportedProps: typeof properties = [];
    
    properties.forEach(prop => {
      if (prop.namespace === 'http://apple.com/ns/ical/' && prop.name === 'calendar-order') {
        unsupportedProps.push(prop);
      } else {
        // For now, we don't support any property updates
        // You can add support for other properties here in the future
        unsupportedProps.push(prop);
      }
    });
    
    // Build response
    let xml = `<?xml version="1.0" encoding="utf-8"?>
<${davPrefix}:multistatus xmlns:${davPrefix}="${DAV_NS}" xmlns:APPLE="http://apple.com/ns/ical/">
  <${davPrefix}:response>
    <${davPrefix}:href>${relativeHref}</${davPrefix}:href>`;
    
    // Helper function to determine namespace prefix for a property
    const getPropPrefix = (prop: {namespace: string, prefix: string}): string => {
      if (prop.namespace === 'http://apple.com/ns/ical/') {
        return 'APPLE';
      } else if (prop.namespace === CALDAV_NS) {
        return 'C';
      } else if (prop.namespace === CS_NS) {
        return 'CS';
      } else {
        return davPrefix;
      }
    };
    
    // Echo back supported properties (200 OK)
    if (supportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      supportedProps.forEach(prop => {
        const propPrefix = getPropPrefix(prop);
        if (prop.value.trim()) {
          xml += `
        <${propPrefix}:${prop.name}>${escapeXml(prop.value)}</${propPrefix}:${prop.name}>`;
        } else {
          xml += `
        <${propPrefix}:${prop.name}/>`;
        }
      });
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    // Echo back unsupported properties (403 Forbidden for calendar-order)
    if (unsupportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      unsupportedProps.forEach(prop => {
        const propPrefix = getPropPrefix(prop);
        // CRITICAL: Must echo back the property name, even if we reject it
        xml += `
        <${propPrefix}:${prop.name}/>`;
      });
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 403 Forbidden</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    // If no properties found in request, return empty propstat
    if (properties.length === 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop/>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    xml += `
  </${davPrefix}:response>
</${davPrefix}:multistatus>`;

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

// Handle nested principal paths like /caldav/principals/1/1/
// This route must come BEFORE /principals/:id to match more specific paths first
router.all("/principals/:id/:subId", caldavAuth, async (req: AuthenticatedRequest, res: Response) => {
  const method = req.method.toUpperCase();
  const calendar = req.calendar!;
  const calendarId = calendar.id;
  
  // For nested principal paths like /principals/1/1/, treat it the same as /principals/1/
  // The subId might be redundant or used for user identification
  
  if (method === "OPTIONS") {
    // CRITICAL: Principal URLs must advertise CalDAV compliance classes
    res.setHeader("Allow", "OPTIONS, PROPFIND, REPORT");
    res.setHeader("DAV", "1, 2, calendar-access, calendar-proxy, calendar-schedule");
    res.setHeader("Content-Length", "0");
    res.status(200).end();
    return;
  }

  if (method === "PROPFIND") {
    const body = typeof req.body === 'string' ? req.body : '';
    const { requested, originalCase } = parsePropfindProperties(body);
    // CRITICAL: Extract DAV namespace prefix from request (macOS uses A: instead of D:)
    const davPrefix = extractDavPrefix(body);
    // CRITICAL: Match the exact path from request (preserve trailing slash)
    const relativeHref = req.path.endsWith('/') ? `/caldav/principals/${req.params.id}/${req.params.subId}/` : `/caldav/principals/${req.params.id}/${req.params.subId}`;
    
    // CRITICAL: Principal URL must match exactly what's configured in routing
    const principalHref = relativeHref;
    
    // If no properties requested, default to resourcetype
    if (requested.size === 0) {
      requested.add('resourcetype');
    }
    
    let xml = `<?xml version="1.0" encoding="utf-8"?>
<${davPrefix}:multistatus xmlns:${davPrefix}="${DAV_NS}" xmlns:C="${CALDAV_NS}" xmlns:CS="${CS_NS}">
  <${davPrefix}:response>
    <${davPrefix}:href>${relativeHref}</${davPrefix}:href>`;
    
    const supportedProps: string[] = [];
    const unsupportedProps: string[] = [];
    
    if (requested.has('resourcetype')) {
      supportedProps.push('resourcetype');
    }
    if (requested.has('displayname')) {
      supportedProps.push('displayname');
    }
    if (requested.has('calendar-home-set')) {
      supportedProps.push('calendar-home-set');
    }
    if (requested.has('email-address-set')) {
      supportedProps.push('email-address-set');
    }
    if (requested.has('current-user-principal')) {
      supportedProps.push('current-user-principal');
    }
    if (requested.has('owner')) {
      supportedProps.push('owner');
    }
    
    requested.forEach(prop => {
      if (!supportedProps.includes(prop)) {
        unsupportedProps.push(prop);
      }
    });
    
    // Get user email from calendar share or use a default
    let userEmail = req.caldavShare?.username || 'user@example.com';
    if (userEmail && !userEmail.includes('@')) {
      userEmail = `${userEmail}@glasscal.local`;
    }
    
    if (supportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      if (supportedProps.includes('resourcetype')) {
        xml += `
        <${davPrefix}:resourcetype><${davPrefix}:principal/></${davPrefix}:resourcetype>`;
      }
      if (supportedProps.includes('displayname')) {
        xml += `
        <${davPrefix}:displayname>Calendar User</${davPrefix}:displayname>`;
      }
      if (supportedProps.includes('calendar-home-set')) {
        const calendarHomeHref = `/caldav/calendars/${calendarId}/`;
        xml += `
        <C:calendar-home-set>
          <${davPrefix}:href>${calendarHomeHref}</${davPrefix}:href>
        </C:calendar-home-set>`;
      }
      if (supportedProps.includes('email-address-set')) {
        xml += `
        <C:email-address-set>
          <C:email-address>${escapeXml(userEmail)}</C:email-address>
        </C:email-address-set>`;
      }
      if (supportedProps.includes('current-user-principal')) {
        // CRITICAL: Use consistent principal URL that matches routing
        xml += `
        <${davPrefix}:current-user-principal>
          <${davPrefix}:href>${principalHref}</${davPrefix}:href>
        </${davPrefix}:current-user-principal>`;
      }
      if (supportedProps.includes('owner')) {
        xml += `
        <${davPrefix}:owner><${davPrefix}:href>${principalHref}</${davPrefix}:href></${davPrefix}:owner>`;
      }
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    if (unsupportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      unsupportedProps.forEach(prop => {
        const propXml = formatUnsupportedProperty(prop, originalCase);
        const propXmlWithPrefix = propXml.replace(/<D:/g, `<${davPrefix}:`).replace(/<\/D:/g, `</${davPrefix}:`);
        xml += `
        ${propXmlWithPrefix}`;
      });
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 404 Not Found</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    xml += `
  </${davPrefix}:response>
</${davPrefix}:multistatus>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(207).send(xml);
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
    // CRITICAL: Principal URLs must advertise CalDAV compliance classes
    // This tells macOS that this is a valid principal resource
    res.setHeader("Allow", "OPTIONS, PROPFIND, REPORT");
    res.setHeader("DAV", "1, 2, calendar-access, calendar-proxy, calendar-schedule");
    res.setHeader("Content-Length", "0");
    res.status(200).end();
    return;
  }

  if (method === "PROPFIND") {
    const body = typeof req.body === 'string' ? req.body : '';
    const { requested, originalCase } = parsePropfindProperties(body);
    // CRITICAL: Extract DAV namespace prefix from request (macOS uses A: instead of D:)
    const davPrefix = extractDavPrefix(body);
    // CRITICAL: Match the exact path from request (preserve trailing slash)
    const relativeHref = req.path.endsWith('/') ? `/caldav/principals/${calendarId}/` : `/caldav/principals/${calendarId}`;
    
    // CRITICAL: Principal URL must match exactly what's configured in routing
    // Use the same href format for consistency
    const principalHref = relativeHref;
    
    // If no properties requested, default to resourcetype
    if (requested.size === 0) {
      requested.add('resourcetype');
    }
    
    let xml = `<?xml version="1.0" encoding="utf-8"?>
<${davPrefix}:multistatus xmlns:${davPrefix}="${DAV_NS}" xmlns:C="${CALDAV_NS}" xmlns:CS="${CS_NS}">
  <${davPrefix}:response>
    <${davPrefix}:href>${relativeHref}</${davPrefix}:href>`;
    
    const supportedProps: string[] = [];
    const unsupportedProps: string[] = [];
    
    if (requested.has('resourcetype')) {
      supportedProps.push('resourcetype');
    }
    if (requested.has('displayname')) {
      supportedProps.push('displayname');
    }
    if (requested.has('calendar-home-set')) {
      supportedProps.push('calendar-home-set');
    }
    if (requested.has('email-address-set')) {
      supportedProps.push('email-address-set');
    }
    if (requested.has('current-user-principal')) {
      supportedProps.push('current-user-principal');
    }
    if (requested.has('owner')) {
      supportedProps.push('owner');
    }
    
    requested.forEach(prop => {
      if (!supportedProps.includes(prop)) {
        unsupportedProps.push(prop);
      }
    });
    
    // Get user email - use caldavShare username if it looks like an email, otherwise construct one
    // For CalDAV, the username is often the email address
    let userEmail = req.caldavShare?.username || 'user@example.com';
    if (userEmail && !userEmail.includes('@')) {
      // If username doesn't look like an email, try to get from calendar owner
      // For now, use a default format
      userEmail = `${userEmail}@glasscal.local`;
    }
    
    if (supportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      if (supportedProps.includes('resourcetype')) {
        xml += `
        <${davPrefix}:resourcetype><${davPrefix}:principal/></${davPrefix}:resourcetype>`;
      }
      if (supportedProps.includes('displayname')) {
        xml += `
        <${davPrefix}:displayname>Calendar User</${davPrefix}:displayname>`;
      }
      if (supportedProps.includes('calendar-home-set')) {
        // CRITICAL: Fix path construction - should be /calendars/{calendarId}/ not /calendars/{calendarId}/{calendarId}/
        const calendarHomeHref = `/caldav/calendars/${calendarId}/`;
        xml += `
        <C:calendar-home-set>
          <${davPrefix}:href>${calendarHomeHref}</${davPrefix}:href>
        </C:calendar-home-set>`;
      }
      if (supportedProps.includes('email-address-set')) {
        // macOS Calendar requests email-address-set for calendar invites
        xml += `
        <C:email-address-set>
          <C:email-address>${escapeXml(userEmail)}</C:email-address>
        </C:email-address-set>`;
      }
      if (supportedProps.includes('current-user-principal')) {
        // CRITICAL: Use consistent principal URL that matches routing
        xml += `
        <${davPrefix}:current-user-principal>
          <${davPrefix}:href>${principalHref}</${davPrefix}:href>
        </${davPrefix}:current-user-principal>`;
      }
      if (supportedProps.includes('owner')) {
        xml += `
        <${davPrefix}:owner><${davPrefix}:href>${principalHref}</${davPrefix}:href></${davPrefix}:owner>`;
      }
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 200 OK</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    if (unsupportedProps.length > 0) {
      xml += `
    <${davPrefix}:propstat>
      <${davPrefix}:prop>`;
      
      unsupportedProps.forEach(prop => {
        const propXml = formatUnsupportedProperty(prop, originalCase);
        const propXmlWithPrefix = propXml.replace(/<D:/g, `<${davPrefix}:`).replace(/<\/D:/g, `</${davPrefix}:`);
        xml += `
        ${propXmlWithPrefix}`;
      });
      
      xml += `
      </${davPrefix}:prop>
      <${davPrefix}:status>HTTP/1.1 404 Not Found</${davPrefix}:status>
    </${davPrefix}:propstat>`;
    }
    
    xml += `
  </${davPrefix}:response>
</${davPrefix}:multistatus>`;

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
  // CRITICAL: Use persistent ETag from database (stable across restarts)
  const etag = generateEventETag(event);

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("ETag", etag);
  res.send(ics);
});

export default router;
