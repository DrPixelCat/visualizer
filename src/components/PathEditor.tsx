"use client";

import dynamic from "next/dynamic";

// Konva depends on browser APIs, so the editor client is loaded without SSR.
const PathEditorClient = dynamic(() => import("./PathEditorClient"), {
  ssr: false,
});

export default function PathEditor() {
  return <PathEditorClient />;
}
