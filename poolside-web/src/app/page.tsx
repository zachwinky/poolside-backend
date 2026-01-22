import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-lg border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-lg"></div>
              <span className="text-xl font-bold">Poolside Code</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/pricing" className="text-gray-400 hover:text-white transition">
                Pricing
              </Link>
              <Link href="/login" className="text-gray-400 hover:text-white transition">
                Log in
              </Link>
              <Link
                href="/register"
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl font-bold mb-6 bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
            Code Anywhere with AI
          </h1>
          <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            The mobile code editor powered by Claude AI. Edit your projects on the go,
            get intelligent suggestions, and sync seamlessly with OneDrive.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-8 py-3 rounded-lg font-medium text-lg transition shadow-lg shadow-cyan-500/25"
            >
              Start Free Trial
            </Link>
            <a
              href="#features"
              className="border border-gray-700 hover:border-gray-600 text-white px-8 py-3 rounded-lg font-medium text-lg transition"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Everything You Need to Code on Mobile</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg mb-4 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Claude AI Assistant</h3>
              <p className="text-gray-400">Get intelligent code suggestions, explanations, and refactoring help powered by Claude 3.5 Sonnet.</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-lg mb-4 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">OneDrive Sync</h3>
              <p className="text-gray-400">Access your projects from anywhere. Automatic sync with Microsoft OneDrive keeps your code in the cloud.</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg mb-4 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Syntax Highlighting</h3>
              <p className="text-gray-400">Full syntax highlighting for 100+ languages. Write code that looks beautiful on any screen size.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-gray-400 mb-8">Start free, upgrade when you need more.</p>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-2">Free</h3>
              <div className="text-3xl font-bold mb-4">$0<span className="text-lg text-gray-400">/mo</span></div>
              <ul className="text-sm text-gray-400 space-y-2 mb-6">
                <li>10 AI requests/day</li>
                <li>OneDrive sync</li>
                <li>Basic features</li>
              </ul>
              <Link href="/register" className="block w-full border border-gray-700 hover:border-gray-600 py-2 rounded-lg transition text-center">
                Get Started
              </Link>
            </div>
            <div className="bg-gradient-to-b from-cyan-500/10 to-blue-500/10 border border-cyan-500/50 rounded-xl p-6 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs px-3 py-1 rounded-full">
                Popular
              </div>
              <h3 className="text-lg font-semibold mb-2">Pro</h3>
              <div className="text-3xl font-bold mb-4">$6.99<span className="text-lg text-gray-400">/mo</span></div>
              <ul className="text-sm text-gray-400 space-y-2 mb-6">
                <li>500 AI requests/day</li>
                <li>Priority support</li>
                <li>All features</li>
              </ul>
              <Link href="/register" className="block w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 py-2 rounded-lg transition text-center">
                Subscribe
              </Link>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-2">Unlimited</h3>
              <div className="text-3xl font-bold mb-4">$14.99<span className="text-lg text-gray-400">/mo</span></div>
              <ul className="text-sm text-gray-400 space-y-2 mb-6">
                <li>Unlimited AI requests</li>
                <li>Priority support</li>
                <li>Early access features</li>
              </ul>
              <Link href="/register" className="block w-full border border-gray-700 hover:border-gray-600 py-2 rounded-lg transition text-center">
                Subscribe
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-cyan-500/10 to-blue-500/10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Code Anywhere?</h2>
          <p className="text-gray-400 mb-8">Join developers who code on the go with Poolside Code.</p>
          <Link
            href="/register"
            className="inline-block bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white px-8 py-3 rounded-lg font-medium text-lg transition shadow-lg shadow-cyan-500/25"
          >
            Create Free Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-800">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gradient-to-br from-cyan-400 to-blue-500 rounded"></div>
            <span className="font-semibold">Poolside Code</span>
          </div>
          <p className="text-gray-500 text-sm">&copy; 2026 Poolside Code. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
