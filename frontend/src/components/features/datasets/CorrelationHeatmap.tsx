import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { motion } from "framer-motion";

interface CorrelationHeatmapProps {
  correlations?: Record<string, Record<string, number>>;
}

export function CorrelationHeatmap({ correlations }: CorrelationHeatmapProps) {
  if (!correlations || Object.keys(correlations).length < 2) {
    return null;
  }

  const columns = Object.keys(correlations);

  // Helper to color map correlation values [-1, 1]
  const getColor = (value: number) => {
    const intensity = Math.abs(value);
    if (value > 0) {
      // Primary hue (Indigo 500 equivalent)
      return `rgba(99, 102, 241, ${intensity})`;
    } else {
      // Danger/Error hue (Red 500 equivalent)
      return `rgba(239, 68, 68, ${intensity})`;
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="mt-8 border border-border shadow-sm">
        <CardHeader className="bg-background/50 border-b border-border">
          <CardTitle className="flex items-center gap-2 text-text-primary">
            <Activity className="w-4 h-4 text-primary-500" />
            Pearson Correlation Matrix
          </CardTitle>
          <p className="text-xs text-text-secondary mt-1">
            Detect relationships between numeric features. Values range from -1 (inverse) to 1 (direct).
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[600px] p-4">
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `minmax(120px, auto) repeat(${columns.length}, 1fr)` }}
            >
              {/* Header Row */}
              <div className="h-10"></div>
              {columns.map((col) => (
                <div key={`header-${col}`} className="h-10 flex items-center justify-center -rotate-12 transform origin-bottom-left text-xs font-medium text-text-secondary truncate px-2">
                  {col}
                </div>
              ))}

              {/* Data Rows */}
              {columns.map((row) => (
                <React.Fragment key={`row-${row}`}>
                  <div className="flex items-center justify-end pr-4 text-xs font-medium text-text-secondary truncate h-12">
                    {row}
                  </div>
                  {columns.map((col) => {
                    const val = correlations[row]?.[col] ?? 0;
                    return (
                      <div
                        key={`cell-${row}-${col}`}
                        className="h-12 flex items-center justify-center rounded-md text-xs font-semibold tabular-nums border border-border/10 transition-colors hover:border-text-primary"
                        style={{
                          backgroundColor: getColor(val),
                          color: Math.abs(val) > 0.4 ? "#ffffff" : "var(--text-primary)"
                        }}
                        title={`${row} & ${col}: ${val}`}
                      >
                        {val.toFixed(2)}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
