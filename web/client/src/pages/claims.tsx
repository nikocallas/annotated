import { LegalLayout } from "@/components/LegalLayout";

export default function ClaimsPage() {
  return (
    <LegalLayout title="How claims work">
      <p className="text-sm text-muted-foreground">
        Claims help us keep Annotated a place where annotation, criticism, and commentary stay
        within fair use. This page explains what a claim is, when to file one, and what happens
        after you do.
      </p>

      <h2>What a claim is</h2>
      <p>
        A claim is a request for our team to review a clip you believe goes beyond fair use or
        otherwise infringes your rights. Annotated is built around short clips that anchor
        commentary &mdash; not full reproductions of someone else&rsquo;s work &mdash; so claims
        are how rightsholders and creators flag clips that miss that line.
      </p>

      <h2>When to file a claim</h2>
      <ul>
        <li>The clip reproduces too much of your work to be reasonable commentary.</li>
        <li>The clip is presented in a way that misrepresents your work or you.</li>
        <li>The clip uses material you own without a credible fair-use basis.</li>
        <li>The clip violates another right you hold (e.g. publicity, trademark).</li>
      </ul>
      <p>
        If you simply disagree with the annotator&rsquo;s opinion, that is not a claim &mdash;
        commentary and criticism are part of how the platform works. Use comments or your own
        annotation to respond.
      </p>

      <h2>What to include</h2>
      <ul>
        <li>A link to the specific annotation or clip in question.</li>
        <li>Who you are and your relationship to the work (rightsholder, creator, agent).</li>
        <li>A short explanation of why the clip exceeds fair use or infringes your rights.</li>
        <li>Contact information we can reply to.</li>
      </ul>
      <p>
        The more specific your claim, the faster we can review it. Vague reports take longer
        because we have to come back with questions.
      </p>

      <h2>What happens after you submit</h2>
      <ol>
        <li>
          <strong>We record it immediately.</strong> The confirmation screen gives you a claim
          reference. When email delivery is available, we also send an acknowledgement to the
          address you provided.
        </li>
        <li>
          <strong>We attempt to notify the poster.</strong> When the poster has a deliverable
          provider email, we tell them a claim was filed and give them a chance to respond
          &mdash; for example, by removing the clip or providing context.
        </li>
        <li>
          <strong>We review.</strong> Our team weighs the claim, the response, and the clip
          itself against our policies and a fair-use analysis. We may temporarily hide the clip
          while we review.
        </li>
        <li>
          <strong>We act.</strong> Depending on the outcome we may leave the clip up, ask the
          poster to edit it, take it down, or, for repeat or serious cases, remove the
          poster&rsquo;s account.
        </li>
        <li>
          <strong>We follow up.</strong> We use the contact information available to communicate
          material updates or request more evidence. If you do not receive an expected update,
          contact support with the claim reference from your confirmation screen.
        </li>
      </ol>

      <h2>Good-faith filings only</h2>
      <p>
        Filing a claim that you know is false or that you&rsquo;re using to silence legitimate
        commentary is a misuse of the system. Repeated bad-faith claims can lead to losing the
        ability to file.
      </p>

      <h2>Not legal advice</h2>
      <p>
        This page describes how Annotated handles claims as a product. It is not legal advice
        and does not change anything written in our{" "}
        <a href="/tos">Terms of Service</a>. If you need legal advice, talk to a lawyer.
      </p>

      <h2>Questions</h2>
      <p>
        For anything you can&rsquo;t resolve through the in-product claim form, email{" "}
        <a href="mailto:support@annotatedextension.com">support@annotatedextension.com</a> and
        we&rsquo;ll help.
      </p>
    </LegalLayout>
  );
}
