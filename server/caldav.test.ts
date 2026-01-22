import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import caldavRouter from "./caldav";

// Mock the storage module
vi.mock("./storage", () => ({
  storage: {
    getCaldavShareByUsername: vi.fn().mockImplementation(async (username: string) => {
      if (username === "cal_1") {
        return {
          id: 1,
          calendarId: 1,
          username: "cal_1",
          password: "testpassword123",
          createdAt: new Date(),
        };
      }
      return null;
    }),
    getCalendar: vi.fn().mockImplementation(async (id: number) => {
      if (id === 1) {
        return {
          id: 1,
          title: "Test Calendar",
          description: "A test calendar",
          color: "#3b82f6",
          ownerId: "user123",
          createdAt: new Date("2025-01-01T00:00:00Z"),
          updatedAt: new Date("2025-01-16T08:53:36.490Z"),
          caldavOrder: 3,
          caldavColor: "#FF5733FF",
        };
      }
      return null;
    }),
    updateCalendar: vi.fn().mockImplementation(async (id: number, updates: any) => {
      return {
        id,
        title: "Test Calendar",
        description: "A test calendar",
        color: "#3b82f6",
        ownerId: "user123",
        createdAt: new Date("2025-01-01T00:00:00Z"),
        updatedAt: new Date(),
        caldavOrder: updates.caldavOrder ?? 3,
        caldavColor: updates.caldavColor ?? "#FF5733FF",
      };
    }),
    getCaldavShare: vi.fn().mockImplementation(async (calendarId: number) => {
      if (calendarId === 1) {
        return {
          id: 1,
          calendarId: 1,
          username: "cal_1",
          password: "testpassword123",
          createdAt: new Date(),
        };
      }
      return null;
    }),
    getEventsByCalendar: vi.fn().mockImplementation(async (calendarId: number) => {
      if (calendarId === 1) {
        return [
          {
            id: 1,
            calendarId: 1,
            title: "Test Event",
            description: "Test description",
            location: "Test location",
            startTime: new Date("2025-01-16T10:00:00Z"),
            endTime: new Date("2025-01-16T11:00:00Z"),
            color: "#3b82f6",
            recurrence: null,
            createdBy: "user123",
            createdAt: new Date("2025-01-15T00:00:00Z"),
            updatedAt: new Date("2025-01-16T08:53:36.505Z"),
          },
        ];
      }
      return [];
    }),
    getEvents: vi.fn().mockImplementation(async ({ calendarId }: { calendarId?: number }) => {
      if (calendarId === 1) {
        return [
          {
            id: 1,
            calendarId: 1,
            title: "Test Event",
            description: "Test description",
            location: "Test location",
            startTime: new Date("2025-01-16T10:00:00Z"),
            endTime: new Date("2025-01-16T11:00:00Z"),
            color: "#3b82f6",
            recurrence: null,
            createdBy: "user123",
            createdAt: new Date("2025-01-15T00:00:00Z"),
            updatedAt: new Date("2025-01-16T08:53:36.505Z"),
          },
        ];
      }
      return [];
    }),
    getEvent: vi.fn().mockImplementation(async (id: number) => {
      if (id === 1) {
        return {
          id: 1,
          calendarId: 1,
          title: "Test Event",
          description: "Test description",
          location: "Test location",
          startTime: new Date("2025-01-16T10:00:00Z"),
          endTime: new Date("2025-01-16T11:00:00Z"),
          color: "#3b82f6",
          recurrence: null,
          createdBy: "user123",
          createdAt: new Date("2025-01-15T00:00:00Z"),
          updatedAt: new Date("2025-01-16T08:53:36.505Z"),
        };
      }
      return null;
    }),
  },
}));

// Create test app
function createTestApp() {
  const app = express();
  app.use("/caldav", caldavRouter);
  return app;
}

// Helper to create Basic Auth header
function basicAuth(username: string, password: string): string {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
}

let app: express.Application;

