import { NavLink, useParams } from "react-router";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MediaType } from "@/types";

/** One shared component, two routes: /explore/anime and /explore/manga (§6.3). */
export function ExplorePage() {
  const { type } = useParams();
  const mediaType: MediaType = type === "manga" ? "MANGA" : "ANIME";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Explore</h1>
        <div className="flex rounded-md border border-line p-0.5 text-sm">
          <TypeTab to="/explore/anime" label="Anime" active={mediaType === "ANIME"} />
          <TypeTab to="/explore/manga" label="Manga" active={mediaType === "MANGA"} />
        </div>
      </header>
      <EmptyState
        title={`${mediaType === "ANIME" ? "Anime" : "Manga"} discovery arrives in Phase 2`}
        body="Search, genre and season filters, and an infinite-scroll grid backed by AniList."
      />
    </div>
  );
}

function TypeTab({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={`rounded px-3 py-1 transition-colors ${
        active
          ? "bg-signal text-on-signal font-semibold"
          : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </NavLink>
  );
}
