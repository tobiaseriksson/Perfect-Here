import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEventSchema, type Event } from "@shared/schema";
import { z } from "zod";
import { useEffect } from "react";
import { useCreateEvent, useUpdateEvent, useDeleteEvent } from "@/hooks/use-events";
import { useCalendars } from "@/hooks/use-calendars";

interface EventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: Date;
  eventToEdit?: Event | null;
}

const formSchema = insertEventSchema.extend({
  calendarId: z.coerce.number(),
  startTime: z.string(),
  endTime: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export function EventDialog({ isOpen, onClose, selectedDate, eventToEdit }: EventDialogProps) {
  const { data: calendars } = useCalendars();
  const createMutation = useCreateEvent();
  const updateMutation = useUpdateEvent();
  const deleteMutation = useDeleteEvent();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      color: "#3b82f6",
      calendarId: calendars?.[0]?.id,
      startTime: new Date().toISOString().slice(0, 16),
      endTime: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString().slice(0, 16),
    }
  });

  useEffect(() => {
    if (isOpen) {
      if (eventToEdit) {
        form.reset({
          ...eventToEdit,
          description: eventToEdit.description || "",
          location: eventToEdit.location || "",
          color: eventToEdit.color || "#3b82f6",
          calendarId: eventToEdit.calendarId,
          startTime: new Date(eventToEdit.startTime).toISOString().slice(0, 16),
          endTime: new Date(eventToEdit.endTime).toISOString().slice(0, 16),
        });
      } else if (selectedDate) {
        // Create new event at selected date
        // Set time to current time but on selected date
        const now = new Date();
        const start = new Date(selectedDate);
        start.setHours(now.getHours(), 0, 0, 0);
        const end = new Date(start.getTime() + 60 * 60 * 1000);

        form.reset({
          title: "",
          description: "",
          location: "",
          color: "#3b82f6",
          calendarId: calendars?.[0]?.id,
          startTime: start.toISOString().slice(0, 16),
          endTime: end.toISOString().slice(0, 16),
        });
      }
    }
  }, [isOpen, selectedDate, eventToEdit, calendars, form]);

  const onSubmit = async (data: FormValues) => {
    // Manually construct proper Date strings with TZ offset if needed, 
    // but slice(0,16) creates "YYYY-MM-DDTHH:mm" which is parsed locally.
    // For simplicity in this demo we pass the string and let hook convert to ISO.
    
    if (eventToEdit) {
      await updateMutation.mutateAsync({ 
        id: eventToEdit.id, 
        ...data 
      });
    } else {
      await createMutation.mutateAsync(data);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (eventToEdit) {
      await deleteMutation.mutateAsync(eventToEdit.id);
      onClose();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] glass border-white/50">
        <DialogHeader>
          <DialogTitle className="font-comic text-2xl text-primary">
            {eventToEdit ? "Edit Event" : "Create New Event"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input {...form.register("title")} placeholder="Meeting with team..." className="bg-white/50 border-white/30" />
            {form.formState.errors.title && <p className="text-destructive text-sm">{form.formState.errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input type="datetime-local" {...form.register("startTime")} className="bg-white/50 border-white/30" />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input type="datetime-local" {...form.register("endTime")} className="bg-white/50 border-white/30" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Calendar</Label>
            <Select 
              value={String(form.watch("calendarId"))} 
              onValueChange={(val) => form.setValue("calendarId", parseInt(val))}
            >
              <SelectTrigger className="bg-white/50 border-white/30">
                <SelectValue placeholder="Select calendar" />
              </SelectTrigger>
              <SelectContent>
                {calendars?.map((cal) => (
                  <SelectItem key={cal.id} value={String(cal.id)}>
                    {cal.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Input {...form.register("location")} placeholder="Office, Zoom..." className="bg-white/50 border-white/30" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Input type="color" {...form.register("color")} className="h-10 w-full bg-white/50 border-white/30 p-1" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea {...form.register("description")} className="bg-white/50 border-white/30" />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {eventToEdit && (
              <Button 
                type="button" 
                variant="destructive" 
                onClick={handleDelete}
                disabled={isPending}
                className="mr-auto comic-button"
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending} className="comic-button">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="comic-button bg-primary text-primary-foreground hover:bg-primary/90">
              {isPending ? "Saving..." : "Save Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
