/**
 * Skeleton — calm token-driven loading placeholder.
 * See `documents/ux design/19-implementation-safety.md § 4`.
 *
 * Use in two flavours:
 *   <Skeleton className="h-4 w-32" />        // single line
 *   <SkeletonBlock lines={3} />              // stacked paragraph block
 *   <SkeletonCard />                         // card-sized placeholder
 */
import React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('fc-skeleton', className)}
      {...props}
    />
  );
}

export function SkeletonBlock({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="fc-skeleton h-3"
          style={{ width: `${92 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('fc-card p-5', className)} aria-busy="true">
      <div className="fc-skeleton h-3 w-24 mb-4" />
      <div className="fc-skeleton h-6 w-32 mb-6" />
      <SkeletonBlock lines={3} />
    </div>
  );
}
