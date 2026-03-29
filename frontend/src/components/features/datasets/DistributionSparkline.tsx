import React from "react";

interface DistributionSparklineProps {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

export function DistributionSparkline({ min, q1, median, q3, max }: DistributionSparklineProps) {
  // Guard against invalid ranges
  if (min >= max) {
    return <div className="h-2 w-full bg-border rounded-full" />;
  }

  const range = max - min;
  const getPercent = (val: number) => Math.max(0, Math.min(100, ((val - min) / range) * 100));

  const pQ1 = getPercent(q1);
  const pMed = getPercent(median);
  const pQ3 = getPercent(q3);

  return (
    <div className="w-full relative h-6 py-2 pb-0 group" title={`Min: ${min}\nQ1: ${q1}\nMedian: ${median}\nQ3: ${q3}\nMax: ${max}`}>
      {/* Background track (Min to Max) */}
      <div className="absolute top-1/2 -mt-[1px] h-[2px] w-full bg-border rounded-full" />
      
      {/* IQR Box (Q1 to Q3) */}
      <div
        className="absolute top-1/2 -mt-1 h-2 bg-primary-200 border border-primary-300 rounded-[2px]"
        style={{ left: `${pQ1}%`, width: `${Math.max(2, pQ3 - pQ1)}%` }}
      />
      
      {/* Median marked line */}
      <div
        className="absolute top-1/2 -mt-1.5 h-3 w-0.5 bg-primary-600 rounded-full group-hover:bg-primary-700 transition-colors"
        style={{ left: `${Math.min(99, pMed)}%` }}
      />
    </div>
  );
}
