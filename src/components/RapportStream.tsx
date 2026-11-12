"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Lichte sanitisatie van de (tijdens het streamen nog onvolledige) HTML voordat
// die live wordt weergegeven: verwijder scripts/styles en event-handlers.
function saneer(html: string): string {
  return html
    .replace(/```html?/gi, "")
    .replace(/```/g, "")
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?(<\/\1>|$)/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

/**
 * Genereert een AI-onderzoeksrapport en toont de tekst LIVE terwijl Claude
 * schrijft (streaming). Na afloop wordt de pagina ververst zodat de opgeslagen
 * versie en de "rapport openen"-link verschijnen.
 */
export function RapportStream({
  onderzoekId,
  bestaand,
  rapportPad,
}: {
  onderzoekId: string;
  bestaand: boolean;
  rapportPad?: string | null;
}) {
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);
  const [open, setOpen] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const preRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  async function genereer() {
    setBezig(true);
    setFout(null);
    setTekst("");
    setOpen(true);
    try {
      const res = await fetch(`/api/rapport/onderzoek/${onderzoekId}`, { method: "POST" });
      if (!res.ok || !res.body) throw new Error(`Serverfout (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setTekst((t) => t + decoder.decode(value, { stream: true }));
        // Meescrollen met de nieuwe tekst.
        requestAnimationFrame(() => {
          if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
        });
      }
      router.refresh();
    } catch (e: any) {
      setFout(e?.message ?? "Onbekende fout");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={genereer}
          disabled={bezig}
          className="btn-ghost inline-flex items-center gap-2 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-70"
        >
          {bezig && (
            <span
              aria-hidden
              className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          )}
          {bezig ? "AI schrijft…" : `✨ ${bestaand ? "Rapport opnieuw genereren" : "Genereer AI-rapport"}`}
        </button>
        {rapportPad && !bezig && (
          <a
            href={rapportPad}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-hanab-700 hover:underline"
          >
            rapport openen ↗
          </a>
        )}
      </div>

      {open && (
        <div
          ref={preRef}
          className="rapport-live mt-2 max-h-96 overflow-auto rounded-md bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 ring-1 ring-slate-200"
        >
          <div dangerouslySetInnerHTML={{ __html: saneer(tekst) }} />
          {bezig && !tekst && <span className="text-slate-400">…</span>}
          {bezig && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-slate-400 align-middle" />}
        </div>
      )}
      {fout && <p className="mt-1 text-xs text-rose-600">Kon rapport niet genereren: {fout}</p>}
    </div>
  );
}
