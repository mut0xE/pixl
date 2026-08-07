"use client";

// Returns to the front door: clears the "entered" flag so the root lands on the
// landing page (see HomeView), then does a full navigation home.
const ENTERED_KEY = "pixl.entered";

export function HomeButton() {
  const goHome = () => {
    try {
      window.sessionStorage.removeItem(ENTERED_KEY);
    } catch {
      /* sessionStorage may be unavailable; navigation still works */
    }
    window.location.href = "/";
  };
  return (
    <button type="button" className="header-link" onClick={goHome}>
      HOME
    </button>
  );
}
