# GlassCal - Calendar Sharing Application

## Overview

GlassCal is a modern calendar sharing application with a glassmorphic design aesthetic. Users can create multiple calendars, manage events, and share calendars with others via email-based admin access or CalDAV URLs for read-only viewing. The application uses Replit Auth (OpenID Connect) for authentication and features a responsive interface with dark/light mode support.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight routing library)
- **State Management**: TanStack React Query for server state, React Hook Form for form handling
- **Styling**: Tailwind CSS with CSS variables for theming, Shadcn/ui component library
- **Animations**: Framer Motion for transitions and dialogs
- **Date Handling**: date-fns for date manipulation and formatting

The frontend follows a component-based architecture with:
- Pages in `client/src/pages/` (Home, Login, NotFound)
- Reusable components in `client/src/components/`
- UI primitives from Shadcn/ui in `client/src/components/ui/`
- Custom hooks in `client/src/hooks/` for data fetching and authentication
- Utility functions in `client/src/lib/`

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: Passport.js with Replit Auth (OpenID Connect)
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple

The backend follows a modular structure:
- `server/routes.ts` - API route definitions
- `server/storage.ts` - Database access layer implementing IStorage interface
- `server/db.ts` - Database connection setup
- `server/replit_integrations/auth/` - Authentication module with Replit Auth

### Database Schema
Located in `shared/schema.ts`:
- **users** - User accounts (managed by Replit Auth)
- **sessions** - Session storage for authentication
- **calendars** - Calendar entities with owner reference
- **events** - Calendar events with recurrence support
- **calendarShares** - Sharing permissions (admin access by email, CalDAV credentials)

### API Structure
RESTful API defined in `shared/routes.ts` using Zod for validation:
- `GET/POST /api/calendars` - List and create calendars
- `GET/PUT/DELETE /api/calendars/:id` - Single calendar operations
- `POST /api/calendars/:id/share` - Share calendar by email
- `POST /api/calendars/:id/caldav` - Generate CalDAV credentials
- `GET/POST /api/events` - List and create events
- `PUT/DELETE /api/events/:id` - Event operations

### Build System
- **Development**: Vite dev server with HMR
- **Production**: esbuild for server bundling, Vite for client build
- **Output**: `dist/` directory with `index.cjs` (server) and `public/` (client assets)

## External Dependencies

### Database
- **PostgreSQL** (Neon-backed on Replit) - Primary data store
- Connection via `DATABASE_URL` environment variable

### Authentication
- **Replit Auth** (OpenID Connect) - User authentication
- Requires `ISSUER_URL`, `REPL_ID`, and `SESSION_SECRET` environment variables

### Third-Party Services
- **Google Fonts** - DM Sans and Architects Daughter fonts loaded via CDN

### Key NPM Packages
- `drizzle-orm` / `drizzle-kit` - Type-safe SQL and migrations
- `passport` / `openid-client` - Authentication middleware
- `express-session` / `connect-pg-simple` - Session management
- `@tanstack/react-query` - Data fetching and caching
- `@radix-ui/*` - Accessible UI primitives
- `tailwindcss` - Utility-first CSS