// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Background } from "@/components/Background";
import { CardGrid } from "@/components/cards/CardRenderer";
import { SourceCard } from "@/components/cards/MessageCards";
import type { CardData, SourceCardData } from "@/lib/rag/types";

const location: CardData = {
  kind: "location", entityId: "location:del-perro-pier", name: "Del Perro Pier", region: "Los Santos", district: "Del Perro Beach",
  mapX: 0.3, mapY: 0.6, gameX: -1850, gameY: -1235, precision: "approximate",
  externalMapUrl: "https://www.ign.com/wikis/gta-5/GTA_5_Interactive_Map%3A_All_Quests%2C_Collectibles%2C_Locations_and_More", summary: "The famous pier.",
};

describe("rich cards", () => {
  it("renders a MissionCard with protagonists, giver, approaches and spoiler badge", () => {
    render(<CardGrid lang="en" cards={[{ kind: "mission", entityId: "heist:big-score", name: "The Big Score", missionType: "heist", protagonists: ["Michael", "Franklin"], giver: "Lester Crest", approaches: ["Subtle", "Obvious"], summary: "The final heist.", spoilerLevel: 2 }]} />);
    expect(screen.getByRole("heading", { name: "The Big Score" })).toBeInTheDocument();
    expect(screen.getByText("Subtle / Obvious")).toBeInTheDocument();
    expect(screen.getByText(/Story spoiler/)).toBeInTheDocument();
  });

  it("renders a LocationCard with an allow-listed map link and approximate-precision badge", () => {
    render(<CardGrid lang="en" cards={[location]} />);
    const link = screen.getByRole("link", { name: /Open map/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("ign.com"));
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("approximate")).toBeInTheDocument();
  });

  it("refuses to render map links to non-allow-listed hosts", () => {
    render(<CardGrid lang="en" cards={[{ ...location, externalMapUrl: "https://evil.example/phish" }]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("'Directions' shows an approximate straight-line bearing and lets the user pick an origin", () => {
    render(<CardGrid lang="en" cards={[location]} />);
    fireEvent.click(screen.getByRole("button", { name: /Directions/ }));
    expect(screen.getByText(/km →/)).toBeInTheDocument();
    expect(screen.getByText(/approximate/i, { selector: "p" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "trevor" } });
    expect(screen.getByText(/km →/)).toBeInTheDocument();
  });

  it("renders a MapCard with an accessible SVG, marker label and expand dialog", () => {
    render(<CardGrid lang="en" cards={[{ kind: "map", entityId: "location:del-perro-pier", name: "Del Perro Pier", mapX: 0.3, mapY: 0.6, precision: "approximate", markers: [{ id: "location:del-perro-pier", name: "Del Perro Pier", mapX: 0.3, mapY: 0.6 }] }]} />);
    expect(screen.getAllByRole("img", { name: /Map: Del Perro Pier/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Enlarge/ }));
    expect(document.querySelector("dialog")).toHaveAttribute("open");
  });

  it("renders Online warning, vehicle, collectible, character and image cards", () => {
    const cards: CardData[] = [
      { kind: "warning", tone: "online", title: "That belongs to GTA Online, not Story Mode.", text: "Cayo Perico Heist" },
      { kind: "vehicle", entityId: "vehicle:space-docker", name: "Space Docker", category: "special", summary: "s", howToGet: "Collect all 50 Spaceship Parts", storyMode: true },
      { kind: "collectible", entityId: "collectible:spaceship-parts", name: "Spaceship Parts", total: 50, summary: "s", versions: [] },
      { kind: "character", entityId: "character:michael-de-santa", name: "Michael De Santa", playable: true, summary: "s", ability: "Slows time" },
      { kind: "image", entityId: "character:michael-de-santa", title: "Michael gallery", url: "https://gta.fandom.com/wiki/Michael_De_Santa", isExternalLink: true, license: "Link only", source: "GTA Wiki" },
    ];
    render(<CardGrid lang="en" cards={cards} />);
    expect(screen.getByText("Cayo Perico Heist")).toBeInTheDocument();
    expect(screen.getByText("Collect all 50 Spaceship Parts")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GTA Wiki/ })).toHaveAttribute("href", "https://gta.fandom.com/wiki/Michael_De_Santa");
  });
});

describe("ImageCard asset guard", () => {
  const base = { kind: "image" as const, title: "Map", isExternalLink: false, license: "own", source: "project" };
  it("renders only same-origin asset paths as <img>", () => {
    const { container } = render(<CardGrid lang="en" cards={[{ ...base, url: "/maps/san-andreas.svg" }]} />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/maps/san-andreas.svg");
  });
  it.each(["//evil.example/x.png", "https://evil.example/x.png", "javascript:alert(1)", "/a b/../<x>"])("never renders %s as an image", (url) => {
    const { container } = render(<CardGrid lang="en" cards={[{ ...base, url }]} />);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("SourceCard", () => {
  const source: SourceCardData = { index: 1, title: "Space Docker", sourceName: "Grand Theft Wiki", sourceType: "wiki", url: "https://www.grandtheftwiki.com/Space_Docker", confidence: 0.85, verification: "verified", entityId: "vehicle:space-docker" };
  it("links to the source and shows verification status", () => {
    render(<ul><SourceCard source={source} messageId="m1" lang="en" /></ul>);
    expect(screen.getByRole("link", { name: /Grand Theft Wiki/ })).toHaveAttribute("href", source.url);
    expect(screen.getByText("verified")).toBeInTheDocument();
  });
  it("does not link to unsafe URLs", () => {
    render(<ul><SourceCard source={{ ...source, url: "javascript:alert(1)" }} messageId="m1" lang="en" /></ul>);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("Background", () => {
  it("is decorative, hidden from assistive tech, and has the four day-cycle layers", () => {
    render(<Background />);
    const bg = screen.getByTestId("background");
    expect(bg).toHaveAttribute("aria-hidden", "true");
    for (const k of ["morning", "afternoon", "evening", "night"]) expect(bg.querySelector(`.sky-${k}`)).not.toBeNull();
  });
});
