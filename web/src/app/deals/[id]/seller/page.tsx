import { DealShell } from "@/components/DealShell";

export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <DealShell id={params.id} role="seller" />;
}
