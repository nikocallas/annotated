import { LegalLayout } from "@/components/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p className="text-sm text-muted-foreground">Effective date: August 1, 2026</p>

      <p>
        This Privacy Policy describes how Annotated ("we", "us") collects, uses, and shares
        information when you use the Annotated website at https://annotatedextension.com,
        the Annotated Chrome extension, and related services (collectively, the "Service").
        It is written in plain language and is not a substitute for legal advice.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account identity from OAuth.</strong> When you sign in with Google or X
          (Twitter), we receive a stable user identifier, your display name, your username
          or handle, a profile image URL, and any email address the provider makes available
          for authentication and account notices. We do not receive or store your provider
          password, and your email is not shown on your public Annotated profile.
        </li>
        <li>
          <strong>Content you create.</strong> Annotations, clip metadata (source URL,
          start/end seconds, text), commentary text, audio commentary, comments, social
          interactions, and any claim or support information you choose to submit.
        </li>
        <li>
          <strong>Usage and technical data.</strong> Standard request logs from our hosting
          provider (IP address, user agent, timestamps, request paths) and basic
          application logs used for debugging and abuse prevention.
        </li>
        <li>
          <strong>Browser data the extension uses locally.</strong> The Chrome extension
          stores a small amount of state in <code>chrome.storage.local</code>, including your
          Annotated profile and short-lived access and refresh session tokens, so the side
          panel remains signed in across page loads. The extension sends the access token to
          the Annotated API to authenticate your requests and sends the refresh token only to
          Annotated's session-refresh endpoint. It does not expose those tokens to source pages.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To create and maintain your Annotated account.</li>
        <li>To display your annotations, comments, and profile to other users.</li>
        <li>To process clip uploads and produce the playable clip.</li>
        <li>To respond to fair-use claims and trust-and-safety reports.</li>
        <li>To detect, prevent, and address fraud, abuse, and security issues.</li>
        <li>To improve the Service.</li>
      </ul>

      <h2>Third-party processors</h2>
      <p>
        We use a small number of vendors to run the Service. These processors only
        receive the data they need to do their job:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — managed Postgres database, authentication broker, and
          media-object storage.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting, serverless functions, and edge
          delivery.
        </li>
        <li>
          <strong>OAuth providers (Google, X / Twitter)</strong> — sign-in. They only see
          that you authorized Annotated; they do not see what you do inside the app.
        </li>
        <li>
          <strong>Resend</strong> — transactional delivery for support and claim notices when
          email delivery is configured.
        </li>
      </ul>

      <h2>Sharing</h2>
      <p>
        We do not sell your personal information. We share information only with the
        processors listed above, when required by law, or to protect the rights, safety,
        and property of Annotated and its users.
      </p>

      <h2>Public content</h2>
      <p>
        Annotations, comments, and your public profile are visible to anyone who visits
        the Service. Do not publish content you would not want to be public.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We retain account and published content while your account is active. Incomplete media
        uploads are automatically removed after a 24-hour cleanup window, and abuse-prevention
        counters expire after their rate-limit window. Claim records and their audit trail may be
        retained as needed to resolve a dispute and meet legal obligations.
      </p>
      <p>
        You can permanently delete your account from the Account controls section of your profile.
        This removes your profile, annotations, comments, social interactions, stored media, and
        linked OAuth identity. You may also contact support if you cannot access your account.
      </p>

      <h2>Your rights and contact</h2>
      <p>
        You can request access to or correction of your information. You can delete your account
        directly from your profile, or make a request by emailing{" "}
        <a href="mailto:support@annotatedextension.com">support@annotatedextension.com</a>. We will
        respond within a reasonable time.
      </p>

      <h2>Children</h2>
      <p>
        Annotated is not directed to children under 13. We do not knowingly collect
        personal information from children under 13.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. We will update the effective
        date above when we do.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:support@annotatedextension.com">support@annotatedextension.com</a>.
      </p>
    </LegalLayout>
  );
}
