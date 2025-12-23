import { z } from 'zod';
import { insertCalendarSchema, insertEventSchema, calendars, events, calendarShares } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  calendars: {
    list: {
      method: 'GET' as const,
      path: '/api/calendars',
      responses: {
        200: z.array(z.custom<typeof calendars.$inferSelect & { role: string }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/calendars',
      input: insertCalendarSchema,
      responses: {
        201: z.custom<typeof calendars.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/calendars/:id',
      responses: {
        200: z.custom<typeof calendars.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/calendars/:id',
      input: insertCalendarSchema.partial(),
      responses: {
        200: z.custom<typeof calendars.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/calendars/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    share: {
      method: 'POST' as const,
      path: '/api/calendars/:id/share',
      input: z.object({ email: z.string().email(), role: z.enum(['admin', 'viewer']) }),
      responses: {
        201: z.custom<typeof calendarShares.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  events: {
    list: {
      method: 'GET' as const,
      path: '/api/events',
      input: z.object({
        calendarId: z.coerce.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof events.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/events',
      input: insertEventSchema,
      responses: {
        201: z.custom<typeof events.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/events/:id',
      input: insertEventSchema.partial(),
      responses: {
        200: z.custom<typeof events.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/events/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type CalendarResponse = z.infer<typeof api.calendars.get.responses[200]>;
export type EventResponse = z.infer<typeof api.events.create.responses[201]>;
