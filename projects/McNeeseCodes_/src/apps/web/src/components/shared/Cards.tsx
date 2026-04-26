/**
 * Shared card primitives.
 *
 * Implements `documents/ux design/90-component-card.md`.
 * Now routes through the globals.css `.fc-card` family so every surface
 * shares identical border, radius, and shadow (no more copy-pasted
 * `bg-white border border-slate-300 rounded-[16px] shadow-resting`).
 *
 * Radius tiers (spec 00 § 11):
 *   r-card    12 px → KPICard, SummaryCard (default tier)
 *   r-dialog  16 px → ActionPanel (grouped panel)
 *   r-feature 20 px → Card size="feature" (landing / login)
 */

import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTooltip } from './InfoTooltip';

type CardTone = 'default' | 'muted' | 'feature' | 'feature-dark';
type CardSize = 'compact' | 'default' | 'feature';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  size?: CardSize;
  /** When true, card is interactive — hover elevation allowed (spec 90 § States). */
  interactive?: boolean;
}

const CARD_SIZE_PAD: Record<CardSize, string> = {
  compact: 'p-4',
  default: 'p-5',
  feature: 'p-7',
};

const CARD_TONE_CLASS: Record<CardTone, string> = {
  default:         'fc-card',
  muted:           'fc-card-muted',
  feature:         'fc-card-feature',
  'feature-dark':  'fc-card-feature-dark',
};

/** Canonical card wrapper — prefer this over ad-hoc bg/border/rounded combos. */
export function Card({
  tone = 'default',
  size = 'default',
  interactive = false,
  className,
  ...props
}: CardProps) {
  const isFeature = tone === 'feature' || tone === 'feature-dark';
  return (
    <div
      className={cn(
        CARD_TONE_CLASS[tone],
        CARD_SIZE_PAD[size],
        interactive && !isFeature && 'fc-card-interactive',
        className,
      )}
      {...props}
    />
  );
}

interface BaseCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

type TrendDirection = 'up' | 'down' | 'flat';

export interface KPICardProps extends BaseCardProps {
  title: string;
  value: string | number;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
  /** Optional explanation shown in a tooltip next to the title. */
  info?: string;
  /** Emphasis trend chip shown next to the value. */
  trend?: { direction: TrendDirection; label: string; tone?: 'positive' | 'negative' | 'neutral' };
  /** Use a larger numeral + tighter vertical rhythm to make a standout metric pop. */
  emphasis?: boolean;
}

const TREND_CLASS: Record<NonNullable<NonNullable<KPICardProps['trend']>['tone']>, string> = {
  positive: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  negative: 'bg-rose-50 text-rose-700 border border-rose-200',
  neutral:  'bg-slate-50 text-slate-600 border border-slate-200',
};

export function KPICard({
  className,
  title,
  value,
  footer,
  icon,
  info,
  trend,
  emphasis = false,
  ...props
}: KPICardProps) {
  const TrendIcon =
    trend?.direction === 'up' ? ArrowUpRight :
    trend?.direction === 'down' ? ArrowDownRight : null;

  return (
    <Card
      className={cn('min-h-[108px] flex flex-col justify-between', className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="fc-eyebrow truncate">{title}</span>
          {info && <InfoTooltip label={title} description={info} />}
        </div>
        {icon && <span className="text-slate-400 flex-shrink-0" aria-hidden="true">{icon}</span>}
      </div>

      <div className="mt-3 mb-1 flex items-end justify-between gap-2">
        {/* role: kpi-numeral (spec 00 § 8.2) */}
        <span
          className={cn(
            'font-semibold text-slate-900 tracking-tight tabular-nums',
            emphasis ? 'text-[32px] leading-[36px]' : 'text-[28px] leading-[32px]',
          )}
        >
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-[2px] rounded-full leading-none',
              TREND_CLASS[trend.tone ?? 'neutral'],
            )}
            title={trend.label}
          >
            {TrendIcon && <TrendIcon className="w-3 h-3" strokeWidth={2.4} />}
            {trend.label}
          </span>
        )}
      </div>

      {props.children}

      {footer && (
        <div className="text-[12px] font-medium text-slate-500 mt-auto">{footer}</div>
      )}
    </Card>
  );
}

export function SummaryCard({
  className,
  title,
  children,
  footer,
  ...props
}: BaseCardProps & { title: string; footer?: React.ReactNode }) {
  return (
    <Card className={cn('min-h-[160px] flex flex-col', className)} {...props}>
      <h3 className="fc-section-title mb-3">{title}</h3>
      <div className="text-[14px] leading-[22px] text-slate-700 flex-1">
        {children}
      </div>
      {footer && (
        <div className="mt-4 pt-3 border-t fc-divider text-[12px] font-medium text-slate-500">
          {footer}
        </div>
      )}
    </Card>
  );
}

export function ActionPanel({
  className,
  children,
  title,
  isSticky = false,
  info,
  aside,
  ...props
}: BaseCardProps & {
  title?: string;
  isSticky?: boolean;
  /** Optional explanation surfaced next to the panel title. */
  info?: string;
  /** Optional right-aligned element in the header row (badge, button, timestamp). */
  aside?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'fc-card-muted p-5',
        isSticky && 'sticky top-[88px]',
        className,
      )}
      {...props}
    >
      {(title || aside) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          {title && (
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="fc-section-title truncate">{title}</h3>
              {info && <InfoTooltip label={title} description={info} />}
            </div>
          )}
          {aside && <div className="flex-shrink-0">{aside}</div>}
        </div>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
