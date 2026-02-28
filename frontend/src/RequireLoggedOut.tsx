import { Navigate } from "react-router-dom";

export default function RequireLoggedOut({ loggedIn, children }: { loggedIn: boolean; children: JSX.Element }) {
  if (loggedIn) return <Navigate to="/" replace />;
  return children;
}
