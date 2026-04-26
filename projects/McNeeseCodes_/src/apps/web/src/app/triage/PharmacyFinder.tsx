"use client";

/**
 * PharmacyFinder — "where can I buy this medication near me?" panel.
 *
 * Sits inside the Step 2 reading flow on /triage. The panel pre-fills
 * the drug name from the most recently mentioned medication in the
 * patient narrative, remembers the last-used ZIP (so the kiosk demo
 * stays one click away), and surfaces an OTC vs Rx availability chip
 * up top so the patient knows whether they need a clinic visit before
 * heading to the pharmacy.
 *
 * Each result card now shows pharmacy name, address, phone (tap-to-call),
 * an estimated price chip when one is detected, a one-liner snippet,
 * and two CTAs: a Maps button (opens Google Maps to the address) and
 * a website link. Cards are capped at 5 — the patient only needs the
 * top picks, not every Tavily hit.
 *
 * Mode is surfaced honestly with a chip:
 *   - "Live results" when the engine returned mode=live
 *   - "Demo results" when the engine returned mode=demo (no Tavily key
 *     configured, or no live hits)
 */

import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  MapPin,
  Phone,
  Pill,
  Search,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { Disclosure } from "@/components/shared/Disclosure";

type Availability = "otc" | "rx_required" | "unknown";

type PharmacyResult = {
  name: string;
  url: string;
  snippet: string;
  estimated_prices: string[];
  score: number | null;
  channel: "in_store" | "mail_order" | "coupon";
  source: "tavily" | "demo_curated";
  address?: string;
  phone?: string | null;
  // null when the result is a coupon / mail-order / online-only listing
  // with no physical destination — the UI hides "Open in Maps" in that
  // case so the patient never lands on a "can't find this place" screen.
  maps_url?: string | null;
  availability?: Availability;
};

type PharmacyResponse = {
  ok: boolean;
  mode: "live" | "demo";
  drug: string;
  zip: string;
  availability: Availability;
  availability_label: string;
  results: PharmacyResult[];
  note?: string;
  fetched_at?: string;
};

const ZIP_REGEX = /^\d{5}(?:-\d{4})?$/;
const LAST_ZIP_KEY = "frudgecare:lastZip";

