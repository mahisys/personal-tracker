/** Soft, slowly drifting colour fields behind the whole app. Purely decorative. */
export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-[10%] -top-[20%] h-[60vh] w-[60vw] rounded-full bg-[var(--aurora-1)] blur-[110px] animate-float" />
      <div className="absolute -right-[15%] top-[5%] h-[55vh] w-[50vw] rounded-full bg-[var(--aurora-2)] blur-[120px] animate-float [animation-delay:-6s]" />
      <div className="absolute bottom-[-25%] left-[20%] h-[55vh] w-[55vw] rounded-full bg-[var(--aurora-3)] blur-[120px] animate-float [animation-delay:-11s]" />
      <div className="absolute bottom-[5%] right-[5%] h-[30vh] w-[30vw] rounded-full bg-[var(--aurora-4)] blur-[100px] animate-float [animation-delay:-3s]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgb(120_112_200/0.10)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
    </div>
  );
}
