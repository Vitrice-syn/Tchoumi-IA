import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, sanitizeForFirestore } from '../firebase';
import { Language, PaymentMethod, UserPlan } from '../types';
import { TCHOUMI_PLANS, getPlanById } from '../lib/models';
import { cn } from '../lib/utils';

interface SubscriptionRequestModalProps {
  isOpen: boolean;
  initialPlan: UserPlan;
  language: Language;
  userEmail?: string | null;
  userDisplayName?: string | null;
  userUid?: string | null;
  onClose: () => void;
}

const PAID_PLANS = TCHOUMI_PLANS.filter((p) => p.id !== 'free') as Array<
  (typeof TCHOUMI_PLANS)[number] & { id: 'plus' | 'pro' | 'ultra' }
>;

export const SubscriptionRequestModal: React.FC<SubscriptionRequestModalProps> = ({
  isOpen,
  initialPlan,
  language,
  userEmail,
  userDisplayName,
  userUid,
  onClose,
}) => {
  const isFr = language === 'fr';

  const normalizedInitial: 'plus' | 'pro' | 'ultra' =
    initialPlan === 'plus' || initialPlan === 'pro' || initialPlan === 'ultra'
      ? initialPlan
      : 'pro';

  const [selectedPlan, setSelectedPlan] = useState<'plus' | 'pro' | 'ultra'>(normalizedInitial);
  const [fullName, setFullName] = useState(userDisplayName || '');
  const [email, setEmail] = useState(userEmail || '');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('orange_money');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedPlan(normalizedInitial);
      setFullName((prev) => prev || userDisplayName || '');
      setEmail((prev) => prev || userEmail || '');
      setFormError(null);
      setSubmittedRequestId(null);
    }
  }, [isOpen, normalizedInitial, userDisplayName, userEmail]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const activePlanDef = getPlanById(selectedPlan);
  const priceLabel = activePlanDef.priceLabel[language];

  const paymentOptions: { id: PaymentMethod; label: string }[] = isFr
    ? [
        { id: 'orange_money', label: 'Orange Money' },
        { id: 'mtn_momo', label: 'MTN MoMo' },
        { id: 'card', label: 'Carte / Virement' },
        { id: 'whatsapp', label: 'WhatsApp Direct' },
      ]
    : [
        { id: 'orange_money', label: 'Orange Money' },
        { id: 'mtn_momo', label: 'MTN MoMo' },
        { id: 'card', label: 'Card / Transfer' },
        { id: 'whatsapp', label: 'Direct WhatsApp' },
      ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    const trimmedNotes = notes.trim();

    if (trimmedName.length < 2) {
      setFormError(
        isFr ? 'Veuillez saisir votre nom complet.' : 'Please enter your full name.'
      );
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError(
        isFr
          ? "Veuillez saisir une adresse e-mail valide pour le compte à activer."
          : 'Please enter a valid email address for the account to activate.'
      );
      return;
    }
    if (trimmedPhone.length < 6) {
      setFormError(
        isFr
          ? 'Veuillez saisir un numéro WhatsApp / téléphone valide.'
          : 'Please enter a valid phone / WhatsApp number.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload = sanitizeForFirestore({
        id: requestId,
        fullName: trimmedName.slice(0, 120),
        email: trimmedEmail.slice(0, 160),
        phone: trimmedPhone.slice(0, 40),
        paymentMethod,
        plan: selectedPlan,
        priceLabel,
        ...(trimmedNotes ? { notes: trimmedNotes.slice(0, 500) } : {}),
        status: 'pending' as const,
        ...(userUid ? { uid: userUid } : {}),
        createdAt: Date.now(),
      });

      await setDoc(doc(db, 'subscription_requests', requestId), payload);
      setSubmittedRequestId(requestId);
    } catch (err: any) {
      console.error('Failed to submit subscription request:', err);
      const msg = String(err?.message || err || '');
      if (msg.toLowerCase().includes('permission')) {
        setFormError(
          isFr
            ? "La demande n'a pas pu être enregistrée dans Firestore (règles de sécurité en attente de publication). Vous pouvez tout de même envoyer votre demande via WhatsApp ci-dessous."
            : 'Could not save request to Firestore (rules pending publish). You can still send your request via WhatsApp below.'
        );
      } else {
        setFormError(
          isFr
            ? "Une erreur est survenue lors de l'envoi. Veuillez réessayer."
            : 'An error occurred while submitting. Please try again.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedPaymentLabel =
    paymentOptions.find((p) => p.id === paymentMethod)?.label || paymentMethod;

  const whatsappSummary = isFr
    ? `Bonjour M. Tchoumi Chilic Vitrice,\n\nJe viens de soumettre une demande d'abonnement sur Tchoumi IA :\n- Nom : ${fullName.trim() || 'Client'}\n- E-mail du compte à activer : ${email.trim() || 'Non précisé'}\n- Téléphone : ${phone.trim() || 'Non précisé'}\n- Formule : ${activePlanDef.name} (${priceLabel})\n- Paiement souhaité : ${selectedPaymentLabel}${notes.trim() ? `\n- Note / Réf : ${notes.trim()}` : ''}${submittedRequestId ? `\n- Référence : ${submittedRequestId}` : ''}\n\nMerci d'activer mon abonnement.`
    : `Hello Mr. Tchoumi Chilic Vitrice,\n\nI just submitted a Tchoumi AI subscription request:\n- Name: ${fullName.trim() || 'Client'}\n- Account email to activate: ${email.trim() || 'Not specified'}\n- Phone: ${phone.trim() || 'Not specified'}\n- Plan: ${activePlanDef.name} (${priceLabel})\n- Preferred payment: ${selectedPaymentLabel}${notes.trim() ? `\n- Note / Ref: ${notes.trim()}` : ''}${submittedRequestId ? `\n- Reference: ${submittedRequestId}` : ''}\n\nPlease activate my subscription.`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 bg-[#090a0e] text-neutral-100 overflow-y-auto rounded-none"
        >
          {/* Top Navigation Bar */}
          <header className="sticky top-0 z-20 bg-[#090a0e]/95 backdrop-blur-sm border-b border-white/10 rounded-none">
            <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-sm min-w-0">
                <span className="font-semibold text-white whitespace-nowrap shrink-0">
                  Tchoumi IA
                </span>
                <span className="text-neutral-600" aria-hidden="true">
                  /
                </span>
                <span className="text-neutral-400 truncate">
                  {isFr ? 'Souscription' : 'Subscription'}
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 px-4 py-2 border border-white/15 bg-transparent hover:bg-white/[0.06] text-xs font-medium text-neutral-200 transition-colors cursor-pointer rounded-none whitespace-nowrap shrink-0"
              >
                <ArrowLeft size={14} />
                <span>{isFr ? 'Retour' : 'Back'}</span>
              </button>
            </div>
          </header>

          {/* Main Full-Page Container */}
          <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
            {/* Page Heading */}
            <div className="border-b border-white/10 pb-6 mb-8">
              <p className="text-xs text-neutral-400 mb-2">
                {isFr
                  ? 'Facturation mensuelle · Activation manuelle par l’administrateur'
                  : 'Monthly billing · Activated directly by the administrator'}
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                {isFr ? 'Demande d’abonnement' : 'Subscription Request'} — {activePlanDef.name}
              </h1>
              <p className="text-sm text-neutral-400 mt-2 max-w-2xl leading-relaxed">
                {isFr
                  ? 'Renseignez vos informations et l’adresse e-mail Google exacte associée au compte sur lequel vous souhaitez activer votre formule.'
                  : 'Enter your contact details and the exact Google email address associated with the account you want to activate.'}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
              {/* Left Column: Form or Confirmation */}
              <div className="lg:col-span-7">
                {submittedRequestId ? (
                  <div className="space-y-6">
                    <div className="p-5 border border-emerald-500/40 bg-emerald-500/[0.08] flex items-start gap-3.5 rounded-none">
                      <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <h2 className="text-base font-semibold text-white">
                          {isFr
                            ? 'Demande enregistrée avec succès'
                            : 'Request submitted successfully'}
                        </h2>
                        <p className="text-sm text-neutral-300 leading-relaxed">
                          {isFr
                            ? `Votre demande pour le ${activePlanDef.name} a été transmise. Dès validation du paiement, l'accès sera activé sur le compte :`
                            : `Your request for ${activePlanDef.name} has been sent. Once verified, access will be activated on:`}
                        </p>
                        <p className="font-mono text-sm text-emerald-300 font-medium pt-0.5">
                          {email.trim().toLowerCase()}
                        </p>
                      </div>
                    </div>

                    {/* Structured Summary Table */}
                    <div className="border border-white/12 bg-[#0f1117] divide-y divide-white/10 rounded-none">
                      <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                        <span className="text-neutral-400">{isFr ? 'Formule' : 'Plan'}</span>
                        <span className="font-medium text-white tabular-nums">
                          {activePlanDef.name} · {priceLabel}
                        </span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                        <span className="text-neutral-400">{isFr ? 'Nom complet' : 'Full name'}</span>
                        <span className="font-medium text-white">{fullName.trim()}</span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                        <span className="text-neutral-400">{isFr ? 'Compte e-mail' : 'Account email'}</span>
                        <span className="font-mono text-neutral-200">{email.trim().toLowerCase()}</span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                        <span className="text-neutral-400">{isFr ? 'Téléphone' : 'Phone'}</span>
                        <span className="font-mono text-neutral-200">{phone.trim()}</span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                        <span className="text-neutral-400">{isFr ? 'Paiement' : 'Payment'}</span>
                        <span className="text-neutral-200">{selectedPaymentLabel}</span>
                      </div>
                      <div className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                        <span className="text-neutral-400">{isFr ? 'Référence' : 'Reference'}</span>
                        <span className="font-mono text-xs text-neutral-300">{submittedRequestId}</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-1">
                      <a
                        href={`https://wa.me/237677201028?text=${encodeURIComponent(whatsappSummary)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 bg-[#16a34a] hover:bg-[#15803d] text-white font-medium text-sm transition-colors rounded-none whitespace-nowrap"
                      >
                        <MessageSquare size={16} />
                        <span>
                          {isFr
                            ? 'Confirmer sur WhatsApp (optionnel)'
                            : 'Confirm on WhatsApp (optional)'}
                        </span>
                      </a>
                      <button
                        type="button"
                        onClick={onClose}
                        className="py-3 px-6 border border-white/15 bg-transparent hover:bg-white/[0.06] text-neutral-200 text-sm font-medium transition-colors cursor-pointer rounded-none whitespace-nowrap"
                      >
                        {isFr ? 'Retour à Tchoumi IA' : 'Back to Tchoumi AI'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Plan Selector */}
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-neutral-300">
                        {isFr ? 'Formule choisie' : 'Selected plan'}
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {PAID_PLANS.map((planItem) => {
                          const isSel = selectedPlan === planItem.id;
                          return (
                            <button
                              key={planItem.id}
                              type="button"
                              onClick={() => setSelectedPlan(planItem.id)}
                              className={cn(
                                'p-3.5 border text-left transition-colors cursor-pointer rounded-none',
                                isSel
                                  ? 'bg-white/[0.08] border-white text-white'
                                  : 'bg-[#0f1117] border-white/12 text-neutral-400 hover:border-white/30 hover:text-neutral-200'
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold">
                                  {planItem.name.replace('Plan ', '')}
                                </span>
                                {isSel && <Check size={14} className="text-white shrink-0" />}
                              </div>
                              <div className="text-xs text-neutral-300 mt-1 tabular-nums">
                                {planItem.priceLabel[language]}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Full Name */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="sub-full-name"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        {isFr ? 'Nom complet' : 'Full name'}{' '}
                        <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="sub-full-name"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={isFr ? 'Ex : Jean Dupont' : 'Ex: vitrice tchoumi'}
                        className="w-full px-3.5 py-2.5 bg-[#0f1117] border border-white/15 focus:border-white text-sm text-white placeholder-neutral-500 outline-none transition-colors rounded-none"
                      />
                    </div>

                    {/* Account Email */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="sub-email"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        {isFr
                          ? 'Adresse e-mail du compte à activer'
                          : 'Email address of the account to activate'}{' '}
                        <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="sub-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="exemple@gmail.com"
                        className="w-full px-3.5 py-2.5 bg-[#0f1117] border border-white/15 focus:border-white text-sm text-white font-mono placeholder-neutral-500 outline-none transition-colors rounded-none"
                      />
                      <p className="text-xs text-neutral-500">
                        {isFr
                          ? "Indiquez exactement l'adresse e-mail Google utilisée pour vous connecter à Tchoumi IA."
                          : 'Enter the exact Google email address used to sign in to Tchoumi AI.'}
                      </p>
                    </div>

                    {/* Phone / WhatsApp */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="sub-phone"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        {isFr ? 'Numéro WhatsApp / Téléphone' : 'WhatsApp / Phone number'}{' '}
                        <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="sub-phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+237 6XX XX XX XX"
                        className="w-full px-3.5 py-2.5 bg-[#0f1117] border border-white/15 focus:border-white text-sm text-white font-mono placeholder-neutral-500 outline-none transition-colors rounded-none"
                      />
                    </div>

                    {/* Payment Method */}
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-neutral-300">
                        {isFr ? 'Moyen de paiement souhaité' : 'Preferred payment method'}
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        {paymentOptions.map((opt) => {
                          const isSelected = paymentMethod === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setPaymentMethod(opt.id)}
                              className={cn(
                                'px-3.5 py-2.5 border text-xs font-medium transition-colors cursor-pointer text-left flex items-center justify-between rounded-none',
                                isSelected
                                  ? 'bg-white/[0.08] border-white text-white'
                                  : 'bg-[#0f1117] border-white/12 text-neutral-400 hover:text-neutral-200 hover:border-white/30'
                              )}
                            >
                              <span>{opt.label}</span>
                              {isSelected && <Check size={13} className="text-white shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Optional Notes */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor="sub-notes"
                        className="block text-xs font-medium text-neutral-300"
                      >
                        {isFr
                          ? 'Message ou référence de transaction (optionnel)'
                          : 'Message or payment reference (optional)'}
                      </label>
                      <textarea
                        id="sub-notes"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={
                          isFr
                            ? 'Ex : ID de transaction ou précision sur votre demande...'
                            : 'Ex: Transaction ID or details about your request...'
                        }
                        className="w-full px-3.5 py-2.5 bg-[#0f1117] border border-white/15 focus:border-white text-sm text-white placeholder-neutral-500 outline-none resize-none transition-colors rounded-none"
                      />
                    </div>

                    {formError && (
                      <div className="p-4 border border-red-500/40 bg-red-500/10 text-xs text-red-200 flex items-start gap-2.5 rounded-none">
                        <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
                        <div className="space-y-2.5 flex-1">
                          <p className="leading-relaxed">{formError}</p>
                          <a
                            href={`https://wa.me/237677201028?text=${encodeURIComponent(whatsappSummary)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white font-medium text-xs transition-colors rounded-none"
                          >
                            <MessageSquare size={13} />
                            <span>{isFr ? 'Envoyer via WhatsApp' : 'Send via WhatsApp'}</span>
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Form Actions */}
                    <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={onClose}
                        className="sm:w-1/3 py-3 px-5 border border-white/15 bg-transparent hover:bg-white/[0.06] text-neutral-300 text-sm font-medium transition-colors cursor-pointer rounded-none"
                      >
                        {isFr ? 'Annuler' : 'Cancel'}
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="sm:w-2/3 py-3 px-6 bg-white hover:bg-neutral-200 disabled:opacity-60 text-black font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer rounded-none"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>{isFr ? 'Envoi en cours...' : 'Submitting...'}</span>
                          </>
                        ) : (
                          <span>
                            {isFr
                              ? 'Envoyer la demande d’abonnement'
                              : 'Submit subscription request'}
                          </span>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Right Column: Clean Order & Plan Summary */}
              <aside className="lg:col-span-5 border border-white/12 bg-[#0f1117] p-6 space-y-6 rounded-none">
                <div>
                  <p className="text-xs text-neutral-400">
                    {isFr ? 'Récapitulatif de la formule' : 'Plan summary'}
                  </p>
                  <div className="flex items-baseline justify-between gap-4 mt-2">
                    <h2 className="text-lg font-semibold text-white">{activePlanDef.name}</h2>
                    <span className="text-lg font-semibold text-white tabular-nums">
                      {priceLabel}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1">
                    {activePlanDef.monthlyHint[language]}
                  </p>
                </div>

                <div className="border-t border-white/10 pt-5 space-y-2.5">
                  <p className="text-xs font-medium text-neutral-300">
                    {isFr ? 'Inclus dans cette formule' : 'Included in this plan'}
                  </p>
                  <ul className="space-y-2">
                    {activePlanDef.features[language].map((feat, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-xs text-neutral-300 leading-relaxed"
                      >
                        <Check size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-white/10 pt-5 space-y-1.5">
                  <p className="text-xs font-medium text-neutral-300">
                    {isFr ? 'Modèles accessibles' : 'Included AI models'}
                  </p>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    {activePlanDef.modelsIncluded.join(' · ')}
                  </p>
                </div>

                <div className="border-t border-white/10 pt-5 space-y-2">
                  <p className="text-xs font-medium text-neutral-300">
                    {isFr ? 'Procédure d’activation' : 'Activation process'}
                  </p>
                  <ol className="space-y-1.5 text-xs text-neutral-400 leading-relaxed">
                    <li>
                      <span className="font-mono text-neutral-300 mr-1.5">01.</span>
                      {isFr
                        ? 'Soumettez votre demande via ce formulaire.'
                        : 'Submit your request using this form.'}
                    </li>
                    <li>
                      <span className="font-mono text-neutral-300 mr-1.5">02.</span>
                      {isFr
                        ? 'Votre paiement est vérifié par l’équipe Tchoumi IA.'
                        : 'Your payment is verified by the Tchoumi AI team.'}
                    </li>
                    <li>
                      <span className="font-mono text-neutral-300 mr-1.5">03.</span>
                      {isFr
                        ? 'L’abonnement est activé directement sur votre compte Google.'
                        : 'Your subscription is activated directly on your Google account.'}
                    </li>
                  </ol>
                </div>
              </aside>
            </div>
          </main>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
