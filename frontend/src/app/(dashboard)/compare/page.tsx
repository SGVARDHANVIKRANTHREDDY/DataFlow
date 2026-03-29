"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  ArrowRightLeft, AlertCircle, Database, BarChart2, Cpu, LucideIcon 
} from "lucide-react";
import { datasetsApi } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";

interface DatasetStats {
  ready: boolean;
  name: string;
  health_score: number;
  row_count: number;
  col_count: number;
  memory_usage: number;
  missing_cells: number;
  duplicate_rows: number;
}

interface CompareResponse {
  dataset1: DatasetStats;
  dataset2: DatasetStats;
}

export default function ComparePage() {
  const [targetId1, setTargetId1] = useState<number | "">("");
  const [targetId2, setTargetId2] = useState<number | "">("");

  // Reuse the datasets list from cache to populate drop-downs
  const { data: listData } = useQuery({
    queryKey: ["datasets", 1, 50],
    queryFn: () => datasetsApi.list(1, 50),
    staleTime: 60000,
  });

  const { data: compareData, isLoading, isError } = useQuery({
    queryKey: ["datasets", "compare", targetId1, targetId2],
    queryFn: () => datasetsApi.compare(targetId1 as number, targetId2 as number),
    enabled: typeof targetId1 === "number" && typeof targetId2 === "number" && targetId1 !== targetId2,
  });

  const datasets = listData?.items || [];

  return (
    <div className="layout-page animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Dataset Comparison</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            Compare data drift and statistical metrics side-by-side
          </p>
        </div>
      </div>

      <Card className="mb-8">
        <CardContent className="flex flex-col sm:flex-row items-center justify-center gap-6 py-8">
          <div className="flex-1 w-full max-w-sm">
            <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">
              Baseline Dataset
            </label>
            <div className="relative">
              <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <select
                value={targetId1}
                onChange={(e) => setTargetId1(e.target.value ? Number(e.target.value) : "")}
                className="w-full h-11 pl-10 pr-10 appearance-none bg-background text-sm text-text-primary border border-border rounded-xl focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all outline-none cursor-pointer"
              >
                <option value="">Select baseline...</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-10 h-10 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center flex-shrink-0 animate-pulse mt-6 sm:mt-0">
            <ArrowRightLeft className="w-5 h-5" />
          </div>

          <div className="flex-1 w-full max-w-sm">
            <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase tracking-wide">
              Target Dataset
            </label>
            <div className="relative">
              <Database className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <select
                value={targetId2}
                onChange={(e) => setTargetId2(e.target.value ? Number(e.target.value) : "")}
                className="w-full h-11 pl-10 pr-10 appearance-none bg-background text-sm text-text-primary border border-border rounded-xl focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all outline-none cursor-pointer"
              >
                <option value="">Select target...</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {targetId1 === targetId2 && targetId1 !== "" && (
         <div className="mb-8 p-4 bg-warning-50 border border-warning-200 rounded-xl text-warning-800 text-sm font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Please select two different datasets to compare.
         </div>
      )}

      {isLoading && (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary-500 border-t-transparent animate-spin" />
        </div>
      )}

      {compareData && !isLoading && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <DatasetDetailCard title="Baseline" data={compareData.dataset1} isBaseline={true} opponent={compareData.dataset2} />
          <DatasetDetailCard title="Target" data={compareData.dataset2} isBaseline={false} opponent={compareData.dataset1} />
        </div>
      )}

      {!compareData && !isLoading && (
        <EmptyState
          icon={BarChart2}
          title="Ready to compare"
          description="Select two profiled datasets above to analyze feature drift and health variance."
        />
      )}
    </div>
  );
}

function DatasetDetailCard({ title, data, isBaseline, opponent }: { title: string, data: DatasetStats, opponent: DatasetStats, isBaseline: boolean }) {
  if (!data.ready) {
    return (
      <Card className="h-full border-border">
        <CardHeader className="bg-background border-b border-border py-4">
           <CardTitle className="text-base text-text-secondary">{title} Dataset</CardTitle>
        </CardHeader>
        <CardContent className="p-8 flex items-center justify-center flex-col text-center">
            <AlertCircle className="w-8 h-8 text-text-tertiary mb-3 opacity-50" />
            <p className="text-text-secondary font-medium text-sm">Profile Not Found</p>
            <p className="text-xs text-text-tertiary mt-1">Make sure this dataset has completed profiling.</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate generic arrows
  const getDiff = (key: keyof DatasetStats) => {
      if (!opponent.ready) return null;
      const v1 = data[key];
      const v2 = opponent[key];
      if (typeof v1 !== 'number' || typeof v2 !== 'number') return null;
      if (v1 === v2) return null;
      
      const isHigher = v1 > v2;
      const diffVal = v1 - v2;
      const diffStr = isHigher ? `+${diffVal.toLocaleString()}` : diffVal.toLocaleString();
      
      // Determine color based on whether higher is "good" or "bad"
      let goodDirection = true;
      if (["health_score", "row_count", "col_count"].includes(key)) goodDirection = isHigher;
      else if (["missing_cells", "duplicate_rows", "memory_usage"].includes(key)) goodDirection = !isHigher;
      else goodDirection = true; // Neutral fallback

      const color = goodDirection ? "text-success-600" : "text-danger-600";
      return <span className={cn("text-xs font-semibold ml-2", color)}>{diffStr}</span>;
  };

  return (
    <Card className={cn("shadow-sm overflow-hidden", isBaseline ? "border-primary-200" : "border-accent-200")}>
      <CardHeader className={cn("border-b py-4", isBaseline ? "bg-primary-50/50 border-primary-100" : "bg-accent-50/50 border-accent-100")}>
        <div className="flex justify-between items-center">
            <Badge variant={isBaseline ? "primary" : "info"}>
              {title}
            </Badge>
            <span className="text-sm font-bold text-text-primary font-mono">{data.name}</span>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
            <CompareRow label="Health Score" value={`${data.health_score}/100`} diff={getDiff('health_score')} icon={BarChart2} />
            <CompareRow label="Rows" value={(data.row_count || 0).toLocaleString()} diff={getDiff('row_count')} icon={Database} />
            <CompareRow label="Columns" value={data.col_count} diff={getDiff('col_count')} />
            <CompareRow label="Memory Usage" value={`${data.memory_usage?.toFixed(2)} MB`} diff={getDiff('memory_usage')} icon={Cpu} />
            <CompareRow label="Missing Cells" value={(data.missing_cells || 0).toLocaleString()} diff={getDiff('missing_cells')} />
            <CompareRow label="Duplicate Rows" value={(data.duplicate_rows || 0).toLocaleString()} diff={getDiff('duplicate_rows')} />
        </ul>
      </CardContent>
    </Card>
  );
}

function CompareRow({ label, value, diff, icon: Icon }: { label: string, value: string | number, diff?: React.ReactNode, icon?: LucideIcon }) {
    return (
        <li className="px-6 py-4 flex items-center justify-between hover:bg-background/50 transition-colors">
            <span className="text-sm text-text-secondary font-medium flex items-center gap-2">
                {Icon && <Icon className="w-4 h-4 text-text-tertiary" />}
                {label}
            </span>
            <div className="flex items-center">
                <span className="text-sm font-semibold text-text-primary bg-background px-2.5 py-1 rounded border border-border">{value}</span>
                {diff && <span className="w-16 text-right block">{diff}</span>}
                {!diff && <span className="w-16 flex justify-end block"><MinusDashes /></span>}
            </div>
        </li>
    );
}

const MinusDashes = () => <span className="text-text-tertiary opacity-30">--</span>;
