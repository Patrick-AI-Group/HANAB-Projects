// Originele, volledig inline SVG-illustraties in de HANAB-huisstijl.
// Geen externe assets → werkt offline en is scherp op elk scherm.

type Variant = "KABELS_ELEKTRA" | "LEIDINGEN_WATER" | "COMBI" | string;

/**
 * Decoratieve dwarsdoorsnede van ondergrondse infra, gebruikt als
 * achtergrond-"afbeelding" in hero's en projectbanners. Vult de container
 * (slice). Accent wordt per werktype benadrukt.
 */
export function InfraBanner({
  className = "",
  variant = "COMBI",
}: {
  className?: string;
  variant?: Variant;
}) {
  const waterSterk = variant !== "KABELS_ELEKTRA";
  const kabelSterk = variant !== "LEIDINGEN_WATER";
  return (
    <svg
      className={className}
      viewBox="0 0 1200 320"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#002b5e" />
          <stop offset="1" stopColor="#00416e" />
        </linearGradient>
        <linearGradient id="hb-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a3a63" />
          <stop offset="1" stopColor="#05192f" />
        </linearGradient>
        <pattern id="hb-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.2" fill="#ffffff" opacity="0.06" />
        </pattern>
      </defs>

      {/* lucht / bovengrond */}
      <rect width="1200" height="320" fill="url(#hb-sky)" />

      {/* topografische contourlijnen */}
      <g fill="none" stroke="#62bfff" strokeOpacity="0.18" strokeWidth="1.5">
        <path d="M0,64 C200,36 400,96 600,66 S1000,36 1200,78" />
        <path d="M0,104 C220,76 420,138 640,106 S1020,74 1200,118" />
        <path d="M0,146 C240,118 440,178 660,148 S1040,116 1200,158" />
      </g>

      {/* grondpakket */}
      <rect y="198" width="1200" height="122" fill="url(#hb-soil)" />
      <rect y="198" width="1200" height="122" fill="url(#hb-dots)" />
      {/* asfalt-/maaiveldlaag */}
      <rect y="198" width="1200" height="14" fill="#071b33" />
      <rect y="196" width="1200" height="2.5" fill="#62bfff" opacity="0.5" />

      {/* ondiepe mantelbuis links */}
      <g opacity={kabelSterk ? 0.9 : 0.35}>
        <rect x="-10" y="238" width="420" height="20" rx="10" fill="#0e4f7d" />
        <rect x="-10" y="242" width="420" height="4" rx="2" fill="#62bfff" opacity="0.5" />
      </g>

      {/* open sleuf met leidingen/kabels */}
      <g>
        <rect x="770" y="212" width="250" height="108" fill="#041426" />
        <rect x="768" y="212" width="3" height="108" fill="#0a3a63" />
        <rect x="1019" y="212" width="3" height="108" fill="#0a3a63" />

        {/* waarschuwingslint */}
        <g stroke="#e63223" strokeWidth="5" strokeDasharray="14 10" opacity="0.9">
          <line x1="776" y1="232" x2="1014" y2="232" />
        </g>

        {/* waterleiding */}
        <g opacity={waterSterk ? 1 : 0.4}>
          <circle cx="845" cy="280" r="33" fill="#bce4fa" />
          <circle cx="845" cy="280" r="33" fill="none" stroke="#ffffff" strokeWidth="3" />
          <circle cx="845" cy="280" r="21" fill="#62bfff" />
          <circle cx="838" cy="272" r="6" fill="#ffffff" opacity="0.55" />
        </g>

        {/* gebundelde kabelmantelbuizen */}
        <g opacity={kabelSterk ? 1 : 0.4}>
          <circle cx="935" cy="268" r="15" fill="#e63223" />
          <circle cx="935" cy="268" r="15" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="966" cy="276" r="15" fill="#0e4f7d" />
          <circle cx="966" cy="276" r="15" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="950" cy="294" r="15" fill="#dbe7f3" />
          <circle cx="950" cy="294" r="15" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        </g>
      </g>
    </svg>
  );
}

/** HANAB-woordmerk. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      Hanab<span className="text-hanab-accent">.</span>
    </span>
  );
}

/** Kleine lijn-iconen voor KPI-tegels en sectiekoppen (24px, currentColor). */
export const Icon = {
  Projecten: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M3 7h7l2 2h9v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
    </IconBase>
  ),
  Onderzoek: (p: IconProps) => (
    <IconBase {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </IconBase>
  ),
  Euro: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M17 7a6 6 0 1 0 0 10" />
      <path d="M4 10h8M4 14h8" />
    </IconBase>
  ),
  Waarschuwing: (p: IconProps) => (
    <IconBase {...p}>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4M12 17v.5" />
    </IconBase>
  ),
  Tekening: (p: IconProps) => (
    <IconBase {...p}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </IconBase>
  ),
};

type IconProps = { className?: string };
function IconBase({ className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
