"use client";

import RelationshipCard from "@/components/RelationshipCard";
import { PriorityItem } from "@/components/types";

type Props = {
  items: PriorityItem[];
  onSimulateSend: (relationshipId: string, message: string) => Promise<void>;
};

export default function DashboardList({ items, onSimulateSend }: Props) {
  return (
    <section className="grid gap-4">
      {items.map((item, idx) => (
        <div key={item.relationship_id} style={{ animationDelay: `${idx * 80}ms` }}>
          <RelationshipCard item={item} onSimulateSend={onSimulateSend} />
        </div>
      ))}
    </section>
  );
}
