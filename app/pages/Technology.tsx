export default function Technology() {
  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1 pb-16 sm:pb-20">
      <main className="container mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 md:py-12">
        <div className="space-y-8 sm:space-y-12">
        <header className="space-y-4 sm:space-y-6">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-bolt-elements-textPrimary leading-tight">
            Technology
          </h1>
          <p className="text-base sm:text-lg md:text-xl leading-relaxed text-bolt-elements-textSecondary break-words md:mb-0">
            The first Trading System-as-a-Service (TSaaS) platform — built for professionals who need reliability, scale, and security in automated trading.
          </p>
        </header>

        {/* Spacer to prevent overlap - only on mobile/tablet */}
        <div className="h-16 sm:h-20 md:hidden"></div>

        <section className="space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4">
            <p className="text-sm sm:text-base md:text-lg text-bolt-elements-textSecondary leading-relaxed break-words">
              At its core, we extend the battle-tested Freqtrade engine, trusted by thousands of algorithmic traders worldwide. On top of this foundation, we've built a cloud-native orchestration layer that enables multi-user, multi-exchange execution at institutional reliability standards.
            </p>
          </div>

          <div className="space-y-6 sm:space-y-8">
            <div className="space-y-4 sm:space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
                Core Infrastructure
              </h2>
              
              <div className="grid md:grid-cols-1 gap-6 sm:gap-8">
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Cloud-Native Orchestration
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Every bot runs in its own isolated environment, ensuring fault tolerance, high availability, and horizontal scalability.
                  </p>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Instant Strategy Provisioning
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    New strategies can be deployed or updated seamlessly with zero downtime.
                  </p>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Enterprise Reliability
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Our distributed architecture supports rolling updates, automated recovery, and resource scaling out of the box.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
                Execution & Monitoring
              </h2>
              
              <div className="grid md:grid-cols-1 gap-6 sm:gap-8">
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Multi-Exchange Connectivity
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Unified execution across Binance, Coinbase, Kraken, Bitget, OKX, Bybit, and more.
                  </p>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Optimized Execution Layer
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Built-in order reconciliation, retry logic, and latency-aware execution ensure consistency across venues.
                  </p>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Real-Time Observability
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Live trade data, PnL, and risk metrics stream continuously to dashboards and trading charts.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
                Security & Compliance
              </h2>
              
              <div className="grid md:grid-cols-1 gap-6 sm:gap-8">
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Keyless Paper Trading
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Users can start without API keys. For live trading, keys are fully encrypted and never leave our secure environment.
                  </p>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Environment Isolation
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Each trading system is logically separated, preventing cross-user interference or data leakage.
                  </p>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Jurisdictional Alignment
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Exchange-specific routing (e.g., Binance.com vs Binance.US) ensures compliance with regional regulations.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 sm:space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-bolt-elements-textPrimary">
                AI Strategy Layer
              </h2>
              
              <div className="grid md:grid-cols-1 gap-6 sm:gap-8">
                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Natural Language to Strategy
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Describe a trading idea in plain English — our AI agent converts it into executable strategies.
                  </p>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h3 className="text-lg sm:text-xl font-semibold text-bolt-elements-textPrimary">
                    Adaptive Optimization
                  </h3>
                  <p className="text-sm sm:text-base text-bolt-elements-textSecondary leading-relaxed">
                    Bots improve performance continuously through parameter tuning, backtesting feedback loops, and automated retraining.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-bolt-elements-borderColor pt-6 sm:pt-8 mt-8 sm:mt-12">
              <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 sm:p-6">
                <p className="text-base sm:text-lg text-bolt-elements-textPrimary font-medium text-center leading-relaxed">
                  10XTraders.AI combines the transparency of open source with the reliability of enterprise infrastructure — delivering institutional-grade trading automation in a simple, secure service.
                </p>
              </div>
            </div>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}