export function Companion({ name }: { name: string }) {
  return (
    <div className="companion-wrap" aria-label={`${name}, your play companion`}>
      <div className="companion" aria-hidden="true">
        <span className="ear ear-left" />
        <span className="ear ear-right" />
        <span className="eye eye-left" />
        <span className="eye eye-right" />
        <span className="smile" />
      </div>
      <span className="companion-name">{name}</span>
    </div>
  );
}
