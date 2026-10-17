import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CircleHelp, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { ITEMS, isGastspiel } from "@/game/content";
import { blankSnap, createGame, type GameApi, type Snap } from "@/game/createGame";
import { money } from "@/game/save";

function HelpLine({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-b border-line py-2 last:border-b-0">
      <p className="text-sm text-sodium">{title}</p>
      <p className="mt-1 text-sm text-ivory">{body}</p>
    </div>
  );
}

function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-20 flex items-end justify-center bg-ink/80 p-4 md:items-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div data-scroll className="bg-surface max-h-4/5 w-full max-w-sm overflow-y-auto rounded-lg border border-line p-5">
        <p className="font-display text-3xl leading-none text-ivory">How to ride</p>
        <p className="mt-2 text-sm text-muted">Three lanes. The street comes at you.</p>

        <p className="mt-4 text-xs tracking-wide text-muted uppercase">On a phone</p>
        <HelpLine title="Left and Right" body="Change lanes. A sideways swipe does the same." />
        <HelpLine title="Hop" body="Clears potholes, puddles, and the pointe shoe. Tap the road or swipe up." />
        <HelpLine title="Steady" body="Hold it to slow down. A downward swipe brakes for a moment." />

        <p className="mt-4 text-xs tracking-wide text-muted uppercase">On a keyboard</p>
        <HelpLine title="A and D" body="Lanes. Arrow keys work too." />
        <HelpLine title="W or space" body="Hop. The up arrow hops as well." />
        <HelpLine title="S" body="Hold it, or the down arrow, to steady. P or Esc pauses." />

        <p className="mt-4 text-xs tracking-wide text-muted uppercase">What counts</p>
        <HelpLine title="Gold arrow" body="Hop that. A red dash means leave the lane. Green is a free one." />
        <HelpLine title="Notes" body="Gold notes fill eight bars. The eighth pays, and gives a little grace back." />
        <HelpLine title="Close passes" body="A near miss pays. A clean hop pays more. Swans, tubas, and wrong signs pay extra." />
        <HelpLine title="Don't hop these" body="Cars, people, trams, dogs, and barriers. Change lanes." />
        <HelpLine
          title="Grace"
          body="Your balance. It returns if you ride clean. Empty grace is a bow, and the purse takes a cut."
        />
        <HelpLine
          title="The night"
          body="Four streets, then the opera. One is an errand. Every fifth evening is the train to Hanover."
        />

        <button type="button" className="mt-5 min-h-12 w-full rounded-lg bg-opera text-ivory" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}

