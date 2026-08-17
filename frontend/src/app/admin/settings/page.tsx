"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, Input, Skeleton } from "@/components/ui/atoms";
import { toast } from "@/components/ui/toast";
import { MapPin, Clock, CalendarDays, Plus, Trash2, ShieldAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";

export interface OfficeSettingsData {
  id?: number;
  latitude: number;
  longitude: number;
  allowed_radius: number;
  office_start_time: string;
  office_end_time: string;
  lunch_break_hours: number;
  required_working_hours: number;
  weekends: string;
}

export interface HolidayData {
  id: number;
  name: string;
  date: string;
  description?: string;
}

function OfficeSettingsForm({ initialData }: { initialData: OfficeSettingsData }) {
  const queryClient = useQueryClient();
  const [lat, setLat] = useState(initialData.latitude.toString());
  const [lng, setLng] = useState(initialData.longitude.toString());
  const [radius, setRadius] = useState(initialData.allowed_radius.toString());
  const [startTime, setStartTime] = useState(initialData.office_start_time.substring(0, 5));
  const [endTime, setEndTime] = useState(initialData.office_end_time.substring(0, 5));
  const [lunchHrs, setLunchHrs] = useState(initialData.lunch_break_hours.toString());
  const [reqHrs, setReqHrs] = useState(initialData.required_working_hours.toString());
  const [weekendsStr, setWeekendsStr] = useState(initialData.weekends);

  const updateOfficeMutation = useMutation({
    mutationFn: (payload: unknown) => apiFetch("/settings/office", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["officeSettings"] });
      toast.success("Office configurations updated successfully.");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to update office settings.";
      toast.error(errorMsg);
    }
  });

  const handleOfficeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lat || !lng || !radius || !startTime || !endTime) {
      toast.error("Please provide all required parameters");
      return;
    }

    updateOfficeMutation.mutate({
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
      allowed_radius: parseFloat(radius),
      office_start_time: startTime + ":00",
      office_end_time: endTime + ":00",
      lunch_break_hours: parseFloat(lunchHrs),
      required_working_hours: parseFloat(reqHrs),
      weekends: weekendsStr
    });
  };

  const fetchCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude.toString());
          setLng(pos.coords.longitude.toString());
          toast.success("Current GPS coordinates loaded!");
        },
        () => {
          toast.error("Failed to access Browser GPS. Please check permissions.");
        }
      );
    } else {
      toast.error("Geolocation is not supported by this browser.");
    }
  };

  return (
    <form onSubmit={handleOfficeSubmit} className="space-y-4 pt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
        <Input label="Office Latitude *" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} required />
        <Input label="Office Longitude *" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} required />
      </div>
      
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <Button type="button" variant="outline" size="sm" onClick={fetchCurrentLocation} className="shrink-0 self-start sm:self-auto">
          Use My Current GPS
        </Button>
        <span className="text-[10px] sm:text-[11px] text-slate-500 flex items-center gap-1">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          Must be inside office boundaries when capturing GPS coords.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5 border-t border-slate-100 pt-3.5">
        <Input label="Allowed Radius (meters) *" type="number" value={radius} onChange={(e) => setRadius(e.target.value)} required />
        <Input label="Weekend Days (comma-separated)" value={weekendsStr} onChange={(e) => setWeekendsStr(e.target.value)} placeholder="Saturday,Sunday" />
      </div>

      {/* Office timings */}
      <div className="border-t border-slate-100 pt-3.5">
        <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1.5 uppercase">
          <Clock className="h-4 w-4 text-indigo-600" />
          Office Shift & Lunch Hours
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input label="Shift Start *" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          <Input label="Shift End *" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          <Input label="Lunch (hrs) *" type="number" step="any" value={lunchHrs} onChange={(e) => setLunchHrs(e.target.value)} required />
          <Input label="Req. Hours *" type="number" step="any" value={reqHrs} onChange={(e) => setReqHrs(e.target.value)} required />
        </div>
      </div>

      <div className="flex justify-end pt-3 border-t border-slate-100">
        <Button type="submit" size="sm" disabled={updateOfficeMutation.isPending}>
          {updateOfficeMutation.isPending ? "Updating Settings..." : "Save Office Configs"}
        </Button>
      </div>
    </form>
  );
}

