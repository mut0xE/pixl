"use client";
import { useRouter } from "next/navigation";
import { AdminShell } from "./AdminShell";
import { CreateSeasonForm } from "./CreateSeasonForm";

// Dedicated create-season screen; on success it navigates to the roster.
export function NewSeason() {
  const router = useRouter();
  return (
    <AdminShell
      title="CREATE SEASON"
      back={{ href: "/admin", label: "← ADMIN" }}
    >
      {({ game }) => (
        <CreateSeasonForm
          game={game}
          onCreated={() => router.push("/admin/seasons")}
        />
      )}
    </AdminShell>
  );
}