beforeAll(() => {
  app = createTestApp();
});

describe("CalDAV Protocol Tests - Thunderbird Compatibility", () => {

  describe("Test Case 1: PROPFIND with Depth: 0 requesting getctag", () => {
    it("should return getctag in CalendarServer namespace (CS:) format", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D='DAV:' xmlns:CS='http://calendarserver.org/ns/'><D:prop><CS:getctag/></D:prop></D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "0")
        .send(requestBody);

      expect(response.status).toBe(207);
      expect(response.headers["content-type"]).toMatch(/application\/xml/);

      const body = response.text;

      // Verify XML structure
      expect(body).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(body).toContain("<D:multistatus");
      expect(body).toContain('xmlns:D="DAV:"');
      expect(body).toContain('xmlns:CS="http://calendarserver.org/ns/"');

      // Verify response contains the calendar href
      expect(body).toContain("<D:href>/caldav/calendars/1/</D:href>");

      // Verify getctag is present with CS: namespace prefix
      expect(body).toMatch(/<CS:getctag>"[^"]+?"<\/CS:getctag>/);

      // Verify status
      expect(body).toContain("<D:status>HTTP/1.1 200 OK</D:status>");

      // Verify proper XML closing tags
      expect(body).toContain("</D:propstat>");
      expect(body).toContain("</D:response>");
      expect(body).toContain("</D:multistatus>");
    });

    it("should include the CS namespace declaration when getctag is requested", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D='DAV:' xmlns:CS='http://calendarserver.org/ns/'><D:prop><CS:getctag/></D:prop></D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "0")
        .send(requestBody);

      expect(response.status).toBe(207);

      // The CS namespace MUST be declared when CS:getctag is used
      expect(response.text).toContain('xmlns:CS="http://calendarserver.org/ns/"');
    });

    it("should return 401 without authentication", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D='DAV:' xmlns:CS='http://calendarserver.org/ns/'><D:prop><CS:getctag/></D:prop></D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "0")
        .send(requestBody);

      expect(response.status).toBe(401);
      expect(response.headers["www-authenticate"]).toContain("Basic");
    });

    it("should return 401 with wrong password", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D='DAV:' xmlns:CS='http://calendarserver.org/ns/'><D:prop><CS:getctag/></D:prop></D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "wrongpassword"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "0")
        .send(requestBody);

      expect(response.status).toBe(401);
    });
  });

  describe("Test Case 2: PROPFIND with Depth: 1 requesting resourcetype, getetag, getcontenttype", () => {
    it("should return calendar collection and event resources with proper properties", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:getcontenttype/><D:resourcetype/><D:getetag/></D:prop></D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "1")
        .send(requestBody);

      expect(response.status).toBe(207);
      expect(response.headers["content-type"]).toMatch(/application\/xml/);

      const body = response.text;

      // Verify XML structure
      expect(body).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(body).toContain("<D:multistatus");
      expect(body).toContain('xmlns:D="DAV:"');
      expect(body).toContain('xmlns:C="urn:ietf:params:xml:ns:caldav"');

      // Verify calendar collection response
      expect(body).toContain("<D:href>/caldav/calendars/1/</D:href>");
      expect(body).toContain("<D:collection/>");
      expect(body).toContain("<C:calendar/>");

      // Calendar collection should have getetag
      expect(body).toMatch(/<D:getetag>"[^"]+?"<\/D:getetag>/);

      // Calendar getcontenttype should be 404 (not applicable to collections)
      expect(body).toContain("<D:getcontenttype />");
      expect(body).toContain("<D:status>HTTP/1.1 404 Not Found</D:status>");

      // Verify event resource response
      expect(body).toMatch(/<D:href>\/caldav\/calendars\/1\/event-\d+\.ics<\/D:href>/);

      // Event should have getetag
      expect(body).toMatch(/<D:getetag>"event-\d+-[^"]+?"<\/D:getetag>/);

      // Event should have getcontenttype with vevent component
      expect(body).toContain("<D:getcontenttype>text/calendar; component=VEVENT</D:getcontenttype>");
      
      // Verify proper structure
      expect(body).toContain("</D:propstat>");
      expect(body).toContain("</D:response>");
      expect(body).toContain("</D:multistatus>");
    });

    it("should list all events in the calendar", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:getcontenttype/><D:resourcetype/><D:getetag/></D:prop></D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "1")
        .send(requestBody);

      expect(response.status).toBe(207);

      const body = response.text;

      // Should contain at least 2 response elements (calendar + at least 1 event)
      const responseCount = (body.match(/<D:response>/g) || []).length;
      expect(responseCount).toBeGreaterThanOrEqual(2);

      // Verify event href format
      expect(body).toContain("/caldav/calendars/1/event-1.ics");
    });

    it("should return resourcetype with collection and calendar for the calendar itself", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "0")
        .send(requestBody);

      expect(response.status).toBe(207);

      const body = response.text;

      // Calendar collection MUST have both collection and calendar in resourcetype
      expect(body).toContain("<D:resourcetype>");
      expect(body).toContain("<D:collection/>");
      expect(body).toContain("<C:calendar/>");
      expect(body).toContain("</D:resourcetype>");
    });
  });

  describe("Test Case 3: PROPPATCH for APPLE:calendar-order and calendar-color", () => {
    it("should return 200 OK for APPLE:calendar-order", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<A:propertyupdate xmlns:A="DAV:" xmlns:D="http://apple.com/ns/ical/">
  <A:set>
    <A:prop>
      <D:calendar-order>1</D:calendar-order>
    </A:prop>
  </A:set>
</A:propertyupdate>`;

      const response = await request(app)
        .proppatch("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .send(requestBody);

      expect(response.status).toBe(207);
      expect(response.headers["content-type"]).toMatch(/application\/xml/);

      const body = response.text;

      // Verify XML structure
      expect(body).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(body).toContain("<A:multistatus");
      expect(body).toContain('xmlns:A="DAV:"');
      expect(body).toContain('xmlns:APPLE="http://apple.com/ns/ical/"');

      // CRITICAL: Must return 200 OK for calendar-order (not 403 Forbidden)
      expect(body).toContain("<APPLE:calendar-order");
      expect(body).toContain("<A:status>HTTP/1.1 200 OK</A:status>");

      // Must NOT contain 403 Forbidden
      expect(body).not.toContain("403 Forbidden");
    });

    it("should return 200 OK for APPLE:calendar-color", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<A:propertyupdate xmlns:A="DAV:" xmlns:D="http://apple.com/ns/ical/">
  <A:set>
    <A:prop>
      <D:calendar-color>#FF5733FF</D:calendar-color>
    </A:prop>
  </A:set>
</A:propertyupdate>`;

      const response = await request(app)
        .proppatch("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .send(requestBody);

      expect(response.status).toBe(207);

      const body = response.text;

      // CRITICAL: Must return 200 OK for calendar-color
      expect(body).toContain("<APPLE:calendar-color");
      expect(body).toContain("<A:status>HTTP/1.1 200 OK</A:status>");
      expect(body).not.toContain("403 Forbidden");
    });

    it("should return 200 OK for both calendar-order and calendar-color in same request", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<A:propertyupdate xmlns:A="DAV:" xmlns:D="http://apple.com/ns/ical/">
  <A:set>
    <A:prop>
      <D:calendar-order>5</D:calendar-order>
      <D:calendar-color>#00FF00FF</D:calendar-color>
    </A:prop>
  </A:set>
</A:propertyupdate>`;

      const response = await request(app)
        .proppatch("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .send(requestBody);

      expect(response.status).toBe(207);

      const body = response.text;

      // Both properties should be accepted
      expect(body).toContain("<APPLE:calendar-order");
      expect(body).toContain("<APPLE:calendar-color");
      expect(body).toContain("<A:status>HTTP/1.1 200 OK</A:status>");
      expect(body).not.toContain("403 Forbidden");
    });
  });

  describe("Test Case 4: PROPFIND returns calendar-order and calendar-color", () => {
    it("should return stored calendar-order value", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:APPLE="http://apple.com/ns/ical/">
  <D:prop>
    <APPLE:calendar-order/>
  </D:prop>
</D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "0")
        .send(requestBody);

      expect(response.status).toBe(207);

      const body = response.text;

      // Should return calendar-order with the stored value (3 from mock)
      expect(body).toContain("calendar-order");
      expect(body).toContain(">3<");
      expect(body).toContain("<D:status>HTTP/1.1 200 OK</D:status>");
      // Must NOT return 404 for calendar-order
      expect(body).not.toContain("404 Not Found");
    });

    it("should return stored calendar-color value", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:APPLE="http://apple.com/ns/ical/">
  <D:prop>
    <APPLE:calendar-color/>
  </D:prop>
</D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "0")
        .send(requestBody);

      expect(response.status).toBe(207);

      const body = response.text;

      // Should return calendar-color with the stored value (#FF5733FF from mock)
      expect(body).toContain("calendar-color");
      expect(body).toContain("#FF5733FF");
      expect(body).toContain("<D:status>HTTP/1.1 200 OK</D:status>");
      // Must NOT return 404 for calendar-color
      expect(body).not.toContain("404 Not Found");
    });

    it("should return both calendar-order and calendar-color in same request", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:APPLE="http://apple.com/ns/ical/">
  <D:prop>
    <APPLE:calendar-order/>
    <APPLE:calendar-color/>
  </D:prop>
</D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "0")
        .send(requestBody);

      expect(response.status).toBe(207);

      const body = response.text;

      // Both properties should be present with stored values
      expect(body).toContain("calendar-order");
      expect(body).toContain(">3<");
      expect(body).toContain("calendar-color");
      expect(body).toContain("#FF5733FF");
      expect(body).toContain("<D:status>HTTP/1.1 200 OK</D:status>");
    });

    it("should declare APPLE namespace at multistatus root level", async () => {
      const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<D:propfind xmlns:D="DAV:" xmlns:APPLE="http://apple.com/ns/ical/">
  <D:prop>
    <APPLE:calendar-order/>
  </D:prop>
</D:propfind>`;

      const response = await request(app)
        .propfind("/caldav/calendars/1/")
        .set("Authorization", basicAuth("cal_1", "testpassword123"))
        .set("Content-Type", "text/xml; charset=utf-8")
        .set("Depth", "0")
        .send(requestBody);

      expect(response.status).toBe(207);

      const body = response.text;

      // APPLE namespace MUST be declared at multistatus level (not inline)
      expect(body).toContain('xmlns:APPLE="http://apple.com/ns/ical/"');
      
      // The multistatus element should include all namespace declarations
      expect(body).toMatch(/<D:multistatus[^>]*xmlns:APPLE="http:\/\/apple\.com\/ns\/ical\/"/);
    });
  });
});

