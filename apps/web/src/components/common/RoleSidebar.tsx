"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, ClipboardList, Stethoscope,
  Settings, BarChart3, History, LogOut, Calendar
} from 'lucide-react';
import { UserRole } from '@/types';

interface SidebarItem { icon: any; label: string; href: string; }

const ROLE_NAV: Record<UserRole, SidebarItem[]> = {
  patient: [
    { icon: ClipboardList,   label: 'Intake',          href: '/patient/intake' },
    { icon: LayoutDashboard, label: 'Status',           href: '/patient/status' },
    { icon: History,         label: 'History',          href: '/patient/history' },
  ],
  front_desk: [
    { icon: ClipboardList,   label: 'Queue',            href: '/front-desk/queue' },
    { icon: Calendar,        label: 'Appointments',     href: '/front-desk/appointments' },
  ],
  nurse: [
    { icon: Stethoscope,     label: 'Triage Workspace', href: '/nurse' },
  ],
  provider: [
    { icon: Stethoscope,     label: 'Daily List',       href: '/provider/daily' },
    { icon: LayoutDashboard, label: 'Case Dashboard',   href: '/provider/daily' },
  ],
  operations: [
    { icon: BarChart3,  label: 'Dashboard', href: '/operations/dashboard' },
    { icon: History,    label: 'Audit Log', href: '/operations/audit' },
  ],
  admin: [
    { icon: Settings,   label: 'Settings',  href: '/settings' },
  ],
};

export const RoleSidebar = ({ role }: { role: UserRole }) => {
  const pathname = usePathname();
  const router = useRouter();
  const navItems = ROLE_NAV[role] || [];

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/');
  };

  return (
    <aside className="h-screen flex flex-col py-6 gap-6 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 w-16 lg:w-64 transition-all duration-300 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 lg:px-4 overflow-hidden">
        <div className="w-9 h-9 rounded-xl bg-[#0F4C81] flex items-center justify-center text-white font-black text-lg shrink-0 shadow-lg">
          F
        </div>
        <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 hidden lg:block whitespace-nowrap">
          Frudge<span className="text-[#0F4C81] dark:text-blue-400">Care</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 w-full space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname?.startsWith(item.href + '/') ?? false);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`w-full flex items-center gap-3 px-2.5 py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-[#0F4C81] text-white shadow-md'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              <item.icon size={20} className="shrink-0" />
              <span className="font-medium hidden lg:block whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 space-y-1 border-t border-zinc-100 dark:border-zinc-800 pt-4">
        <Link
          href="/settings"
          title="Settings"
          className={`w-full flex items-center gap-3 px-2.5 py-3 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors ${
            pathname === '/settings' ? 'text-[#0F4C81]' : ''
          }`}
        >
          <Settings size={20} className="shrink-0" />
          <span className="font-medium hidden lg:block">Settings</span>
        </Link>
        <button
          onClick={handleLogout}
          title="Logout"
          className="w-full flex items-center gap-3 px-2.5 py-3 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
        >
          <LogOut size={20} className="shrink-0" />
          <span className="font-medium hidden lg:block">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
