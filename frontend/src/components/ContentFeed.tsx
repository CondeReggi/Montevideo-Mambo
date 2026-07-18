"use client";

import { useEffect, useState } from "react";
import { listPublishedContent, Content } from "@/lib/api";
import { Card, Badge, Skeleton } from "@/components/ui";
import { IconPin, IconChevron } from "@/components/ui/Icons";
import { contentTypeLabel, fmtDate, mapUrl } from "@/components/format";

/**
 * Muro de contenidos publicados (noticias, novedades, muestras, talleres, eventos).
 * Lo usan la vista del alumno (/me) y la página pública (/novedades). Solo lectura.
 */
export default function ContentFeed({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<Content[] | null>(null);

  useEffect(() => {
    listPublishedContent()
      .then((c) => setItems(compact ? c.slice(0, 3) : c))
      .catch(() => setItems([]));
  }, [compact]);

  if (items === null) return <Skeleton className="h-40" />;
  if (items.length === 0)
    return <p className="text-sm text-muted">No hay novedades por ahora.</p>;

  return (
    <div className="grid grid-cols-1 gap-4">
      {items.map((c) => (
        <ContentCard key={c.id} c={c} />
      ))}
    </div>
  );
}

function ContentCard({ c }: { c: Content }) {
  const maps = mapUrl(c);
  return (
    <Card className="overflow-hidden p-0 animate-fade-up">
      {c.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.imageUrl} alt={c.title} className="max-h-56 w-full object-cover" />
      )}
      <div className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone="lime">{contentTypeLabel(c.type)}</Badge>
          {c.eventDate && <span className="text-xs text-muted">{fmtDate(c.eventDate)}</span>}
        </div>
        <h3 className="font-display text-xl">{c.title}</h3>
        {c.body && <p className="mt-2 whitespace-pre-line text-sm text-muted-soft">{c.body}</p>}

        {(c.locationName || c.locationAddress) && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <span className="text-lime"><IconPin /></span>
            {c.locationName || c.locationAddress}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {maps && (
            <a
              href={maps}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-ink-500 px-3 py-1.5 text-sm text-foreground hover:bg-ink-700"
            >
              <IconPin /> Cómo llegar
            </a>
          )}
          {c.externalUrl && (
            <a
              href={c.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-lime/15 px-3 py-1.5 text-sm text-lime hover:bg-lime/25"
            >
              Más info <IconChevron />
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}
