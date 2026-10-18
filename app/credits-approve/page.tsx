"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthShell from "@/components/AuthShell";

// Where "Payment received: add the credits" in a credit order email lands
// (lib/creditRequests.ts). For School Compliance only, so English, like
// /platform.
//
// 🔴 Asks for a click instead of acting on arrival. Mail scanners open the
// links in a message by themselves, and one that added credits on page load
// would add them before anybody had checked the payment.

type Order = {
  credits: number;
  amountRand: number;
  reference: string;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved";
};

function Approve() {
  const params = useSearchParams();
  const id = params.get("id") || "";
  const token = params.get("token") || "";
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState<"ready" | "working" | "done">("ready");
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    fetch(`/api/translation-credits/approve?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.ok) setOrder(d);
        else setError(d.error || "This link is not valid.");
      })
      .catch(() => setError("We could not reach the portal. Please try again."));
  }, [id, token]);

  const approve = async () => {
    setState("working");
    try {
      const res = await fetch("/api/translation-credits/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, token }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "That did not work. Please try again.");
        setState("ready");
        return;
      }
      setBalance(d.balance);
      setState("done");
    } catch {
      setError("We could not reach the portal. Please try again.");
      setState("ready");
    }
  };

  if (state === "done" && order) {
    return (
      <AuthShell title="Credits added">
        <p className="text-sm text-gray-600">
          {order.credits} credits added. The school now has <strong>{balance}</strong>, and {order.requestedBy} has
          been emailed.
        </p>
      </AuthShell>
    );
  }
  if (error && !order) {
    return (
      <AuthShell title="This link cannot be used">
        <div className="bg-red-50 text-risk-high px-4 py-3 rounded-lg text-sm">{error}</div>
      </AuthShell>
    );
  }
  if (!order) {
    return (
      <AuthShell title="Translation credits">
        <p className="text-sm text-gray-600">One moment...</p>
      </AuthShell>
    );
  }
  if (order.status === "approved") {
    return (
      <AuthShell title="Already added">
        <p className="text-sm text-gray-600">These {order.credits} credits were already added. Nothing more to do.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Add translation credits">
      <div className="text-sm text-gray-700 space-y-2 mb-6">
        <p>
          <strong>{order.credits} credits</strong> (R{order.amountRand.toLocaleString("en-ZA")}), asked for by{" "}
          {order.requestedBy} on {new Date(order.requestedAt).toLocaleDateString("en-ZA")}.
        </p>
        {order.reference && <p>PO / reference: {order.reference}</p>}
        <p className="text-amber-700 font-medium">Only press this once the EFT is in your account.</p>
      </div>
      {error && <div className="bg-red-50 text-risk-high px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>}
      <button
        onClick={approve}
        disabled={state === "working"}
        className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === "working" ? "Adding..." : `Payment received: add ${order.credits} credits`}
      </button>
    </AuthShell>
  );
}

export default function CreditsApprovePage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Translation credits">
          <p className="text-sm text-gray-600">One moment...</p>
        </AuthShell>
      }
    >
      <Approve />
    </Suspense>
  );
}
