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
        };
      }
      return null;
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

describe("CalDAV Protocol Tests - Thunderbird Compatibility", () => {
  let app: express.Application;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("Test Case 1: PROPFIND /caldav/calendars/:id/ with Depth: 0 requesting getctag", () => {
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
});
