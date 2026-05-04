import { LegalLayout } from "@/components/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p className="text-sm text-muted-foreground">Effective date: May 3, 2026</p>

      <p>
        These Terms of Service ("Terms") govern your use of Annotated, including the
        website at https://annotatedextension.com, the Annotated Chrome extension, and
        related services (collectively, the "Service"). By using the Service, you agree
        to these Terms. These Terms have not been reviewed by a lawyer and are not legal
        advice.
      </p>

      <h2>1. Account and eligibility</h2>
      <p>
        You sign in with Google or X (Twitter). You must be at least 13 years old to use
        the Service. You are responsible for activity on your account.
      </p>

      <h2>2. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>
          violate any applicable law, including copyright, trademark, privacy, and
          anti-spam laws;
        </li>
        <li>
          post content that is unlawful, harassing, defamatory, hateful, sexually
          exploitative of minors, or that incites violence;
        </li>
        <li>
          impersonate a person or entity, or misrepresent your affiliation with anyone;
        </li>
        <li>
          attempt to gain unauthorized access to the Service, scrape it at scale, or
          interfere with its normal operation;
        </li>
        <li>
          publish clips that exceed the technical limits the Service enforces (for
          example, the 90-second clip cap).
        </li>
      </ul>

      <h2>3. Your content and media rights</h2>
      <p>
        Annotated is a tool for clipping and annotating short excerpts of third-party
        media. You are responsible for the clips, commentary, and comments you publish.
        By publishing content, you represent that:
      </p>
      <ul>
        <li>
          you have the right to publish it, or your use qualifies as fair use, fair
          dealing, or another applicable exception under the laws that govern you;
        </li>
        <li>
          you grant Annotated a non-exclusive, worldwide, royalty-free license to host,
          store, reproduce, display, and distribute your content as needed to operate the
          Service.
        </li>
      </ul>

      <h2>4. Source attribution</h2>
      <p>
        Every clip on Annotated links back to its original source. You must not remove or
        obscure source attribution. We may remove clips that misrepresent or fail to
        attribute their source.
      </p>

      <h2>5. Claims workflow (fair use disputes)</h2>
      <p>
        If you are a rights holder and you believe a clip on Annotated is not a fair use
        of your work, file a claim using the "File a claim" button on the clip's page or
        email <a href="mailto:support@annotatedextensions.com">support@annotatedextensions.com</a>.
        Provide:
      </p>
      <ul>
        <li>your name and a contact email address;</li>
        <li>the URL of the clip on Annotated;</li>
        <li>the URL of the original work and proof you control its rights;</li>
        <li>a brief explanation of why the clip is not a fair use.</li>
      </ul>
      <p>
        We will review claims in good faith and may remove or restrict access to clips we
        determine should be taken down. Repeat infringers will have their accounts
        terminated.
      </p>

      <h2>6. Beta / as-is service</h2>
      <p>
        The Service is provided "as is" and "as available." It is currently in active
        development and may change, break, or be discontinued without notice. We make no
        warranties of any kind, express or implied, including merchantability, fitness for
        a particular purpose, and non-infringement.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Annotated and its operators are not
        liable for any indirect, incidental, special, consequential, or punitive damages,
        or for any loss of profits, revenue, data, or goodwill, arising out of or in
        connection with your use of the Service. Our total liability for any claim
        relating to the Service is limited to one hundred U.S. dollars ($100).
      </p>

      <h2>8. Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate your
        access if you violate these Terms or if we reasonably believe doing so is
        necessary to protect the Service or other users. We may also discontinue the
        Service at any time.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these Terms from time to time. Material changes will be reflected
        by an updated effective date above. Your continued use of the Service after a
        change means you accept the updated Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions or notices: <a href="mailto:support@annotatedextensions.com">support@annotatedextensions.com</a>.
      </p>
    </LegalLayout>
  );
}
