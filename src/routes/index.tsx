import { createFileRoute } from "@tanstack/react-router";
import { EightBars } from "@/components/EightBars";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <EightBars />;
}
