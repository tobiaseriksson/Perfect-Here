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
import { datetimeLocalToUTC, utcToDatetimeLocal } from "@/lib/timezone";

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
}).refine((data) => {
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);
  const minDuration = 5 * 60 * 1000; // 5 minutes in ms
  return end.getTime() - start.getTime() >= minDuration;
}, {
  message: "Event must be at least 5 minutes long",
  path: ["endTime"],
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
      startTime: utcToDatetimeLocal(new Date()),
      endTime: utcToDatetimeLocal(new Date(new Date().getTime() + 60 * 60 * 1000)),
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
          startTime: utcToDatetimeLocal(eventToEdit.startTime),
          endTime: utcToDatetimeLocal(eventToEdit.endTime),
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
          startTime: utcToDatetimeLocal(start),
          endTime: utcToDatetimeLocal(end),
        });
      }
    }
  }, [isOpen, selectedDate, eventToEdit, calendars, form]);

  const onSubmit = async (data: FormValues) => {
    // Convert datetime-local values (browser timezone) to UTC before sending to server
    const submitData = {
      ...data,
      startTime: datetimeLocalToUTC(data.startTime),
      endTime: datetimeLocalToUTC(data.endTime),
    };
    
    if (eventToEdit) {
      await updateMutation.mutateAsync({ 
        id: eventToEdit.id, 
        ...submitData 
      });
    } else {
      await createMutation.mutateAsync(submitData);
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
      <DialogContent className="sm:max-w-[500px] bg-white/70 backdrop-blur-xl border-2 border-white/60 shadow-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-3xl bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
            {eventToEdit ? "Edit Event" : "Create New Event"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">Title</Label>
            <Input {...form.register("title")} placeholder="Meeting with team..." className="bg-white/80 border-white/50 text-gray-900 placeholder:text-gray-500 focus:bg-white" />
            {form.formState.errors.title && <p className="text-destructive text-sm">{form.formState.errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Start Time</Label>
              <Input type="datetime-local" {...form.register("startTime")} className="bg-white/80 border-white/50 text-gray-900 focus:bg-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">End Time</Label>
              <Input type="datetime-local" {...form.register("endTime")} className="bg-white/80 border-white/50 text-gray-900 focus:bg-white" />
              {form.formState.errors.endTime && <p className="text-destructive text-sm">{form.formState.errors.endTime.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">Calendar</Label>
            <Select 
              value={String(form.watch("calendarId"))} 
              onValueChange={(val) => form.setValue("calendarId", parseInt(val))}
            >
              <SelectTrigger className="bg-white/80 border-white/50 text-gray-900 focus:bg-white">
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
              <Label className="text-sm font-semibold text-gray-700">Location</Label>
              <Input {...form.register("location")} placeholder="Office, Zoom..." className="bg-white/80 border-white/50 text-gray-900 placeholder:text-gray-500 focus:bg-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-gray-700">Color</Label>
              <Input type="color" {...form.register("color")} className="h-10 w-full bg-white/80 border-white/50 p-1 focus:bg-white" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">Description</Label>
            <Textarea {...form.register("description")} className="bg-white/80 border-white/50 text-gray-900 placeholder:text-gray-500 focus:bg-white" />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-4">
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
