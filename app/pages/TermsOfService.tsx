import { PageLayout } from '~/components/layout/PageLayout';

export default function TermsOfService() {
  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-8 px-6 py-12">
        <style dangerouslySetInnerHTML={{ __html: `
          [data-custom-class='body'], [data-custom-class='body'] * {
            background: transparent !important;
          }
          [data-custom-class='title'], [data-custom-class='title'] * {
            font-family: Arial !important;
            font-size: 26px !important;
            color: var(--bolt-elements-textPrimary) !important;
          }
          [data-custom-class='subtitle'], [data-custom-class='subtitle'] * {
            font-family: Arial !important;
            color: var(--bolt-elements-textSecondary) !important;
            font-size: 14px !important;
          }
          [data-custom-class='heading_1'], [data-custom-class='heading_1'] * {
            font-family: Arial !important;
            font-size: 19px !important;
            color: var(--bolt-elements-textPrimary) !important;
          }
          [data-custom-class='heading_2'], [data-custom-class='heading_2'] * {
            font-family: Arial !important;
            font-size: 17px !important;
            color: var(--bolt-elements-textPrimary) !important;
          }
          [data-custom-class='body_text'], [data-custom-class='body_text'] * {
            color: var(--bolt-elements-textSecondary) !important;
            font-size: 14px !important;
            font-family: Arial !important;
          }
          [data-custom-class='link'], [data-custom-class='link'] * {
            color: var(--bolt-elements-messages-linkColor) !important;
            font-size: 14px !important;
            font-family: Arial !important;
            word-break: break-word !important;
          }
        `}} />
        
        <div data-custom-class="body" dangerouslySetInnerHTML={{ __html: `
          <div>
            <strong>
              <span style="font-size: 26px;">
                <span data-custom-class="title">
                  <h1>TERMS OF SERVICE</h1>
                </span>
              </span>
            </strong>
          </div>
          <div>
            <span style="color: rgb(127, 127, 127);">
              <strong>
                <span style="font-size: 15px;">
                  <span data-custom-class="subtitle">Last updated April 15, 2024</span>
                </span>
              </strong>
            </span>
          </div>
          <div class="space-y-8">
            <div class="space-y-4">
              <h2 data-custom-class="heading_1">1. Agreement to Terms</h2>
              <p data-custom-class="body_text">
                By accessing and using 10XTraders.AI ("the Platform"), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing the Platform.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">2. Trading Risks</h2>
              <p data-custom-class="body_text">
                Trading cryptocurrency involves substantial risk of loss and is not suitable for all investors. You acknowledge that:
              </p>
              <ul class="list-disc pl-6 space-y-2" data-custom-class="body_text">
                <li>Cryptocurrency trading is highly speculative and volatile</li>
                <li>Past performance is not indicative of future results</li>
                <li>You may sustain significant losses of your invested capital</li>
                <li>Automated trading systems may not perform as expected</li>
                <li>Technical issues could impact trading performance</li>
              </ul>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">3. Service Description</h2>
              <p data-custom-class="body_text">
                10XTraders.AI provides automated cryptocurrency trading strategy development and execution services. The Platform:
              </p>
              <ul class="list-disc pl-6 space-y-2" data-custom-class="body_text">
                <li>Allows users to create and customize trading strategies</li>
                <li>Provides tools for strategy testing and optimization</li>
                <li>Facilitates automated trade execution through API connections</li>
                <li>Offers educational resources and community features</li>
              </ul>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">4. User Responsibilities</h2>
              <p data-custom-class="body_text">
                As a user of the Platform, you are responsible for:
              </p>
              <ul class="list-disc pl-6 space-y-2" data-custom-class="body_text">
                <li>Maintaining the security of your account credentials</li>
                <li>Ensuring your API keys remain confidential</li>
                <li>Monitoring your trading activities and positions</li>
                <li>Complying with all applicable laws and regulations</li>
                <li>Understanding the risks associated with cryptocurrency trading</li>
              </ul>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">5. Intellectual Property</h2>
              <p data-custom-class="body_text">
                The Platform, including its original content, features, and functionality, is owned by 10XTraders.AI and is protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">6. Account Terms</h2>
              <p data-custom-class="body_text">
                You must:
              </p>
              <ul class="list-disc pl-6 space-y-2" data-custom-class="body_text">
                <li>Be at least 18 years old to use the Platform</li>
                <li>Provide accurate and complete registration information</li>
                <li>Maintain the security of your account</li>
                <li>Accept responsibility for all activities under your account</li>
                <li>Not share your account credentials with others</li>
              </ul>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">7. Service Modifications</h2>
              <p data-custom-class="body_text">
                We reserve the right to modify or discontinue the Platform at any time, with or without notice. We shall not be liable to you or any third party for any modification, suspension, or discontinuance of the Platform.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">8. Limitation of Liability</h2>
              <p data-custom-class="body_text">
                To the maximum extent permitted by law, 10XTraders.AI shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the Platform.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">9. Governing Law</h2>
              <p data-custom-class="body_text">
                These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">10. Contact Information</h2>
              <p data-custom-class="body_text">
                For any questions about these Terms, please contact us at:
              </p>
              <div class="mt-4">
                <p data-custom-class="body_text">10XTRADERS.AI, LLC</p>
                <p data-custom-class="body_text">3343 Peachtree Rd NE</p>
                <p data-custom-class="body_text">Ste 145-1585</p>
                <p data-custom-class="body_text">Atlanta, GA 30326</p>
                <p data-custom-class="body_text">United States</p>
                <p data-custom-class="body_text">Email: 10xtraders.ai@gmail.com</p>
              </div>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">11. Changes to Terms</h2>
              <p data-custom-class="body_text">
                We reserve the right to modify these terms at any time. We will notify you of any changes by posting the new Terms of Service on this page and updating the "Last updated" date at the top of this Terms of Service.
              </p>
              <p data-custom-class="body_text">
                You are advised to review these Terms of Service periodically for any changes. Changes to these Terms of Service are effective when they are posted on this page.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">12. Termination</h2>
              <p data-custom-class="body_text">
                We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever and without limitation, including but not limited to a breach of the Terms.
              </p>
              <p data-custom-class="body_text">
                If you wish to terminate your account, you may simply discontinue using the Service or contact us for account deletion.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">13. Disclaimer</h2>
              <p data-custom-class="body_text">
                The Service is provided "as is" and "as available" without any warranty or representation, express or implied. 10XTraders.AI makes no warranty or representation with respect to the completeness, security, reliability, quality, accuracy, or availability of the Service.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">14. Acknowledgment</h2>
              <p data-custom-class="body_text">
                By using the Service, you acknowledge that you have read these Terms of Service and agree to be bound by them.
              </p>
            </div>
          </div>
        `}} />
      </div>
    </PageLayout>
  );
}
