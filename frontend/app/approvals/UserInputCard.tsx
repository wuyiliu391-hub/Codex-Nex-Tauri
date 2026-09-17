/**
 * Inline user-input questionnaire — the official requestUserInput surface.
 *
 * The official client renders this INLINE in the message stream (see the
 * `requestUserInputAsync.questionIndex` handling in conversation-blocks), not
 * as a modal. Questions are structured: each carries a header, a question body,
 * and optional selectable options.
 *
 * Wire shapes (protocol/v2/item.rs):
 *   ToolRequestUserInputQuestion { id, header, question, isOther, isSecret, options[] }
 *   ToolRequestUserInputResponse { answers: { [questionId]: { answers: string[] } } }
 *
 * `answers` is an array per question, so multi-select is representable.
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { removePendingRequest } from "@/state/turnStore";
import type { PendingRequest } from "@/state/types";

interface QuestionOption {
  label?: unknown;
  description?: unknown;
}

interface Question {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: QuestionOption[];
}

function parseQuestions(params: Record<string, unknown>): Question[] {
  const raw = params["questions"];
  if (!Array.isArray(raw)) return [];
  const out: Question[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const id = typeof rec["id"] === "string" ? rec["id"] : null;
    if (!id) continue;
    out.push({
      id,
      header: typeof rec["header"] === "string" ? rec["header"] : "",
      question: typeof rec["question"] === "string" ? rec["question"] : "",
      isOther: rec["isOther"] === true,
      isSecret: rec["isSecret"] === true,
      options: Array.isArray(rec["options"]) ? (rec["options"] as QuestionOption[]) : [],
    });
  }
  return out;
}

function optionLabel(option: QuestionOption): string {
  return typeof option.label === "string" ? option.label : "";
}

function optionDescription(option: QuestionOption): string {
  return typeof option.description === "string" ? option.description : "";
}

export function UserInputCard({ request }: { request: PendingRequest }) {
  const params = request.params;
  const questions = parseQuestions(params);
  const isBlocking = params["isBlocking"] !== false;

  // questionId -> selected labels / free text
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  function setAnswer(questionId: string, values: string[]): void {
    setAnswers((prev) => ({ ...prev, [questionId]: values }));
  }

  function toggleOption(questionId: string, label: string): void {
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      const next = current.includes(label)
        ? current.filter((v) => v !== label)
        : [...current, label];
      return { ...prev, [questionId]: next };
    });
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setFailed(null);
    try {
      const payload: Record<string, { answers: string[] }> = {};
      for (const q of questions) {
        const values = answers[q.id] ?? [];
        // Omit unanswered optional questions; the server tolerates missing keys.
        if (values.length) payload[q.id] = { answers: values };
      }
      await invoke("respond_server_request", {
        requestId: request.id,
        result: { answers: payload },
      });
      removePendingRequest(request.id);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!questions.length) return null;

  return (
    <section className="user-input-card" data-request-id={String(request.id)}>
      {questions.map((q) => {
        const selected = answers[q.id] ?? [];
        return (
          <div className="user-input-question" key={q.id}>
            {q.header ? <div className="user-input-header">{q.header}</div> : null}
            {q.question ? <p className="user-input-body">{q.question}</p> : null}

            {q.options.length ? (
              <div className="user-input-options">
                {q.options.map((option, i) => {
                  const label = optionLabel(option);
                  const desc = optionDescription(option);
                  if (!label) return null;
                  return (
                    <button
                      key={`${q.id}-${i}`}
                      type="button"
                      className={`user-input-option${selected.includes(label) ? " is-selected" : ""}`}
                      onClick={() => toggleOption(q.id, label)}
                    >
                      <span className="user-input-option-label">{label}</span>
                      {desc ? <span className="user-input-option-desc">{desc}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {q.isOther || !q.options.length ? (
              <input
                className="user-input-field"
                type={q.isSecret ? "password" : "text"}
                placeholder={q.options.length ? "Other…" : ""}
                value={selected.filter((v) => !q.options.some((o) => optionLabel(o) === v)).join(", ")}
                onChange={(e) => {
                  const typed = e.target.value;
                  const fromOptions = selected.filter((v) =>
                    q.options.some((o) => optionLabel(o) === v),
                  );
                  setAnswer(q.id, typed ? [...fromOptions, typed] : fromOptions);
                }}
              />
            ) : null}
          </div>
        );
      })}

      <div className="user-input-actions">
        <button type="button" className="approval-card-btn is-primary" disabled={busy} onClick={() => void submit()}>
          {isBlocking ? "Submit" : "Send"}
        </button>
      </div>

      {failed ? <div className="approval-card-error">Respond failed: {failed}</div> : null}
    </section>
  );
}
