import Link from "next/link";
import { HomeButton } from "../../components/HomeButton";
import { SeasonBrowser } from "../../components/SeasonBrowser";

// Public seasons roster. Unlike /admin/seasons this route is ungated — any
// visitor can browse live, upcoming, and finished seasons and drill into a
// season's canvas + leaderboard. Wraps the shared SeasonBrowser in a landing-
// styled shell rather than the authority-gated AdminShell.
export default function SeasonsPage() {
  return (
    <main className="seasons-route">
      <header className="landing__header">
        <Link href="/" className="landing__wordmark">
          Pixl
        </Link>
        <div className="landing__header-actions">
          <HomeButton />
        </div>
      </header>
      <section className="seasons-route__body">
        <SeasonBrowser />
      </section>
    </main>
  );
}
