"use client";

/**
 * PharmacyFinder — "where can I buy this medication near me?" panel.
 *
 * Renders below the cascade. Patient enters a drug name and a 5-digit
 * US ZIP. We POST to /api/pharmacy/search which proxies to FastAPI,
 * which calls Tavily Search live (when TAVILY_API_KEY is set on the
 * engine) or returns a curated demo set otherwise.
 *
 * The mode is surfaced honestly with a chip:
 *   - "Live results" when the engine returned mode=live
 *   - "Demo results" when the engine returned mode=demo (no Tavily key
 *     configured, or no live hits)
 *
 * The panel pre-fills the drug name from the most-recently-mentioned
 * medication in the patient narrative when available, so the patient
 * doesn't have to retype "amoxicillin" they just told us about.
 */

import { useEffect, useMemo, useState } from "react";

type PharmacyResult = {
  name: string;
  url: string;
  snippet: string;
  estimated_prices: string[];
  score: number | null;
  channel: "in_store" | "mail_order" | "coupon";
  source: "tavily" | "demo_curated";
};

type PharmacyResponse = {
  ok: boolean;
  mode: "live" | "demo";
  drug: string;
  zip: string;
  results: PharmacyResult[];
  note?: string;
  fetched_at?: string;
};

const ZIP_REGEX = /^\d{5}(?:-\d{4})?$/;

export function PharmacyFinder({
  suggestedDrug,
  className = "",
}: {
  suggestedDrug?: string;
  className?: string;
}) {
  const [drug, setDrug] = useState<string>(suggestedDrug ?? "");
  const [zip, setZip] = useState<string>("");
  const [data, setData] = useState<PharmacyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-prefill when the parent gives us a new drug suggestion (e.g. the
  // user picked a different Synthea patient and ran a fresh analysis).
  useEffect(() => {
    if (suggestedDrug && !drug) {
      setDrug(suggestedDrug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedDrug]);

  const zipValid = useMemo(() => ZIP_REGEX.test(zip.trim()), [zip]);
  const canSubmit = drug.trim().length >= 2 && zipValid && !loading;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = new URLSearchParams({ drug: drug.trim(), zip: zip.trim() });
      const r = await fetch(`/api/pharmacy/search?${params.toString()}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = (await r.json()) as PharmacyResponse;
      setData(body);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Pharmacy finder request failed.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      className={`rounded-[14px] border border-slate-200 bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.04)] ${className}`}
      aria-label="Find pharmacies"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold tracking-tight text-slate-900">
            Find this medication near you
          </h3>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-500">
            Enter a drug and a US ZIP. We&apos;ll search local pharmacies
            and online options, with cash prices when available. For
            information only — confirm with the dispensing pharmacy.
          </p>
        </div>
        {data ? (
          <span
            className={
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
              (data.mode === "live"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-800")
            }
            title={data.note}
          >
            {data.mode === "live" ? "Live results" : "Demo results"}
          </span>
        ) : null}
      </div>

      <form
        onSubmit={handleSearch}
        className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_auto]"
      >
        <input
          type="text"
          value={drug}
          onChange={(e) => setDrug(e.target.value)}
          placeholder="Medication (e.g. amoxicillin)"
          className="rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
        />
        <input
          type="text"
          inputMode="numeric"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="ZIP (e.g. 70601)"
          maxLength={10}
          className="rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-[#0F4C81] focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/20"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-[10px] bg-[#0F4C81] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0d3f6c] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Searching…" : "Find pharmacies"}
        </button>
      </form>

      {error ? (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {error}
        </div>
      ) : null}

      {!data && !loading ? (
        <p className="rounded-[10px] border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
          Enter a medication and ZIP, then hit <strong>Find pharmacies</strong>.
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[88px] animate-pulse rounded-[10px] border border-slate-100 bg-slate-50"
            />
          ))}
        </div>
      ) : null}

      {data && !loading && data.results.length === 0 ? (
        <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
          {data.note || "No pharmacy results. Try a different ZIP or drug spelling."}
        </div>
      ) : null}

      {data && data.results.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {data.results.map((r) => (
            <li key={r.url}>
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full rounded-[10px] border border-slate-200 bg-white p-3 transition hover:border-[#0F4C81] hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide">
                  <span className="text-slate-500">
                    {channelLabel(r.channel)}
                  </span>
                  {r.estimated_prices.length > 0 ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      {r.estimated_prices[0]}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 line-clamp-1 text-[13px] font-semibold text-slate-900">
                  {r.name}
                </div>
                {r.snippet ? (
                  <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-slate-600">
                    {r.snippet}
                  </p>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function channelLabel(channel: PharmacyResult["channel"]): string {
  switch (channel) {
    case "in_store":
      return "Pickup nearby";
    case "mail_order":
      return "Mail order";
    case "coupon":
      return "Coupon / discount";
    default:
      return "Pharmacy";
  }
}
