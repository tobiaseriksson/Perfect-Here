import { 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  format, 
  isSameMonth, 
  isSameDay, 
  isToday 
} from "date-fns";
import { cn } from "@/lib/utils";
import { type Event } from "@shared/schema";
import { motion } from "framer-motion";

interface CalendarGridProps {
  currentDate: Date;
  events?: Event[];
  onDateClick: (date: Date) => void;
  onEventClick: (event: Event) => void;
}

export function CalendarGrid({ currentDate, events = [], onDateClick, onEventClick }: CalendarGridProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(new Date(event.startTime), day));
  };

  return (
    <div className="w-full h-full flex flex-col glass-card p-4">
      {/* Header Days */}
      <div className="grid grid-cols-7 mb-2">
        {weekDays.map(day => (
          <div key={day} className="text-center font-comic font-bold text-muted-foreground py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr gap-2">
        {days.map((day, dayIdx) => {
          const dayEvents = getEventsForDay(day);
          const isCurrentMonth = isSameMonth(day, monthStart);

          return (
            <motion.div
              key={day.toString()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: dayIdx * 0.01 }}
              onClick={() => onDateClick(day)}
              className={cn(
                "min-h-[100px] p-2 rounded-xl border border-white/20 transition-all cursor-pointer hover:bg-white/40",
                !isCurrentMonth && "opacity-50 bg-gray-50/20",
                isCurrentMonth && "bg-white/20",
                isToday(day) && "ring-2 ring-primary bg-primary/5 shadow-inner"
              )}
            >
              <div className="flex justify-between items-start">
                <span className={cn(
                  "text-sm font-semibold rounded-full w-7 h-7 flex items-center justify-center",
                  isToday(day) ? "bg-primary text-white" : "text-muted-foreground"
                )}>
                  {format(day, "d")}
                </span>
              </div>
              
              <div className="mt-2 space-y-1 overflow-y-auto max-h-[80px] scrollbar-thin">
                {dayEvents.map(event => (
                  <motion.div
                    key={event.id}
                    layoutId={`event-${event.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    className="text-xs px-2 py-1 rounded-md truncate shadow-sm hover:scale-105 transition-transform cursor-pointer"
                    style={{ 
                      backgroundColor: event.color || '#3b82f6',
                      color: '#fff',
                      textShadow: '0px 1px 2px rgba(0,0,0,0.1)'
                    }}
                  >
                    {format(new Date(event.startTime), "HH:mm")} {event.title}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
