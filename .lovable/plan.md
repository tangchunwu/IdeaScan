

## Security Scan — Warn-Level Findings

After reviewing the full scan results, there is only **one** non-ignored finding at "warn" level:

### SUPA_auth_leaked_password_protection — Leaked Password Protection Disabled

**What it means:** Users can currently sign up with passwords that have appeared in known data breaches (e.g. "password123", "qwerty2024"). Enabling this feature checks new passwords against a database of compromised credentials and blocks them.

**Why it matters:** Credential stuffing and account takeover attacks are significantly easier when users reuse leaked passwords.

### Required Action

This is a **backend authentication configuration** change, not a code change. It cannot be done through code or database migrations.

**How to enable it:**

<lov-actions>
  <lov-open-backend>Open Backend Settings</lov-open-backend>
</lov-actions>

1. Open the backend (click above)
2. Navigate to **Authentication → URL Configuration** or **Auth Settings**
3. Find **"Leaked Password Protection"** and enable it
4. Save

Once enabled, the security scan warning will be resolved automatically on the next scan.

---

All other findings in the scan are at "info" level (no action needed) or already ignored with documented reasons. No code changes are required.

