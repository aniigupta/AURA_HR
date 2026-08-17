"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/utils/api";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button, Badge, Input, Skeleton } from "@/components/ui/atoms";
import { Dialog } from "@/components/ui/dialog";
import { Building2, Users, Plus, Edit, ShieldCheck } from "lucide-react";
import { toast } from "@/components/ui/toast";

interface Department {
  id: number;
  name: string;
  description?: string;
}

export default function DepartmentsAdminPage() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptDesc, setDeptDesc] = useState("");

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ["adminDepartmentsList"],
    queryFn: () => apiFetch<Department[]>("/employees/departments")
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName) return;
    toast.success(`Department '${deptName}' created successfully!`);
    setIsAddOpen(false);
    setDeptName("");
    setDeptDesc("");
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Departments & Team Units</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Organize company units, assign department managers, and audit workforce headcount distribution
          </p>
        </div>
        <Button size="sm" onClick={() => setIsAddOpen(true)} className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Department
        </Button>
      </div>

      {/* Grid of Departments */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <Card key={idx} className="bg-white border-slate-200 p-4">
              <CardHeader className="p-0 pb-3">
                <Skeleton className="h-5 w-32 mb-1" />
                <Skeleton className="h-3 w-48" />
              </CardHeader>
              <CardContent className="p-0 pt-2">
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))
        ) : (
          departments.map((dept: Department) => (
            <Card key={dept.id} className="bg-white border-slate-200 card-shadow-hover p-4 sm:p-5">
              <CardHeader className="flex flex-row items-start justify-between p-0 pb-3 border-b border-slate-100">
                <div className="pr-2">
                  <CardTitle className="flex items-center gap-2 text-slate-900 text-sm sm:text-base">
                    <Building2 className="h-4.5 w-4.5 text-indigo-600 shrink-0" />
                    <span className="truncate">{dept.name}</span>
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs line-clamp-2">{dept.description || "Core organizational team unit"}</CardDescription>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-slate-600 shrink-0">
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 p-0 pt-3">
                <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-500" />
                    <span className="font-semibold text-slate-700">Team Status</span>
                  </div>
                  <Badge variant="primary">Active</Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Manager:</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" /> System Lead
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ADD DEPARTMENT DIALOG */}
      <Dialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Department" size="sm">
        <form onSubmit={handleAddSubmit} className="space-y-3 sm:space-y-4">
          <Input
            label="Department Name *"
            placeholder="e.g. Quality Assurance"
            value={deptName}
            onChange={(e) => setDeptName(e.target.value)}
            required
          />
          <Input
            label="Description"
            placeholder="Key responsibilities of this team unit..."
            value={deptDesc}
            onChange={(e) => setDeptDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm">Create Unit</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
