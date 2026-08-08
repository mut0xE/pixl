import Link from "next/link";
import { Leaderboard } from "../../components/Leaderboard";

export default function LeaderboardPage() {
  return (
    <main className="leaderboard-page">
      <Link href="/" className="header-link leaderboard-page__back">
        ← BACK
      </Link>
      <Leaderboard />
    </main>
  );
}
