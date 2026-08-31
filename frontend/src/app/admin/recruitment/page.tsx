"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/utils/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button, Badge, SearchInput, Tabs, Input, Select } from "@/components/ui/atoms";
import { Dialog } from "@/components/ui/dialog";
import { UserCheck, Plus, ArrowRight, Briefcase, Users, Search, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/toast";

interface Department {
  id: number;
  name: string;
}

interface JobOpening {
  id: string;
  title: string;
  dept: string;
  type: string;
  applicants: number;
  status: "Active" | "Closed" | "Draft";
}

interface Applicant {
  id: string;
  jobId: string;
  name: string;
  role: string;
  stage: "Applied" | "Screening" | "Interview" | "Offered" | "Rejected";
  score: string;
  applied: string;
}

export default function RecruitmentAdminPage() {
  const { user } = useAuth();
  const orgSlug = user?.organization_slug || "default";
  const storageKeyOpenings = `recruitment_openings_${orgSlug}`;
  const storageKeyApplicants = `recruitment_applicants_${orgSlug}`;

  const [activeTab, setActiveTab] = useState("openings");
  const [search, setSearch] = useState("");
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);

  // Form fields
  const [jobTitle, setJobTitle] = useState("");
  const [jobDept, setJobDept] = useState("");
  const [jobType, setJobType] = useState("Full-Time");

  const [jobOpenings, setJobOpenings] = useState<JobOpening[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["recruitmentDepartments", orgSlug],
    queryFn: () => apiFetch<Department[]>("/employees/departments"),
  });

  // Load from localStorage for this organization
  useEffect(() => {
    try {
      const savedOpenings = localStorage.getItem(storageKeyOpenings);
      const savedApplicants = localStorage.getItem(storageKeyApplicants);
      if (savedOpenings) {
        setJobOpenings(JSON.parse(savedOpenings));
      } else {
        setJobOpenings([]);
      }
      if (savedApplicants) {
        setApplicants(JSON.parse(savedApplicants));
      } else {
        setApplicants([]);
      }
    } catch {
      setJobOpenings([]);
      setApplicants([]);
    } finally {
      setIsLoaded(true);
    }
  }, [storageKeyOpenings, storageKeyApplicants]);

  const saveOpenings = (newOpenings: JobOpening[]) => {
    setJobOpenings(newOpenings);
    try {
      localStorage.setItem(storageKeyOpenings, JSON.stringify(newOpenings));
    } catch {}
  };

  const handleCreateJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim()) {
      toast.error("Please enter a job title");
      return;
    }
    const deptName = jobDept || (departments[0]?.name || "Engineering & Tech");
    const newJob: JobOpening = {
      id: Date.now().toString(),
      title: jobTitle.trim(),
      dept: deptName,
      type: jobType,
      applicants: 0,
      status: "Active",
    };

    const updated = [newJob, ...jobOpenings];
    saveOpenings(updated);
    toast.success(`Job opening '${newJob.title}' posted successfully!`);
    setIsAddJobOpen(false);
    setJobTitle("");
    setJobDept("");
    setJobType("Full-Time");
  };

  const handleToggleStatus = (jobId: string) => {
    const updated = jobOpenings.map((job) =>
      job.id === jobId ? { ...job, status: (job.status === "Active" ? "Closed" : "Active") as "Active" | "Closed" } : job
    );
    saveOpenings(updated);
    toast.info("Job status updated.");
  };

  const activeOpeningsCount = jobOpenings.filter((j) => j.status === "Active").length;

  const filteredApplicants = applicants.filter(
    (cand) =>
      cand.name.toLowerCase().includes(search.toLowerCase()) ||
      cand.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Recruitment & Hiring Pipeline</h1>
            <Badge variant={activeOpeningsCount > 0 ? "primary" : "neutral"}>
              {activeOpeningsCount} Open {activeOpeningsCount === 1 ? "Role" : "Roles"}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Post job positions, track candidate stages, schedule interviews, and issue offer letters
          </p>
        </div>
        <Button size="sm" onClick={() => setIsAddJobOpen(true)} className="shrink-0 self-start sm:self-auto">
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
        jobOpenings.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 sm:p-12 text-center card-shadow">
            <div className="h-12 w-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
              <Briefcase className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">No Job Openings Posted Yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Your recruitment board is currently clean. Create your first opening to begin receiving applicants.
            </p>
            <Button size="sm" onClick={() => setIsAddJobOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Post Your First Job Opening
            </Button>
          </div>
        ) : (
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
                    <Button size="sm" variant="outline" onClick={() => handleToggleStatus(job.id)}>
                      {job.status === "Active" ? "Close Posting" : "Reopen Posting"}
                    </Button>
                    <Button size="sm" variant="soft" onClick={() => setActiveTab("applicants")}>
                      View Candidates <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <Card className="bg-white border-slate-200 p-4">
            <SearchInput
              placeholder="Search candidate name or position..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Card>

          {filteredApplicants.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center card-shadow">
              <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                <Users className="h-5 w-5" />
              </div>
              <h4 className="text-xs font-bold text-slate-800">No Candidate Applicants</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Applicants applying to your active job postings will appear here for stage tracking.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredApplicants.map((cand) => (
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
          )}
        </div>
      )}

      {/* Post New Opening Dialog */}
      <Dialog
        isOpen={isAddJobOpen}
        onClose={() => setIsAddJobOpen(false)}
        title="Post New Job Opening"
      >
        <form onSubmit={handleCreateJob} className="space-y-4">
          <Input
            label="Job Position Title *"
            placeholder="e.g. Senior Frontend Engineer"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            required
          />

          <Select
            label="Department"
            value={jobDept}
            onChange={(e) => setJobDept(e.target.value)}
            options={departments.map((d) => ({ value: d.name, label: d.name }))}
          />

          <Select
            label="Employment Type"
            value={jobType}
            onChange={(e) => setJobType(e.target.value)}
            options={[
              { value: "Full-Time", label: "Full-Time" },
              { value: "Part-Time", label: "Part-Time" },
              { value: "Contract / Freelance", label: "Contract / Freelance" },
              { value: "Remote / Hybrid", label: "Remote / Hybrid" },
            ]}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsAddJobOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Post Job Position
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