export function PharmacyFinder({
  suggestedDrug,
  className = "",
  flat = false,
}: {
  suggestedDrug?: string;
  className?: string;
  /**
   * When true, renders as a flat content section (no card chrome). Used
   * inside the consolidated CarePlanCard on /triage. When false (default),
   * renders as a standalone card.
   */
  flat?: boolean;
}) {
  const [drug, setDrug] = useState<string>(suggestedDrug ?? "");
  const [zip, setZip] = useState<string>("");
  const [data, setData] = useState<PharmacyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First mount: hydrate ZIP from localStorage so the kiosk doesn't
  // make the patient retype the same ZIP every visit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(LAST_ZIP_KEY);
    if (stored && ZIP_REGEX.test(stored)) {
      setZip(stored);
    }
  }, []);

  // Re-prefill the drug field when the parent's suggestion changes,
  // but only if the patient hasn't already typed something else.
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
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_ZIP_KEY, zip.trim());
      }
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

  const cappedResults = (data?.results ?? []).slice(0, 5);

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="fc-section-title flex items-center gap-2">
          <Pill size={14} className="text-[var(--primary)]" aria-hidden="true" />
          Find this medication near you
        </h3>
        <span className="text-[11px] text-slate-500">
          Top 5 nearby
        </span>
      </div>
      <p className="mb-3 text-[12.5px] leading-snug text-slate-500 max-w-[560px]">
        Pre-filled from your assessment. Add your ZIP to see local pharmacies, prices, and whether
        you need a prescription first.
      </p>

      <form
        onSubmit={handleSearch}
        className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto]"
      >
        <div>
          <label
            htmlFor="pharm-drug"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
          >
            Medication
          </label>
          <input
            id="pharm-drug"
            type="text"
            value={drug}
            onChange={(e) => setDrug(e.target.value)}
            placeholder="e.g. amoxicillin"
            className="fc-text-input fc-focus-ring"
          />
        </div>
        <div>
          <label
            htmlFor="pharm-zip"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
          >
            ZIP code
          </label>
          <input
            id="pharm-zip"
            type="text"
            inputMode="numeric"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="e.g. 70601"
            maxLength={10}
            className="fc-text-input fc-focus-ring"
          />
        </div>
        <div className="sm:flex sm:items-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="fc-focus-ring inline-flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--primary)] px-4 h-10 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0B3A66] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Search size={14} />
            {loading ? "Searching…" : "Find pharmacies"}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-3 inline-block fc-highlight-warn pl-3 py-1 text-[12px] text-slate-700">
          {error}
        </p>
      )}

      {!data && !loading && !error && (
        <p className="mt-3 text-[12px] text-slate-500">
          Enter a medication and ZIP, then tap <strong>Find pharmacies</strong>.
        </p>
      )}

      {loading && (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="fc-skeleton h-[112px] w-full rounded-[var(--radius-card)]"
            />
          ))}
        </div>
      )}

      {data && !loading && (
        <>
          <AvailabilityBanner
            availability={data.availability}
            label={data.availability_label}
            mode={data.mode}
          />

          {cappedResults.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-slate-600">
              {data.note || "No pharmacy results. Try a different ZIP or drug spelling."}
            </p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {cappedResults.map((r) => (
                <li key={r.url}>
                  <PharmacyCard result={r} />
                </li>
              ))}
            </ul>
          )}

          {data.results.length > 5 && (
            <p className="mt-3 text-[11px] text-slate-400">
              Showing top 5 of {data.results.length} matches — refine medication or ZIP to narrow.
            </p>
          )}
        </>
      )}
    </>
  );

  if (flat) {
    return <div className={className}>{body}</div>;
  }
  return (
    <Disclosure
      label="Find this medication near you"
      defaultOpen={Boolean(suggestedDrug)}
      className={`fc-card p-5 ${className}`}
    >
      {body}
    </Disclosure>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function AvailabilityBanner({
  availability,
  label,
  mode,
}: {
  availability: Availability;
  label: string;
  mode: "live" | "demo";
}) {
  const tone = availabilityTone(availability);
  const Icon = tone.icon;
  // Flat row, no card chrome — uses an inset highlight bar like the
  // provider-case patterns (fc-highlight-* in globals.css).
  return (
    <div className={`mt-4 flex items-start justify-between gap-3 ${tone.highlight} pl-3 py-2`}>
      <div className="flex min-w-0 items-start gap-2">
        <Icon size={14} className={`mt-0.5 shrink-0 ${tone.iconColor}`} />
        <div className="min-w-0">
          <div className={`text-[11px] font-bold uppercase tracking-wider ${tone.textStrong}`}>
            {tone.title}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-slate-700">
            {label}
          </p>
        </div>
      </div>
      <span
        className={
          "shrink-0 inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold uppercase tracking-wider " +
          (mode === "live"
            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
            : "bg-slate-100 border border-slate-200 text-slate-600")
        }
        title={mode === "live" ? "Powered by Tavily Search" : "Curated demo set"}
      >
        {mode === "live" ? "Live" : "Demo"}
      </span>
    </div>
  );
}

function availabilityTone(a: Availability) {
  if (a === "otc") {
    return {
      title: "Over the counter",
      icon: ShieldCheck,
      iconColor: "text-[#2E7D32]",
      highlight: "fc-highlight-success",
      textStrong: "text-[#2E7D32]",
    };
  }
  if (a === "rx_required") {
    return {
      title: "Prescription required",
      icon: AlertTriangle,
      iconColor: "text-[#B45309]",
      highlight: "fc-highlight-warn",
      textStrong: "text-[#B45309]",
    };
  }
  return {
    title: "Availability unknown",
    icon: HelpCircle,
    iconColor: "text-slate-500",
    highlight: "fc-highlight-primary",
    textStrong: "text-slate-700",
  };
}

function PharmacyCard({ result }: { result: PharmacyResult }) {
  const channelLabel = labelForChannel(result.channel);
  const price = result.estimated_prices?.[0];
  // Only build a Maps directions URL when we have a real parseable street
  // address. Coupon / mail-order pages (GoodRx, RxSaver, Cost Plus Drugs)
  // don't have a physical destination — feeding their page title to
  // Google Maps lands the patient on "can't find this place", so we
  // hide the button entirely instead and let Website take the full row.
  const mapsUrl =
    result.address && result.channel === "in_store"
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
          result.address,
        )}&travelmode=driving`
      : null;
  const availabilityChip = chipForAvailability(result.availability);

  return (
    <div className="flex h-full flex-col rounded-[var(--radius-card)] border border-slate-200 bg-white p-4 transition hover:border-[#0F4C81]/50 hover:shadow-[0_4px_14px_rgba(15,76,129,0.08)]">
      {/* Header — name + small chip stack */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-1 text-[13.5px] font-semibold text-slate-900">
            {result.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            <span>{channelLabel}</span>
            {availabilityChip && (
              <span
                className={`rounded-full px-2 py-0.5 ${availabilityChip.classes}`}
              >
                {availabilityChip.label}
              </span>
            )}
          </div>
        </div>
        {price && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">
            {price}
          </span>
        )}
      </div>

      {/* Address */}
      {result.address && (
        <div className="mb-1 flex items-start gap-2 text-[12px] text-slate-700">
          <MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" />
          <span className="line-clamp-2">{result.address}</span>
        </div>
      )}

      {/* Phone */}
      {result.phone && (
        <div className="mb-2 flex items-center gap-2 text-[12px]">
          <Phone size={13} className="shrink-0 text-slate-400" />
          <a
            href={`tel:${result.phone.replace(/[^\d+]/g, "")}`}
            className="text-[#0F4C81] underline decoration-[#0F4C81]/30 underline-offset-2 hover:decoration-[#0F4C81]"
          >
            {result.phone}
          </a>
        </div>
      )}

      {/* Snippet */}
      {result.snippet && (
        <p className="line-clamp-2 text-[12px] leading-snug text-slate-600">
          {result.snippet}
        </p>
      )}

      {/* CTAs */}
      <div className="mt-auto flex items-center gap-2 pt-3">
        {mapsUrl ? (
          <>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="fc-focus-ring inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[#0F4C81] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[#0B3A66]"
            >
              <MapPin size={13} />
              Open in Maps
            </a>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="fc-focus-ring inline-flex items-center justify-center gap-1 rounded-[var(--radius-control)] border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 transition hover:border-[#0F4C81]/50 hover:text-[#0F4C81]"
            >
              Website
              <ExternalLink size={12} />
            </a>
          </>
        ) : (
          // No physical address — show only the website link, full-width,
          // so the patient understands this is an online-only resource.
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="fc-focus-ring inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[#0F4C81] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[#0B3A66]"
          >
            <ExternalLink size={13} />
            {result.channel === "coupon" ? "Get coupon" : "Visit website"}
          </a>
        )}
      </div>
    </div>
  );
}

function labelForChannel(channel: PharmacyResult["channel"]): string {
  switch (channel) {
    case "in_store":   return "Pickup nearby";
    case "mail_order": return "Mail order";
    case "coupon":     return "Coupon · discount";
    default:           return "Pharmacy";
  }
}

function chipForAvailability(a: Availability | undefined) {
  if (a === "otc") {
    return {
      label: "OTC",
      classes: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    };
  }
  if (a === "rx_required") {
    return {
      label: "Rx",
      // Slate background — keeps the urgency-amber reserved for the
      // top availability banner per design system 10.3 (urgency channel
      // is not for incidental chips).
      classes: "bg-slate-100 text-slate-700 border border-slate-200",
    };
  }
  return null;
}
