import { permanentRedirect } from "next/navigation";

/** Mini-apps grid is hidden; Figma home is the main entry at /. */
export default function DashboardPage() {
  permanentRedirect("/");
}
