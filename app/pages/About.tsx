// app/pages/About.tsx
export default function About() {
  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1 pb-16 sm:pb-20">
      <main className="container mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 md:py-12">
        <div className="space-y-8 sm:space-y-12">
        <header className="space-y-4 sm:space-y-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-bolt-elements-textPrimary leading-tight">
            About 10XTraders.AI
          </h1>
          <p className="text-base sm:text-lg md:text-xl leading-relaxed text-bolt-elements-textSecondary md:mb-0">
            Empowering traders with AI-driven automation and strategy development
          </p>
        </header>

        {/* Spacer to prevent overlap - only on mobile/tablet */}
        <div className="h-16 sm:h-20 md:hidden"></div>

        <section className="space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
              Our Mission
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-bolt-elements-textSecondary leading-relaxed">
              At 10XTraders.AI, we're revolutionizing cryptocurrency trading by combining 
              cutting-edge artificial intelligence with robust automation tools. Our platform 
              empowers traders to create, test, and deploy sophisticated trading strategies 
              with unprecedented ease and control.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
                Innovation at Core
              </h2>
              <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                Our platform leverages advanced AI technology to help traders develop and 
                optimize their trading strategies. By combining real-time market analysis 
                with automated execution, we provide a comprehensive solution for modern 
                cryptocurrency trading.
              </p>
            </div>

            <div className="space-y-3 sm:space-y-4">
              <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
                Built for Traders
              </h2>
              <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                Whether you're an experienced trader or just starting out, our platform 
                offers the flexibility and tools you need. Maintain full control over your 
                strategies while automating the execution process for optimal efficiency.
              </p>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6">
            <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
              Key Features
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {features.map((feature, index) => (
                <div 
                  key={index}
                  className="p-4 sm:p-6 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
                >
                  <div className="text-xl sm:text-2xl text-bolt-elements-messages-linkColor mb-2 sm:mb-3">
                    {feature.icon}
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-bolt-elements-textPrimary mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
              Our Commitment
            </h2>
            <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
              We're committed to providing a secure, reliable, and innovative platform that 
              helps traders achieve their goals. Our team of experienced developers and 
              traders works continuously to enhance the platform's capabilities and respond 
              to our users' needs.
            </p>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
              Join Our Community
            </h2>
            <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
              Become part of a growing community of traders who are leveraging AI to transform 
              their trading strategies. Share insights, learn from others, and stay updated 
              with the latest developments in cryptocurrency trading.
            </p>
            <div className="flex gap-4 pt-3 sm:pt-4">
              <a 
                href="https://discord.com/invite/UMsrG9tgYY" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base rounded-lg bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover transition-colors"
              >
                <div className="i-ph:discord-logo text-base sm:text-lg" />
                Join our Discord
              </a>
            </div>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}

const features = [
  {
    icon: <div className="i-ph:robot" />,
    title: "AI-Powered Strategy Development",
    description: "Create sophisticated trading strategies using our advanced AI assistant."
  },
  {
    icon: <div className="i-ph:chart-line-up" />,
    title: "Real-time Analytics",
    description: "Monitor your strategies with comprehensive real-time market analysis."
  },
  {
    icon: <div className="i-ph:gear" />,
    title: "Automated Execution",
    description: "Deploy your strategies with reliable automated trading execution."
  },
  {
    icon: <div className="i-ph:shield-check" />,
    title: "Security First",
    description: "Your assets and data are protected with enterprise-grade security."
  },
  {
    icon: <div className="i-ph:users-three" />,
    title: "Community Driven",
    description: "Learn and grow with our active community of traders."
  },
  {
    icon: <div className="i-ph:code" />,
    title: "Full Customization",
    description: "Maintain complete control over your trading strategies and parameters."
  }
];
