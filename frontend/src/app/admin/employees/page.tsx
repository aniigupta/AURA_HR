"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getBackendUrl } from "@/utils/api";
import { getPasswordStrengthError } from "@/utils/validation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button, Input, Select, Badge, Skeleton, SearchInput } from "@/components/ui/atoms";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { 
  Edit, Trash2, Key, ToggleLeft, ToggleRight, 
  Upload, UserPlus
} from "lucide-react";

export interface DepartmentRecord {
  id: number;
  name: string;
  description?: string;
}

export interface EmployeeProfileRecord {
  first_name: string;
  last_name: string;
  employee_id: string;
  phone?: string | null;
  designation?: string | null;
  department_id?: number | null;
  profile_image_url?: string | null;
  leave_balance_casual: number;
  leave_balance_sick: number;
  leave_balance_paid: number;
  hourly_rate?: number;
  base_salary?: number;
  wfh_enabled: boolean;
  wfh_start_date?: string | null;
  wfh_end_date?: string | null;
  wfh_reason?: string | null;
  department?: DepartmentRecord;
}

export interface EmployeeRecord {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  profile?: EmployeeProfileRecord;
}

export default function EmployeesAdminPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("");
  
  // Dialog visibility states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  
  // Active selection states
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  
  // Form input states
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formEmpCode, setFormEmpCode] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formDesignation, setFormDesignation] = useState("");
  const [formDeptId, setFormDeptId] = useState<number>(0);
  const [formCasualBal, setFormCasualBal] = useState(12);
  const [formSickBal, setFormSickBal] = useState(10);
  const [formPaidBal, setFormPaidBal] = useState(15);
  
  // Salary / Compensation states (INR ₹)
  const [formHourlyRate, setFormHourlyRate] = useState<number>(650.0);
  const [formBaseSalary, setFormBaseSalary] = useState<number>(95000.0);

  // WFH Edit configs inside edit form
  const [formWfhEnabled, setFormWfhEnabled] = useState(false);
  const [formWfhStart, setFormWfhStart] = useState("");
  const [formWfhEnd, setFormWfhEnd] = useState("");
  const [formWfhReason, setFormWfhReason] = useState("");

  const [formNewPass, setFormNewPass] = useState("");

  // Queries
  const { data: employees = [], isLoading } = useQuery<EmployeeRecord[]>({
    queryKey: ["employees", search, selectedDept],
    queryFn: () => apiFetch<EmployeeRecord[]>("/employees", {
      params: {
        search: search || undefined,
        department_id: selectedDept ? parseInt(selectedDept) : undefined,
      }
    })
  });

  const { data: departments = [] } = useQuery<DepartmentRecord[]>({
    queryKey: ["departments"],
    queryFn: () => apiFetch<DepartmentRecord[]>("/employees/departments")
  });

  // Mutators
  const createMutation = useMutation({
    mutationFn: (newEmp: unknown) => apiFetch("/employees", {
      method: "POST",
      body: JSON.stringify(newEmp)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee profile created successfully!");
      setIsAddOpen(false);
      resetAddForm();
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to create employee.";
      toast.error(errorMsg);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string, payload: unknown }) => apiFetch(`/employees/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee updated successfully!");
      setIsEditOpen(false);
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to update employee details.";
      toast.error(errorMsg);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/employees/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee deleted successfully.");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to delete employee.";
      toast.error(errorMsg);
    }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/employees/${id}/toggle-status`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Status toggled successfully.");
    }
  });

  const resetPassMutation = useMutation({
    mutationFn: ({ id, pass }: { id: string, pass: string }) => apiFetch(`/employees/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ new_password: pass })
    }),
    onSuccess: () => {
      toast.success("Password reset completed successfully.");
      setIsResetOpen(false);
      setFormNewPass("");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to reset password.";
      toast.error(errorMsg);
    }
  });

  const resetAddForm = () => {
    setFormEmail("");
    setFormPassword("");
    setFormFirstName("");
    setFormLastName("");
    setFormEmpCode("");
    setFormPhone("+91 ");
    setFormDesignation("");
    setFormDeptId(departments[0]?.id || 0);
    setFormCasualBal(12);
    setFormSickBal(10);
    setFormPaidBal(15);
    setFormHourlyRate(650.0);
    setFormBaseSalary(95000.0);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail || !formPassword || !formFirstName || !formLastName || !formEmpCode) {
      toast.error("Please fill in all mandatory fields.");
      return;
    }
    const passwordError = getPasswordStrengthError(formPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }

    createMutation.mutate({
      email: formEmail,
      password: formPassword,
      role: "Employee",
      profile: {
        first_name: formFirstName,
        last_name: formLastName,
        employee_id: formEmpCode,
        phone: formPhone || undefined,
        designation: formDesignation || undefined,
        department_id: formDeptId ? parseInt(formDeptId.toString()) : undefined,
        leave_balance_casual: parseInt(formCasualBal.toString()),
        leave_balance_sick: parseInt(formSickBal.toString()),
        leave_balance_paid: parseInt(formPaidBal.toString()),
        hourly_rate: parseFloat(formHourlyRate.toString()) || 0.0,
        base_salary: parseFloat(formBaseSalary.toString()) || 0.0,
      }
    });
  };

  const handleEditClick = (emp: EmployeeRecord) => {
    setSelectedEmployee(emp);
    setFormFirstName(emp.profile?.first_name || "");
    setFormLastName(emp.profile?.last_name || "");
    setFormEmpCode(emp.profile?.employee_id || "");
    setFormPhone(emp.profile?.phone || "");
    setFormDesignation(emp.profile?.designation || "");
    setFormDeptId(emp.profile?.department_id || 0);
    setFormCasualBal(emp.profile?.leave_balance_casual ?? 12);
    setFormSickBal(emp.profile?.leave_balance_sick ?? 10);
    setFormPaidBal(emp.profile?.leave_balance_paid ?? 15);
    setFormHourlyRate(emp.profile?.hourly_rate ?? 650.0);
    setFormBaseSalary(emp.profile?.base_salary ?? 95000.0);
    
    setFormWfhEnabled(emp.profile?.wfh_enabled ?? false);
    setFormWfhStart(emp.profile?.wfh_start_date || "");
    setFormWfhEnd(emp.profile?.wfh_end_date || "");
    setFormWfhReason(emp.profile?.wfh_reason || "");

    setIsEditOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFirstName || !formLastName) {
      toast.error("Name is required");
      return;
    }
    if (!selectedEmployee) return;

    updateMutation.mutate({
      id: selectedEmployee.id,
      payload: {
        first_name: formFirstName,
        last_name: formLastName,
        phone: formPhone || null,
        designation: formDesignation || null,
        department_id: formDeptId ? parseInt(formDeptId.toString()) : null,
        leave_balance_casual: parseInt(formCasualBal.toString()),
        leave_balance_sick: parseInt(formSickBal.toString()),
        leave_balance_paid: parseInt(formPaidBal.toString()),
        hourly_rate: parseFloat(formHourlyRate.toString()) || 0.0,
        base_salary: parseFloat(formBaseSalary.toString()) || 0.0,
        wfh_enabled: formWfhEnabled,
        wfh_start_date: formWfhStart || null,
        wfh_end_date: formWfhEnd || null,
        wfh_reason: formWfhReason || null,
      }
    });
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const passwordError = getPasswordStrengthError(formNewPass || "");
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (!selectedEmployee) return;
    resetPassMutation.mutate({ id: selectedEmployee.id, pass: formNewPass });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, empId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      await apiFetch(`/employees/${empId}/upload-avatar`, {
        method: "POST",
        body: formData,
      });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Avatar uploaded successfully!");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to upload avatar.";
      toast.error(errorMsg);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Employee Directory & Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Register workforce members, configure department roles, INR CTC salary structures, and WFH privileges
          </p>
        </div>
        <Button onClick={() => { resetAddForm(); setIsAddOpen(true); }} size="sm" className="shrink-0 self-start sm:self-auto">
          <UserPlus className="h-4 w-4 mr-1.5" />
          Add Employee
        </Button>
      </div>

      {/* Search & Filters Card */}
      <Card className="bg-white border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex-1 w-full">
            <SearchInput
              placeholder="Search by name, email, or employee code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-56">
            <Select
              options={[
                { label: "All Departments", value: "" },
                ...departments.map((d: DepartmentRecord) => ({ label: d.name, value: d.id }))
              ]}
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Employees Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Avatar</TableHead>
            <TableHead>ID Code</TableHead>
            <TableHead>Employee Name</TableHead>
            <TableHead>Email Address</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Designation</TableHead>
            <TableHead>Rate (INR)</TableHead>
            <TableHead>WFH Status</TableHead>
            <TableHead>Account Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <TableRow key={idx}>
                {Array.from({ length: 10 }).map((_, cIdx) => (
                  <TableCell key={cIdx}><Skeleton className="h-5 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : employees.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-10 text-slate-400 font-medium">
                No employee profiles match your search filters.
              </TableCell>
            </TableRow>
          ) : (
            employees.map((emp: EmployeeRecord) => (
              <TableRow key={emp.id}>
                {/* Avatar Upload Cell */}
                <TableCell>
                  <div className="relative group w-8 h-8 rounded-full overflow-hidden border border-slate-200 flex items-center justify-center bg-indigo-50 text-indigo-700 font-bold text-xs">
                    {emp.profile?.profile_image_url ? (
                      <Image 
                        src={`${getBackendUrl()}${emp.profile.profile_image_url}`} 
                        alt="avatar" 
                        fill
                        sizes="32px"
                        unoptimized
                        className="object-cover" 
                      />
                    ) : (
                      <span>
                        {emp.profile?.first_name?.charAt(0)}
                      </span>
                    )}
                    {/* Hover Overlay */}
                    <label className="absolute inset-0 bg-slate-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      <Upload className="h-3.5 w-3.5 text-white" />
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => handleFileChange(e, emp.id)} 
                      />
                    </label>
                  </div>
                </TableCell>
                <TableCell className="font-semibold text-slate-400">{emp.profile?.employee_id}</TableCell>
                <TableCell className="font-semibold text-slate-900">
                  {emp.profile?.first_name} {emp.profile?.last_name}
                </TableCell>
                <TableCell className="text-slate-500">{emp.email}</TableCell>
                <TableCell className="font-medium text-slate-700">
                  {emp.profile?.department?.name || "N/A"}
                </TableCell>
                <TableCell className="text-slate-600">{emp.profile?.designation || "N/A"}</TableCell>
                <TableCell className="font-semibold text-emerald-700">
                  ₹{emp.profile?.hourly_rate ? emp.profile.hourly_rate.toFixed(2) : "0.00"}/hr
                </TableCell>
                <TableCell>
                  {emp.profile?.wfh_enabled ? (
                    <Badge variant="primary">WFH Active</Badge>
                  ) : (
                    <Badge variant="neutral">GPS Verified</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {emp.is_active ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditClick(emp)}
                      title="Edit employee details"
                    >
                      <Edit className="h-3.5 w-3.5 text-indigo-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setSelectedEmployee(emp); setIsResetOpen(true); }}
                      title="Reset employee password"
                    >
                      <Key className="h-3.5 w-3.5 text-amber-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleStatusMutation.mutate(emp.id)}
                      title={emp.is_active ? "Deactivate account" : "Activate account"}
                    >
                      {emp.is_active ? (
                        <ToggleRight className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-slate-400" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this employee profile?")) {
                          deleteMutation.mutate(emp.id);
                        }
                      }}
                      title="Delete employee"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* ADD EMPLOYEE DIALOG */}
      <Dialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Register New Employee (India)" size="lg">
        <form onSubmit={handleAddSubmit} className="space-y-3.5 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
            <Input label="Corporate Email *" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required placeholder="name@company.in" />
            <Input label="Initial Password *" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required />
            <Input label="First Name *" value={formFirstName} onChange={(e) => setFormFirstName(e.target.value)} required placeholder="e.g. Rajesh" />
            <Input label="Last Name *" value={formLastName} onChange={(e) => setFormLastName(e.target.value)} required placeholder="e.g. Sharma" />
            <Input label="Employee ID Code *" value={formEmpCode} onChange={(e) => setFormEmpCode(e.target.value)} required placeholder="EMP002" />
            <Input label="Phone Number" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+91 98765 43210" />
            <Input label="Designation" value={formDesignation} onChange={(e) => setFormDesignation(e.target.value)} placeholder="Software Engineer" />
            <Select 
              label="Department"
              options={departments.map((d: DepartmentRecord) => ({ label: d.name, value: d.id }))}
              value={formDeptId}
              onChange={(e) => setFormDeptId(parseInt(e.target.value))}
            />
          </div>

          <h4 className="text-xs font-bold text-slate-900 pt-2 border-t border-slate-100 uppercase tracking-wider">LEAVE BALANCES (ANNUAL)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Casual Leaves (CL)" type="number" value={formCasualBal} onChange={(e) => setFormCasualBal(parseInt(e.target.value))} />
            <Input label="Sick Leaves (SL)" type="number" value={formSickBal} onChange={(e) => setFormSickBal(parseInt(e.target.value))} />
            <Input label="Paid Leaves (PL)" type="number" value={formPaidBal} onChange={(e) => setFormPaidBal(parseInt(e.target.value))} />
          </div>

          <h4 className="text-xs font-bold text-indigo-600 pt-2 border-t border-slate-100 uppercase tracking-wider">SALARY & CTC (INR ₹)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Hourly Rate (₹ / hr)" type="number" step="1" value={formHourlyRate} onChange={(e) => setFormHourlyRate(parseFloat(e.target.value))} />
            <Input label="Monthly Base Salary (₹)" type="number" step="1" value={formBaseSalary} onChange={(e) => setFormBaseSalary(parseFloat(e.target.value))} />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm">Register Account</Button>
          </div>
        </form>
      </Dialog>

      {/* EDIT EMPLOYEE DIALOG */}
      <Dialog isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Update Employee Profile" size="lg">
        <form onSubmit={handleEditSubmit} className="space-y-3.5 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
            <Input label="First Name *" value={formFirstName} onChange={(e) => setFormFirstName(e.target.value)} required />
            <Input label="Last Name *" value={formLastName} onChange={(e) => setFormLastName(e.target.value)} required />
            <Input label="Employee ID Code" value={formEmpCode} disabled />
            <Input label="Phone Number" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+91 98765 43210" />
            <Input label="Designation" value={formDesignation} onChange={(e) => setFormDesignation(e.target.value)} />
            <Select 
              label="Department"
              options={departments.map((d: DepartmentRecord) => ({ label: d.name, value: d.id }))}
              value={formDeptId}
              onChange={(e) => setFormDeptId(parseInt(e.target.value))}
            />
          </div>

          <h4 className="text-xs font-bold text-slate-900 pt-2 border-t border-slate-100 uppercase tracking-wider">LEAVE BALANCES</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Casual Leaves (CL)" type="number" value={formCasualBal} onChange={(e) => setFormCasualBal(parseInt(e.target.value))} />
            <Input label="Sick Leaves (SL)" type="number" value={formSickBal} onChange={(e) => setFormSickBal(parseInt(e.target.value))} />
            <Input label="Paid Leaves (PL)" type="number" value={formPaidBal} onChange={(e) => setFormPaidBal(parseInt(e.target.value))} />
          </div>

          <h4 className="text-xs font-bold text-indigo-600 pt-2 border-t border-slate-100 uppercase tracking-wider">SALARY & CTC (INR ₹)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Hourly Rate (₹ / hr)" type="number" step="1" value={formHourlyRate} onChange={(e) => setFormHourlyRate(parseFloat(e.target.value))} />
            <Input label="Monthly Base Salary (₹)" type="number" step="1" value={formBaseSalary} onChange={(e) => setFormBaseSalary(parseFloat(e.target.value))} />
          </div>

          {/* WFH CONFIGURATION */}
          <h4 className="text-xs font-bold text-slate-900 pt-2 border-t border-slate-100 uppercase tracking-wider">WORK FROM HOME EXCEPTION</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <input 
                type="checkbox" 
                id="wfh-toggle" 
                checked={formWfhEnabled} 
                onChange={(e) => setFormWfhEnabled(e.target.checked)} 
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="wfh-toggle" className="text-xs font-medium text-slate-700 cursor-pointer">
                Grant Work-From-Home (Bypass GPS Geofence Verification)
              </label>
            </div>
            
            {formWfhEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg animate-in fade-in-50 duration-150">
                <Input label="Start Date" type="date" value={formWfhStart} onChange={(e) => setFormWfhStart(e.target.value)} />
                <Input label="End Date" type="date" value={formWfhEnd} onChange={(e) => setFormWfhEnd(e.target.value)} />
                <div className="sm:col-span-2">
                  <Input label="WFH Reason" value={formWfhReason} onChange={(e) => setFormWfhReason(e.target.value)} placeholder="e.g. Remote assignment, medical isolation..." />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm">Save Changes</Button>
          </div>
        </form>
      </Dialog>

      {/* RESET PASSWORD DIALOG */}
      <Dialog isOpen={isResetOpen} onClose={() => setIsResetOpen(false)} title="Reset Account Password" size="sm">
        <form onSubmit={handleResetSubmit} className="space-y-4">
          <Input 
            label="New Account Password *" 
            type="password" 
            placeholder="At least 6 characters" 
            value={formNewPass} 
            onChange={(e) => setFormNewPass(e.target.value)} 
            required 
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsResetOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm">Reset Password</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
