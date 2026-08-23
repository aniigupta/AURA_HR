"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useMutation } from "@tanstack/react-query";
import { apiFetch, getBackendUrl } from "@/utils/api";
import { getPasswordStrengthError } from "@/utils/validation";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, Input } from "@/components/ui/atoms";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/context/AuthContext";
import { Lock, Phone, CalendarDays, ClipboardList } from "lucide-react";

export default function EmployeeProfilePage() {
  const { user, refreshUser } = useAuth();
  
  // Phone number state
  const [phone, setPhone] = useState(user?.profile?.phone || "");
  
  // Password change states
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const updatePhoneMutation = useMutation({
    mutationFn: (newPhone: string) => 
      apiFetch(`/employees/${user?.id}`, {
        method: "PUT",
        body: JSON.stringify({ phone: newPhone }),
      }),
    onSuccess: () => {
      toast.success("Phone number updated successfully!");
      refreshUser();
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to update phone number.";
      toast.error(errorMsg);
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: (payload: { old_password: string; new_password: string }) => 
      apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: unknown) => {
      const errorMsg = err instanceof Error ? err.message : "Failed to change password. Make sure current password is correct.";
      toast.error(errorMsg);
    }
  });

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updatePhoneMutation.mutate(phone);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    const passwordError = getPasswordStrengthError(newPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    changePasswordMutation.mutate({
      old_password: oldPassword,
      new_password: newPassword
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 card-shadow">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">My Portal Profile</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          View account metadata, update contact phone numbers, and change your portal password
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Profile Card */}
        <Card className="bg-white border-slate-200 p-4 sm:p-5 flex flex-col items-center text-center card-shadow">
          <div className="relative w-16 sm:w-20 h-16 sm:h-20 rounded-full overflow-hidden border-2 border-indigo-200 mb-3 bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xl sm:text-2xl">
            {user?.profile?.profile_image_url ? (
              <Image 
                src={`${getBackendUrl()}${user.profile.profile_image_url}`} 
                alt="profile pic" 
                fill
                sizes="80px"
                unoptimized
                className="object-cover" 
              />
            ) : (
              <span>
                {user?.profile?.first_name?.charAt(0)}
              </span>
            )}
          </div>

          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            {user?.profile?.first_name} {user?.profile?.last_name}
          </h2>
          <p className="text-xs text-indigo-600 font-semibold tracking-wide uppercase mt-0.5">
            {user?.profile?.designation || "Staff Member"}
          </p>
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium mt-0.5">
            EMPLOYEE ID: {user?.profile?.employee_id}
          </span>

          {/* Department Meta */}
          <div className="w-full mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-slate-100 text-left space-y-2.5 sm:space-y-3">
            <div className="flex gap-2.5 items-center">
              <ClipboardList className="h-4 w-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Department</span>
                <span className="text-xs font-semibold text-slate-800">
                  {user?.profile?.department?.name || "N/A"}
                </span>
              </div>
            </div>

            <div className="flex gap-2.5 items-center">
              <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase">Join Date</span>
                <span className="text-xs font-semibold text-slate-800">
                  {user?.profile?.join_date ? new Date(user.profile.join_date).toLocaleDateString() : "N/A"}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Update Forms */}
        <div className="md:col-span-2 space-y-4 sm:space-y-6">
          
          {/* Phone Form */}
          <Card className="bg-white border-slate-200 p-4 sm:p-5 card-shadow">
            <CardHeader className="flex flex-row items-center gap-2.5 p-0 pb-3 border-b border-slate-100">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 shrink-0">
                <Phone className="h-4 w-4" />
              </div>
              <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">CONTACT DETAILS</CardTitle>
            </CardHeader>
            <div className="pt-3.5 sm:pt-4">
              <form onSubmit={handlePhoneSubmit} className="space-y-3">
                <Input 
                  label="Contact Phone Number" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  placeholder="e.g. +91 98765 43210"
                />
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={updatePhoneMutation.isPending}>
                    {updatePhoneMutation.isPending ? "Saving..." : "Save Phone Info"}
                  </Button>
                </div>
              </form>
            </div>
          </Card>

          {/* Change Password Form */}
          <Card className="bg-white border-slate-200 p-4 sm:p-5 card-shadow">
            <CardHeader className="flex flex-row items-center gap-2.5 p-0 pb-3 border-b border-slate-100">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600 shrink-0">
                <Lock className="h-4 w-4" />
              </div>
              <CardTitle className="text-xs sm:text-sm font-bold text-slate-900">CHANGE PASSWORD</CardTitle>
            </CardHeader>
            <div className="pt-3.5 sm:pt-4">
              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                <Input 
                  label="Current Password *" 
                  type="password" 
                  value={oldPassword} 
                  onChange={(e) => setOldPassword(e.target.value)} 
                  required 
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input 
                    label="Enter New Password *" 
                    type="password" 
                    value={newPassword} 
                    onChange={(e) => setNewPassword(e.target.value)} 
                    required 
                  />
                  <Input 
                    label="Confirm New Password *" 
                    type="password" 
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    required 
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" size="sm" disabled={changePasswordMutation.isPending}>
                    {changePasswordMutation.isPending ? "Updating Password..." : "Change Account Password"}
                  </Button>
                </div>
              </form>
            </div>
          </Card>

        </div>

      </div>
    </div>
  );
}
