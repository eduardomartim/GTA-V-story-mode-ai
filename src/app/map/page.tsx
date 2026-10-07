import type { Metadata } from "next";
import { MapExplorer } from "@/components/map/MapExplorer";
import { LangProvider } from "@/lib/ui/i18n";

export const metadata: Metadata = {
  title: "Interactive map — GTA V Story AI",
  description: "Story Mode map layers: missions, Strangers and Freaks, collectibles with in-game coordinates, and places — each marker states how precise its position is.",
};

export default function MapPage() {
  return (
    <LangProvider>
      <MapExplorer />
    </LangProvider>
  );
}
