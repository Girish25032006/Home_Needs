import { useEffect, useState } from "react";
import "./ResetPassword.css";

import API_URL from './api'

function ResetPassword({ onBackToLogin }) {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [passwordStrength, setPasswordStrength] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resetToken = params.get("token");

    if (resetToken) {
      setToken(resetToken);
    } else {
      setMessage("This password reset link is invalid or incomplete.");
      setMessageType("error");
    }
  }, []);

  const calculatePasswordStrength = (value) => {
    let strength = 0;

    if (value.length >= 8) strength++;
    if (/[A-Z]/.test(value)) strength++;
    if (/[a-z]/.test(value)) strength++;
    if (/[0-9]/.test(value)) strength++;
    if (/[^A-Za-z0-9]/.test(value)) strength++;

    setPasswordStrength(strength);
  };

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    calculatePasswordStrength(value);
  };

  const getStrengthText = () => {
    if (!password) return "";
    if (passwordStrength <= 2) return "Weak password";
    if (passwordStrength === 3) return "Medium password";
    if (passwordStrength === 4) return "Strong password";
    return "Very strong password";
  };

  const getStrengthClass = () => {
    if (!password) return "";
    if (passwordStrength <= 2) return "weak";
    if (passwordStrength === 3) return "medium";
    return "strong";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setMessage("");
    setMessageType("");

    if (!token) {
      setMessage("This reset link is invalid or has expired.");
      setMessageType("error");
      return;
    }

    if (!password || !confirmPassword) {
      setMessage("Please enter both password fields.");
      setMessageType("error");
      return;
    }

    if (password.length < 8) {
      setMessage("Password must contain at least 8 characters.");
      setMessageType("error");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setMessageType("error");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/api/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
        token: token,
        password: password,
        confirmPassword: confirmPassword,
      }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Unable to reset your password."
        );
      }

      setMessage(
        "Your password has been reset successfully. You can now sign in with your new password."
      );
      setMessageType("success");

      setPassword("");
      setConfirmPassword("");
      setPasswordStrength(0);

      setTimeout(() => {
        if (onBackToLogin) {
          onBackToLogin();
        } else {
          window.location.href = "/";
        }
      }, 2500);
    } catch (error) {
      console.error("Reset password error:", error);

      setMessage(
        error.message ||
          "Something went wrong. Please request a new reset link."
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    if (onBackToLogin) {
      onBackToLogin();
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div className="reset-page">
      {/* Left Brand Section */}
      <section className="reset-brand-panel">
        <div className="reset-brand-content">

          <div className="reset-brand-logo">
            <div className="reset-logo-box">
              <span>⌂</span>
            </div>

            <div>
              <h2>Home Needs</h2>
              <p>Smarter Homes • Happier Families</p>
            </div>
          </div>

          <div className="reset-brand-main">
            <span className="reset-eyebrow">
              YOUR SMART HOME ASSISTANT
            </span>

            <h1>
              A safer home
              <br />
              starts with
              <span> smart access.</span>
            </h1>

            <p>
              Keep your household information secure and manage everything
              from one simple, intelligent home assistant.
            </p>

            <div className="reset-feature-list">

              <div className="reset-feature">
                <div className="reset-feature-icon">🛒</div>
                <div>
                  <strong>Smart Grocery Planning</strong>
                  <small>Stay prepared for your household needs.</small>
                </div>
              </div>

              <div className="reset-feature">
                <div className="reset-feature-icon">🤖</div>
                <div>
                  <strong>AI-Powered Predictions</strong>
                  <small>Plan purchases using smart consumption insights.</small>
                </div>
              </div>

              <div className="reset-feature">
                <div className="reset-feature-icon">🍲</div>
                <div>
                  <strong>Meal Recommendations</strong>
                  <small>Discover meals from available ingredients.</small>
                </div>
              </div>

            </div>
          </div>

          <div className="reset-brand-footer">
            Made with <span>♥</span> for happier homes
          </div>
        </div>
      </section>

      {/* Right Reset Card */}
      <section className="reset-form-panel">

        <div className="reset-card">

          <div className="reset-card-header">

            <div className="reset-home-icon">
              <span>⌂</span>
              <i>✦</i>
            </div>

            <h2>Home Needs</h2>
            <p>Smarter Homes • Happier Families</p>

            <div className="reset-key-icon">
              🔑
            </div>

            <h1>Reset Your Password</h1>

            <p className="reset-description">
              Create a new password to securely access your Home Needs
              account.
            </p>

          </div>

          <form onSubmit={handleSubmit} className="reset-form">

            {/* New Password */}
            <div className="reset-field">

              <label htmlFor="new-password">
                New Password
              </label>

              <div className="reset-input-wrapper">

                <span className="reset-input-icon">
                  🔒
                </span>

                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your new password"
                  value={password}
                  onChange={handlePasswordChange}
                  autoComplete="new-password"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="reset-eye-button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? "🙈" : "👁"}
                </button>

              </div>

              {password && (
                <div className="password-strength">

                  <div className="strength-bars">

                    {[1, 2, 3, 4, 5].map((item) => (
                      <span
                        key={item}
                        className={
                          item <= passwordStrength
                            ? `active ${getStrengthClass()}`
                            : ""
                        }
                      ></span>
                    ))}

                  </div>

                  <span className={`strength-text ${getStrengthClass()}`}>
                    {getStrengthText()}
                  </span>

                </div>
              )}

              <div className="password-hint">
                Use at least 8 characters with letters, numbers and symbols.
              </div>

            </div>

            {/* Confirm Password */}
            <div className="reset-field">

              <label htmlFor="confirm-password">
                Confirm Password
              </label>

              <div className="reset-input-wrapper">

                <span className="reset-input-icon">
                  🔒
                </span>

                <input
                  id="confirm-password"
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                  autoComplete="new-password"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="reset-eye-button"
                  onClick={() =>
                    setShowConfirmPassword(!showConfirmPassword)
                  }
                  aria-label={
                    showConfirmPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showConfirmPassword ? "🙈" : "👁"}
                </button>

              </div>

            </div>

            {/* Match indicator */}
            {confirmPassword && (
              <div
                className={
                  password === confirmPassword
                    ? "password-match success"
                    : "password-match error"
                }
              >
                <span>
                  {password === confirmPassword ? "✓" : "!"}
                </span>

                {password === confirmPassword
                  ? "Passwords match"
                  : "Passwords do not match"}
              </div>
            )}

            {/* Message */}
            {message && (
              <div
                className={`reset-message ${messageType}`}
              >
                <span className="reset-message-icon">
                  {messageType === "success" ? "✓" : "!"}
                </span>

                <span>{message}</span>
              </div>
            )}

            {/* Reset Button */}
            <button
              type="submit"
              className="reset-submit-button"
              disabled={loading || !token}
            >
              {loading ? (
                <>
                  <span className="reset-spinner"></span>
                  Updating Password...
                </>
              ) : (
                <>
                  Reset Password
                  <span>→</span>
                </>
              )}
            </button>

          </form>

          {/* Back to Login */}
          <button
            type="button"
            className="back-login-button"
            onClick={handleBackToLogin}
          >
            ← Back to Login
          </button>

          <div className="reset-security">

            <span className="security-icon">
              🛡️
            </span>

            <div>
              <strong>Secure Account</strong>
              <span>
                Your password is securely protected.
              </span>
            </div>

          </div>

        </div>

      </section>
    </div>
  );
}

export default ResetPassword;