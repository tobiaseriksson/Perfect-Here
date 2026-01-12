import { useCalendars, useCreateCalendar, useDeleteCalendar, useShareCalendar, useCalendarShares, useDeleteShare, useGenerateCalDAVShare } from "@/hooks/use-calendars";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Share2, Copy, Check, Loader2, Link as LinkIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCalendarSchema } from "@shared/schema";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
            <CalDAVShareButton calendarId={calendar.id} />
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

function CalDAVShareButton({ calendarId }: { calendarId: number }) {
  const caldavMutation = useGenerateCalDAVShare();
  const [caldavData, setCaldavData] = useState<{ caldavUrl: string; username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    caldavMutation.mutate(calendarId, {
      onSuccess: (data) => {
        setCaldavData(data);
      }
    });
  };

  const handleCopyUrl = () => {
    if (caldavData) {
      navigator.clipboard.writeText(caldavData.caldavUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog onOpenChange={(open) => {
      if (open && !caldavData && !caldavMutation.isPending) {
        handleGenerate();
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-primary hover:bg-primary/10" data-testid="button-caldav-share">
          <LinkIcon className="w-3 h-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="glass border-white/50 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl">CalDAV Sharing</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {caldavMutation.isPending ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground font-medium">Generating sharing link...</p>
            </div>
          ) : caldavData ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">CalDAV URL</Label>
                <div className="flex gap-2">
                  <Input 
                    value={caldavData.caldavUrl} 
                    readOnly 
                    className="bg-white/50 text-xs"
                    data-testid="input-caldav-url"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyUrl}
                    className="flex-shrink-0"
                    data-testid="button-copy-caldav-url"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Username</Label>
                  <Input 
                    value={caldavData.username} 
                    onChange={(e) => setCaldavData({ ...caldavData, username: e.target.value })}
                    className="bg-white/50 text-xs" 
                    data-testid="input-caldav-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Password</Label>
                  <Input 
                    value={caldavData.password} 
                    onChange={(e) => setCaldavData({ ...caldavData, password: e.target.value })}
                    type="text"
                    className="bg-white/50 text-xs" 
                    data-testid="input-caldav-password"
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-white/20">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Use these credentials in your calendar app (Apple Calendar, Outlook, etc.) to sync this calendar. This is a read-only link.
                </p>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Failed to generate CalDAV link. Please try again.</p>
              <Button 
                onClick={handleGenerate} 
                variant="outline" 
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareCalendarDialog({ calendarId, open, onOpenChange }: { calendarId: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const shareMutation = useShareCalendar();
  const deleteShareMutation = useDeleteShare();
  const { data: shares, isLoading: sharesLoading } = useCalendarShares(calendarId);
  const [email, setEmail] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

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

  const handleDeleteClick = (shareId: number) => {
    setDeleteTargetId(shareId);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (deleteTargetId !== null) {
      deleteShareMutation.mutate({ calendarId, shareId: deleteTargetId });
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
    }
  };

  return (
    <>
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

            <div className="flex justify-end gap-2 pb-4 border-b border-white/30">
              <Button 
                onClick={handleShare} 
                disabled={shareMutation.isPending || !email} 
                className="comic-button bg-primary text-white"
                size="sm"
              >
                {shareMutation.isPending ? "Granting..." : "Grant Access"}
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Users with Access</Label>
              {sharesLoading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : shares && shares.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {shares.map((share) => (
                    <div 
                      key={share.id} 
                      className="flex items-center justify-between bg-white/40 rounded-md p-3 border border-white/30"
                      data-testid={`share-item-${share.id}`}
                    >
                      <span className="text-sm text-gray-900 font-medium">{share.email}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteClick(share.id)}
                        disabled={deleteShareMutation.isPending}
                        data-testid={`button-delete-share-${share.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">No one has access yet.</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="glass border-white/50">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Access</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to remove this user's access to the calendar? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              disabled={deleteShareMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteShareMutation.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
