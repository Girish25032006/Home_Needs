import React, { useEffect, useState } from 'react';
import './Auth.css';
import API_URL from '../api';

function Auth({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('homeNeedsRememberEmail');
      if (savedEmail) {
        setFormData((prev) => ({ ...prev, email: savedEmail }));
        setRememberMe(true);
      }
    } catch (err) {
      console.warn('Remember email is unavailable in this browser.', err);
    }
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
  };

  const switchMode = () => {
    setIsLogin((prev) => !prev);
    setError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormData((prev) => ({ ...prev, name: '', phone: '', password: '', confirmPassword: '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const email = formData.email.trim();

    if (!isLogin && !formData.name.trim()) return setError('Please enter your full name.');
    if (!isLogin && formData.phone.trim() && !/^[0-9+\-\s()]{7,20}$/.test(formData.phone.trim())) {
      return setError('Please enter a valid phone number.');
    }
    if (formData.password.length < 8) return setError('Password must contain at least 8 characters.');
    if (!isLogin && formData.password !== formData.confirmPassword) return setError('Passwords do not match.');

    try {
      if (isLogin && rememberMe) localStorage.setItem('homeNeedsRememberEmail', email);
      else if (isLogin) localStorage.removeItem('homeNeedsRememberEmail');
    } catch (err) {
      console.warn('Could not save remembered email.', err);
    }

    setLoading(true);
    try {
      if (typeof onAuthSuccess !== 'function') throw new Error('Authentication handler is not configured.');
      await onAuthSuccess({ ...formData, email, name: formData.name.trim(), phone: formData.phone.trim(), mode: isLogin ? 'login' : 'signup' });
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    setForgotEmail(formData.email || '');
    setForgotMessage('');
    setForgotSuccess(false);
    setShowForgotPassword(true);
  };

  const closeForgotPassword = () => {
    if (forgotLoading) return;
    setShowForgotPassword(false);
    setForgotMessage('');
    setForgotSuccess(false);
  };

  const handleForgotSubmit = async (event) => {
    event.preventDefault();
    setForgotMessage('');
    setForgotSuccess(false);
    const email = forgotEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setForgotMessage('Please enter a valid email address.');

    setForgotLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/forgot-password`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
      });
      let data = {};
      try { data = await response.json(); } catch { /* Empty response is allowed. */ }
      if (!response.ok) throw new Error(data.message || 'Unable to process the password reset request.');
      setForgotSuccess(true);
      setForgotMessage(data.message || 'If an account exists for this email, a password reset link has been sent.');
    } catch (err) {
      console.error('Forgot password error:', err);
      setForgotMessage(err.message || 'Unable to send the reset link. Please check that Flask is running.');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one" aria-hidden="true" />
      <div className="auth-decoration auth-decoration-two" aria-hidden="true" />
      <div className="auth-decoration auth-decoration-three" aria-hidden="true" />

      <section className="auth-brand-story" aria-label="Home Needs benefits">
        <div className="auth-story-logo" aria-hidden="true">
          <span className="story-house">⌂</span><span className="story-leaf">✦</span>
        </div>
        <p className="auth-story-kicker">A HEALTHIER, HAPPIER HOME</p>
        <h2>Everyday home care, <span>made smarter.</span></h2>
        <p className="auth-story-description">Plan groceries, track household consumption, reduce waste, and discover meals your family will love.</p>
        <div className="auth-feature-list">
          <div className="auth-feature-card"><span className="auth-feature-icon grocery-icon" aria-hidden="true">🛒</span><span><strong>Smart Grocery Planning</strong><small>Know what your household needs.</small></span></div>
          <div className="auth-feature-card"><span className="auth-feature-icon prediction-icon" aria-hidden="true">▥</span><span><strong>AI-Powered Predictions</strong><small>Plan purchases with smart predictions.</small></span></div>
          <div className="auth-feature-card"><span className="auth-feature-icon meal-icon" aria-hidden="true">🥗</span><span><strong>Meal Recommendations</strong><small>Discover meals using available ingredients.</small></span></div>
        </div>
        <div className="auth-story-signoff"><span className="auth-story-sprout" aria-hidden="true">🌿</span><span>Good Food.<br /><strong>Happier Days.</strong></span></div>
      </section>

      <section className="auth-panel" aria-label={isLogin ? 'Sign in' : 'Create account'}>
        <header className="auth-brand">
          <div className="auth-brand-mark" aria-hidden="true"><span className="brand-house">⌂</span><span className="brand-leaf">✦</span></div>
          <div className="auth-brand-copy"><span className="auth-brand-name">Home Needs</span><span className="auth-brand-tagline">Smarter Homes · Happier Families</span></div>
        </header>

        <div className="auth-welcome-icon" aria-hidden="true">{isLogin ? '👋' : '🌱'}</div>
        <div className="auth-heading">
          <p className="auth-eyebrow">{isLogin ? 'WELCOME HOME' : 'START YOUR JOURNEY'}</p>
          <h1>{isLogin ? 'Welcome Back!' : 'Create Your Account'}</h1>
          <p className="auth-subtitle">{isLogin ? 'Sign in to take care of your happy home.' : 'Make everyday household planning simpler.'}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && <>
            <div className="auth-input-group"><label htmlFor="auth-name">Full name</label><div className="auth-input-wrapper"><span className="auth-input-icon" aria-hidden="true">♙</span><input id="auth-name" type="text" name="name" placeholder="Enter your full name" value={formData.name} onChange={handleChange} autoComplete="name" maxLength={100} required /></div></div>
            <div className="auth-input-group"><label htmlFor="auth-phone">Phone number <span className="auth-optional">(optional)</span></label><div className="auth-input-wrapper"><span className="auth-input-icon" aria-hidden="true">☎</span><input id="auth-phone" type="tel" name="phone" placeholder="Enter your phone number" value={formData.phone} onChange={handleChange} autoComplete="tel" inputMode="tel" /></div></div>
          </>}

          <div className="auth-input-group"><label htmlFor="auth-email">Email address</label><div className="auth-input-wrapper"><span className="auth-input-icon" aria-hidden="true">✉</span><input id="auth-email" type="email" name="email" placeholder="you@example.com" value={formData.email} onChange={handleChange} autoComplete="email" inputMode="email" required /></div></div>

          <div className="auth-input-group"><label htmlFor="auth-password">Password</label><div className="auth-input-wrapper"><span className="auth-input-icon" aria-hidden="true">⌑</span><input id="auth-password" type={showPassword ? 'text' : 'password'} name="password" placeholder="At least 8 characters" value={formData.password} onChange={handleChange} autoComplete={isLogin ? 'current-password' : 'new-password'} required /><button
  type="button"
  className="password-toggle"
  onClick={() => setShowPassword((prev) => !prev)}
  aria-label={showPassword ? 'Hide password' : 'Show password'}
  aria-pressed={showPassword}
>
  {showPassword ? '🙈' : '👁️'}
</button></div></div>

          {!isLogin && <div className="auth-input-group"><label htmlFor="auth-confirm-password">Confirm password</label><div className="auth-input-wrapper"><span className="auth-input-icon" aria-hidden="true">⌑</span><input id="auth-confirm-password" type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" placeholder="Re-enter your password" value={formData.confirmPassword} onChange={handleChange} autoComplete="new-password" required /><button
  type="button"
  className="password-toggle"
  onClick={() => setShowConfirmPassword((prev) => !prev)}
  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
  aria-pressed={showConfirmPassword}
>
  {showConfirmPassword ? '🙈' : '👁️'}
</button></div></div>}

          {isLogin && <div className="auth-login-options"><label className="remember-option"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span className="remember-check" aria-hidden="true">{rememberMe ? '✓' : ''}</span><span>Remember me</span></label><button type="button" className="forgot-password" onClick={openForgotPassword}>Forgot password?</button></div>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit-btn" type="submit" disabled={loading}>{loading ? 'Please wait...' : isLogin ? <>Sign In <span aria-hidden="true">→</span></> : <>Create Account <span aria-hidden="true">→</span></>}</button>
        </form>

        <div className="auth-switch"><span>{isLogin ? 'New to Home Needs?' : 'Already have an account?'}</span><button type="button" onClick={switchMode}>{isLogin ? 'Create account' : 'Sign in'}</button></div>
        <div className="auth-secure"><span className="secure-shield" aria-hidden="true">✓</span><span>Your household information stays private and secure.</span></div>
        <p className="auth-footer">Made with <span aria-label="love">♥</span> for happier homes</p>
      </section>

      {showForgotPassword && <div className="forgot-modal-overlay" onMouseDown={closeForgotPassword}>
        <section className="forgot-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-title" onMouseDown={(event) => event.stopPropagation()}>
          <button type="button" className="forgot-modal-close" onClick={closeForgotPassword} aria-label="Close password reset" disabled={forgotLoading}>×</button>
          <div className="forgot-modal-icon" aria-hidden="true">✉</div><p className="auth-eyebrow">ACCOUNT RECOVERY</p><h2 id="forgot-title">Reset your password</h2><p className="forgot-description">Enter the email address linked to your Home Needs account.</p>
          <form onSubmit={handleForgotSubmit}><div className="auth-input-group"><label htmlFor="forgot-email">Email address</label><div className="auth-input-wrapper"><span className="auth-input-icon" aria-hidden="true">✉</span><input id="forgot-email" type="email" placeholder="you@example.com" value={forgotEmail} onChange={(event) => { setForgotEmail(event.target.value); setForgotMessage(''); setForgotSuccess(false); }} autoComplete="email" required /></div></div>
            {forgotMessage && <div className={forgotSuccess ? 'forgot-success' : 'auth-error'} role="status">{forgotMessage}</div>}
            <button type="submit" className="auth-submit-btn forgot-submit" disabled={forgotLoading}>{forgotLoading ? 'Sending...' : 'Send reset link →'}</button>
          </form>
          <button type="button" className="forgot-back" onClick={closeForgotPassword} disabled={forgotLoading}>← Back to sign in</button>
        </section>
      </div>}
    </main>
  );
}

export default Auth;
