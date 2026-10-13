export function errorMessage(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  return err?.message || err?.code || "Unknown error";
}

export function ErrorBox({ error, onRetry, title = "Could not load this section" }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="box box-error" role="alert">
      <strong>{title}</strong>
      <p className="muted">{errorMessage(error)}</p>
      {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}