export default function OfficeSettingsPage() {
  const queryClient = useQueryClient();
  
  // Holidays Add Dialog State
  const [isHolidayOpen, setIsHolidayOpen] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayDesc, setHolidayDesc] = useState("");

  // Fetch Office settings
  const { data: officeSettings, isLoading: isOfficeLoading } = useQuery<OfficeSettingsData>({
    queryKey: ["officeSettings"],
    queryFn: () => apiFetch<OfficeSettingsData>("/settings/office"),
  });

  // Fetch Holidays
  const { data: holidays = [], isLoading: isHolidaysLoading } = useQuery<HolidayData[]>({
    queryKey: ["holidays"],
    queryFn: () => apiFetch<HolidayData[]>("/settings/holidays"),
  });

  const addHolidayMutation = useMutation({
    mutationFn: (newHoliday: unknown) => apiFetch("/settings/holidays", {
      method: "POST",
      body: JSON.stringify(newHoliday)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday added to system calendar.");
      setIsHolidayOpen(false);
      setHolidayName("");
      setHolidayDate("");
      setHolidayDesc("");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to register holiday.";
      toast.error(errorMsg);
    }
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/settings/holidays/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday removed successfully.");
    }
  });

  const handleHolidaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayName || !holidayDate) {
      toast.error("Holiday Name and Date are required.");
      return;
    }
    addHolidayMutation.mutate({
      name: holidayName,
      date: holidayDate,
      description: holidayDesc || undefined
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Portal & Geofence Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure office GPS coordinates, geofenced radius limits, shift rules, and public holidays (India - IST)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Office & GPS Settings Form */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <Card className="bg-white border-slate-200 p-4 sm:p-5">
            <CardHeader className="flex flex-row items-center gap-3 p-0 pb-4 border-b border-slate-100">
              <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">GEOFENCING & GPS LOCATION</CardTitle>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Determine office location boundary limits for attendance clock-ins</p>
              </div>
            </CardHeader>

            {isOfficeLoading || !officeSettings ? (
              <div className="space-y-3 pt-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <OfficeSettingsForm initialData={officeSettings} />
            )}
          </Card>
        </div>

        {/* Holidays List Card */}
        <div>
          <Card className="bg-white border-slate-200 p-4 sm:p-5">
            <CardHeader className="flex flex-row items-center justify-between p-0 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600 shrink-0">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">PUBLIC HOLIDAYS</CardTitle>
                  <p className="text-[10px] sm:text-[11px] text-slate-500">Dates bypassing GPS geofencing</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setIsHolidayOpen(true)} className="shrink-0">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </CardHeader>
            <div className="pt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Holiday Name</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isHolidaysLoading ? (
                    <TableRow>
                      <TableCell colSpan={3}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ) : holidays.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-6 text-slate-400 font-medium">
                        No holidays registered.
                      </TableCell>
                    </TableRow>
                  ) : (
                    holidays.map((h: HolidayData) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-semibold text-slate-500">{h.date}</TableCell>
                        <TableCell className="font-semibold text-slate-900">{h.name}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Remove holiday: ${h.name}?`)) {
                                deleteHolidayMutation.mutate(h.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>

      {/* ADD HOLIDAY DIALOG */}
      <Dialog isOpen={isHolidayOpen} onClose={() => setIsHolidayOpen(false)} title="Configure New Public Holiday" size="sm">
        <form onSubmit={handleHolidaySubmit} className="space-y-3">
          <Input label="Holiday Name *" value={holidayName} onChange={(e) => setHolidayName(e.target.value)} required placeholder="e.g. Independence Day" />
          <Input label="Holiday Date *" type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} required />
          <Input label="Description" value={holidayDesc} onChange={(e) => setHolidayDesc(e.target.value)} placeholder="e.g. National holiday" />
          
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsHolidayOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={addHolidayMutation.isPending}>
              {addHolidayMutation.isPending ? "Adding..." : "Register Holiday"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
