import { PageLayout } from '~/components/layout/PageLayout';

export default function PrivacyPolicy() {
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
          ul {
            list-style-type: square;
          }
          ul > li > ul {
            list-style-type: circle;
          }
          ul > li > ul > li > ul {
            list-style-type: square;
          }
          ol li {
            font-family: Arial;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
          }
          table, th, td {
            border: 1px solid var(--bolt-elements-borderColor);
          }
          th, td {
            padding: 0.75rem;
            text-align: left;
          }
          th {
            background-color: var(--bolt-elements-background-depth-2);
          }
        `}} />
        
        <div data-custom-class="body" className="prose prose-sm max-w-none prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-a:text-accent-500 hover:prose-a:text-accent-600 prose-strong:text-gray-900 dark:prose-strong:text-white" dangerouslySetInnerHTML={{ __html: `
          <div>
            <strong>
              <span style="font-size: 26px;">
                <span data-custom-class="title">
                  <h1>PRIVACY POLICY</h1>
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
              <h2 data-custom-class="heading_1">1. WHAT INFORMATION DO WE COLLECT?</h2>
              <p data-custom-class="body_text">
                We collect personal information that you voluntarily provide to us when you register on the Services, express an interest in obtaining information about us or our products and Services, when you participate in activities on the Services, or otherwise when you contact us.
              </p>
              <p data-custom-class="body_text">
                <strong>Personal Information Provided by You:</strong> The personal information we collect depends on the context of your interactions with us and the Services, the choices you make, and the products and features you use. The personal information we collect may include:
              </p>
              <ul class="list-disc pl-6 space-y-2">
                <li>Names</li>
                <li>Email addresses</li>
                <li>Usernames</li>
                <li>Passwords</li>
                <li>Phone numbers</li>
                <li>Billing addresses</li>
                <li>Debit/credit card numbers</li>
                <li>API keys</li>
              </ul>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">2. HOW DO WE PROCESS YOUR INFORMATION?</h2>
              <p data-custom-class="body_text">
                We process your personal information for these purposes in reliance on our legitimate business interests, in order to enter into or perform a contract with you, with your consent, and/or for compliance with our legal obligations.
              </p>
              <p data-custom-class="body_text">
                We use the information we collect or receive:
              </p>
              <ul class="list-disc pl-6 space-y-2">
                <li>To facilitate account creation and authentication</li>
                <li>To deliver and facilitate delivery of services to the user</li>
                <li>To respond to user inquiries/offer support</li>
                <li>To send administrative information</li>
                <li>To fulfill and manage your orders</li>
                <li>To enable user-to-user communications</li>
                <li>To protect our Services</li>
                <li>To comply with legal obligations</li>
              </ul>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">3. WHEN AND WITH WHOM DO WE SHARE YOUR PERSONAL INFORMATION?</h2>
              <p data-custom-class="body_text">
                We may share your data with third-party vendors, service providers, contractors, or agents who perform services for us or on our behalf and require access to such information to do that work.
              </p>
              <p data-custom-class="body_text">
                We may also share your data:
              </p>
              <ul class="list-disc pl-6 space-y-2">
                <li>When required by law</li>
                <li>In connection with a business transfer</li>
                <li>With our business partners</li>
                <li>With your consent</li>
              </ul>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">4. DO WE USE COOKIES AND OTHER TRACKING TECHNOLOGIES?</h2>
              <p data-custom-class="body_text">
                We may use cookies and other tracking technologies to collect and store your information. This helps us provide and improve our Services, analyze trends, administer the website, track users' movements around the website, and gather demographic information about our user base as a whole.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">5. HOW DO WE HANDLE YOUR SOCIAL LOGINS?</h2>
              <p data-custom-class="body_text">
                If you choose to register or log in to our Services using a social media account, we may have access to certain information about you from your social media provider. The information we receive will depend on the social media provider concerned and your privacy settings with that provider.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">6. HOW LONG DO WE KEEP YOUR INFORMATION?</h2>
              <p data-custom-class="body_text">
                We will only keep your personal information for as long as it is necessary for the purposes set out in this privacy notice, unless a longer retention period is required or permitted by law. When we have no ongoing legitimate business need to process your personal information, we will either delete or anonymize it.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">7. HOW DO WE KEEP YOUR INFORMATION SAFE?</h2>
              <p data-custom-class="body_text">
                We have implemented appropriate and reasonable technical and organizational security measures designed to protect the security of any personal information we process. However, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">8. DO WE COLLECT INFORMATION FROM MINORS?</h2>
              <p data-custom-class="body_text">
                We do not knowingly collect data from or market to children under 18 years of age. If we learn that personal information from users less than 18 years of age has been collected, we will deactivate the account and take reasonable measures to promptly delete such data from our records.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">9. WHAT ARE YOUR PRIVACY RIGHTS?</h2>
              <p data-custom-class="body_text">
                Depending on your location, you may have certain rights regarding your personal information, such as:
              </p>
              <ul class="list-disc pl-6 space-y-2">
                <li>Right to access your personal information</li>
                <li>Right to rectify or update your personal information</li>
                <li>Right to erase or delete your personal information</li>
                <li>Right to restrict processing</li>
                <li>Right to data portability</li>
                <li>Right to object to processing</li>
                <li>Right to withdraw consent</li>
              </ul>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">10. CONTROLS FOR DO-NOT-TRACK FEATURES</h2>
              <p data-custom-class="body_text">
                Most web browsers and some mobile operating systems and mobile applications include a Do-Not-Track ("DNT") feature or setting you can activate to signal your privacy preference not to have data about your online browsing activities monitored and collected. At this stage, no uniform technology standard for recognizing and implementing DNT signals has been finalized.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">11. DO WE MAKE UPDATES TO THIS NOTICE?</h2>
              <p data-custom-class="body_text">
                We may update this privacy notice from time to time. The updated version will be indicated by an updated "Revised" date and the updated version will be effective as soon as it is accessible. If we make material changes to this privacy notice, we may notify you either by prominently posting a notice of such changes or by directly sending you a notification.
              </p>
            </div>

            <div class="space-y-4">
              <h2 data-custom-class="heading_1">12. HOW CAN YOU CONTACT US ABOUT THIS NOTICE?</h2>
              <p data-custom-class="body_text">
                If you have questions or comments about this notice, you may contact us at:
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
              <h2 data-custom-class="heading_1">13. HOW CAN YOU REVIEW, UPDATE, OR DELETE THE DATA WE COLLECT FROM YOU?</h2>
              <p data-custom-class="body_text">
                You have the right to request access to the personal information we collect from you, change that information, or delete it. To request to review, update, or delete your personal information, please visit our data subject access request portal.
              </p>
            </div>
          </div>
        `}} />
      </div>
    </PageLayout>
  );
}