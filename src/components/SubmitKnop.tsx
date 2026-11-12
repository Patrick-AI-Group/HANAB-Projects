"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit-knop met ingebouwde laadstatus. Tijdens het uitvoeren van de server
 * action (bijv. een AI-call van ~10-30s) toont de knop een spinner en is hij
 * uitgeschakeld, zodat de gebruiker ziet dat er iets gebeurt en niet dubbelklikt.
 *
 * Moet binnen een <form action={...}> staan (useFormStatus leest de status van
 * het omringende form).
 */
export function SubmitKnop({
  children,
  className = "btn-accent",
  bezigLabel,
  title,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  bezigLabel?: string;
  title?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      title={title}
      aria-busy={pending}
      className={`${className} inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {pending ? bezigLabel ?? "Bezig…" : children}
    </button>
  );
}
