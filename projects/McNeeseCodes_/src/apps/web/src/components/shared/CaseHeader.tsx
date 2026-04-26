import React from 'react';
import { StatusChip } from './StatusChip';
import { cn } from '@/lib/utils';
import { AlertCircle, Clock } from 'lucide-react'; // Assuming lucide-react is installed, standard for shadcn

export interface CaseHeaderProps {
  caseId: string;
  patientName: string;
  demographics?: string; // e.g., "45yo F"
  urgency: 'Routine' | 'Urgent' | 'Emergency';
  currentState: "Submitted" | "Under Review" | "Waiting on Patient" | "Nurse Pending" | "Provider Review" | "Follow-up Due" | "Escalated" | "Closed";
  nextOwnerRole: string;
  waitingOn?: string;
  appointmentStatus?: string;
  lastUpdated: string;
  isEscalated?: boolean;
  actionButtons?: React.ReactNode;
}

export function CaseHeader({
  caseId,
  patientName,
  demographics,
  urgency,
  currentState,
  nextOwnerRole,
  waitingOn,
  appointmentStatus,
  lastUpdated,
  isEscalated,
  actionButtons
}: CaseHeaderProps) {
  return (
    <div className="flex flex-col bg-white border border-slate-900/10 rounded-[20px] p-[20px] sm:p-[20px_24px] gap-3 mb-1">
      {/* Top Row: Core Entity & Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-slate-900 text-[20px] font-bold leading-tight">{patientName}</h2>
            {demographics && <span className="text-slate-500 text-[14px] font-medium">{demographics}</span>}
          </div>
          <span className="text-slate-400 text-[12px] font-semibold tracking-wider">#{caseId}</span>
          
          <div className="w-px h-4 bg-slate-200 hidden md:block mx-1" />

          <div className="flex items-center gap-2">
            {urgency === 'Urgent' && <span className="text-amber-700 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded text-[12px] font-bold tracking-wide uppercase">Urgent</span>}
            {urgency === 'Emergency' && <span className="text-red-700 bg-red-50 border border-red-200/50 px-2 py-0.5 rounded text-[12px] font-bold tracking-wide uppercase">Emergency</span>}
            {isEscalated && (
              <span className="flex items-center gap-1 text-red-700 font-bold bg-red-50 border border-red-200/50 px-2 py-0.5 rounded text-[12px] uppercase">
                <AlertCircle className="w-3.5 h-3.5" /> Escalated
              </span>
            )}
            <StatusChip status={currentState} />
          </div>
        </div>

        {/* Action Injection */}
        {actionButtons && (
          <div className="flex items-center gap-2">
            {actionButtons}
          </div>
        )}
      </div>

      {/* Bottom Row: State Metadata */}
      <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-[13px] font-medium text-slate-500">
        {waitingOn && (
          <span className="flex items-center gap-1.5 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-slate-400" /> Waiting on: {waitingOn}
          </span>
        )}
        
        {nextOwnerRole && (
          <div className="flex items-center text-slate-600">
             <span className="text-slate-400 mr-1.5">Next up:</span>
             {nextOwnerRole}
          </div>
        )}

        {appointmentStatus && (
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /> 
            {appointmentStatus}
          </span>
        )}

        <div className="flex-1" />
        
        <span className="text-slate-400 flex items-center gap-1.5">
           <span className="w-1.5 h-1.5 rounded-full bg-[rgba(15,76,129,0.4)]" />
           Updated {lastUpdated}
        </span>
      </div>
    </div>
  );
}
