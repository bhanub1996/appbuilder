import { Navigate, Route, Routes } from "react-router-dom";

import AdminPanel from "./pages/AdminPanel";
import DeveloperWorkspace from "./pages/DeveloperWorkspace";
import Login from "./pages/Login";
import { useAuth } from "./state/auth";

export default function App() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/work/:storyId?" element={<DeveloperWorkspace />} />
      {user.role === "admin" && (
        <Route path="/admin/*" element={<AdminPanel />} />
      )}
      <Route
        path="*"
        element={
          <Navigate to={user.role === "admin" ? "/admin" : "/work"} replace />
        }
      />
    </Routes>
  );
}
