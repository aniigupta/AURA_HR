"use client";

import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, AreaChart, Area, Legend
} from "recharts";

export interface DailyGraphPoint {
  date: string;
  day: string;
  present: number;
  late: number;
  wfh: number;
}

export interface MonthlyGraphPoint {
  month: string;
  present: number;
}

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "#ffffff",
  borderColor: "#e2e8f0",
  borderRadius: "8px",
  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
};
const TOOLTIP_LABEL_STYLE = { color: "#1e293b", fontWeight: "bold", fontSize: 12 };

export function DailyAttendanceChart({ data }: { data?: DailyGraphPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="day" stroke="#64748b" fontSize={11} />
        <YAxis stroke="#64748b" fontSize={11} />
        <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Bar dataKey="present" name="Present" fill="#4f46e5" radius={[4, 4, 0, 0]} />
        <Bar dataKey="late" name="Late Arrivals" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="wfh" name="Work From Home" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyTurnoutChart({ data }: { data?: MonthlyGraphPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
        <YAxis stroke="#64748b" fontSize={11} />
        <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
        <Area
          type="monotone"
          dataKey="present"
          name="Turnout Count"
          stroke="#4f46e5"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorPresent)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
