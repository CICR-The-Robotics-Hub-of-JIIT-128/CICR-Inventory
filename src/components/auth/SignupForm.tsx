import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { User, Mail, Lock, Phone, Hash, ShieldCheck, Eye, EyeOff, LogIn, Camera, AlertCircle, Info, X } from 'lucide-react';
import { AnimatedFileUpload } from '../ui/animated-file-upload';

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

const CicrLogo: React.FC<{ size?: number; className?: string }> = ({ size = 44, className = '' }) => (
  <div
    style={{ width: size, height: size }}
    className={`rounded-2xl overflow-hidden bg-white border-2 border-slate-200 dark:border-slate-800 shadow-md flex items-center justify-center shrink-0 ${className}`}
  >
    <img
      src="/cicr-logo.jpg"
      alt="CICR Robotics Cell"
      className="w-full h-full object-cover"
      onError={(e) => {
        (e.target as HTMLElement).style.display = 'none';
      }}
    />
  </div>
);

export const SignupForm: React.FC<SignupFormProps> = ({ onSwitchToLogin }) => {
  const { signUp, loading } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState('');
  const [collegeEmail, setCollegeEmail] = useState('');
  const [enrollmentNo, setEnrollmentNo] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [showDropZone, setShowDropZone] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showReviewPopup, setShowReviewPopup] = useState(false);
  const [submittedData, setSubmittedData] = useState<{
    fullName: string;
    email: string;
    enrollmentNo?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avatarInitial = fullName.trim() ? fullName.trim().charAt(0).toUpperCase() : 'U';

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Profile photo must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatarUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Prevent multiple simultaneous submissions
    setErrorMsg('');

    if (!fullName.trim() || !collegeEmail.trim() || !password.trim() || !confirmPassword.trim()) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      const emailTrimmed = collegeEmail.trim().toLowerCase();
      const res = await signUp({
        full_name: fullName.trim(),
        email: emailTrimmed,
        password: password,
        enrollment_no: enrollmentNo.trim() || undefined,
        phone: contactNumber.trim() || undefined,
        avatar_url: avatarUrl || undefined,
      });

      if (res.success) {
        setSubmittedData({
          fullName: fullName.trim(),
          email: emailTrimmed,
          enrollmentNo: enrollmentNo.trim() || undefined,
        });
        setShowReviewPopup(true);
        showToast(
          'success',
          'Request Sent to Admin Portal',
          'Your registration request has been sent to the Admin Portal for administrator approval.'
        );
      } else {
        setErrorMsg(res.error || 'Registration failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[650px] bg-white dark:bg-[#0c0918] border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-slate-900/10 relative overflow-hidden text-slate-900 dark:text-slate-100">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mb-4">
        <CicrLogo size={44} className="mb-2" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">CICR Inventory</h1>
        <p className="text-[10px] tracking-[0.2em] font-bold text-slate-500 dark:text-zinc-400 uppercase mt-0.5">
          CREATIVE & INNOVATIVE CELL IN ROBOTICS
        </p>
      </div>

      {/* Segmented Tab Switcher */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-[#120d22] border border-slate-200 dark:border-slate-800 mb-4">
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="flex items-center justify-center gap-2 py-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white font-medium text-xs transition-colors cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span>Sign In</span>
        </button>
        <button
          type="button"
          className="flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 dark:bg-purple-600 text-white font-bold text-xs shadow-sm transition-all cursor-default"
        >
          <span className="text-base font-light leading-none">+</span>
          <span>Register</span>
        </button>
      </div>

      {errorMsg && (
        <div className="mb-3.5 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border-2 border-red-500 text-red-900 dark:text-red-200 text-xs font-semibold flex items-start gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Register Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
        {/* Profile Picture Upload & Preview Strip */}
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#080512] border-2 border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative group shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-600 dark:bg-purple-600 text-white font-black text-sm flex items-center justify-center shadow-md overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" />
                ) : (
                  avatarInitial
                )}
              </div>
            </div>

            <div className="min-w-0">
              <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight block">Profile Photo</span>
              <span className="text-[10px] text-slate-500 dark:text-zinc-400 leading-tight block truncate">Optional avatar preview</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowDropZone(!showDropZone)}
              className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-purple-950/40 hover:bg-blue-100 text-blue-700 dark:text-purple-300 border border-blue-200 dark:border-purple-800 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{showDropZone ? 'Close' : avatarUrl ? 'Change' : 'Upload'}</span>
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl('')}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                title="Remove photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Animated File Upload Drop Zone */}
        {showDropZone && (
          <div className="p-1 animate-in fade-in duration-200">
            <AnimatedFileUpload
              variant="compact"
              multiple={false}
              accept="image/*"
              maxSize={2 * 1024 * 1024}
              maxFiles={1}
              dropTitle="Drop Profile Avatar"
              dropSubtitle="PNG, JPG (up to 2MB)"
              onFilesSelected={(files: File[]) => {
                if (files[0]) {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    if (e.target?.result) {
                      setAvatarUrl(e.target.result as string);
                      setShowDropZone(false);
                    }
                  };
                  reader.readAsDataURL(files[0]);
                }
              }}
            />
          </div>
        )}

        {/* 6 Form Input Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Full Name */}
          <div>
            <label className="block text-slate-900 dark:text-zinc-200 font-bold text-xs mb-1.5">
              Full Name <span className="text-red-600 font-bold">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter Your Name"
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 font-medium text-xs outline-none transition-all"
              />
            </div>
          </div>

          {/* Email ID */}
          <div>
            <label className="block text-slate-900 dark:text-zinc-200 font-bold text-xs mb-1.5">
              Email ID <span className="text-red-600 font-bold">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                required
                value={collegeEmail}
                onChange={(e) => setCollegeEmail(e.target.value)}
                placeholder="Enter your College Email"
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 font-medium text-xs outline-none transition-all"
              />
            </div>
          </div>

          {/* Enrollment Number */}
          <div>
            <label className="block text-slate-900 dark:text-zinc-200 font-bold text-xs mb-1.5">Enrollment Number</label>
            <div className="relative">
              <Hash className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={enrollmentNo}
                onChange={(e) => setEnrollmentNo(e.target.value)}
                placeholder="Enter your Enrollment Number"
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 font-medium text-xs outline-none transition-all"
              />
            </div>
          </div>

          {/* Contact Number */}
          <div>
            <label className="block text-slate-900 dark:text-zinc-200 font-bold text-xs mb-1.5">Contact Number</label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="Enter your Contact Number"
                className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 font-medium text-xs outline-none transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-slate-900 dark:text-zinc-200 font-bold text-xs mb-1.5">
              Password <span className="text-red-600 font-bold">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your Password"
                className="w-full pl-9 pr-9 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 font-medium text-xs outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-3 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-slate-900 dark:text-zinc-200 font-bold text-xs mb-1.5">
              Confirm Password <span className="text-red-600 font-bold">*</span>
            </label>
            <div className="relative">
              <ShieldCheck className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your Password"
                className="w-full pl-9 pr-9 py-2.5 bg-white dark:bg-[#14141c] border-2 border-slate-300 dark:border-zinc-700 focus:border-blue-600 dark:border-purple-600 dark:focus:border-purple-500 focus:ring-2 focus:ring-blue-100 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 font-medium text-xs outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-2.5 top-3 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-300 cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting || loading}
          className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white shadow-md shadow-blue-600/25 dark:shadow-purple-950/40 flex items-center justify-center gap-2 mt-1 cursor-pointer disabled:opacity-50 transition-all"
        >
          <span className="text-sm font-light leading-none">+</span>
          <span>{isSubmitting || loading ? 'Submitting Request...' : 'Submit Registration Request'}</span>
        </button>
      </form>

      {/* Footer Switcher */}
      <div className="text-center mt-3.5">
        <p className="text-xs text-slate-600 dark:text-zinc-400">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-blue-600 dark:text-purple-400 hover:underline font-bold underline-offset-2 transition-colors ml-1 cursor-pointer"
          >
            Sign In
          </button>
        </p>
      </div>

      {/* Registration Review Popup Modal */}
      <AnimatePresence>
        {showReviewPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowReviewPopup(false);
                onSwitchToLogin();
              }}
              className="fixed inset-0 bg-slate-900/50 dark:bg-black/80 backdrop-blur-md"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#0c0918] border-2 border-slate-200 dark:border-zinc-800 p-6 sm:p-8 shadow-2xl text-slate-900 dark:text-slate-100 z-10 space-y-5"
            >
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-purple-950/60 border-2 border-blue-200 dark:border-purple-500/40 text-blue-600 dark:text-purple-400 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[10px] font-extrabold uppercase tracking-wider">
                  Pending Admin Review
                </span>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Registration Sent to Admin Portal
                </h3>
                <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1.5 leading-relaxed">
                  Your account request has been successfully submitted and forwarded to the Admin Portal for review and clearance.
                </p>
              </div>

              {submittedData && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#14141c] border border-slate-200 dark:border-zinc-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-zinc-400 font-medium">Applicant</span>
                    <strong className="text-slate-900 dark:text-white font-bold">{submittedData.fullName}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-zinc-400 font-medium">Email</span>
                    <strong className="text-slate-900 dark:text-white font-mono text-[11px] break-all">{submittedData.email}</strong>
                  </div>
                  {submittedData.enrollmentNo && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-zinc-400 font-medium">Enrollment No</span>
                      <strong className="text-slate-900 dark:text-white font-mono">{submittedData.enrollmentNo}</strong>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-zinc-800/80">
                    <span className="text-slate-500 dark:text-zinc-400 font-medium">Review Status</span>
                    <span className="font-extrabold text-amber-600 dark:text-amber-400 text-[10px] uppercase">Awaiting Admin Approval</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowReviewPopup(false);
                  onSwitchToLogin();
                }}
                className="w-full py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 text-white font-bold text-xs shadow-lg shadow-blue-600/25 dark:shadow-purple-950/50 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Acknowledge &amp; Return to Sign In</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
