"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Activity,
  ChevronRight,
  ShieldCheck
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

const data = [
  { name: "Day 1", severity: 2 },
  { name: "Day 2", severity: 3 },
  { name: "Day 3", severity: 5 },
  { name: "Day 4", severity: 4 },
  { name: "Day 5", severity: 7 },
  { name: "Day 6", severity: 8 },
  { name: "Day 7", severity: 6 },
];

interface AIAnalysisProps {
  analysis?: {
    urgency: string;
    summary: string;
    risks: string[];
    reasoning: string;
  };
}

export const VisualAIInsights = ({ analysis }: AIAnalysisProps) => {
  const urgencyColor = 
    analysis?.urgency.toLowerCase() === "high" ? "text-red-500" :
    analysis?.urgency.toLowerCase() === "medium" ? "text-amber-500" :
    "text-emerald-500";

  const urgencyBg = 
    analysis?.urgency.toLowerCase() === "high" ? "bg-red-500/10" :
    analysis?.urgency.toLowerCase() === "medium" ? "bg-amber-500/10" :
    "bg-emerald-500/10";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glass-card rounded-3xl p-8 w-full max-w-4xl overflow-hidden"
    >
      <div className="flex flex-col md:flex-row gap-8">
        {/* Left Column: Summary & Urgency */}
        <div className="flex-1 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-600">
              <Activity size={24} />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">AI Intelligence Report</h2>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${urgencyBg} ${urgencyColor} uppercase`}>
                  {analysis?.urgency || "Low"} Priority Suggestion
                </span>
              </div>
            </div>
          </div>

          <p className="text-2xl font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
            {analysis?.summary || "Analyzing patient intake patterns to determine optimal care pathways..."}
          </p>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 text-blue-500">
                <CheckCircle2 size={18} />
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {analysis?.reasoning || "Historical data and reported symptoms are being processed through FrudgeCare's specialized clinical models."}
              </p>
            </div>
          </div>

          <div className="pt-4 flex flex-wrap gap-2">
            {analysis?.risks.map((risk, index) => (
              <span key={index} className="flex items-center gap-1.5 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl text-sm font-medium text-zinc-700 dark:text-zinc-300">
                <AlertTriangle size={14} className="text-amber-500" />
                {risk}
              </span>
            ))}
          </div>
        </div>

        {/* Right Column: Data Visualization */}
        <div className="flex-1 min-h-[300px] relative">
          <div className="absolute inset-0 bg-blue-500/5 rounded-3xl -z-10" />
          <div className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-zinc-600 dark:text-zinc-400">Symptom Severity Trend</h3>
              <TrendingUp size={18} className="text-blue-500" />
            </div>
            
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorSeverity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.8)',
                      borderRadius: '16px',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="severity" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorSeverity)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
              <div className="flex items-center gap-2 text-emerald-600 mb-1">
                <ShieldCheck size={18} />
                <span className="text-xs font-bold uppercase">Staff Review Required</span>
              </div>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                AI suggestion based on intake data. Final clinical decision must be made by a healthcare provider.
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
