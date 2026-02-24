"use client";

import { useEffect, useState } from "react";

const capabilities = [
  "Finding and analyzing YouTube video transcripts",
  "Searching through Google Books",
  "Processing data with JSONata",
  "Retrieve all Customer and Order data",
  "Retrieve all Comments from the Comments API",
];

function MessageWelcome() {
  const [visible, setVisible] = useState<boolean[]>(new Array(capabilities.length).fill(false));

  useEffect(() => {
    capabilities.forEach((_, i) => {
      setTimeout(
        () => {
          setVisible((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
        },
        300 + i * 120,
      );
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 border border-slate-200">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Welcome to AI Agent Chat!{" "}
            <span className="inline-block" style={{ animation: "wave 1.5s ease-in-out" }}>
              👋
            </span>
          </h1>
        </div>

        {/* Subtitle */}
        <p className="text-slate-500 text-sm mb-4 font-medium">I can help you with:</p>

        {/* Capabilities List */}
        <ul className="space-y-2 mb-6">
          {capabilities.map((cap, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-slate-700 text-sm"
              style={{
                opacity: visible[i] ? 1 : 0,
                transform: visible[i] ? "translateX(0)" : "translateX(-10px)",
                transition: "opacity 0.4s ease, transform 0.4s ease",
              }}
            >
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 flex-shrink-0" />
              {cap}
            </li>
          ))}
        </ul>
      </div>
      <style>{`
        @keyframes wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(20deg); }
          75% { transform: rotate(-10deg); }
        }
      `}</style>
    </div>
  );
}

export default MessageWelcome;
