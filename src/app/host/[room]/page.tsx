import type { Metadata } from "next";
import { Suspense } from "react";
import { HostClient } from "./host-client";

export const metadata: Metadata = { title: "أفيش — المضيف", robots: { index: false } };

async function Room({ params }: { params: PageProps<"/host/[room]">["params"] }) {
  const { room } = await params;
  return <HostClient room={room.toUpperCase()} />;
}

export default function HostPage({ params }: PageProps<"/host/[room]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Room params={params} />
    </Suspense>
  );
}
