import { notFound } from "next/navigation";
import { isSimulated } from "@/lib/paypal";
import { SimApprove } from "@/components/SimApprove";

export const dynamic = "force-dynamic";
export const metadata = { title: "PayPal simulator" };

export default function Page() {
  if (!isSimulated()) notFound();
  return <SimApprove />;
}
