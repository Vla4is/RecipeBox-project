import { Navigate } from "react-router-dom";

export default function RequireAuth({ loggedIn, children }: { loggedIn: boolean; children: JSX.Element }) {
  if (!loggedIn) return <Navigate to="/login" replace />;
  return children;
}
