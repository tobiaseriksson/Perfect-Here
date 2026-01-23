import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { CalendarGrid } from "@/components/CalendarGrid";
import { CalendarList } from "@/components/CalendarList";
import { EventDialog } from "@/components/EventDialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, LogOut, Menu, Plus, Calendar } from "lucide-react";
import { useState, useEffect } from "react";
import { addMonths, subMonths, format } from "date-fns";
import { useEvents } from "@/hooks/use-events";
import { useCalendars } from "@/hooks/use-calendars";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { type Event } from "@shared/schema";

export default function Home() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { data: calendars } = useCalendars();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<number | null>(null);

  // Set first calendar as selected on initial load
  useEffect(() => {
    if (calendars && calendars.length > 0 && selectedCalendarId === null) {
      setSelectedCalendarId(calendars[0].id);
    }
  }, [calendars, selectedCalendarId]);

  // Fetch events for current month view range, filtered by selected calendar
  const { data: events } = useEvents({ calendarId: selectedCalendarId || undefined });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  if (!user) return <Redirect to="/login" />;

  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setEventToEdit(null);
    setIsEventDialogOpen(true);
  };

  const handleEventClick = (event: Event) => {
    setEventToEdit(event);
    setSelectedDate(undefined);
    setIsEventDialogOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedDate(new Date());
    setEventToEdit(null);
    setIsEventDialogOpen(true);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-72 flex-col gap-6 p-6 border-r border-slate-200/60 bg-slate-50/50 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-[#625df5] rounded-xl shadow-md shadow-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">MyCal</span>
        </div>

        <Button 
          className="w-full justify-start gap-2 h-12 text-lg rounded-full bg-[#625df5] text-white hover:bg-[#524de5] shadow-lg shadow-indigo-500/20 transition-all"
          onClick={handleCreateNew}
        >
          <Plus className="w-5 h-5" /> Create Event
        </Button>

        <div className="flex-1 overflow-y-auto pr-2">
          <CalendarList selectedCalendarId={selectedCalendarId} onSelectCalendar={setSelectedCalendarId} />
        </div>

        <div className="pt-4 border-t border-slate-200">
          <div className="flex items-center gap-3 mb-4">
            <img 
              src={user.profileImageUrl || `https://ui-avatars.com/api/?name=${user.firstName}+${user.lastName}`} 
              className="w-10 h-10 rounded-full border border-slate-200 shadow-sm"
              alt="Profile"
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-destructive hover:bg-destructive/10" onClick={() => logout()}>
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-slate-200/60 bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="glass w-80 p-0 border-r-white/40">
                <div className="h-full flex flex-col p-6 gap-6">
                  <div className="flex items-center gap-3 px-2">
                    <div className="w-10 h-10 bg-[#625df5] rounded-xl flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-xl font-bold">MyCal</span>
                  </div>
                  <Button className="w-full justify-start gap-2 rounded-full bg-[#625df5]" onClick={handleCreateNew}>
                    <Plus className="w-4 h-4" /> Create Event
                  </Button>
                  <CalendarList selectedCalendarId={selectedCalendarId} onSelectCalendar={setSelectedCalendarId} />
                  <div className="mt-auto pt-4 border-t border-white/20">
                    <Button variant="ghost" className="w-full justify-start text-destructive" onClick={() => logout()}>
                      <LogOut className="w-4 h-4 mr-2" /> Sign Out
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handlePrevMonth} className="h-9 w-9 rounded-full hover:bg-slate-50 border-slate-200">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h2 className="text-2xl font-bold min-w-[140px] text-center">
                {format(currentDate, "MMMM yyyy")}
              </h2>
              <Button variant="outline" size="icon" onClick={handleNextMonth} className="h-9 w-9 rounded-full hover:bg-slate-50 border-slate-200">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" onClick={() => setCurrentDate(new Date())}>Today</Button>
          </div>
        </header>

        {/* Calendar Grid Container */}
        <div className="flex-1 p-4 md:p-6 overflow-hidden">
          <CalendarGrid 
            currentDate={currentDate} 
            events={events} 
            onDateClick={handleDateClick}
            onEventClick={handleEventClick}
          />
        </div>
      </main>

      <EventDialog 
        isOpen={isEventDialogOpen} 
        onClose={() => setIsEventDialogOpen(false)} 
        selectedDate={selectedDate}
        eventToEdit={eventToEdit}
      />
    </div>
  );
}
