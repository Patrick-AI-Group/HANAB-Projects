import Link from "next/link";
import { maakProject } from "@/app/actions";
import { PROJECT_TYPES } from "@/lib/domein";

export default function NieuwProject() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/" className="text-sm text-hanab-700 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Nieuw project</h1>
        <p className="mt-1 text-sm text-slate-500">
          Leg de basisgegevens vast. Na aanmaken genereer je direct een AI-onderzoeksadvies.
        </p>
      </div>

      <form action={maakProject} className="card space-y-5 p-6">
        <div>
          <label className="label" htmlFor="naam">
            Projectnaam *
          </label>
          <input id="naam" name="naam" required className="input" placeholder="bv. Renovatie waterleiding Dorpsstraat" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="opdrachtgever">
              Opdrachtgever *
            </label>
            <input id="opdrachtgever" name="opdrachtgever" required className="input" placeholder="bv. Vitens / Liander" />
          </div>
          <div>
            <label className="label" htmlFor="projectnummer">
              Projectnummer
            </label>
            <input id="projectnummer" name="projectnummer" className="input" placeholder="automatisch indien leeg" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="type">
              Type werk
            </label>
            <select id="type" name="type" className="input" defaultValue="COMBI">
              {Object.entries(PROJECT_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="plaats">
              Plaats
            </label>
            <input id="plaats" name="plaats" className="input" placeholder="bv. Nijkerk" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="startdatum">
              Startdatum
            </label>
            <input id="startdatum" name="startdatum" type="date" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="opleverdatum">
              Opleverdatum
            </label>
            <input id="opleverdatum" name="opleverdatum" type="date" className="input" />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="omschrijving">
            Omschrijving / scope
          </label>
          <textarea
            id="omschrijving"
            name="omschrijving"
            rows={4}
            className="input"
            placeholder="bv. Vervanging 1,2 km AC-waterleiding door PE in bestaande rijbaan, incl. gestuurde boring onder watergang."
          />
          <p className="mt-1 text-xs text-slate-500">
            Hoe concreter de scope (boringen, rijbaan, grondwater…), des te scherper het AI-advies.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link href="/" className="btn-ghost">
            Annuleren
          </Link>
          <button type="submit" className="btn-primary">
            Project aanmaken
          </button>
        </div>
      </form>
    </div>
  );
}
