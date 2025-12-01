export default function VideoTutorial() {
  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-8 text-center">
          Video Tutorial
        </h1>

        <div className="bg-bolt-elements-background-depth-2 rounded-lg shadow-xl p-6 mb-8">
          <div className="relative overflow-hidden rounded-lg shadow-lg mx-auto" style={{ maxWidth: '900px' }}>
            <iframe
              width="100%"
              height="506"
              src="https://www.youtube.com/embed/_IwjJ_XR8PY?si=J9fQYW5DvI7eX0_t"
              title="10xTraders AI Platform Tutorial"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="w-full border-0 outline-none"
              style={{
                aspectRatio: '16 / 9',
                minHeight: '400px'
              }}
            />
          </div>
        </div>

        <div className="bg-bolt-elements-background-depth-2 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">
            Getting Started with 10xTraders AI
          </h2>
          <p className="text-bolt-elements-textSecondary mb-4">
            Watch this comprehensive tutorial to learn how to use the 10xTraders AI platform to generate,
            configure, deploy, and monitor your cryptocurrency trading strategies.
          </p>

          <div className="space-y-4 mt-6">
            <h3 className="text-xl font-semibold">What You'll Learn:</h3>
            <ul className="list-disc list-inside space-y-2 text-bolt-elements-textSecondary">
              <li>How to generate trading strategies using AI</li>
              <li>Configuring your bot with exchange credentials and trading parameters</li>
              <li>Deploying your bot to the cloud infrastructure</li>
              <li>Monitoring real-time trading performance and analytics</li>
              <li>Using the live trading dashboard with charts and logs</li>
              <li>Managing multiple bots across different exchanges</li>
            </ul>
          </div>
        </div>

        <div className="text-center">
          <a
            href="/"
            className="inline-block px-6 py-3 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
          >
            Start Building Your Strategy
          </a>
        </div>
      </div>
    </div>
  );
}
