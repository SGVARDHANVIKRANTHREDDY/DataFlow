"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Database, GitBranch, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function OnboardingCard() {
  const steps = [
    {
      id: "upload",
      title: "Upload your data",
      description: "Import a CSV file to begin your pipeline journey.",
      icon: Database,
      done: false,
      href: "/datasets",
    },
    {
      id: "profile",
      title: "Profile & Cleanse",
      description: "AI-powered anomaly detection and sanitization.",
      icon: Zap,
      done: false,
      href: "/datasets",
    },
    {
      id: "pipeline",
      title: "Create Pipeline",
      description: "Build logic steps using our NL-to-DSL engine.",
      icon: GitBranch,
      done: false,
      href: "/pipelines",
    },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const progressPercent = (completedCount / steps.length) * 100;

  return (
    <Card className="border-primary-100 bg-gradient-to-br from-primary-50/50 to-white overflow-hidden shadow-sm">
      <CardContent className="p-0">
        <div className="flex flex-col md:flex-row">
          {/* Progress Section */}
          <div className="p-6 md:p-8 flex-1">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-text-primary">Getting Started</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Complete these steps to launch your first pipeline.
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-primary-600 font-mono">
                  {Math.round(progressPercent)}%
                </span>
                <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Progress</p>
              </div>
            </div>

            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={step.id} className="flex gap-4 group">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10 transition-colors",
                      step.done ? "bg-success-500 text-white" : "bg-white border-2 border-border text-text-tertiary"
                    )}>
                      {step.done ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-2xs font-bold">{idx + 1}</span>}
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="w-0.5 h-full bg-border -mt-1 -mb-1" />
                    )}
                  </div>
                  <div className="pb-4">
                    <Link href={step.href} className="group-hover:text-primary-600 transition-colors">
                       <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                         {step.title}
                         <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                       </h4>
                    </Link>
                    <p className="text-xs text-text-secondary mt-0.5">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-primary-600 p-8 md:w-80 flex flex-col justify-center text-white relative overflow-hidden">
             <div className="relative z-10">
                <h4 className="text-lg font-bold mb-2">Ready to scale?</h4>
                <p className="text-primary-100 text-sm mb-6 leading-relaxed">
                  Upload your first dataset and let our AI engine handle the heavy lifting of profiling and cleansing.
                </p>
                <Link href="/datasets">
                  <Button className="w-full bg-white text-primary-600 hover:bg-primary-50 border-none shadow-lg">
                    Start Onboarding
                  </Button>
                </Link>
             </div>
             {/* Decorative background element */}
             <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
             <Zap className="absolute top-4 right-4 w-24 h-24 text-white/5 rotate-12 pointer-events-none" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
