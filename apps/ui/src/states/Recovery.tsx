export function Recovery({ message = "Mimo needs a tiny moment." }: { message?: string }) {
  return (
    <main className="stage recovery" role="status">
      <div className="recovery-star" aria-hidden="true">★</div>
      <h1>{message}</h1>
      <p>We’ll be ready to play soon.</p>
    </main>
  );
}
