"use client";

import RelationshipCard from "@/components/RelationshipCard";
import { PriorityItem, ScoreExplanation } from "@/components/types";

type Props = {
  items: PriorityItem[];
  onSimulateSend: (relationshipId: string, message: string) => Promise<void>;
  explanations: Record<string, ScoreExplanation>;
  loadingExplanation: Record<string, boolean>;
  onLoadExplanation: (relationshipId: string) => Promise<void>;
  selectedIds: Set<string>;
  onToggleSelect: (relationshipId: string) => void;
  onDeleteRelationship: (relationshipId: string) => Promise<void>;
  deleteDisabled?: boolean;
};

export default function DashboardList({
  items,
  onSimulateSend,
  explanations,
  loadingExplanation,
  onLoadExplanation,
  selectedIds,
  onToggleSelect,
  onDeleteRelationship,
  deleteDisabled,
}: Props) {
  return (
    <section className="grid gap-4">
      {items.map((item, idx) => (
        <div key={item.relationship_id} style={{ animationDelay: `${idx * 80}ms` }}>
          <RelationshipCard
            item={item}
            onSimulateSend={onSimulateSend}
            explanation={explanations[item.relationship_id]}
            explanationLoading={Boolean(loadingExplanation[item.relationship_id])}
            onLoadExplanation={onLoadExplanation}
            selected={selectedIds.has(item.relationship_id)}
            onToggleSelect={onToggleSelect}
            onDelete={onDeleteRelationship}
            deleteDisabled={deleteDisabled}
          />
        </div>
      ))}
    </section>
  );
}
