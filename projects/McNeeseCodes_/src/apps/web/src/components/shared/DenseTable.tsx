import React from 'react';
import { cn } from '@/lib/utils';

export interface DenseTableColumn<T> {
  header: React.ReactNode;
  accessor: (row: T) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  isAction?: boolean;
}

export interface DenseTableProps<T> {
  data: T[];
  columns: DenseTableColumn<T>[];
  keyExtractor: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectedKey?: string;
  className?: string;
}

export function DenseTable<T>({ data, columns, keyExtractor, onRowClick, selectedKey, className }: DenseTableProps<T>) {
  return (
    <div className={cn("w-full overflow-auto bg-white border border-slate-300 rounded-[16px] shadow-resting", className)}>
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 border-b border-slate-300 sticky top-0 z-10">
          <tr>
            {columns.map((col, index) => (
              <th
                key={index}
                className={cn(
                  "h-[44px] px-[16px] py-[12px] text-[12px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap",
                  col.align === 'center' ? 'text-center' : col.align === 'right' || col.isAction ? 'text-right' : 'text-left'
                )}
                style={{ width: col.width }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const isSelected = selectedKey === keyExtractor(row);
            return (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "h-[56px] border-b border-slate-200 last:border-b-0 transition-colors cursor-pointer",
                  isSelected 
                    ? "bg-blue-50/50 relative after:content-[''] after:absolute after:left-0 after:top-0 after:bottom-0 after:w-1 after:bg-[#0F4C81]" 
                    : "hover:bg-slate-50"
                )}
              >
                {columns.map((col, idx) => (
                  <td
                    key={idx}
                    className={cn(
                      "px-[16px] py-[12px] text-[13px] font-medium text-slate-700",
                      col.align === 'center' ? 'text-center' : col.align === 'right' || col.isAction ? 'text-right' : 'text-left'
                    )}
                  >
                    {col.accessor(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