function ShopSheet({
  snap,
  onClose,
  onBuy,
}: {
  snap: Snap;
  onClose: () => void;
  onBuy: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-20 flex items-end justify-center bg-ink/80 p-4 md:items-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="bg-surface flex max-h-4/5 w-full max-w-md flex-col overflow-hidden rounded-lg border border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p className="font-display text-2xl leading-none text-ivory">The room</p>
            <p className="mt-1 text-sm text-sodium">{money(snap.purse)} in the purse</p>
          </div>
          <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-sm text-ivory" onClick={onClose}>
            Close
          </button>
        </div>
        <ul data-scroll className="min-h-0 flex-1 overflow-y-auto">
          {ITEMS.map((item) => {
            const have = snap.owned.includes(item.id);
            const afford = snap.purse >= item.price;
            return (
              <li key={item.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ivory">{item.name}</p>
                  <p className="mt-1 text-xs leading-snug text-muted">{item.blurb}</p>
                </div>
                {have ? (
                  <p className="shrink-0 text-sm text-mint">In the room</p>
                ) : afford ? (
                  <button
                    type="button"
                    className="min-h-11 shrink-0 rounded-lg bg-sodium px-3 text-sm text-ink"
                    onClick={() => onBuy(item.id)}
                  >
                    {money(item.price)}
                  </button>
                ) : (
                  <p className="shrink-0 text-sm text-muted">{money(item.price)}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function IconButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-surface text-ivory"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}

export function EightBars() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const api = useRef<GameApi | null>(null);
  const heldForHelp = useRef(false);
  const [snap, setSnap] = useState<Snap>(blankSnap());
  const [help, setHelp] = useState(false);
  const [shop, setShop] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const game = createGame(canvas, root, setSnap);
    api.current = game;
    const block = (event: TouchEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-scroll]")) return;
      event.preventDefault();
    };
    root.addEventListener("touchmove", block, { passive: false });
    const menu = (event: Event) => event.preventDefault();
    root.addEventListener("contextmenu", menu);
    return () => {
      root.removeEventListener("touchmove", block);
      root.removeEventListener("contextmenu", menu);
      game.destroy();
      api.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (!help) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setHelp(false);
      if (heldForHelp.current) {
        heldForHelp.current = false;
        api.current?.togglePause();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [help]);

  const room = snap.mode === "room";
  const ride = snap.mode === "ride";
  const dance = snap.mode === "dance";
  const recap = snap.mode === "recap";
  const guest = isGastspiel(snap.day);

  function openHelp() {
    setShop(false);
    setHelp(true);
    if ((snap.mode === "ride" || snap.mode === "dance") && !snap.paused) {
      heldForHelp.current = true;
      api.current?.togglePause();
    }
  }

  function closeHelp() {
    setHelp(false);
    if (heldForHelp.current) {
      heldForHelp.current = false;
      api.current?.togglePause();
    }
  }

  return (
    <div ref={rootRef} className="game-root text-ivory">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        {room && (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row md:justify-end">
            <header
              className="pointer-events-auto flex items-center justify-between gap-3 bg-ink px-4 py-3 md:hidden"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            >
              <div>
                <p className="font-display text-3xl leading-none text-ivory">Eight Bars</p>
                <p className="mt-1 text-sm text-muted">{guest ? "Train to Hanover" : "Four streets to the opera"}</p>
              </div>
              <div className="flex gap-2">
                <IconButton label="How to ride" onClick={openHelp}>
                  <CircleHelp size={18} />
                </IconButton>
                <IconButton
                  label={snap.muted ? "Unmute" : "Mute"}
                  pressed={snap.muted}
                  onClick={() => api.current?.toggleMute()}
                >
                  {snap.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </IconButton>
              </div>
            </header>

            <div className="min-h-0 flex-1 md:hidden" />

            <aside className="bg-ink pointer-events-auto flex max-h-3/5 w-full flex-col border-t border-line md:h-full md:max-h-full md:w-96 md:border-t-0 md:border-l md:bg-surface">
              <div
                data-scroll
                className="overflow-y-auto px-4 pt-4 md:min-h-0 md:flex-1"
                style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
              >
                <div className="hidden items-start justify-between gap-3 md:flex">
                  <div>
                    <p className="font-display text-4xl leading-none text-ivory">Eight Bars</p>
                    <p className="mt-2 text-sm text-muted">
                      {guest ? `Evening ${snap.day} · Hanover and back` : `Evening ${snap.day} · the opera`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <IconButton label="How to ride" onClick={openHelp}>
                      <CircleHelp size={18} />
                    </IconButton>
                    <IconButton
                      label={snap.muted ? "Unmute" : "Mute"}
                      pressed={snap.muted}
                      onClick={() => api.current?.toggleMute()}
                    >
                      {snap.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </IconButton>
                  </div>
                </div>

                <p className="text-xs tracking-wide text-muted uppercase md:mt-6">Tonight</p>
                <ol className="mt-2 flex flex-col gap-2">
                  {snap.plan.map((stage, index) => (
                    <li key={`${stage.id}-${index}`} className="flex items-baseline gap-3 text-sm">
                      <span className="w-4 shrink-0 text-sodium">{index + 1}</span>
                      <span className="text-ivory">{stage.title}</span>
                      {stage.quest ? <span className="ml-auto shrink-0 text-xs text-muted">Errand</span> : null}
                    </li>
                  ))}
                </ol>

                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs tracking-wide text-muted uppercase">Purse</p>
                    <p className="font-display text-2xl leading-none text-sodium">{money(snap.purse)}</p>
                    <p className="mt-1 text-xs text-muted">Best night {money(snap.best)}</p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-line px-4 text-sm text-ivory"
                    onClick={() => {
                      setHelp(false);
                      setShop(true);
                    }}
                  >
                    Decorate
                  </button>
                </div>
                <button
                  type="button"
                  className="mt-4 min-h-12 w-full rounded-lg bg-opera text-base text-ivory"
                  onClick={() => api.current?.depart()}
                >
                  {guest ? "Catch the train" : "Take the scooter"}
                </button>
              </div>
            </aside>
          </div>
        )}

        {(ride || dance) && (
          <div className="pointer-events-none flex justify-end gap-2 p-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
            <IconButton label="How to ride" onClick={openHelp}>
              <CircleHelp size={18} />
            </IconButton>
            <IconButton label={snap.paused ? "Resume" : "Pause"} onClick={() => api.current?.togglePause()}>
              {snap.paused ? <Play size={18} /> : <Pause size={18} />}
            </IconButton>
          </div>
        )}

        {ride && !help && (
          <div className="pointer-events-none mt-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-2">
              <button
                type="button"
                className="bg-surface min-h-11 rounded-lg border border-line text-sm text-ivory"
                onPointerDown={() => api.current?.holdSteady(true)}
                onPointerUp={() => api.current?.holdSteady(false)}
                onPointerLeave={() => api.current?.holdSteady(false)}
                onPointerCancel={() => api.current?.holdSteady(false)}
              >
                Steady
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="bg-surface min-h-14 rounded-lg border border-line text-sm text-ivory"
                  onClick={() => api.current?.nudge(-1)}
                >
                  Left
                </button>
                <button
                  type="button"
                  className="min-h-14 rounded-lg bg-sodium text-sm text-ink"
                  onClick={() => api.current?.hop()}
                >
                  Hop
                </button>
                <button
                  type="button"
                  className="bg-surface min-h-14 rounded-lg border border-line text-sm text-ivory"
                  onClick={() => api.current?.nudge(1)}
                >
                  Right
                </button>
              </div>
            </div>
          </div>
        )}

        {dance && !help && (
          <div className="pointer-events-none mt-auto flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              className="bg-surface pointer-events-auto min-h-11 rounded-lg border border-line px-5 text-sm text-ivory"
              onClick={() => api.current?.skipDance()}
            >
              Skip the bow
            </button>
          </div>
        )}

        {snap.paused && (ride || dance) && !help && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              className="pointer-events-auto min-h-12 rounded-lg bg-sodium px-6 text-ink"
              onClick={() => api.current?.togglePause()}
            >
              Resume
            </button>
          </div>
        )}

        {recap && snap.recap && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center p-4 md:items-center">
            <div className="bg-surface pointer-events-auto w-full max-w-sm rounded-lg border border-line p-5">
              <p className="font-display text-3xl leading-none text-ivory">
                {snap.recap.gastspiel ? "Guest night" : snap.recap.onTime ? "You made the opera" : "During the overture"}
              </p>
              <p className="mt-2 text-sm text-muted">
                {snap.recap.gastspiel
                  ? "Hanover, then the train, then the parquet."
                  : snap.recap.onTime
                    ? "Four streets. The door. Sleep."
                    : "You got there. The bow from the asphalt came with you."}
              </p>
              <p className="mt-4 font-display text-4xl text-sodium">{money(snap.recap.earned)}</p>
              <p className="mt-1 text-xs text-muted">
                {snap.recap.hits} hits · {snap.recap.wipeouts} bows · {snap.recap.notes} notes
              </p>
              <button
                type="button"
                className="mt-5 min-h-12 w-full rounded-lg bg-opera text-ivory"
                onClick={() => api.current?.toRoom()}
              >
                Back to the room
              </button>
            </div>
          </div>
        )}

        {help && <HelpSheet onClose={closeHelp} />}
        {room && shop && !help && (
          <ShopSheet snap={snap} onClose={() => setShop(false)} onBuy={(id) => api.current?.buy(id)} />
        )}
      </div>
    </div>
  );
}
