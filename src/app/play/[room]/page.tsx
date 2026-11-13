import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayClient } from "./play-client";

export const metadata: Metadata = { title: "أفيش — العب", robots: { index: false } };

async function Room({ params }: { params: PageProps<"/play/[room]">["params"] }) {
  const { room } = await params;
  return <PlayClient room={room.toUpperCase()} />;
}

export default function PlayPage({ params }: PageProps<"/play/[room]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Room params={params} />
    </Suspense>
  );
}
