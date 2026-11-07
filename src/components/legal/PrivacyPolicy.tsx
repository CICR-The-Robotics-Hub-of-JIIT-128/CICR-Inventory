import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  ArrowLeft,
  FileText,
  Mail,
  Building2,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

interface PrivacyPolicyProps {
  onBack?: () => void;
  defaultTab?: 'privacy' | 'terms';
  mode?: 'privacy' | 'terms';
  isSubdomain?: boolean;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({
  onBack,
  defaultTab = 'privacy',
  mode,
  isSubdomain = false,
}) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(mode || defaultTab);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.location.href = '/';
    }
  };

  const handleTabChange = (tab: 'privacy' | 'terms') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined' && !isSubdomain) {
      window.history.pushState(null, '', tab === 'privacy' ? '/privacy' : '/terms');
    }
  };

  const handleSwitchToOther = () => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host.startsWith('privacy.')) {
        // Switch subdomain to tos. (or terms.)
        window.location.href =
          window.location.protocol +
          '//' +
          host.replace(/^privacy\./, 'tos.') +
          (window.location.port ? ':' + window.location.port : '') +
          '/terms';
      } else if (
        host.startsWith('tos.') ||
        host.startsWith('terms.') ||
        host.startsWith('toc.')
      ) {
        // Switch subdomain to privacy.
        window.location.href =
          window.location.protocol +
          '//' +
          host.replace(/^(tos|terms|toc)\./, 'privacy.') +
          (window.location.port ? ':' + window.location.port : '') +
          '/privacy';
      } else {
        handleTabChange(activeTab === 'privacy' ? 'terms' : 'privacy');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070510] text-slate-900 dark:text-slate-100 py-10 px-4 sm:px-6 lg:px-8 selection:bg-purple-600 selection:text-white">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#120d22] border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:text-purple-600 dark:hover:text-purple-400 text-xs font-bold shadow-sm transition-all cursor-pointer hover:shadow active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to CICR Vault</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-zinc-500">
              Effective Date: November 2026
            </span>
          </div>
        </div>

        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-white dark:bg-[#120d22] border-2 border-slate-200 dark:border-purple-900/60 shadow-xl shadow-purple-900/10 mb-2">
            <img src="/cicr-logo.jpg" alt="CICR Logo" className="w-12 h-12 rounded-xl object-cover" />
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {isSubdomain
              ? activeTab === 'privacy'
                ? 'CICR Inventory Privacy Policy'
                : 'CICR Inventory Terms of Service'
              : 'CICR Inventory Privacy & Legal Center'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 font-medium max-w-xl mx-auto">
            Creative &amp; Innovative Cell in Robotics (CICR) &bull; Jaypee Institute of Information Technology, Noida
          </p>

          {/* If on a dedicated subdomain, show quick link to the other document; otherwise show the tab switcher */}
          {isSubdomain ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSwitchToOther}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 px-3.5 py-1.5 rounded-full shadow-sm"
              >
                <span>
                  {activeTab === 'privacy'
                    ? 'Looking for Terms of Service? View Terms'
                    : 'Looking for Privacy Policy? View Privacy'}
                </span>
                <span aria-hidden="true">&rarr;</span>
              </button>
            </div>
          ) : (
            <div className="inline-flex p-1 bg-slate-200/80 dark:bg-zinc-900 rounded-2xl border border-slate-300 dark:border-zinc-800 mt-4">
              <button
                type="button"
                onClick={() => handleTabChange('privacy')}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'privacy'
                    ? 'bg-white dark:bg-purple-600 text-slate-900 dark:text-white shadow-md'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Privacy Policy</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('terms')}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'terms'
                    ? 'bg-white dark:bg-purple-600 text-slate-900 dark:text-white shadow-md'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Terms of Service</span>
              </button>
            </div>
          )}
        </div>

        {/* Content Container */}
        {activeTab === 'privacy' ? (
          <div className="bg-white dark:bg-[#0c0918] border-2 border-slate-200 dark:border-zinc-800/80 rounded-3xl p-6 sm:p-10 shadow-xl space-y-8 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
            {/* Section 1 */}
            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5 border-b pb-2 border-slate-200 dark:border-zinc-800">
                <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  1
                </span>
                <span>Overview &amp; Scope</span>
              </h2>
              <p>
                This Privacy Policy describes how the <strong>Creative &amp; Innovative Cell in Robotics (CICR)</strong> at <strong>Jaypee Institute of Information Technology (JIIT)</strong>, Noida, collects, stores, protects, and handles user information through the <strong>CICR Inventory Management System</strong> accessible at{' '}
                <a
                  href="https://cicr-inventory.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 dark:text-purple-400 font-mono hover:underline inline-flex items-center gap-1"
                >
                  https://cicr-inventory.vercel.app <ExternalLink className="w-3 h-3" />
                </a>.
              </p>
              <p>
                The CICR Inventory platform is only for CICR Team members who are currently enrolled in any program in Jaypee institute of information technology, Noida. It manages robotics hardware loans, electronic components, microcontrollers, issue passes, and return clearance records.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5 border-b pb-2 border-slate-200 dark:border-zinc-800">
                <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  2
                </span>
                <span>Information We Collect</span>
              </h2>
              <p>
                To provide secure hardware custody and authentic academic accountability, the system processes minimal necessary data:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Google Workspace Identity Information:</strong> When signing in with your institutional Google account, we collect your verified full name, official college email address (restricted to <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-purple-600 dark:text-purple-400 font-mono text-xs">@mail.jiit.ac.in</code>), and Google account profile avatar.
                </li>
                <li>
                  <strong>Academic Enrollment / Roll Number:</strong> Auto-extracted directly from your official college email prefix (e.g. <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-purple-600 dark:text-purple-400 font-mono text-xs">992501030399@mail.jiit.ac.in</code> &rarr; Roll Number <code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-purple-600 dark:text-purple-400 font-mono text-xs">992501030399</code>).
                </li>
                <li>
                  <strong>Laboratory Requisition &amp; Audit Telemetry:</strong> Records of component borrow requests, quantities, project names, issue passes, physical return clearance statuses, timestamps, and administrative approval actions.
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5 border-b pb-2 border-slate-200 dark:border-zinc-800">
                <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  3
                </span>
                <span>Purpose of Data Processing</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#120d22] border border-slate-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Laboratory Custody</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Ensuring transparency and institutional accountability for physical robotics hardware issued to students.
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#120d22] border border-slate-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Single Sign-On (SSO)</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Authenticating student membership without requiring vulnerable manual passwords or secondary credentials.
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#120d22] border border-slate-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Issue Pass Generation</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Generating verifiable, cryptographically signed digital lab issue passes for physical hardware pickup.
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#120d22] border border-slate-200 dark:border-zinc-800 space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Audit &amp; Stock Telemetry</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Real-time tracking of laboratory stock levels, item availability, and component health records.
                  </p>
                </div>
              </div>
            </section>

            {/* Section 4 - Google API Policy Compliance */}
            <section className="space-y-3 p-4 sm:p-5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40">
              <h2 className="text-base sm:text-lg font-bold text-purple-900 dark:text-purple-200 flex items-center gap-2">
                <Lock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span>Google API Services User Data Policy Compliance</span>
              </h2>
              <p className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                CICR Inventory uses Google OAuth 2.0 strictly for federated identity verification. We only request basic OAuth scopes: <code className="bg-white/80 dark:bg-black/40 px-1 py-0.5 rounded font-mono text-xs">openid</code>, <code className="bg-white/80 dark:bg-black/40 px-1 py-0.5 rounded font-mono text-xs">email</code>, and <code className="bg-white/80 dark:bg-black/40 px-1 py-0.5 rounded font-mono text-xs">profile</code>.
              </p>
              <p className="text-slate-700 dark:text-zinc-300 leading-relaxed">
                CICR Inventory&apos;s use and transfer to any other app of information received from Google APIs adheres to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline text-purple-700 dark:text-purple-300 inline-flex items-center gap-1"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
              <div className="pt-2 text-xs font-semibold text-purple-800 dark:text-purple-300">
                &bull; We never use Google user data for advertising, machine learning model training, or commercial profiling.
              </div>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5 border-b pb-2 border-slate-200 dark:border-zinc-800">
                <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  4
                </span>
                <span>Zero Commercialization &amp; Data Sharing Guarantee</span>
              </h2>
              <p>
                <strong>We do not sell, rent, monetize, or disclose student or operator data to any third party.</strong> Data is stored within secure, access-controlled cloud infrastructure (Supabase PostgreSQL with Row Level Security &amp; Vercel serverless functions in compliant data centers). Information is accessible strictly to authorized CICR student coordinators and faculty advisors.
              </p>
            </section>

            {/* Section 6 */}
            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5 border-b pb-2 border-slate-200 dark:border-zinc-800">
                <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  5
                </span>
                <span>Data Retention &amp; User Rights</span>
              </h2>
              <p>
                Student accounts and hardware activity logs are retained for the duration of academic projects and student enrollment at JIIT. Users have the right to:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Access all hardware loan logs associated with their enrollment profile.</li>
                <li>Request rectification of any discrepancies in their laboratory clearance status.</li>
                <li>Request account de-provisioning and removal of inactive profile data upon graduation or lab project completion by contacting the administrator.</li>
              </ul>
            </section>

            {/* Section 7 - Contact */}
            <section className="space-y-3 border-t pt-6 border-slate-200 dark:border-zinc-800">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span>Institutional Contact &amp; Grievance Redressal</span>
              </h2>
              <p>
                For questions regarding data privacy, security verifications, or account clearance:
              </p>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#120d22] border border-slate-200 dark:border-zinc-800 space-y-2 font-mono text-xs">
                <div className="flex items-center gap-2 text-slate-800 dark:text-zinc-200 font-bold">
                  <Mail className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Email: cicrinventoryofficial@gmail.com</span>
                </div>
                <p className="text-slate-600 dark:text-zinc-400">
                  Organization: Creative &amp; Innovative Cell in Robotics (CICR)
                </p>
                <p className="text-slate-600 dark:text-zinc-400">
                  Institution: Jaypee Institute of Information Technology, A-10, Sector 62, Noida, Uttar Pradesh 201309
                </p>
              </div>
            </section>
          </div>
        ) : (
          /* Terms of Service */
          <div className="bg-white dark:bg-[#0c0918] border-2 border-slate-200 dark:border-zinc-800/80 rounded-3xl p-6 sm:p-10 shadow-xl space-y-8 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5 border-b pb-2 border-slate-200 dark:border-zinc-800">
                <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  1
                </span>
                <span>Acceptance of Institutional Terms</span>
              </h2>
              <p>
                By authenticating through the <strong>CICR Inventory Portal</strong>, users agree to adhere strictly to the laboratory safety regulations, hardware accountability policies, and code of academic integrity of the <strong>Jaypee Institute of Information Technology (JIIT)</strong>.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5 border-b pb-2 border-slate-200 dark:border-zinc-800">
                <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  2
                </span>
                <span>Hardware Custody &amp; Return Clearance</span>
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Authorized Purpose:</strong> Issued electronic components, sensors, microcontrollers, and laboratory equipment must be utilized strictly for bonafide academic projects, robotics research, hackathons, and institutional technical coursework.
                </li>
                <li>
                  <strong>Accountability:</strong> Borrowers are personally responsible for the physical safety, operational integrity, and timely return of all items logged under their enrollment number.
                </li>
                <li>
                  <strong>Return Process:</strong> Hardware returns must be verified and cleared through the digital issue pass system by an authorized CICR lab administrator.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2.5 border-b pb-2 border-slate-200 dark:border-zinc-800">
                <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  3
                </span>
                <span>Authorized Institutional Access Only</span>
              </h2>
              <p>
                Access to the CICR Vault is granted exclusively to CICR Team members who are currently enrolled in any program at Jaypee Institute of Information Technology (JIIT) possessing valid institutional email credentials (<code className="bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-purple-600 dark:text-purple-400 font-mono text-xs">@mail.jiit.ac.in</code>). Attempted unauthorized access, account spoofing, or tampering with hardware tracking telemetry is strictly prohibited.
              </p>
            </section>

            <section className="space-y-3 border-t pt-6 border-slate-200 dark:border-zinc-800">
              <p className="text-xs text-slate-500 dark:text-zinc-500">
                For questions regarding terms of equipment loans or lab clearances, contact the CICR robotics coordinator at <span className="font-mono text-purple-600 dark:text-purple-400">cicrinventoryofficial@gmail.com</span>.
              </p>
            </section>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-500 dark:text-zinc-500 pt-4 pb-12">
          &copy; {new Date().getFullYear()} Creative &amp; Innovative Cell in Robotics (CICR), JIIT Noida. All rights reserved.
        </div>
      </div>
    </div>
  );
};

