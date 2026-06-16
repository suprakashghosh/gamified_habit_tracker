"use client";

import { useState } from "react";
import { GenerateButton } from "./GenerateButton";

interface TodoInputProps {
  onGenerate: (rawTodos: string) => void;
  isLoading: boolean;
}

export function TodoInput({ onGenerate, isLoading }: TodoInputProps) {
  const [value, setValue] = useState("");

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onGenerate(trimmed);
  }

  return (
    <div className="flex flex-col gap-[--spacing-md]">
      <label className="font-display text-[10px] tracking-wider text-game-text-dim uppercase">
        Paste your todos
      </label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Read 20 pages, drink 8 glasses of water, run a 5k..."
        rows={6}
        disabled={isLoading}
        className="w-full resize-y bg-game-bg-panel border border-game-border p-[--spacing-md] font-mono text-sm text-game-text-main outline-none transition-colors placeholder:text-game-text-dim focus:border-game-lunar disabled:opacity-60 rounded-sm"
      />
      <div className="flex justify-end">
        <GenerateButton onClick={handleSubmit} isLoading={isLoading} />
      </div>
    </div>
  );
}
