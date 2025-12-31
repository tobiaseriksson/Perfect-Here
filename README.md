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

### Authentication
- `GET /api/auth/user` - Get current user information
- `POST /api/auth/login` - Login with credentials
- `POST /api/auth/logout` - Logout current user

### Calendars
- `GET /api/calendars` - List user's calendars
- `POST /api/calendars` - Create a new calendar
- `GET /api/calendars/:id` - Get calendar details
- `PUT /api/calendars/:id` - Update calendar
- `DELETE /api/calendars/:id` - Delete calendar

### Calendar Sharing
- `POST /api/calendars/:id/share` - Share calendar via email
- `GET /api/calendars/:id/shares` - Get list of users with access
- `DELETE /api/calendars/:id/shares/:shareId` - Revoke access

### Events
- `GET /api/events` - List events (optionally filtered by calendar)
- `POST /api/events` - Create event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event

### CalDAV
- `GET /caldav/calendars/:id` - Get calendar in iCalendar format (requires CalDAV credentials)

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
