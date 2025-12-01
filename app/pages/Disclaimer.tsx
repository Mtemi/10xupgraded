import { PageLayout } from '~/components/layout/PageLayout';

export default function Disclaimer() {
  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-bolt-elements-textPrimary">
            Disclaimer
          </h1>
          <p className="mt-4 text-bolt-elements-textSecondary">
            Last updated February 18, 2025
          </p>
        </header>

        <section className="space-y-6">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary">
              WEBSITE DISCLAIMER
            </h2>
            <p className="text-bolt-elements-textSecondary leading-relaxed">
              The information provided by 10XTRADERS.AI, LTD. ("we," "us," or "our") on{' '}
              <a 
                href="http://10xtraders.ai" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-bolt-elements-messages-linkColor hover:underline"
              >
                http://www.10xtraders.ai
              </a>{' '}
              (the "Site") and our mobile application is for general informational purposes only. 
              All information on the Site and our mobile application is provided in good faith, 
              however we make no representation or warranty of any kind, express or implied, regarding 
              the accuracy, adequacy, validity, reliability, availability, or completeness of any 
              information on the Site or our mobile application.
            </p>
            <p className="text-bolt-elements-textSecondary leading-relaxed">
              UNDER NO CIRCUMSTANCE SHALL WE HAVE ANY LIABILITY TO YOU FOR ANY LOSS OR DAMAGE OF ANY 
              KIND INCURRED AS A RESULT OF THE USE OF THE SITE OR OUR MOBILE APPLICATION OR RELIANCE ON 
              ANY INFORMATION PROVIDED ON THE SITE AND OUR MOBILE APPLICATION. YOUR USE OF THE SITE AND 
              OUR MOBILE APPLICATION AND YOUR RELIANCE ON ANY INFORMATION ON THE SITE AND OUR MOBILE APPLICATION 
              IS SOLELY AT YOUR OWN RISK.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-bolt-elements-textPrimary">
              PROFESSIONAL DISCLAIMER
            </h2>
            <p className="text-bolt-elements-textSecondary leading-relaxed">
              WE ARE NOT BROKERS OR REGISTERED INVESTMENT ADVISORS. WE PROVIDE SOFTWARE ONLY. 
              WE DO NOT CUSTODY ANY CUSTOMER FUNDS WHATSOEVER. ANY ORDER EXECUTION OR OTHER LIVE TRADING 
              ACTIVITY OCCURS ON A THIRD-PARTY BROKER PLATFORM DESIGNATED BY THE USER. AS SUCH, ANY CONFLICT, 
              ISSUE, OR INQUIRY ARISING FROM SUCH ACTIVITY MUST BE ADDRESSED DIRECTLY WITH SUCH THIRD-PARTY 
              BROKER PLATFORM. THE USE OR RELIANCE OF ANY INFORMATION CONTAINED ON THE SITE OR OUR MOBILE 
              APPLICATION IS SOLELY AT YOUR OWN RISK.
            </p>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
