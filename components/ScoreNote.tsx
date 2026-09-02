"use client";

import { useState } from "react";

// Sits under a compliance score wherever one is read in detail.
//
// Users were treating the number as a mark to get to 100 and getting frustrated
// that they never could. Two things are true and neither was said anywhere on
// the site: an LLM will almost never return 100 because it is asked to keep
// looking for room to improve, and it returns a slightly different number each
// run (one policy here scored 62 and then 68 on the same version). Left
// unexplained, a governance number that moves on its own reads as broken.
//
// The headline stays visible. The detail is behind a button so the panel is not
// a wall of text for people who already know.
export default function ScoreNote() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 text-sm">
      <p className="text-gray-600">
        This is an AI assessment, not an official mark from the GDE or DoE. Use
        it to find issues, not as a target to reach 100.
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-1 text-primary hover:underline font-medium"
      >
        {open ? "Hide explanation" : "Why is it not 100?"}
      </button>

      {open && (
        <ul className="mt-2 space-y-2 text-gray-600 list-disc pl-5">
          <li>
            Almost no policy scores 100. The check is asked to keep looking for
            room to improve, so there is nearly always something on the list.
          </li>
          <li>
            The same document can score a few points differently each time it is
            checked, because the AI reads it fresh on every run. Treat a move of
            a few points as normal. A move of twenty or more is worth a look.
          </li>
          <li>
            The number is only a summary. The issues listed below are the useful
            part. Work through them and mark each one as you go.
          </li>
          <li>
            A lower score does not mean the policy is invalid or that the school
            is non-compliant. It means the check found points worth reviewing.
          </li>
        </ul>
      )}
    </div>
  );
}