describe("CalDAV Protocol Tests - macOS Compatibility", () => {
  it("Test Case 1: OPTIONS /caldav/principals/1/ without authentication", async () => {
    const headers = {
      "host": "0eb9ab60-edd8-436f-922e-a1f5e238b899-00-gz2yrsy04t12.picard.replit.dev",
      "user-agent": "macOS/15.7.3 (24G419) dataaccessd/1.0",
      "accept": "*/*",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "en-GB,en;q=0.9",
      "x-forwarded-for": "94.246.111.207, 10.81.6.57",
      "x-forwarded-proto": "https",
      "x-replit-user-bio": "",
      "x-replit-user-id": "",
      "x-replit-user-name": "",
      "x-replit-user-profile-image": "",
      "x-replit-user-roles": "",
      "x-replit-user-teams": "",
      "x-replit-user-url": ""
    };

    const response = await request(app)
      .options("/caldav/principals/1/")
      .set(headers);

    expect(response.status).toBe(401);
    expect(response.text).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(response.text).toContain('<error xmlns="DAV:">Authentication required</error>');
  });

  it("Test Case 2: OPTIONS /caldav/principals/1/ with authentication", async () => {
    const headers = {
      "host": "0eb9ab60-edd8-436f-922e-a1f5e238b899-00-gz2yrsy04t12.picard.replit.dev",
      "user-agent": "macOS/15.7.3 (24G419) dataaccessd/1.0",
      "accept": "*/*",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "en-GB,en;q=0.9",
      "authorization": basicAuth("cal_1", "testpassword123"),
      "x-forwarded-for": "94.246.111.207, 10.81.6.57",
      "x-forwarded-proto": "https",
      "x-replit-user-bio": "",
      "x-replit-user-id": "",
      "x-replit-user-name": "",
      "x-replit-user-profile-image": "",
      "x-replit-user-roles": "",
      "x-replit-user-teams": "",
      "x-replit-user-url": ""
    };

    const response = await request(app)
      .options("/caldav/principals/1/")
      .set(headers);

    expect(response.status).toBe(200);
    
    // Verifying the specific XML response body requested
    expect(response.text).empty
  });

  it("Test Case 3: PROPFIND /caldav/principals/1/ (Principal Discovery)", async () => {
    const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <B:calendar-home-set xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <B:calendar-user-address-set xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <A:current-user-principal/>
    <A:displayname/>
    <C:dropbox-home-URL xmlns:C="http://calendarserver.org/ns/"/>
    <C:email-address-set xmlns:C="http://calendarserver.org/ns/"/>
    <B:max-attendees-per-instance xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <C:notification-URL xmlns:C="http://calendarserver.org/ns/"/>
    <A:principal-collection-set/>
    <A:principal-URL/>
    <A:resource-id/>
    <B:schedule-inbox-URL xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <B:schedule-outbox-URL xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <A:supported-report-set/>
  </A:prop>
</A:propfind>`;

    const response = await request(app)
      .propfind("/caldav/principals/1/")
      .set("Authorization", basicAuth("cal_1", "testpassword123"))
      .set("Content-Type", "text/xml")
      .set("Depth", "0")
      .send(requestBody);

    expect(response.status).toBe(207);
    const body = response.text;

    // 1. Verify basic XML structure and namespaces
    expect(body).toContain('xmlns:A="DAV:"');
    expect(body).toContain('xmlns:C="urn:ietf:params:xml:ns:caldav"');

    // 2. Verify the Calendar Home Set (The most important part for discovery)
    // This tells the Mac where to actually look for calendar collections
    expect(body).toContain("<C:calendar-home-set>");
    expect(body).toContain("<A:href>/caldav/calendars/1/</A:href>");
    expect(body).toContain("</C:calendar-home-set>");

    // 3. Verify Identity properties
    expect(body).toContain("<A:displayname>cal_1</A:displayname>");
    expect(body).toContain("<A:current-user-principal>");
    expect(body).toContain("<A:href>/caldav/principals/1/</A:href>");

    // 4. Verify 200 OK section exists for supported props
    expect(body).toMatch(/<A:propstat>[\s\S]*<A:status>HTTP\/1\.1 200 OK<\/A:status>/);

    // 5. Verify 404 section exists for unsupported props (like dropbox-home-URL)
    // macOS expects a 404 status for properties the server doesn't support
    expect(body).toMatch(/<A:propstat>[\s\S]*<A:status>HTTP\/1\.1 404 Not Found<\/A:status>/);
  });

  it("Test Case 5: PROPFIND /caldav/calendars/1/ with Depth: 0 (Collection Validation)", async () => {
    // Note: A PROPFIND without a body usually implies allprop or a basic property set
    // In your curl example, no body was sent, so we test the response headers and resourcetype
    const response = await request(app)
      .propfind("/caldav/calendars/1/")
      .set("Authorization", basicAuth("cal_1", "testpassword123"))
      .set("Depth", "0")
      .send(); // Sending no body as per the curl command

    expect(response.status).toBe(207);
    
    // 1. Verify Headers
    expect(response.headers["content-type"]).toMatch(/application\/xml/);
    // macOS uses the ETag to know if the calendar collection itself (metadata) has changed
    expect(response.headers["etag"]).toBeDefined(); 

    const body = response.text;

    // 2. Verify XML structure and Namespace declarations
    expect(body).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(body).toContain('xmlns:D="DAV:"');
    expect(body).toContain('xmlns:C="urn:ietf:params:xml:ns:caldav"');
    
    // 3. Verify the core requirement: Resource Type
    // This is the "Identity" of the calendar. 
    // It must be both a WebDAV Collection AND a CalDAV Calendar.
    expect(body).toContain("<D:resourcetype>");
    expect(body).toContain("<D:collection/>");
    expect(body).toContain("<C:calendar/>");
    expect(body).toContain("</D:resourcetype>");

    // 4. Verify the response matches the requested path
    expect(body).toContain("<D:href>/caldav/calendars/1/</D:href>");

    // 5. Verify the property was found successfully
    expect(body).toContain("<D:status>HTTP/1.1 200 OK</D:status>");
  });

it("Test Case 6: PROPFIND /caldav/calendars/1/ with Depth: 1 (Event Enumeration)", async () => {
    const response = await request(app)
      .propfind("/caldav/calendars/1/")
      .set("Authorization", basicAuth("cal_1", "testpassword123"))
      .set("Depth", "1")
      .send();

    expect(response.status).toBe(207);
    const body = response.text;

    // 1. Verify the Collection itself is still the first response
    expect(body).toContain("<D:href>/caldav/calendars/1/</D:href>");
    expect(body).toContain("<D:collection/>");

    // 2. Verify individual Event resources are present
    // We check for the specific naming convention used in your app
    expect(body).toContain("<D:href>/caldav/calendars/1/event-1.ics</D:href>");

    // 3. Verify core properties for events
    // Every event MUST have an ETag and a Content-Type for the Mac to accept it
    const eventResponses = body.split("<D:response>").slice(2); // Skip the first response (collection)
    
    eventResponses.forEach(eventXml => {
      // Each event must have an ETag
      expect(eventXml).toContain("<D:getetag>");
      // Each event must be identified as a VEVENT
      expect(eventXml).toContain("<D:getcontenttype>text/calendar; component=VEVENT</D:getcontenttype>");
      // Each individual status must be 200 OK
      expect(eventXml).toContain("<D:status>HTTP/1.1 200 OK</D:status>");
    });

    // 4. Verify count (optional but good for consistency)
    // Based on your curl output, you have 12 events + 1 collection = 13 total responses
    const totalResponses = (body.match(/<D:response>/g) || []).length;
    expect(totalResponses).toBeGreaterThanOrEqual(2); 
  });

it("Test Case 7: Complex PROPFIND (macOS Refresh Pattern)", async () => {
    const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <A:add-member/>
    <C:allowed-sharing-modes xmlns:C="http://calendarserver.org/ns/"/>
    <D:autoprovisioned xmlns:D="http://apple.com/ns/ical/"/>
    <E:bulk-requests xmlns:E="http://me.com/_namespace/"/>
    <B:calendar-alarm xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <D:calendar-color xmlns:D="http://apple.com/ns/ical/"/>
    <B:calendar-description xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <B:calendar-free-busy-set xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <D:calendar-order xmlns:D="http://apple.com/ns/ical/"/>
    <B:calendar-timezone xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <A:current-user-privilege-set/>
    <B:default-alarm-vevent-date xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <B:default-alarm-vevent-datetime xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <A:displayname/>
    <C:getctag xmlns:C="http://calendarserver.org/ns/"/>
    <D:language-code xmlns:D="http://apple.com/ns/ical/"/>
    <D:location-code xmlns:D="http://apple.com/ns/ical/"/>
    <B:max-attendees-per-instance xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <A:owner/>
    <C:pre-publish-url xmlns:C="http://calendarserver.org/ns/"/>
    <C:publish-url xmlns:C="http://calendarserver.org/ns/"/>
    <C:push-transports xmlns:C="http://calendarserver.org/ns/"/>
    <C:pushkey xmlns:C="http://calendarserver.org/ns/"/>
    <A:quota-available-bytes/>
    <A:quota-used-bytes/>
    <D:refreshrate xmlns:D="http://apple.com/ns/ical/"/>
    <A:resource-id/>
    <A:resourcetype/>
    <B:schedule-calendar-transp xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <B:schedule-default-calendar-URL xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <C:source xmlns:C="http://calendarserver.org/ns/"/>
    <C:subscribed-strip-alarms xmlns:C="http://calendarserver.org/ns/"/>
    <C:subscribed-strip-attachments xmlns:C="http://calendarserver.org/ns/"/>
    <C:subscribed-strip-todos xmlns:C="http://calendarserver.org/ns/"/>
    <B:supported-calendar-component-set xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <B:supported-calendar-component-sets xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <A:supported-report-set/>
    <A:sync-token/>
  </A:prop>
</A:propfind>`;

    const response = await request(app)
      .propfind("/caldav/calendars/1/")
      .set("Authorization", basicAuth("cal_1", "testpassword123"))
      .set("Content-Type", "text/xml; charset=utf-8")
      .set("Depth", "1")
      .send(requestBody);

    expect(response.status).toBe(207);
    const body = response.text;

    // 1. Verify the Calendar Collection Header (The 1st Response)
    expect(body).toContain("<A:href>/caldav/calendars/1/</A:href>");
    expect(body).toContain("<A:collection/>");
    expect(body).toContain("<C:calendar/>");

    // 2. Verify Event Enumeration (Depth: 1)
    // We expect the children (events) to be listed in the body
    expect(body).toContain("/caldav/calendars/1/event-1.ics");
    
    // 3. Verify specific required properties for events
    // Even if the request asks for 40 properties, events MUST at least return getetag and getcontenttype
    const event1 = body.split("<A:href>/caldav/calendars/1/event-1.ics</A:href>")[1];
    expect(event1).toContain("<A:getetag>");
    expect(event1).toContain("<A:getcontenttype>text/calendar; component=VEVENT</A:getcontenttype>");
    expect(event1).toContain("<A:status>HTTP/1.1 200 OK</A:status>");

    // 4. Verification of Namespace compliance
    // Your expected response uses C: for CalDAV and CS: for CalendarServer
    expect(body).toContain('xmlns:C="urn:ietf:params:xml:ns:caldav"');
    expect(body).toContain('xmlns:CS="http://calendarserver.org/ns/"');
    expect(body).toContain('xmlns:APPLE="http://apple.com/ns/ical/"');
  });

it("Test Case 8: PROPFIND /caldav/principals/1/ (Identity & Email Discovery)", async () => {
    const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <B:calendar-user-address-set xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <A:displayname/>
    <C:email-address-set xmlns:C="http://calendarserver.org/ns/"/>
  </A:prop>
</A:propfind>`;

    const response = await request(app)
      .propfind("/caldav/principals/1/")
      .set("Authorization", basicAuth("cal_1", "testpassword123"))
      .set("Content-Type", "text/xml")
      .set("Depth", "0")
      .set("Prefer", "return=minimal")
      .set("brief", "t")
      .send(requestBody);

    expect(response.status).toBe(207);
    const body = response.text;

    // 1. Verify Namespace Declarations
    expect(body).toContain('xmlns:A="DAV:"');
    expect(body).toContain('xmlns:C="urn:ietf:params:xml:ns:caldav"');
    expect(body).toContain('xmlns:CS="http://calendarserver.org/ns/"');

    // 2. Verify Success Block (200 OK)
    // Should contain displayname and email-address-set
    expect(body).toContain("<A:displayname>cal_1</A:displayname>");
    expect(body).toContain("<C:email-address-set>");
    expect(body).toContain("<C:email-address>cal_1@glasscal.local</C:email-address>");
    
    // Check that these are wrapped in a 200 OK status
    const okBlock = body.split("<A:status>HTTP/1.1 200 OK</A:status>")[0];
    expect(okBlock).toContain("<A:displayname>");
    expect(okBlock).toContain("<C:email-address-set>");

    // 3. Verify Failure Block (404 Not Found)
    // macOS needs to know explicitly that calendar-user-address-set is not supported/set
    expect(body).toContain("<C:calendar-user-address-set />");
    expect(body).toContain("<A:status>HTTP/1.1 404 Not Found</A:status>");

    // 4. Verify Path
    expect(body).toContain("<A:href>/caldav/principals/1/</A:href>");
  });

  it("Test Case 9: PROPFIND /caldav/principals/1/ (Full Principal & Home Set Discovery)", async () => {
    const requestBody = `<?xml version="1.0" encoding="UTF-8"?>
<A:propfind xmlns:A="DAV:">
  <A:prop>
    <B:calendar-home-set xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <B:calendar-user-address-set xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <A:current-user-principal/>
    <A:displayname/>
    <C:dropbox-home-URL xmlns:C="http://calendarserver.org/ns/"/>
    <C:email-address-set xmlns:C="http://calendarserver.org/ns/"/>
    <B:max-attendees-per-instance xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <C:notification-URL xmlns:C="http://calendarserver.org/ns/"/>
    <A:principal-collection-set/>
    <A:principal-URL/>
    <A:resource-id/>
    <B:schedule-inbox-URL xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <B:schedule-outbox-URL xmlns:B="urn:ietf:params:xml:ns:caldav"/>
    <A:supported-report-set/>
  </A:prop>
</A:propfind>`;

    const response = await request(app)
      .propfind("/caldav/principals/1/")
      .set("Authorization", basicAuth("cal_1", "testpassword123"))
      .set("Content-Type", "text/xml")
      .set("Depth", "0")
      .set("Prefer", "return=minimal")
      .set("brief", "t")
      .send(requestBody);

    expect(response.status).toBe(207);
    const body = response.text;

    // 1. Verify namespaces match the expected response format
    expect(body).toContain('xmlns:A="DAV:"');
    expect(body).toContain('xmlns:C="urn:ietf:params:xml:ns:caldav"');
    expect(body).toContain('xmlns:CS="http://calendarserver.org/ns/"');

    // 2. Verify the 200 OK Block - Essential Discoveries
    const okBlock = body.split("<A:status>HTTP/1.1 200 OK</A:status>")[0];
    
    // This tells Mac WHERE the calendars are
    expect(okBlock).toContain("<C:calendar-home-set>");
    expect(okBlock).toContain("<A:href>/caldav/calendars/1/</A:href>");
    
    // This confirms WHO the user is
    expect(okBlock).toContain("<A:displayname>cal_1</A:displayname>");
    expect(okBlock).toContain("<A:current-user-principal>");
    expect(okBlock).toContain("<A:principal-URL>");

    // 3. Verify the 404 Not Found Block - Graceful Degradation
    // This block is crucial for macOS; it needs to know what NOT to look for.
    const errorBlock = body.split("<A:status>HTTP/1.1 404 Not Found</A:status>")[0].split("<A:status>HTTP/1.1 200 OK</A:status>")[1];
    
    expect(errorBlock).toContain("<C:calendar-user-address-set />");
    expect(errorBlock).toContain("<A:dropbox-home-URL />");
    expect(errorBlock).toContain("<A:supported-report-set />");
    expect(errorBlock).toContain("<A:schedule-inbox-URL />");

    // 4. Verify overall XML integrity
    expect(body).toContain("</A:propstat>");
    expect(body).toContain("</A:response>");
  });

});
