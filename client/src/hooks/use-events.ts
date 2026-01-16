import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type CreateEventRequest, type UpdateEventRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface UseEventsOptions {
  startDate?: string;
  endDate?: string;
  calendarId?: number;
}

export function useEvents({ startDate, endDate, calendarId }: UseEventsOptions = {}) {
  return useQuery({
    queryKey: [api.events.list.path, startDate, endDate, calendarId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);
      if (calendarId) params.append("calendarId", String(calendarId));

      const res = await fetch(`${api.events.list.path}?${params.toString()}`, { 
        credentials: "include" 
      });
      
      if (!res.ok) {
        if (res.status === 401) return null;
        throw new Error("Failed to fetch events");
      }
      const events = api.events.list.responses[200].parse(await res.json());
      
      // Filter by calendar if specified
      if (calendarId) {
        return events.filter(e => e.calendarId === calendarId);
      }
      return events;
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { title: string; calendarId: number; startTime: string | Date; endTime: string | Date; description?: string | null; color?: string | null; location?: string | null }) => {
      // Ensure dates are ISO strings if not handled by Zod correctly during serialization
      const payload = {
        ...data,
        startTime: new Date(data.startTime).toISOString(),
        endTime: new Date(data.endTime).toISOString(),
      };

      const res = await fetch(api.events.create.path, {
        method: api.events.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create event");
      }
      return api.events.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.events.list.path] });
      toast({ title: "Event Created", description: "Your event has been saved." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<{ startTime: string | Date; endTime: string | Date; title: string; calendarId: number; description: string | null; color: string | null; location: string | null }>) => {
      const url = buildUrl(api.events.update.path, { id });
      
      // Ensure dates are strings for transport
      const payload: Record<string, unknown> = { ...updates };
      if (payload.startTime) payload.startTime = new Date(payload.startTime as string | Date).toISOString();
      if (payload.endTime) payload.endTime = new Date(payload.endTime as string | Date).toISOString();

      const res = await fetch(url, {
        method: api.events.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update event");
      }
      return api.events.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.events.list.path] });
      toast({ title: "Event Updated", description: "Your changes have been saved." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.events.delete.path, { id });
      const res = await fetch(url, { 
        method: api.events.delete.method,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to delete event");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.events.list.path] });
      toast({ title: "Deleted", description: "Event has been removed." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
