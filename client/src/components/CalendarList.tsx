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
        <h3 className="font-comic text-lg font-bold">Calendars</h3>
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
  const [showCaldav, setShowCaldav] = useState(false);
  const [copiedCaldav, setCopiedCaldav] = useState(false);

  const isOwner = calendar.role !== 'viewer';
  const caldavUrl = `${window.location.origin}/caldav/calendars/${calendar.id}`;

  const handleCopyCalDAV = () => {
    navigator.clipboard.writeText(caldavUrl);
    setCopiedCaldav(true);
    setTimeout(() => setCopiedCaldav(false), 2000);
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
            {calendar.role === 'viewer' && (
              <span className="text-[10px] ml-2 bg-gray-200 px-1.5 py-0.5 rounded text-gray-500 font-bold uppercase">Shared</span>
            )}
          </div>
        </button>

        {isOwner && (
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-muted-foreground hover:text-primary"
              onClick={() => setShowCaldav(!showCaldav)}
              title="CalDAV URL"
            >
              <Copy className="w-3 h-3" />
            </Button>
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

      {showCaldav && (
        <div className="mt-2 text-xs space-y-2">
          <p className="text-muted-foreground">CalDAV URL:</p>
          <div className="flex gap-2 bg-white/40 p-2 rounded border border-white/30">
            <code className="text-[11px] truncate flex-1">{caldavUrl}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={handleCopyCalDAV}
            >
              {copiedCaldav ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      )}
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
          <DialogTitle className="font-comic text-xl">Create Calendar</DialogTitle>
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
  const [role, setRole] = useState<"viewer" | "admin">("viewer");
  const [caldavUsername, setCaldavUsername] = useState("");
  const [caldavPassword, setCaldavPassword] = useState("");

  const handleShare = () => {
    if (!email) return;
    shareMutation.mutate({ 
      id: calendarId, 
      email, 
      role,
      caldavUsername: caldavUsername || undefined,
      caldavPassword: caldavPassword || undefined
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setEmail("");
        setCaldavUsername("");
        setCaldavPassword("");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary hover:bg-primary/10">
          <Share2 className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-white/50 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="font-comic text-xl">Share Calendar</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">Email Address</Label>
            <Input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="friend@example.com" 
              className="bg-white/80 border-white/50 text-gray-900"
            />
          </div>
          <div className="space-y-2">
             <Label className="text-sm font-semibold text-gray-700">Permission</Label>
             <select 
               className="w-full rounded-md border border-white/50 bg-white/80 px-3 py-2 text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/50"
               value={role}
               onChange={(e) => setRole(e.target.value as any)}
             >
               <option value="viewer">Viewer (Read only)</option>
               <option value="admin">Admin (Can edit)</option>
             </select>
          </div>

          <div className="border-t border-white/30 pt-4">
            <p className="text-xs text-muted-foreground mb-3 font-semibold">CalDAV Access (Optional)</p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-700">CalDAV Username</Label>
                <Input 
                  value={caldavUsername} 
                  onChange={(e) => setCaldavUsername(e.target.value)} 
                  placeholder="username" 
                  className="bg-white/80 border-white/50 text-gray-900 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-700">CalDAV Password</Label>
                <Input 
                  type="password"
                  value={caldavPassword} 
                  onChange={(e) => setCaldavPassword(e.target.value)} 
                  placeholder="password" 
                  className="bg-white/80 border-white/50 text-gray-900 text-sm"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Users will need these credentials to access via CalDAV clients</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button 
              onClick={handleShare} 
              disabled={shareMutation.isPending || !email} 
              className="comic-button bg-primary text-white"
            >
              {shareMutation.isPending ? "Sharing..." : "Send Invite"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
