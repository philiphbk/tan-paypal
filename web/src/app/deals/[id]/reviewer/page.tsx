import { DealShell } from "@/components/DealShell";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DealShell id={id} role="reviewer" />;
}
