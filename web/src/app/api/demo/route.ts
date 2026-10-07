import { NextResponse } from "next/server";
import { isSimulated } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/** Tells the UI whether demo tools are on, and whether PayPal is the real sandbox or the simulator. */
export async function GET() {
  return NextResponse.json({
    enabled: process.env.DEMO_MODE === "1",
    paypalMode: isSimulated() ? "simulated" : "sandbox",
  });
}
