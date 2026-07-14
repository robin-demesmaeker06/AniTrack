export function Logo({ size = "text-xl" }: { size?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight ${size}`}>
      Ani<span className="text-signal">Track</span>
    </span>
  );
}
