# GlassCal - Calendar Sharing Application

A modern, glassmorphic calendar application with advanced sharing capabilities. Share your calendars with others via email-based admin access or CalDAV URLs for read-only viewing.

## Features

### Core Calendar Management
- **Multi-Calendar Support**: Create and manage multiple calendars with custom colors and descriptions
- **Event Management**: Create, edit, and delete events with detailed information (title, description, location, time)
- **24-Hour Time Format**: Events displayed in 24-hour format in your local timezone
- **Recurring Events**: Support for event recurrence patterns
- **Calendar Colors**: Customize each calendar with unique colors for easy organization

### Sharing & Collaboration
- **Email-Based Admin Sharing**: Share calendars by email address. Users gain full admin access to manage events
- **CalDAV URL Sharing**: Generate unique CalDAV URLs with username/password credentials for read-only access
- **Access Management**: Easily view and revoke access from the calendar's share management dialog
- **User-Friendly Sharing**: Simple interfaces for both email and CalDAV sharing methods

### Design & UX
- **Glassmorphism Design**: Modern frosted glass aesthetic with blur effects and transparency
- **Dark/Light Mode**: Full theme support with automatic system preference detection
- **Responsive Layout**: Desktop and mobile-friendly interface
- **DM Sans Font**: Professional typography throughout the application
- **Interactive Calendar Grid**: Click dates to create events, view events at a glance

### Authentication
- **Google OAuth Login**: Secure authentication via Replit Auth integration
- **Session Management**: Persistent sessions with secure cookie handling
- **User Profiles**: Display user information and profile pictures

## Technology Stack

### Frontend
- **React 18**: UI component library
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework with dark mode support
- **Wouter**: Lightweight routing library
- **TanStack React Query**: Data fetching and state management
- **React Hook Form**: Efficient form handling
- **Shadcn/ui**: High-quality React components
- **Lucide React**: Beautiful icon library
- **Framer Motion**: Animation library
- **date-fns**: Date manipulation and formatting

### Backend
- **Express.js**: Web application framework
- **PostgreSQL**: Relational database (Neon-backed on Replit)
- **Drizzle ORM**: Type-safe SQL query builder
- **Passport.js**: Authentication middleware
- **OpenID Connect**: OAuth integration
- **Node.js**: JavaScript runtime

### Special Libraries
- **connect-pg-simple**: PostgreSQL session store for Express
- **drizzle-zod**: Automatic schema validation from Drizzle
- **next-themes**: Theme management and persistence
- **react-day-picker**: Calendar date picker component
- **embla-carousel-react**: Carousel/slider functionality
- **recharts**: Chart components for data visualization

## Project Structure

```
.
├── client/                 # Frontend React application
│   └── src/
│       ├── pages/         # Page components
│       ├── components/    # Reusable components
│       ├── hooks/         # Custom React hooks
│       ├── lib/           # Utility functions
│       └── styles/        # Global styles
├── server/                 # Backend Express application
│   ├── routes.ts          # API endpoint definitions
│   ├── storage.ts         # Database interface and implementation
│   ├── db.ts              # Database connection
│   └── index.ts           # Server entry point
├── shared/                 # Shared types and schemas
│   ├── schema.ts          # Drizzle database schema
│   └── routes.ts          # API route definitions
└── package.json           # Dependencies and scripts
```

## Build & Run Instructions

