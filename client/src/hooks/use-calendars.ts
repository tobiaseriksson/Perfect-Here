import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateCalendarRequest, type ShareCalendarRequest } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useCalendars() {
  const { toast } = useToast();
  
  return useQuery({
    queryKey: [api.calendars.list.path],
    queryFn: async () => {
      const res = await fetch(api.calendars.list.path, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 401) return null;
        throw new Error("Failed to fetch calendars");
      }
      return api.calendars.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateCalendar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateCalendarRequest) => {
      const res = await fetch(api.calendars.create.path, {
        method: api.calendars.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create calendar");
      }
      return api.calendars.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.calendars.list.path] });
      toast({ title: "Success", description: "Calendar created successfully!" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteCalendar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.calendars.delete.path, { id });
      const res = await fetch(url, { 
        method: api.calendars.delete.method,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to delete calendar");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.calendars.list.path] });
      toast({ title: "Deleted", description: "Calendar deleted." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useShareCalendar() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & ShareCalendarRequest) => {
      const url = buildUrl(api.calendars.share.path, { id });
      const res = await fetch(url, {
        method: api.calendars.share.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to share calendar");
      }
      return api.calendars.share.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.calendars.shares.path, variables.id] });
      toast({ title: "Shared", description: "Calendar shared successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useCalendarShares(calendarId: number) {
  return useQuery({
    queryKey: [api.calendars.shares.path, calendarId],
    queryFn: async () => {
      const url = buildUrl(api.calendars.shares.path, { id: calendarId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch shares");
      }
      return api.calendars.shares.responses[200].parse(await res.json());
    },
  });
}

export function useDeleteShare() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ calendarId, shareId }: { calendarId: number; shareId: number }) => {
      const url = buildUrl(api.calendars.deleteShare.path, { id: calendarId, shareId });
      const res = await fetch(url, {
        method: api.calendars.deleteShare.method,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to delete share");
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.calendars.shares.path, variables.calendarId] });
      toast({ title: "Removed", description: "User access revoked." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useGenerateCalDAVShare() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (calendarId: number) => {
      const url = buildUrl(api.calendars.caldavShare.path, { id: calendarId });
      const res = await fetch(url, {
        method: api.calendars.caldavShare.method,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to generate CalDAV share");
      return api.calendars.caldavShare.responses[201].parse(await res.json());
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
