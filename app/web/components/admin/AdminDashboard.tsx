"use client";
import { useMemo, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import type { SeasonSummary } from "../../../../packages/sdk";
import { useAdmin } from "../../lib/useAdmin";
import { useSeasons } from "../../lib/useSeasons";
import { CreateSeasonForm } from "./CreateSeasonForm";
import { SeasonLifecyclePanel } from "./SeasonLifecyclePanel";
import { ExportSnapshot } from "./ExportSnapshot";

function shortKey(k: string): string {
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function AccessDenied({
  reason,
  authority,
}: {
  reason: string;
  authority: string | null;
}) {
  return (
    <div className="admin-denied">
      <h1 className="admin-denied__title">ADMIN CONSOLE</h1>
      <p className="admin-denied__msg">{reason}</p>
      {authority && (
        <p className="admin-denied__hint">
          Authority: <code>{shortKey(authority)}</code>
        </p>
      )}
      <WalletMultiButton />
    </div>
  );
}

export function AdminDashboard() {
  const { connected } = useWallet();
  const { game, authority, isAuthority, loading, error, refetch } = useAdmin();
  const { seasons, refetch: refetchSeasons } = useSeasons();
  const [selected, setSelected] = useState<string | null>(null);

  const selectedSeason: SeasonSummary | null = useMemo(
    () => seasons?.find((s) => s.address === selected) ?? null,
    [seasons, selected]
  );

  if (!connected) {
    return (
      <AccessDenied
        reason="Connect the game authority wallet to continue."
        authority={authority?.toBase58() ?? null}
      />
    );
  }
  if (loading && !authority) {
    return (
      <div className="admin-denied">
        <p className="admin-denied__msg">
          <span className="spinner" aria-hidden /> Resolving game authority…
        </p>
      </div>
    );
  }
  if (error) {
    return (
      <AccessDenied reason={`Could not load Game: ${error}`} authority={null} />
    );
  }
  if (!isAuthority || !game) {
    return (
      <AccessDenied
        reason="This wallet is not the game authority. Access denied."
        authority={authority?.toBase58() ?? null}
      />
    );
  }

  const refetchAll = () => {
    void refetch();
    void refetchSeasons();
  };

  return (
    <div className="admin-console">
      <header className="admin-console__bar">
        <h1 className="admin-console__title">ADMIN CONSOLE</h1>
        <div className="admin-console__who">
          <span className="admin-badge">AUTHORITY</span>
          <code>{authority ? shortKey(authority.toBase58()) : "—"}</code>
          <WalletMultiButton />
        </div>
      </header>

      <CreateSeasonForm game={game} onCreated={refetchAll} />

      <section className="admin-card">
        <h3 className="admin-card__heading">MANAGE SEASON</h3>
        {!seasons ? (
          <p className="admin-card__note">
            <span className="spinner" aria-hidden /> Loading seasons…
          </p>
        ) : seasons.length === 0 ? (
          <p className="admin-card__note">No seasons yet.</p>
        ) : (
          <select
            className="admin-select"
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
          >
            <option value="">Select a season…</option>
            {seasons.map((s) => (
              <option key={s.address} value={s.address}>
                #{s.id} · {s.title || "Untitled"} · {s.status}
              </option>
            ))}
          </select>
        )}
      </section>

      {selectedSeason && (
        <>
          <SeasonLifecyclePanel
            game={game}
            season={selectedSeason}
            onChanged={refetchAll}
          />
          <ExportSnapshot season={selectedSeason} />
        </>
      )}
    </div>
  );
}
