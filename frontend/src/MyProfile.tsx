import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { processImage } from "./imageUpload";
import "./App.css";

type Profile = {
  userid: string;
  email: string;
  name: string;
  nickname: string;
  avatar_url: string | null;
  nicknameChangeCount: number;
  nicknameChangedAt: string | null;
  isPremium: boolean;
  nextNicknameChangeAt: string | null;
  createdAt: string;
};

async function safeJson<T>(res: Response): Promise<T> {
  return res.json().catch(() => ({} as T));
}

function formatNicknameRule(profile: Profile) {
  if (profile.isPremium) {
    if (profile.nextNicknameChangeAt && new Date(profile.nextNicknameChangeAt).getTime() > Date.now()) {
      return `Premium nickname change resets on ${new Date(profile.nextNicknameChangeAt).toLocaleDateString()}.`;
    }
    return "Premium members can change nickname once every 30 days.";
  }

  return profile.nicknameChangeCount > 0
    ? "You have already used your one nickname change."
    : "You can change your nickname one time as a regular user.";
}

export default function MyProfile({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [form, setForm] = useState({ name: "", nickname: "", avatar_url: "" });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  useEffect(() => {
    fetch("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 401) {
          onUnauthorized();
          return null;
        }
        const body = await safeJson<{ error?: string; profile?: Profile }>(res);
        if (!res.ok || !body.profile) {
          throw new Error(body.error || "Failed to load profile");
        }
        return body.profile;
      })
      .then((nextProfile) => {
        if (!nextProfile) return;
        setProfile(nextProfile);
        setForm({
          name: nextProfile.name,
          nickname: nextProfile.nickname,
          avatar_url: nextProfile.avatar_url || "",
        });
      })
      .catch((err: Error) => setError(err.message || "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [token, onUnauthorized]);

  const publicUrl = useMemo(() => {
    if (!profile?.nickname) return "";
    return `/@${profile.nickname}`;
  }, [profile?.nickname]);

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
    setProfileMessage("");
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
    setPasswordMessage("");
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Avatar must be smaller than 5MB");
      return;
    }

    void (async () => {
      try {
        const processedAvatar = await processImage(file, {
          width: 320,
          height: 320,
          quality: 0.62,
        });
        setForm((prev) => ({ ...prev, avatar_url: processedAvatar }));
      } catch {
        setError("Failed to process avatar image");
      }
    })();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setError("");
    setProfileMessage("");

    try {
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name,
          nickname: form.nickname,
          avatar_url: form.avatar_url || null,
        }),
      });

      if (res.status === 401) {
        onUnauthorized();
        return;
      }

      const body = await safeJson<{ error?: string; profile?: Profile }>(res);
      if (!res.ok || !body.profile) {
        throw new Error(body.error || "Failed to update profile");
      }

      setProfile(body.profile);
      setForm({
        name: body.profile.name,
        nickname: body.profile.nickname,
        avatar_url: body.profile.avatar_url || "",
      });
      setProfileMessage("Profile updated.");
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    setError("");
    setPasswordMessage("");

    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error("New password confirmation does not match");
      }

      const res = await fetch("/api/me/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (res.status === 401) {
        onUnauthorized();
        return;
      }

      const body = await safeJson<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(body.error || "Failed to update password");
      }

      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordMessage("Password updated.");
    } catch (err: any) {
      setError(err.message || "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-shell">
        <div className="rd-state">
          <div className="rd-spinner" />
          <span>Loading profile...</span>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="profile-shell">
        <div className="rd-state">
          <p className="rd-state-msg">{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="profile-shell">
      <motion.section
        className="profile-hero"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="profile-avatar-wrap">
          {form.avatar_url ? (
            <img src={form.avatar_url} alt={profile.nickname} className="profile-avatar" />
          ) : (
            <div className="profile-avatar profile-avatar-fallback">
              {profile.nickname.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="profile-hero-copy">
          <p className="profile-kicker">My Profile</p>
          <h1>{profile.name}</h1>
          <p className="profile-handle">@{profile.nickname}</p>
          <p className="profile-meta-line">
            Joined {new Date(profile.createdAt).toLocaleDateString()} · {profile.isPremium ? "Premium" : "Standard"} member
          </p>
          <div className="profile-hero-actions">
            <Link to={publicUrl} className="profile-link-btn">
              View public profile
            </Link>
          </div>
        </div>
      </motion.section>

      <div className="profile-grid">
        <motion.form
          className="profile-card"
          onSubmit={handleSaveProfile}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
        >
          <div className="profile-card-head">
            <h2>Profile details</h2>
            <p>{formatNicknameRule(profile)}</p>
          </div>

          <label className="auth-label" htmlFor="profile-name">Name</label>
          <input
            id="profile-name"
            name="name"
            value={form.name}
            onChange={handleProfileChange}
            className="auth-input"
            required
          />

          <label className="auth-label" htmlFor="profile-nickname">Nickname</label>
          <input
            id="profile-nickname"
            name="nickname"
            value={form.nickname}
            onChange={handleProfileChange}
            className="auth-input"
            required
            minLength={3}
          />

          <label className="auth-label" htmlFor="profile-avatar">Avatar</label>
          <input
            id="profile-avatar"
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="auth-input"
          />

          <button type="submit" className="auth-btn" disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save profile"}
          </button>

          {profileMessage ? <div className="auth-success">{profileMessage}</div> : null}
          {error ? <div className="auth-error">{error}</div> : null}
        </motion.form>

        <motion.form
          className="profile-card"
          onSubmit={handleSavePassword}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.14 }}
        >
          <div className="profile-card-head">
            <h2>Password</h2>
            <p>Change your password without touching the rest of your profile.</p>
          </div>

          <label className="auth-label" htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            value={passwordForm.currentPassword}
            onChange={handlePasswordChange}
            className="auth-input"
            required
          />

          <label className="auth-label" htmlFor="new-password">New password</label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            value={passwordForm.newPassword}
            onChange={handlePasswordChange}
            className="auth-input"
            required
            minLength={6}
          />

          <label className="auth-label" htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={handlePasswordChange}
            className="auth-input"
            required
            minLength={6}
          />

          <button type="submit" className="auth-btn" disabled={savingPassword}>
            {savingPassword ? "Updating..." : "Update password"}
          </button>

          {passwordMessage ? <div className="auth-success">{passwordMessage}</div> : null}
        </motion.form>
      </div>
    </div>
  );
}
