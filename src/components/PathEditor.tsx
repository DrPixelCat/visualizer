"use client";

import dynamic from "next/dynamic";

const PathEditorClient = dynamic(() => import("./PathEditorClient"), {
  ssr: false,
});

export default function PathEditor() {
  return <PathEditorClient />;
}
