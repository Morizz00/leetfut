"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ScoutForm from "@/components/ScoutForm";
import CardFan from "@/components/CardFan";
import LoadingScreen from "@/components/LoadingScreen";
import HowItWorksModal from "@/components/HowItWorksModal";
import FooterCredit from "@/components/FooterCredit";
import { SAMPLE_CARDS } from "@/lib/samples";

export default function AppShell() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Mark this tab as "has visited home" so a scouted card shows BACK, while a
  // directly-opened / shared card link (no home visit) shows a "make your card"
  // CTA instead. sessionStorage is per-tab, so a fresh tab from a share is direct.
  useEffect(() => {
    try {
      sessionStorage.setItem("leetfut:seen-home", "1");
    } catch {}
  }, []);

  // Scouting navigates to the canonical /<username> route. The transition keeps
  // the loading screen up (with the mascot + puns) while the report is fetched
  // and server-rendered; the route then plays its own reveal.
  const handleScout = (name: string) => {
    const username = name.trim().replace(/^@/, "");
    if (!username) return;
    setPending(username);
    startTransition(() => router.push(`/${encodeURIComponent(username)}`));
  };

  if (isPending && pending) return <LoadingScreen username={pending} />;

  return (
    <>
      <main className="relative z-[2] flex min-h-screen flex-col">
        <div className="mx-auto flex w-full max-w-[1180px] flex-1 items-center gap-[clamp(24px,5vw,72px)] px-[clamp(22px,5vw,56px)] max-[860px]:flex-col max-[860px]:gap-[34px] max-[860px]:pb-6 max-[860px]:pt-[clamp(40px,6vh,56px)] max-[860px]:text-center">
          <ScoutForm
            loading={isPending}
            error={null}
            onScout={handleScout}
            onOpenModal={() => setModalOpen(true)}
          />
          <CardFan cards={SAMPLE_CARDS} onPick={handleScout} />
        </div>
        <footer className="relative z-[2] mt-auto flex flex-none items-center justify-center p-[clamp(12px,2.6vh,24px)]">
          <FooterCredit />
        </footer>
      </main>

      {modalOpen && <HowItWorksModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
