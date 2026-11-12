import Link from "next/link";
import { getSetting, apiKeyBron, getModel, STANDAARD_MODEL } from "@/lib/settings";
import { opslaanInstellingen, wisApiKey, testVerbinding } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Instellingen() {
  const bron = await apiKeyBron();
  const model = await getModel();
  const ruweTest = await getSetting("laatste_test");
  let test: { ok: boolean; bericht: string; tijd?: string } | null = null;
  if (ruweTest) {
    try {
      test = JSON.parse(ruweTest);
    } catch {
      test = null;
    }
  }

  const bronLabel =
    bron === "instellingen"
      ? { tekst: "Ingesteld (in de app)", kleur: "bg-emerald-100 text-emerald-800 ring-emerald-200" }
      : bron === "omgeving"
        ? { tekst: "Uit omgeving (.env)", kleur: "bg-blue-100 text-blue-800 ring-blue-200" }
        : { tekst: "Niet ingesteld — AI draait op lokale fallback", kleur: "bg-amber-100 text-amber-800 ring-amber-200" };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/" className="text-sm text-hanab-700 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Instellingen</h1>
        <p className="mt-1 text-sm text-slate-500">Beheer de Anthropic (Claude) API-sleutel voor de AI-functies.</p>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Anthropic API-sleutel</h2>
          <span className={`badge ${bronLabel.kleur}`}>{bronLabel.tekst}</span>
        </div>

        <form action={opslaanInstellingen} className="space-y-4">
          <div>
            <label className="label" htmlFor="apikey">
              API-sleutel
            </label>
            <input
              id="apikey"
              name="apikey"
              type="password"
              autoComplete="off"
              className="input font-mono"
              placeholder={bron === "instellingen" ? "•••••••• (ingesteld — laat leeg om te behouden)" : "sk-ant-..."}
            />
            <p className="mt-1 text-xs text-slate-500">
              Wordt lokaal opgeslagen in de database. Laat leeg om de bestaande sleutel te behouden.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="model">
              Model
            </label>
            <input id="model" name="model" className="input font-mono" defaultValue={model} placeholder={STANDAARD_MODEL} />
            <p className="mt-1 text-xs text-slate-500">
              Standaard <code>{STANDAARD_MODEL}</code>. Andere opties: <code>claude-haiku-4-5</code> (sneller), <code>claude-opus-4-8</code> (grondiger, maar trager).
            </p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className="btn-primary">
              Opslaan
            </button>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
          <form action={testVerbinding}>
            <button type="submit" className="btn-ghost" disabled={bron === "geen"}>
              Verbinding testen
            </button>
          </form>
          <form action={wisApiKey}>
            <button type="submit" className="btn-ghost text-rose-600 ring-rose-200 hover:bg-rose-50">
              Sleutel wissen
            </button>
          </form>
        </div>

        {test && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm ring-1 ${
              test.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200"
            }`}
          >
            <span className="font-semibold">{test.ok ? "✓ " : "✗ "}</span>
            {test.bericht}
            {test.tijd && <span className="ml-1 text-xs opacity-70">({new Date(test.tijd).toLocaleString("nl-NL")})</span>}
          </div>
        )}
      </div>

      <div className="card p-6 text-sm text-slate-600">
        <h2 className="mb-2 font-semibold text-slate-800">Zonder sleutel</h2>
        <p>
          De applicatie werkt volledig zonder API-sleutel: alle AI-functies (onderzoeksadvies, voorcalculatie,
          werktekeningadvies, bureauonderzoeksrapport) vallen dan terug op ingebouwde kennisregels. Met een sleutel
          worden de teksten door Claude gegenereerd.
        </p>
      </div>
    </div>
  );
}
