import { ImageResponse } from "next/og";

export const alt = "GTA V Story AI — a specialist for Los Santos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 72,
          background: "linear-gradient(180deg,#181540 0%,#7e3868 38%,#f08a3c 70%,#09090a 100%)", color: "#ece7df",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: 8, color: "#ffcf8a" }}>GROUNDED RAG AGENT · STORY MODE</div>
        <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1, marginTop: 12 }}>GTA V STORY AI</div>
        <div style={{ fontSize: 36, marginTop: 16, opacity: 0.9 }}>Your specialist for Los Santos.</div>
      </div>
    ),
    size,
  );
}
