"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { finishOnboardingAction } from "@/app/app/settings/actions";
import { Button } from "@/components/ui/button";

export function FinishOnboarding({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await finishOnboardingAction();
          router.push("/app/menu");
        })
      }
    >
      {label}
    </Button>
  );
}