### Prerequisites
- Node.js 18+ (or use Replit's built-in Node.js)
- PostgreSQL (or use Replit's built-in PostgreSQL database)
- npm or yarn

### Local Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd calendar-sharing-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory with:
   ```env
   DATABASE_URL=postgres://user:password@localhost:5432/calendar_db
   SESSION_SECRET=your-secure-session-secret-here
   ```

4. **Initialize the database**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5000`

### Building for Production

```bash
npm run build
npm start
```

## API Endpoints

All API endpoints require authentication via session cookie unless noted otherwise.

---

### Authentication

#### `GET /api/auth/user`
Get current authenticated user information.

**Response 200:**
```json
{
  "id": "user_abc123",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "profileImageUrl": "https://example.com/avatar.jpg"
}
```

**Response 401:** (Not authenticated)
```json
{
  "message": "Not authenticated"
}
```

---

### Calendars

#### `GET /api/calendars`
List all calendars accessible by the current user (owned + shared).

**Response 200:**
```json
[
  {
    "id": 1,
    "title": "Work Calendar",
    "description": "My work events",
    "color": "#3b82f6",
    "ownerId": "user_abc123",
    "createdAt": "2025-01-14T10:00:00.000Z",
    "role": "owner"
  },
  {
    "id": 2,
    "title": "Team Calendar",
    "description": "Shared team events",
    "color": "#10b981",
    "ownerId": "user_xyz789",
    "createdAt": "2025-01-10T08:00:00.000Z",
    "role": "admin"
  }
]
```

#### `POST /api/calendars`
Create a new calendar.

**Request Body:**
```json
{
  "title": "My New Calendar",
  "description": "Optional description",
  "color": "#ef4444"
}
```

**Response 201:**
```json
{
  "id": 3,
  "title": "My New Calendar",
  "description": "Optional description",
  "color": "#ef4444",
  "ownerId": "user_abc123",
  "createdAt": "2025-01-14T12:00:00.000Z"
}
```

**Response 400:** (Validation error)
```json
{
  "message": "Title is required"
}
```

#### `GET /api/calendars/:id`
Get a specific calendar by ID.

**Response 200:**
```json
{
  "id": 1,
  "title": "Work Calendar",
  "description": "My work events",
  "color": "#3b82f6",
  "ownerId": "user_abc123",
  "createdAt": "2025-01-14T10:00:00.000Z"
}
```

**Response 404:**
```json
{
  "message": "Calendar not found"
}
```

#### `PUT /api/calendars/:id`
Update a calendar. Requires owner or admin access.

**Request Body:** (all fields optional)
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "color": "#8b5cf6"
}
```

**Response 200:**
```json
{
  "id": 1,
  "title": "Updated Title",
  "description": "Updated description",
  "color": "#8b5cf6",
  "ownerId": "user_abc123",
  "createdAt": "2025-01-14T10:00:00.000Z"
}
```

**Response 403:**
```json
{
  "message": "You don't have permission to update this calendar"
}
```

#### `DELETE /api/calendars/:id`
Delete a calendar. Only the owner can delete.

**Response 204:** (No content - success)

**Response 403:**
```json
{
  "message": "Only the owner can delete this calendar"
}
```

---

### Calendar Sharing (Email-based Admin Access)

#### `POST /api/calendars/:id/share`
Share a calendar with another user by email. Grants admin access.

**Request Body:**
```json
{
  "email": "colleague@example.com"
}
```

**Response 201:**
```json
{
  "id": 5,
  "calendarId": 1,
  "userId": null,
  "email": "colleague@example.com",
  "role": "admin",
  "createdAt": "2025-01-14T12:30:00.000Z"
}
```

**Response 400:**
```json
{
  "message": "This calendar is already shared with that email"
}
```

#### `GET /api/calendars/:id/shares`
Get all shares for a calendar.

**Response 200:**
```json
[
  {
    "id": 5,
    "calendarId": 1,
    "userId": "user_xyz789",
    "email": "colleague@example.com",
    "role": "admin",
    "createdAt": "2025-01-14T12:30:00.000Z"
  }
]
```

#### `DELETE /api/calendars/:id/shares/:shareId`
Revoke a user's access to a calendar.

**Response 204:** (No content - success)

**Response 403:**
```json
{
  "message": "You don't have permission to manage shares for this calendar"
}
```

---

### CalDAV Sharing (Read-only URL Access)

#### `GET /api/calendars/:id/caldav`
Get existing CalDAV credentials for a calendar.

**Response 200:** (Credentials exist)
```json
{
  "caldavUrl": "https://your-app.replit.app/caldav/calendars/1",
  "username": "cal_abc123",
  "password": "securepassword123"
}
```

**Response 200:** (No credentials yet)
```json
null
```

#### `POST /api/calendars/:id/caldav`
Create or update CalDAV credentials for a calendar.

**Request Body:**
```json
{
  "username": "my_calendar",
  "password": "my_secure_password"
}
```

**Response 200:**
```json
{
  "caldavUrl": "https://your-app.replit.app/caldav/calendars/1",
  "username": "my_calendar",
  "password": "my_secure_password"
}
```

**Response 403:**
```json
{
  "message": "Only the owner can manage CalDAV sharing"
}
```

---

### Events

#### `GET /api/events`
List events. Can filter by calendar and date range.

**Query Parameters:**
- `calendarId` (optional): Filter by calendar ID
- `startDate` (optional): Filter events starting after this date (ISO 8601)
- `endDate` (optional): Filter events ending before this date (ISO 8601)

**Example:** `GET /api/events?calendarId=1&startDate=2025-01-01&endDate=2025-01-31`

**Response 200:**
```json
[
  {
    "id": 1,
    "calendarId": 1,
    "title": "Team Meeting",
    "description": "Weekly sync",
    "location": "Conference Room A",
    "startTime": "2025-01-14T14:00:00.000Z",
    "endTime": "2025-01-14T15:00:00.000Z",
    "color": "#3b82f6",
    "recurrence": null,
    "createdBy": "user_abc123",
    "createdAt": "2025-01-10T09:00:00.000Z"
  }
]
```

#### `POST /api/events`
Create a new event. Event must be at least 5 minutes long.

**Request Body:**
```json
{
  "calendarId": 1,
  "title": "Project Review",
  "description": "Q1 review meeting",
  "location": "Zoom",
  "startTime": "2025-01-15T10:00:00.000Z",
  "endTime": "2025-01-15T11:00:00.000Z",
  "color": "#ef4444"
}
```

**Response 201:**
```json
{
  "id": 2,
  "calendarId": 1,
  "title": "Project Review",
  "description": "Q1 review meeting",
  "location": "Zoom",
  "startTime": "2025-01-15T10:00:00.000Z",
  "endTime": "2025-01-15T11:00:00.000Z",
  "color": "#ef4444",
  "recurrence": null,
  "createdBy": "user_abc123",
  "createdAt": "2025-01-14T12:00:00.000Z"
}
```

**Response 400:**
```json
{
  "message": "Event must be at least 5 minutes long"
}
```

#### `PUT /api/events/:id`
Update an event. Requires admin access to the calendar.

**Request Body:** (all fields optional)
```json
{
  "title": "Updated Meeting Title",
  "startTime": "2025-01-15T11:00:00.000Z",
  "endTime": "2025-01-15T12:00:00.000Z"
}
```

**Response 200:**
```json
{
  "id": 2,
  "calendarId": 1,
  "title": "Updated Meeting Title",
  "description": "Q1 review meeting",
  "location": "Zoom",
  "startTime": "2025-01-15T11:00:00.000Z",
  "endTime": "2025-01-15T12:00:00.000Z",
  "color": "#ef4444",
  "recurrence": null,
  "createdBy": "user_abc123",
  "createdAt": "2025-01-14T12:00:00.000Z"
}
```

**Response 403:**
```json
{
  "message": "You don't have permission to edit events in this calendar"
}
```

#### `DELETE /api/events/:id`
Delete an event. Requires admin access to the calendar.

**Response 204:** (No content - success)

**Response 404:**
```json
{
  "message": "Event not found"
}
```

---

### CalDAV Protocol Endpoints

These endpoints implement the CalDAV protocol for calendar subscription in apps like Apple Calendar, Outlook, and other CalDAV clients. Authentication uses HTTP Basic Auth with CalDAV credentials.

#### `GET /.well-known/caldav`
CalDAV service discovery endpoint.

**Response 302:** Redirects to `/caldav/`

#### `OPTIONS /caldav/`
Returns supported CalDAV methods.

**Response Headers:**
```
Allow: OPTIONS, GET, HEAD, POST, PROPFIND, PROPPATCH, REPORT
DAV: 1, 2, calendar-access
```

#### `PROPFIND /caldav/`
Discover available calendars.

**Response 207:** (Multi-Status XML)
```xml
<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/caldav/calendars/1</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Work Calendar</D:displayname>
        <D:resourcetype>
          <D:collection/>
          <C:calendar/>
        </D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>
```

#### `GET /caldav/calendars/:id`
Get full calendar in iCalendar format.

**Response 200:**
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//GlassCal//CalDAV//EN
X-WR-CALNAME:Work Calendar
X-WR-TIMEZONE:UTC
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:event-1@glasscal.local
DTSTAMP:20250114T120000Z
DTSTART:20250114T140000Z
DTEND:20250114T150000Z
SUMMARY:Team Meeting
DESCRIPTION:Weekly sync
LOCATION:Conference Room A
END:VEVENT
END:VCALENDAR
```

#### `REPORT /caldav/calendars/:id`
Calendar query/multiget for sync operations.

**Response 207:** (Multi-Status XML with individual events)
```xml
<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/caldav/calendars/1/event-1.ics</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>"event-1-1705237200000"</D:getetag>
        <C:calendar-data>BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//GlassCal//CalDAV//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:event-1@glasscal.local
...
END:VEVENT
END:VCALENDAR</C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>
```

#### `GET /caldav/calendars/:id/event-:eventId.ics`
Get individual event in iCalendar format.

**Response 200:**
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//GlassCal//CalDAV//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:event-1@glasscal.local
DTSTAMP:20250114T120000Z
DTSTART:20250114T140000Z
DTEND:20250114T150000Z
SUMMARY:Team Meeting
END:VEVENT
END:VCALENDAR
```

---

### Error Responses

All endpoints may return these common error responses:

**401 Unauthorized:**
```json
{
  "message": "Not authenticated"
}
```

**403 Forbidden:**
```json
{
  "message": "You don't have permission to perform this action"
}
```

**404 Not Found:**
```json
{
  "message": "Resource not found"
}
```

**500 Internal Server Error:**
```json
{
  "message": "Internal server error"
}
```

## Features in Detail

### Email Sharing
1. Click the share icon on any calendar
2. Enter the email address of the person you want to share with
3. Click "Grant Access"
4. The recipient will receive an email invitation with a link to the app
5. Once they log in, they'll have full admin access to the calendar

### CalDAV Sharing
1. Click the CalDAV icon next to the share icon
2. A unique CalDAV URL will be generated with credentials
3. Copy the URL to share with others
4. Users can add this calendar to any CalDAV-compatible application (Apple Calendar, Google Calendar, Outlook, etc.)
5. Access is read-only - recipients cannot modify events

## Color Scheme

The application uses a custom color palette with CSS variables defined in `client/src/index.css`:
- **Primary**: Blue (#3b82f6)
- **Secondary**: Purple/Violet tones
- **Accent**: Cyan and complementary colors
- **Background**: Light with glassmorphic overlay

## Development Notes

- All dates are stored in UTC in the database
- Times are converted to the user's local timezone for display
- The application uses TanStack Query v5 with React 18
- Forms are validated using Zod schemas
- The backend is built with Express.js and uses Drizzle ORM for database operations
- Authentication is handled via OpenID Connect through Replit Auth

## License

MIT License - Feel free to use this project for personal or commercial purposes.
