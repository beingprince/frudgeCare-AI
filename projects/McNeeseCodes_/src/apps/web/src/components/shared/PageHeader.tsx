/**
 * PageHeader — canonical page title strip.
 *
 * Replaces the scattered per-route patterns like:
 *   <div className="px-4 md:px-6 py-4 md:py-5 border-b bg-white ...">
 *     <h1 className="text-[20px] md:text-[22px] font-bold ...">Title</h1>
 *     <p className="text-[12px] text-slate-500 ...">Subtitle</p>
 *   </div>
 *
 * Uses `.fc-page-title` / `.fc-page-subtitle` utilities for unified typography,
 * without italic / uppercase / tracking-tighter gimmicks (spec 20 § Tone).
 *
 * Density:
 *   - Staff surfaces  → `compact`  (py-4, border-b)
 *   - Patient pages   → `airy`     (py-6, no border) — pairs with wider whitespace
 */
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { InfoTooltip } from './InfoTooltip';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-hand side actions / filters / meta. */
  actions?: React.ReactNode;
  /** Optional eyebrow (small uppercase label above title). */
  eyebrow?: React.ReactNode;
  density?: 'compact' | 'airy';
  className?: string;
  /** Force a solid background (default: white on staff, transparent on airy). */
  bgSolid?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  density = 'compact',
  className,
  bgSolid,
}: PageHeaderProps) {
  const isAiry = density === 'airy';
  const solid = bgSolid ?? !isAiry;
  return (
    <header
      className={cn(
        'flex items-start justify-between gap-4 flex-shrink-0',
        'px-4 md:px-6',
        isAiry ? 'py-5 md:py-6' : 'py-4 md:py-5',
        solid && 'bg-white',
        !isAiry && 'border-b border-slate-200',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="fc-eyebrow mb-1">{eyebrow}</div>}
        <h1 className="fc-page-title truncate">{title}</h1>
        {subtitle && <p className="fc-page-subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </header>
  );
}

interface SectionHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Explanatory tooltip attached to the title. */
  info?: string;
  /** Small badge element shown inline next to the title (e.g. count, status). */
  badge?: React.ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}

/**
 * SectionHeader — small titled strip used at the top of a card / panel.
 * Use inside cards; outside cards use PageHeader.
 */
export function SectionHeader({
  title,
  subtitle,
  actions,
  info,
  badge,
  as: Tag = 'h2',
  className,
}: SectionHeaderProps) {
  const infoLabel = typeof title === 'string' ? title : 'Section';
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 mb-4',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Tag className="fc-section-title truncate">{title}</Tag>
          {info && <InfoTooltip label={infoLabel} description={info} />}
          {badge}
        </div>
        {subtitle && (
          <p className="text-[12px] text-slate-500 mt-0.5 leading-[16px]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  );
}
