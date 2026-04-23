import { CampaignInsights } from "@/components/types";

type Props = {
  insights: CampaignInsights;
  compact?: boolean;
};

export default function CampaignProofPanel({ insights, compact = false }: Props) {
  const proof = insights.proof_summary;

  return (
    <div className="rounded-md border border-soft bg-canvas/60 p-4 text-sm text-text">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-accent">Experiment Summary Panel</p>
          <p className="mt-2 max-w-2xl text-sm text-muted">{proof.comparison_status}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
            proof.comparison
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : proof.sample_size_valid
                ? "border-sky-400/40 bg-sky-500/10 text-sky-100"
                : "border-amber-400/40 bg-amber-500/10 text-amber-100"
          }`}
        >
          {proof.comparison ? "Comparison Live" : proof.sample_size_valid ? "Baseline Ready" : "Collect More Sends"}
        </span>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "lg:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
        <div className="rounded-md border border-soft bg-panel/50 p-3">
          <p className="text-xs uppercase tracking-wider text-muted">Confidence</p>
          <p className="mt-1 font-semibold text-text">
            {proof.confidence_label} ({proof.confidence_score}/100)
          </p>
          <p className="mt-1 text-xs text-muted">
            Based on {proof.evidence_campaign_count} campaigns • {proof.evidence_send_count} sends
          </p>
          <p className="mt-1 text-xs text-muted">Consistency: {proof.consistency_label}</p>
        </div>

        <div className="rounded-md border border-soft bg-panel/50 p-3">
          <p className="text-xs uppercase tracking-wider text-muted">Projected Lift</p>
          <p className="mt-1 font-semibold text-text">
            {proof.projected_lift_low !== null && proof.projected_lift_high !== null
              ? `+${proof.projected_lift_low}% to +${proof.projected_lift_high}%`
              : "Pending more evidence"}
          </p>
          <p className="mt-1 text-xs text-muted">{proof.projected_lift_basis}</p>
        </div>

        <div className="rounded-md border border-soft bg-panel/50 p-3">
          <p className="text-xs uppercase tracking-wider text-muted">Guardrail</p>
          <p className="mt-1 font-semibold text-text">
            {proof.current_sample_size}/{proof.minimum_sample_size} sends
          </p>
          <p className="mt-1 text-xs text-muted">Matched runs should complete inside {proof.experiment_window_hours} hours.</p>
        </div>

        <div className="rounded-md border border-soft bg-panel/50 p-3">
          <p className="text-xs uppercase tracking-wider text-muted">Response Speed</p>
          <p className="mt-1 font-semibold text-text">
            {proof.average_time_to_response_hours !== null ? `${proof.average_time_to_response_hours}h avg` : "Pending"}
          </p>
          <p className="mt-1 text-xs text-muted">Faster replies indicate stronger intent.</p>
        </div>
      </div>

      {proof.comparison ? (
        <div className="mt-4 rounded-md border border-soft bg-panel/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-accent">Campaign Comparison</p>
              <p className="mt-1 text-xs text-muted">
                {proof.comparison.control_campaign_title} vs {proof.comparison.optimized_campaign_title}
              </p>
            </div>
            <p className="text-xs font-medium text-text">
              Winning strategy applied: <span className="text-accent">{proof.comparison.winning_strategy}</span>
            </p>
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {proof.comparison.metrics.map((metric) => (
              <div key={metric.label} className="rounded-md border border-soft bg-canvas/60 p-3">
                <p className="text-xs uppercase tracking-wider text-muted">{metric.label}</p>
                <p className="mt-2 text-xs text-muted">Control: <span className="text-text">{metric.control_value}</span></p>
                <p className="mt-1 text-xs text-muted">Optimized: <span className="text-text">{metric.optimized_value}</span></p>
                <p className="mt-2 font-semibold text-text">Lift: {metric.lift}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-md border border-soft bg-panel/50 p-3">
          <p className="text-xs uppercase tracking-wider text-accent">Normalized Baseline</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {proof.baseline_metrics.map((metric) => (
              <div key={metric.label} className="rounded-md border border-soft bg-canvas/60 p-3">
                <p className="text-xs uppercase tracking-wider text-muted">{metric.label}</p>
                <p className="mt-1 text-lg font-semibold text-text">{metric.formatted_rate}</p>
                <p className="text-xs text-muted">{metric.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-soft bg-panel/50 p-3">
          <p className="text-xs uppercase tracking-wider text-accent">Action Applied</p>
          <div className="mt-2 space-y-2 text-sm text-text">
            {proof.action_applied.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </div>

      {!compact ? (
        <div className="mt-4 rounded-md border border-soft bg-panel/50 p-3">
          <p className="text-xs uppercase tracking-wider text-accent">Experiment Rules</p>
          <div className="mt-2 space-y-2 text-sm text-muted">
            {proof.experiment_rules.map((rule) => (
              <p key={rule}>{rule}</p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}