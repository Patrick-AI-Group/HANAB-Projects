import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Kaart & bureauonderzoek is de standaardpagina waarmee een project geopend wordt.
export default function ProjectRoot({ params }: { params: { id: string } }) {
  redirect(`/projecten/${params.id}/kaart`);
}
