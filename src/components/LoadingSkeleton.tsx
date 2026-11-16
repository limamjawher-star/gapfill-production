'use client';

import React from 'react';

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({ rows = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      className={`space-y-3 rounded-2xl border border-[#EBEBEB] bg-white p-5 ${className}`}
    >
      <div className="h-4 w-1/3 animate-pulse rounded bg-[#EBEBEB]" />
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="flex items-center justify-between gap-4 border-t border-[#EBEBEB] pt-3"
        >
          <div className="h-3.5 w-2/5 animate-pulse rounded bg-[#F7F7F7]" />
          <div className="h-3.5 w-1/5 animate-pulse rounded bg-[#F7F7F7]" />
        </div>
      ))}
    </div>
  );
}
