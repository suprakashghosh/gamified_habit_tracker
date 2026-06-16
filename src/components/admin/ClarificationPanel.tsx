"use client";

import { useState } from "react";
import { HelpCircle, Loader2 } from "lucide-react";
import type { ClarificationFromLLM } from "@/actions/llm";

interface ClarificationPanelProps {
  clarifications: ClarificationFromLLM[];
  onResolve: (answers: Record<string, string>) => void;
  isLoading: boolean;
}

export function ClarificationPanel({
  clarifications,
  onResolve,
  isLoading,
}: ClarificationPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function handleChange(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function handleResolve() {
    onResolve(answers);
  }

  return (
    <div className="flex flex-col gap-[--spacing-lg]">
      <div className="flex items-center gap-[--spacing-xs] font-display text-xs tracking-wider text-game-text-main">
        <HelpCircle className="h-5 w-5 text-game-lunar" />
        Need a little clarity
      </div>

      <div className="flex flex-col gap-[--spacing-md]">
        {clarifications.map((item, itemIndex) => (
          <div
            key={itemIndex}
            className="bg-game-bg-panel border border-game-border rounded-sm p-[--spacing-md]"
          >
            <p className="mb-[--spacing-sm] font-display text-xs tracking-wider text-game-text-main">
              {item.originalTodo}
            </p>
            {item.suggestedUnit && (
              <p className="mb-[--spacing-sm] font-mono text-xs text-game-text-muted">
                Suggested unit: {item.suggestedUnit}
                {item.suggestedTotal !== undefined && ` · total: ${item.suggestedTotal}`}
              </p>
            )}
            <ul className="mb-[--spacing-md] flex list-disc flex-col gap-[--spacing-xs] pl-[--spacing-md]">
              {item.questions.map((question, qIndex) => (
                <li key={qIndex} className="font-mono text-xs text-game-text-muted">
                  {question}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-[--spacing-sm]">
              {item.questions.map((question, qIndex) => {
                const key = `${itemIndex}-${qIndex}`;
                return (
                  <input
                    key={key}
                    type="text"
                    value={answers[key] ?? ""}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={question}
                    disabled={isLoading}
                    className="w-full bg-game-bg-main border border-game-border px-[--spacing-sm] py-[--spacing-xs] font-mono text-xs text-game-text-main outline-none placeholder:text-game-text-dim focus:border-game-lunar disabled:opacity-60 rounded-sm"
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleResolve}
          disabled={isLoading}
          className="inline-flex items-center gap-[--spacing-xs] bg-game-lunar px-[--spacing-lg] py-[--spacing-sm] font-display text-[10px] uppercase tracking-wider text-game-bg-main transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 rounded-sm"
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Resolve
        </button>
      </div>
    </div>
  );
}
