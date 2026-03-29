import React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Target, Database } from "lucide-react";
import { datasetsApi } from "@/lib/api/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AnomalyRecord {
  idx: number;
  score: number;
  reason: string;
  data: Record<string, any>;
}

export function DatasetAnomalies({ datasetId }: { datasetId: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["datasets", datasetId, "anomalies"],
    queryFn: () => datasetsApi.anomalies(datasetId),
    staleTime: Infinity, // The data doesn't change unless file changes
  });

  if (isLoading) {
    return (
      <div className="mt-6 p-6 bg-background rounded-xl border border-border flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-text-secondary">Scanning for multivariate anomalies (Z-Score)...</p>
        </div>
      </div>
    );
  }

  if (error || !data) return null;

  const { anomalies, total_scanned } = data;

  if (anomalies.length === 0) {
    return (
      <div className="mt-6 p-4 bg-success-50 border border-success-200 rounded-xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-success-100 flex items-center justify-center flex-shrink-0">
          <Target className="w-4 h-4 text-success-600" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-success-900">No strict anomalies detected</h4>
          <p className="text-xs text-success-700 mt-0.5">Scanned {total_scanned} rows. The dataset falls within normal Z-score bounds.</p>
        </div>
      </div>
    );
  }

  return (
    <Card className="mt-6 border-danger-200 shadow-sm">
      <CardHeader className="bg-danger-50/50 border-b border-danger-100 flex flex-row items-center justify-between py-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-danger-600" />
          <CardTitle className="text-sm font-semibold text-danger-900">
            Detected {anomalies.length} Anomaly Row(s)
          </CardTitle>
        </div>
        <Badge variant="primary" className="bg-danger-100 text-danger-800 hover:bg-danger-100 border-none font-medium">
          Z-Score Filter
        </Badge>
      </CardHeader>
      <CardContent className="p-0 overflow-hidden rounded-b-xl">
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-background sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-2.5 px-4 font-semibold text-text-secondary border-b border-border text-xs w-16">Row ID</th>
                <th className="py-2.5 px-4 font-semibold text-text-secondary border-b border-border text-xs w-24">Risk Score</th>
                <th className="py-2.5 px-4 font-semibold text-text-secondary border-b border-border text-xs flex-1">Primary Driver</th>
                <th className="py-2.5 px-4 font-semibold text-text-secondary border-b border-border text-xs w-28">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {anomalies.map((a: AnomalyRecord) => (
                <tr key={a.idx} className="hover:bg-background/50 transition-colors">
                  <td className="py-3 px-4 text-text-primary font-mono text-xs">{a.idx}</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-50 text-danger-700 relative">
                       <span className="w-1.5 h-1.5 rounded-full bg-danger-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]"></span>
                       {a.score.toFixed(1)} SD
                    </span>
                  </td>
                  <td className="py-3 px-4 text-text-secondary text-xs truncate max-w-sm" title={a.reason}>
                    {a.reason}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-2xs font-mono bg-border/40 text-text-tertiary px-2 py-1 rounded w-24 truncate" title={JSON.stringify(a.data)}>
                      {JSON.stringify(a.data)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="bg-background px-4 py-2 border-t border-border flex justify-between items-center">
            <span className="text-xs text-text-tertiary flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Scanned {total_scanned} records
            </span>
            <span className="text-xs text-text-tertiary font-medium">Confidence &gt; 99.7%</span>
        </div>
      </CardContent>
    </Card>
  );
}
