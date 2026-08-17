"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button, Badge, SearchInput, Tabs } from "@/components/ui/atoms";
import { UserCheck, Plus, ArrowRight } from "lucide-react";
import { toast } from "@/components/ui/toast";

export default function RecruitmentAdminPage() {
  const [activeTab, setActiveTab] = useState("openings");
  const [search, setSearch] = useState("");

  const jobOpenings = [
    { id: 1, title: "Senior Full Stack Engineer", dept: "Engineering", type: "Full-Time", applicants: 24, status: "Active" },
    { id: 2, title: "UI/UX Product Designer", dept: "Product", type: "Full-Time", applicants: 18, status: "Active" },
    { id: 3, title: "DevOps & Cloud Specialist", dept: "Engineering", type: "Full-Time", applicants: 11, status: "Active" },
    { id: 4, title: "HR Generalist", dept: "Human Resources", type: "Full-Time", applicants: 32, status: "Closed" },
  ];

  const applicants = [
    { id: 1, name: "Marcus Vance", role: "Senior Full Stack Engineer", stage: "Interview", score: "92%", applied: "Aug 10" },
    { id: 2, name: "Elena Rostova", role: "UI/UX Product Designer", stage: "Screening", score: "88%", applied: "Aug 12" },
    { id: 3, name: "Liam O'Connor", role: "Senior Full Stack Engineer", stage: "Offered", score: "96%", applied: "Aug 08" },
    { id: 4, name: "Sophia Zhang", role: "DevOps Specialist", stage: "Applied", score: "84%", applied: "Aug 14" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Recruitment & Hiring Pipeline</h1>
            <Badge variant="primary">3 Open Roles</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Post job positions, track candidate stages, schedule interviews, and issue offer letters
          </p>
        </div>
        <Button size="sm" onClick={() => toast.success("Create new job opening form launched.")} className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-1.5" />
          Post New Opening
        </Button>
      </div>

      <Tabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { id: "openings", label: "Active Job Positions", count: jobOpenings.length },
          { id: "applicants", label: "Candidate Applicants", count: applicants.length },
        ]}
      />

      {activeTab === "openings" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {jobOpenings.map((job) => (
            <Card key={job.id} className="bg-white border-slate-200 card-shadow-hover p-4 sm:p-5">
              <CardHeader className="flex flex-row items-start justify-between p-0 pb-3 border-b border-slate-100">
                <div className="pr-2">
                  <CardTitle className="text-sm sm:text-base text-slate-900 font-bold">{job.title}</CardTitle>
                  <span className="text-xs text-slate-500 font-medium block mt-0.5">{job.dept} • {job.type}</span>
                </div>
                <Badge variant={job.status === "Active" ? "success" : "neutral"} className="shrink-0">{job.status}</Badge>
              </CardHeader>
              <CardContent className="p-0 pt-3 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="flex items-center gap-1.5 font-medium">
                    <UserCheck className="h-4 w-4 text-indigo-600" /> Total Applicants
                  </span>
                  <span className="font-bold text-slate-900">{job.applicants} Candidates</span>
                </div>
                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => toast.info("Opening job details...")}>
                    Manage Posting
                  </Button>
                  <Button size="sm" variant="soft" onClick={() => setActiveTab("applicants")}>
                    View Candidates <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="bg-white border-slate-200 p-4">
            <SearchInput
              placeholder="Search candidate name or position..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Card>

          <div className="grid grid-cols-1 gap-3">
            {applicants.map((cand) => (
              <div key={cand.id} className="p-3.5 sm:p-4 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 card-shadow">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center border border-indigo-200 shrink-0">
                    {cand.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{cand.name}</h4>
                    <p className="text-[11px] text-slate-500">{cand.role} • Applied {cand.applied}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Match Score</span>
                    <span className="text-xs font-bold text-emerald-700">{cand.score}</span>
                  </div>
                  <Badge variant={cand.stage === "Offered" ? "success" : cand.stage === "Interview" ? "primary" : "neutral"}>
                    {cand.stage}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => toast.success(`Viewing evaluation for ${cand.name}`)}>
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
