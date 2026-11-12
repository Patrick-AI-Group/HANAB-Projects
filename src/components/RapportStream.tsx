"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  const preRef = useRef<HTMLPreElement>(null);
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
        <pre
          ref={preRef}
          className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 font-sans text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200"
        >
          {tekst || (bezig ? "…" : "")}
          {bezig && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-slate-400 align-middle" />}
        </pre>
      )}
      {fout && <p className="mt-1 text-xs text-rose-600">Kon rapport niet genereren: {fout}</p>}
    </div>
  );
}
