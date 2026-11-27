import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  Search,
  MessageSquare,
} from 'lucide-react';
import { Language, SubscriptionRequest } from '../types';
import { getPlanById } from '../lib/models';
import { cn } from '../lib/utils';

export interface ProUserRecord {
  id: string;
  email: string;
  status: string;
  plan?: 'plus' | 'pro' | 'ultra';
  activatedAt?: number;
  fullName?: string;
  phone?: string;
}

export interface RegisteredUserRecord {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  lastLoginMs?: number;
}

interface FounderAdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  subscriptionRequests: SubscriptionRequest[];
  proUsersList: ProUserRecord[];
  registeredUsersList: RegisteredUserRecord[];
  isSaving: boolean;
  actionMessage: string | null;
  onActivatePlan: (
    email: string,
    plan: 'plus' | 'pro' | 'ultra',
    requestId?: string,
    meta?: { fullName?: string; phone?: string }
  ) => Promise<void>;
  onDeactivatePro: (email: string) => Promise<void>;
  onRejectRequest: (requestId: string) => Promise<void>;
  onDeleteRequest: (requestId: string) => Promise<void>;
}

type AdminTab = 'requests' | 'subscribers' | 'users' | 'manual';

export const FounderAdminDashboard: React.FC<FounderAdminDashboardProps> = ({
  isOpen,
  onClose,
  language,
  subscriptionRequests,
  proUsersList,
  registeredUsersList,
  isSaving,
  actionMessage,
  onActivatePlan,
  onDeactivatePro,
  onRejectRequest,
  onDeleteRequest,
}) => {
  const isFr = language === 'fr';
  const [activeTab, setActiveTab] = useState<AdminTab>('requests');
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [planOverrides, setPlanOverrides] = useState<Record<string, 'plus' | 'pro' | 'ultra'>>({});
  const [manualEmail, setManualEmail] = useState('');
  const [manualPlan, setManualPlan] = useState<'plus' | 'pro' | 'ultra'>('pro');

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

  const pendingCount = useMemo(
    () => subscriptionRequests.filter((r) => r.status === 'pending').length,
    [subscriptionRequests]
  );

  const activeSubscribers = useMemo(
    () => proUsersList.filter((u) => u.status === 'active'),
    [proUsersList]
  );

  const estimatedMonthlyRevenue = useMemo(() => {
    return activeSubscribers.reduce((sum, sub) => {
      const p = getPlanById(sub.plan || 'pro');
      return sum + (p?.priceFcfa || 0);
    }, 0);
  }, [activeSubscribers]);

  const filteredRequests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return subscriptionRequests.filter((req) => {
      if (requestFilter !== 'all' && req.status !== requestFilter) return false;
      if (!q) return true;
      return (
        req.fullName.toLowerCase().includes(q) ||
        req.email.toLowerCase().includes(q) ||
        req.phone.toLowerCase().includes(q) ||
        (req.notes || '').toLowerCase().includes(q)
      );
    });
  }, [subscriptionRequests, requestFilter, searchTerm]);

  const filteredSubscribers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return proUsersList.filter((p) => {
      if (!q) return true;
      return (
        p.email.toLowerCase().includes(q) ||
        (p.fullName || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      );
    });
  }, [proUsersList, searchTerm]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return registeredUsersList.filter((u) => {
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q)
      );
    });
  }, [registeredUsersList, searchTerm]);

  const paymentLabel = (method?: string) => {
    switch (method) {
      case 'orange_money':
        return 'Orange Money';
      case 'mtn_momo':
        return 'MTN MoMo';
      case 'card':
        return isFr ? 'Carte / Virement' : 'Card / Transfer';
      case 'whatsapp':
        return 'WhatsApp Direct';
      default:
        return isFr ? 'Non précisé' : 'Unspecified';
    }
  };

  const formatDate = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString(isFr ? 'fr-FR' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const formatPhoneWhatsApp = (phone: string) => phone.replace(/[^\d]/g, '');

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
            <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-sm min-w-0">
                <span className="font-semibold text-white whitespace-nowrap shrink-0">
                  Tchoumi IA
                </span>
                <span className="text-neutral-600" aria-hidden="true">
                  /
                </span>
                <span className="text-neutral-400 truncate">
                  {isFr ? 'Administration' : 'Admin Dashboard'}
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

          {/* Main Full-Page Workspace */}
          <main className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-8">
            {/* Page Header */}
            <div className="border-b border-white/10 pb-6">
              <p className="text-xs text-neutral-400 mb-2">
                {isFr
                  ? 'Console Fondateur · Gestion des abonnements et comptes Google'
                  : 'Founder Console · Subscription and Google account management'}
              </p>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
                {isFr ? 'Administration Tchoumi IA' : 'Tchoumi AI Administration'}
              </h1>
              <p className="text-sm text-neutral-400 mt-1.5 max-w-2xl">
                {isFr
                  ? 'Consultez les demandes clients, vérifiez les paiements et activez les formules en temps réel.'
                  : 'Review client subscription requests, verify payments, and activate plans in real time.'}
              </p>
            </div>

            {/* 4-Column KPI Strip (single elevation, sharp corners) */}
            <section className="grid grid-cols-2 lg:grid-cols-4 border border-white/12 bg-[#0f1117] divide-y sm:divide-y-0 sm:divide-x divide-white/10 rounded-none">
              <div className="p-5">
                <div className="text-xs text-neutral-400">
                  {isFr ? 'Demandes en attente' : 'Pending requests'}
                </div>
                <div className="text-2xl font-semibold text-white mt-2 tabular-nums">
                  {pendingCount}
                </div>
              </div>

              <div className="p-5">
                <div className="text-xs text-neutral-400">
                  {isFr ? 'Abonnés actifs' : 'Active subscribers'}
                </div>
                <div className="text-2xl font-semibold text-white mt-2 tabular-nums">
                  {activeSubscribers.length}
                </div>
              </div>

              <div className="p-5">
                <div className="text-xs text-neutral-400">
                  {isFr ? 'Revenu mensuel estimé' : 'Estimated MRR'}
                </div>
                <div className="text-2xl font-semibold text-white mt-2 tabular-nums truncate">
                  {estimatedMonthlyRevenue.toLocaleString(isFr ? 'fr-FR' : 'en-US')} FCFA
                </div>
              </div>

              <div className="p-5">
                <div className="text-xs text-neutral-400">
                  {isFr ? 'Comptes Google' : 'Google accounts'}
                </div>
                <div className="text-2xl font-semibold text-white mt-2 tabular-nums">
                  {registeredUsersList.length}
                </div>
              </div>
            </section>

            {actionMessage && (
              <div className="px-4 py-3 border border-emerald-500/40 bg-emerald-500/10 text-xs font-medium text-emerald-200 flex items-center gap-2.5 rounded-none">
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                <span>{actionMessage}</span>
              </div>
            )}

            {/* Navigation Tabs + Search */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('requests')}
                  className={cn(
                    'px-4 py-2 border text-xs font-medium transition-colors cursor-pointer rounded-none whitespace-nowrap',
                    activeTab === 'requests'
                      ? 'bg-white text-black border-white'
                      : 'bg-[#0f1117] text-neutral-300 border-white/12 hover:border-white/30'
                  )}
                >
                  {isFr ? 'Demandes' : 'Requests'} ({subscriptionRequests.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('subscribers')}
                  className={cn(
                    'px-4 py-2 border text-xs font-medium transition-colors cursor-pointer rounded-none whitespace-nowrap',
                    activeTab === 'subscribers'
                      ? 'bg-white text-black border-white'
                      : 'bg-[#0f1117] text-neutral-300 border-white/12 hover:border-white/30'
                  )}
                >
                  {isFr ? 'Abonnés' : 'Subscribers'} ({proUsersList.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className={cn(
                    'px-4 py-2 border text-xs font-medium transition-colors cursor-pointer rounded-none whitespace-nowrap',
                    activeTab === 'users'
                      ? 'bg-white text-black border-white'
                      : 'bg-[#0f1117] text-neutral-300 border-white/12 hover:border-white/30'
                  )}
                >
                  {isFr ? 'Utilisateurs' : 'Users'} ({registeredUsersList.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={cn(
                    'px-4 py-2 border text-xs font-medium transition-colors cursor-pointer rounded-none whitespace-nowrap',
                    activeTab === 'manual'
                      ? 'bg-white text-black border-white'
                      : 'bg-[#0f1117] text-neutral-300 border-white/12 hover:border-white/30'
                  )}
                >
                  {isFr ? 'Activation manuelle' : 'Manual activation'}
                </button>
              </div>

              {activeTab !== 'manual' && (
                <div className="relative md:w-72">
                  <Search
                    size={14}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500"
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={
                      isFr ? 'Rechercher nom, e-mail, téléphone...' : 'Search name, email, phone...'
                    }
                    className="w-full pl-9 pr-3.5 py-2 bg-[#0f1117] border border-white/15 focus:border-white text-xs text-white placeholder-neutral-500 outline-none transition-colors rounded-none"
                  />
                </div>
              )}
            </div>

            {/* TAB 1: Client Subscription Requests */}
            {activeTab === 'requests' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    { id: 'all', label: isFr ? 'Toutes' : 'All' },
                    { id: 'pending', label: isFr ? 'En attente' : 'Pending' },
                    { id: 'approved', label: isFr ? 'Activées' : 'Approved' },
                    { id: 'rejected', label: isFr ? 'Refusées' : 'Rejected' },
                  ] as const).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setRequestFilter(f.id)}
                      className={cn(
                        'px-3.5 py-1.5 border text-xs font-medium transition-colors cursor-pointer rounded-none',
                        requestFilter === f.id
                          ? 'bg-white/[0.1] border-white text-white'
                          : 'bg-transparent border-white/12 text-neutral-400 hover:text-neutral-200 hover:border-white/25'
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {filteredRequests.length === 0 ? (
                  <div className="p-12 border border-white/12 bg-[#0f1117] text-center space-y-2 rounded-none">
                    <Clock size={22} className="text-neutral-500 mx-auto" />
                    <p className="text-sm font-medium text-neutral-200">
                      {isFr
                        ? "Aucune demande d'abonnement trouvée."
                        : 'No subscription requests found.'}
                    </p>
                    <p className="text-xs text-neutral-500 max-w-md mx-auto">
                      {isFr
                        ? "Dès qu'un client soumet le formulaire d'abonnement, sa demande apparaît ici en temps réel."
                        : 'Whenever a user submits the subscription form, their request appears here in real time.'}
                    </p>
                  </div>
                ) : (
                  <div className="border border-white/12 bg-[#0f1117] divide-y divide-white/10 rounded-none">
                    {filteredRequests.map((req) => {
                      const chosenPlan = planOverrides[req.id] || req.plan;
                      const planDef = getPlanById(chosenPlan);
                      const waDigits = formatPhoneWhatsApp(req.phone);

                      return (
                        <div key={req.id} className="p-5 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-sm font-semibold text-white">
                                  {req.fullName}
                                </span>
                                <span
                                  className={cn(
                                    'text-xs font-medium',
                                    req.status === 'pending'
                                      ? 'text-amber-400'
                                      : req.status === 'approved'
                                        ? 'text-emerald-400'
                                        : 'text-red-400'
                                  )}
                                >
                                  {req.status === 'pending'
                                    ? isFr
                                      ? 'En attente'
                                      : 'Pending'
                                    : req.status === 'approved'
                                      ? isFr
                                        ? 'Activé'
                                        : 'Approved'
                                      : isFr
                                        ? 'Refusé'
                                        : 'Rejected'}
                                </span>
                                <span className="text-xs text-neutral-400 tabular-nums">
                                  {planDef.name} · {planDef.priceLabel[language]}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-300">
                                <span className="font-mono text-white">{req.email}</span>
                                <span className="text-neutral-600" aria-hidden="true">
                                  ·
                                </span>
                                <span className="font-mono text-neutral-300">{req.phone}</span>
                                <span className="text-neutral-600" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-neutral-400">
                                  {paymentLabel(req.paymentMethod)}
                                </span>
                              </div>

                              {req.notes && (
                                <p className="text-xs text-neutral-400 pt-1">
                                  <span className="text-neutral-500 mr-1.5">
                                    {isFr ? 'Note :' : 'Note:'}
                                  </span>
                                  {req.notes}
                                </p>
                              )}
                            </div>

                            <div className="text-xs text-neutral-500 tabular-nums shrink-0">
                              {formatDate(req.createdAt)}
                            </div>
                          </div>

                          {/* Action Row */}
                          <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <select
                                value={chosenPlan}
                                onChange={(e) =>
                                  setPlanOverrides((prev) => ({
                                    ...prev,
                                    [req.id]: e.target.value as 'plus' | 'pro' | 'ultra',
                                  }))
                                }
                                className="px-3 py-2 bg-[#090a0e] border border-white/15 focus:border-white text-xs font-medium text-white outline-none cursor-pointer rounded-none"
                              >
                                <option value="plus">Plus (2 900 FCFA/mois)</option>
                                <option value="pro">Pro (12 559 FCFA/mois)</option>
                                <option value="ultra">Ultra (29 900 FCFA/mois)</option>
                              </select>

                              {req.status !== 'approved' && (
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() =>
                                    onActivatePlan(req.email, chosenPlan, req.id, {
                                      fullName: req.fullName,
                                      phone: req.phone,
                                    })
                                  }
                                  className="px-4 py-2 bg-white hover:bg-neutral-200 disabled:opacity-50 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer rounded-none"
                                >
                                  <CheckCircle2 size={14} />
                                  <span>
                                    {isFr ? "Activer l'abonnement" : 'Activate subscription'}
                                  </span>
                                </button>
                              )}

                              {req.status === 'pending' && (
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => onRejectRequest(req.id)}
                                  className="px-3.5 py-2 border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer rounded-none"
                                >
                                  <XCircle size={13} />
                                  <span>{isFr ? 'Refuser' : 'Reject'}</span>
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {waDigits.length >= 6 && (
                                <a
                                  href={`https://wa.me/${waDigits}?text=${encodeURIComponent(
                                    isFr
                                      ? `Bonjour ${req.fullName}, concernant votre demande d'abonnement ${planDef.name} sur Tchoumi IA (${req.email})...`
                                      : `Hello ${req.fullName}, regarding your ${planDef.name} subscription request on Tchoumi AI (${req.email})...`
                                  )}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-2 border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-colors rounded-none"
                                >
                                  <MessageSquare size={13} />
                                  <span>WhatsApp</span>
                                </a>
                              )}
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => onDeleteRequest(req.id)}
                                className="p-2 border border-white/12 bg-transparent hover:bg-red-500/15 hover:border-red-500/35 text-neutral-400 hover:text-red-300 transition-colors cursor-pointer rounded-none"
                                title={isFr ? 'Supprimer la demande' : 'Delete request'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Active Subscribers Management */}
            {activeTab === 'subscribers' && (
              <div className="border border-white/12 bg-[#0f1117] divide-y divide-white/10 rounded-none">
                {filteredSubscribers.length === 0 ? (
                  <p className="text-xs text-neutral-500 p-8 text-center">
                    {isFr ? 'Aucun compte abonné enregistré.' : 'No subscriber records yet.'}
                  </p>
                ) : (
                  filteredSubscribers.map((sub) => {
                    const assignedPlan = sub.plan || 'pro';
                    const isActive = sub.status === 'active';
                    return (
                      <div
                        key={sub.id || sub.email}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 text-xs"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-mono text-white font-medium truncate">
                              {sub.email}
                            </span>
                            <span className="text-neutral-500" aria-hidden="true">
                              ·
                            </span>
                            <span
                              className={cn(
                                'font-medium',
                                isActive ? 'text-emerald-400' : 'text-neutral-500'
                              )}
                            >
                              {isActive
                                ? isFr
                                  ? 'Actif'
                                  : 'Active'
                                : isFr
                                  ? 'Inactif'
                                  : 'Inactive'}
                            </span>
                            <span className="text-neutral-500" aria-hidden="true">
                              ·
                            </span>
                            <span className="uppercase font-semibold text-neutral-300">
                              {assignedPlan}
                            </span>
                          </div>
                          {(sub.fullName || sub.phone || sub.activatedAt) && (
                            <div className="text-xs text-neutral-400 tabular-nums">
                              {[sub.fullName, sub.phone, formatDate(sub.activatedAt)]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={assignedPlan}
                            onChange={(e) =>
                              onActivatePlan(
                                sub.email,
                                e.target.value as 'plus' | 'pro' | 'ultra',
                                undefined,
                                { fullName: sub.fullName, phone: sub.phone }
                              )
                            }
                            className="px-3 py-1.5 bg-[#090a0e] border border-white/15 text-xs font-medium text-white outline-none cursor-pointer rounded-none"
                          >
                            <option value="plus">Plus</option>
                            <option value="pro">Pro</option>
                            <option value="ultra">Ultra</option>
                          </select>
                          {isActive ? (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => onDeactivatePro(sub.email)}
                              className="px-3.5 py-1.5 border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-medium transition-colors cursor-pointer rounded-none"
                            >
                              {isFr ? 'Désactiver' : 'Deactivate'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => onActivatePlan(sub.email, assignedPlan)}
                              className="px-3.5 py-1.5 border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition-colors cursor-pointer rounded-none"
                            >
                              {isFr ? 'Réactiver' : 'Reactivate'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 3: Signed-in Google Users */}
            {activeTab === 'users' && (
              <div className="border border-white/12 bg-[#0f1117] divide-y divide-white/10 rounded-none">
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-neutral-500 p-8 text-center">
                    {isFr ? 'Aucun utilisateur trouvé.' : 'No users found.'}
                  </p>
                ) : (
                  filteredUsers.map((regUser) => {
                    const matchedPro = proUsersList.find(
                      (p) =>
                        p.email.toLowerCase() === regUser.email.toLowerCase() &&
                        p.status === 'active'
                    );
                    return (
                      <div
                        key={regUser.uid}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                            <span className="font-mono text-white truncate">
                              {regUser.email}
                            </span>
                            <span className="text-neutral-500" aria-hidden="true">
                              ·
                            </span>
                            <span
                              className={cn(
                                'uppercase font-semibold',
                                matchedPro ? 'text-emerald-400' : 'text-neutral-400'
                              )}
                            >
                              {matchedPro ? matchedPro.plan || 'pro' : 'Free'}
                            </span>
                          </div>
                          {(regUser.displayName || regUser.lastLoginMs) && (
                            <div className="text-xs text-neutral-400 truncate tabular-nums">
                              {[regUser.displayName, formatDate(regUser.lastLoginMs)]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                          )}
                        </div>

                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setManualEmail(regUser.email);
                              setActiveTab('manual');
                            }}
                            className="px-3.5 py-1.5 border border-white/15 bg-transparent hover:bg-white/[0.06] text-neutral-200 text-xs font-medium transition-colors cursor-pointer rounded-none"
                          >
                            {isFr ? 'Gérer le plan' : 'Manage plan'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 4: Direct Manual Activation */}
            {activeTab === 'manual' && (
              <div className="p-6 border border-white/12 bg-[#0f1117] space-y-5 rounded-none">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    {isFr
                      ? 'Activer un abonnement manuellement'
                      : 'Manually activate subscription'}
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    {isFr
                      ? "Saisissez l'adresse e-mail Google du client pour lui attribuer immédiatement une formule."
                      : "Enter a client's Google email address to grant a subscription plan immediately."}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={manualEmail}
                    onChange={(e) => setManualEmail(e.target.value)}
                    placeholder="client@gmail.com"
                    className="flex-1 px-3.5 py-2.5 bg-[#090a0e] border border-white/15 focus:border-white text-sm text-white placeholder-neutral-500 outline-none font-mono rounded-none"
                  />
                  <select
                    value={manualPlan}
                    onChange={(e) =>
                      setManualPlan(e.target.value as 'plus' | 'pro' | 'ultra')
                    }
                    className="px-3.5 py-2.5 bg-[#090a0e] border border-white/15 focus:border-white text-xs font-medium text-white outline-none cursor-pointer rounded-none"
                  >
                    <option value="plus">Plus (2 900 FCFA / mois)</option>
                    <option value="pro">Pro (12 559 FCFA / mois)</option>
                    <option value="ultra">Ultra (29 900 FCFA / mois)</option>
                  </select>
                  <button
                    type="button"
                    disabled={isSaving || !manualEmail.trim()}
                    onClick={async () => {
                      await onActivatePlan(manualEmail, manualPlan);
                      setManualEmail('');
                    }}
                    className="px-5 py-2.5 bg-white hover:bg-neutral-200 disabled:opacity-50 text-black font-semibold text-xs transition-colors cursor-pointer shrink-0 rounded-none"
                  >
                    {isFr ? 'Activer maintenant' : 'Activate now'}
                  </button>
                </div>
              </div>
            )}
          </main>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
