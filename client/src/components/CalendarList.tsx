import { useCalendars, useCreateCalendar, useDeleteCalendar, useShareCalendar } from "@/hooks/use-calendars";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Share2, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCalendarSchema } from "@shared/schema";
import { z } from "zod";

interface CalendarListProps {
  selectedCalendarId?: number | null;
  onSelectCalendar: (id: number | null) => void;
}

export function CalendarList({ selectedCalendarId, onSelectCalendar }: CalendarListProps) {
  const { data: calendars } = useCalendars();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Calendars</h3>
        <CreateCalendarDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      </div>

      <div className="space-y-2">
        {calendars?.map((calendar) => (
          <CalendarItem 
            key={calendar.id} 
            calendar={calendar}
            isSelected={selectedCalendarId === calendar.id}
            onSelect={() => onSelectCalendar(calendar.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CalendarItem({ calendar, isSelected, onSelect }: { calendar: any; isSelected: boolean; onSelect: () => void }) {
  const deleteMutation = useDeleteCalendar();
  const [isShareOpen, setIsShareOpen] = useState(false);

  const isOwner = calendar.role === 'owner';
  const caldavUrl = `${window.location.origin}/caldav/calendars/${calendar.id}`;

  const handleCopyCalDAV = () => {
    navigator.clipboard.writeText(caldavUrl);
  };

  return (
    <div className={`space-y-1 p-3 rounded-lg border transition-all ${isSelected ? 'bg-primary/10 border-primary/50' : 'bg-white/30 border-white/30 hover:bg-white/40'}`}>
      <div className="flex items-center justify-between">
        <button
          onClick={onSelect}
          className="flex items-center gap-3 flex-1 text-left hover:opacity-70 transition-opacity"
        >
          <div 
            className="w-4 h-4 rounded-full shadow-sm" 
            style={{ backgroundColor: calendar.color }} 
          />
          <div className="flex-1">
            <span className="font-medium text-sm">{calendar.title}</span>
            {calendar.role === 'admin' && calendar.role !== 'owner' && (
              <span className="text-[10px] ml-2 bg-blue-200 px-1.5 py-0.5 rounded text-blue-600 font-bold uppercase">Shared</span>
            )}
          </div>
        </button>

        {isOwner && (
          <div className="flex items-center gap-1">
            <ShareCalendarDialog 
              calendarId={calendar.id} 
              open={isShareOpen} 
              onOpenChange={setIsShareOpen} 
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-destructive hover:bg-destructive/10"
              onClick={() => {
                if (confirm("Are you sure you want to delete this calendar?")) {
                  deleteMutation.mutate(calendar.id);
                }
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateCalendarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const createMutation = useCreateCalendar();
  const form = useForm({
    resolver: zodResolver(insertCalendarSchema),
    defaultValues: { title: "", description: "", color: "#3b82f6" }
  });

  const onSubmit = (data: any) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="comic-button gap-2">
          <Plus className="w-4 h-4" /> New
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-white/50">
        <DialogHeader>
          <DialogTitle className="text-xl">Create Calendar</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input {...form.register("title")} className="bg-white/50" placeholder="Work, Personal..." />
            {form.formState.errors.title && <p className="text-red-500 text-xs">{form.formState.errors.title.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <Input type="color" {...form.register("color")} className="h-10 w-full bg-white/50 p-1" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input {...form.register("description")} className="bg-white/50" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createMutation.isPending} className="comic-button bg-primary text-white">Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShareCalendarDialog({ calendarId, open, onOpenChange }: { calendarId: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const shareMutation = useShareCalendar();
  const [email, setEmail] = useState("");

  const handleShare = () => {
    if (!email) return;
    shareMutation.mutate({ 
      id: calendarId, 
      email
    }, {
      onSuccess: () => {
        setEmail("");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10" data-testid="button-share-calendar">
          <Share2 className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-white/50 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Share Calendar</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Email Address</Label>
            <Input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="friend@example.com" 
              className="bg-white/50"
              data-testid="input-share-email"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button 
              onClick={handleShare} 
              disabled={shareMutation.isPending || !email} 
              className="comic-button bg-primary text-white"
            >
              {shareMutation.isPending ? "Sharing..." : "Grant Access"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
