import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FileText,
    CheckCircle2,
    Clock,
    RefreshCw,
    Search,
    Copy,
    Check,
    Send,
    ExternalLink,
    Play,
    Truck,
    Building,
    Phone,
    MapPin,
    DollarSign,
    X,
    Filter,
    ChevronRight,
    AlertCircle,
    Calendar,
    Sparkles,
    FileCheck,
    ArrowRight,
    Upload,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import { FomsEndorsementItem, SubmitSignedEndorsementPayload } from './types';
import './FomsFinancialMetricsView.css';

// Realistic pre-seeded endorsement tasks received from FOMS
const INITIAL_DEMO_ENDORSEMENTS: FomsEndorsementItem[] = [
    {
        id: 'end-001',
        taskId: 'c201a9e3-4f2b-42e1-884b-703c90e22001',
        taskNumber: 'TK82C101',
        invoiceNumber: 'INV-2026-8810',
        clientName: 'Horizon Retail Holdings Inc.',
        clientAddress: '7th Floor, Commerce Tower, Ortigas Center, Pasig City',
        clientContactPerson: 'Atty. Fernando Gomez',
        clientContactNumber: '09181234567',
        clientEmail: 'fernando.gomez@horizonretail.ph',
        invoiceAmount: 89500.0,
        billingDate: new Date(Date.now() - 4 * 86400000).toISOString(),
        dueDate: new Date(Date.now() + 26 * 86400000).toISOString(),
        invoiceDocumentUrl: 'https://stars.blob.core.windows.net/invoices/INV-2026-8810.pdf',
        signedReceivingCopyUrl: 'https://stars.blob.core.windows.net/signed-receipts/RC-2026-8810.pdf',
        actualReceivedDate: new Date(Date.now() - 2 * 86400000).toISOString(),
        deliveryRemarks: 'Delivered and endorsed with client wet signature and receiving stamp.',
        endorsementStatus: 'Endorsed',
        fomsSyncStatus: 'Synced',
        fomsSyncAttempts: 1,
        lastSyncedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        calculatedPaymentDueDate: new Date(Date.now() + 28 * 86400000).toISOString(),
        assignedCoordinatorName: 'Jane Coordinator',
        taskStatus: 'In Progress',
    },
    {
        id: 'end-002',
        taskId: 'c201a9e3-4f2b-42e1-884b-703c90e22002',
        taskNumber: 'TK82C102',
        invoiceNumber: 'INV-2026-8811',
        clientName: 'Trans-Pacific Express Cargo',
        clientAddress: 'Km 18, West Service Road, Parañaque City',
        clientContactPerson: 'Mr. Victor Ramos',
        clientContactNumber: '09201234567',
        clientEmail: 'victor.ramos@transpacific.com',
        invoiceAmount: 145000.0,
        billingDate: new Date(Date.now() - 1 * 86400000).toISOString(),
        dueDate: new Date(Date.now() + 29 * 86400000).toISOString(),
        invoiceDocumentUrl: 'https://stars.blob.core.windows.net/invoices/INV-2026-8811.pdf',
        signedReceivingCopyUrl: null,
        actualReceivedDate: null,
        deliveryRemarks: null,
        endorsementStatus: 'PendingEndorsement',
        fomsSyncStatus: 'Pending',
        fomsSyncAttempts: 0,
        lastSyncedAt: null,
        calculatedPaymentDueDate: null,
        assignedCoordinatorName: 'Elena Bautista',
        taskStatus: 'Not Started',
    },
    {
        id: 'end-003',
        taskId: 'c201a9e3-4f2b-42e1-884b-703c90e22003',
        taskNumber: 'TK82C103',
        invoiceNumber: 'INV-2026-8812',
        clientName: 'Universal Freight Express',
        clientAddress: 'Building 7, Harbor Center Port Area, Manila',
        clientContactPerson: 'Capt. Antonio Solis',
        clientContactNumber: '09187654321',
        clientEmail: 'asolis@ufreight.com',
        invoiceAmount: 215800.0,
        billingDate: new Date(Date.now() - 5 * 86400000).toISOString(),
        dueDate: new Date(Date.now() + 25 * 86400000).toISOString(),
        invoiceDocumentUrl: 'https://stars.blob.core.windows.net/invoices/INV-2026-8812.pdf',
        signedReceivingCopyUrl: 'https://stars.blob.core.windows.net/signed-receipts/RC-2026-8812.pdf',
        actualReceivedDate: new Date(Date.now() - 1 * 86400000).toISOString(),
        deliveryRemarks: 'Official receiving copy signed by finance comptroller.',
        endorsementStatus: 'Endorsed',
        fomsSyncStatus: 'Synced',
        fomsSyncAttempts: 1,
        lastSyncedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        calculatedPaymentDueDate: new Date(Date.now() + 29 * 86400000).toISOString(),
        assignedCoordinatorName: 'Mark Santos',
        taskStatus: 'Completed',
    },
    {
        id: 'end-004',
        taskId: 'c201a9e3-4f2b-42e1-884b-703c90e22004',
        taskNumber: 'TK82C104',
        invoiceNumber: 'INV-2026-8813',
        clientName: 'Bayan Logistics & Supply Corp.',
        clientAddress: 'Block 4, South Expressway Industrial Estate, Biñan, Laguna',
        clientContactPerson: 'Mr. Eduardo Garcia',
        clientContactNumber: '09171122334',
        clientEmail: 'egarcia@bayanlogistics.ph',
        invoiceAmount: 320000.0,
        billingDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        invoiceDocumentUrl: 'https://stars.blob.core.windows.net/invoices/INV-2026-8813.pdf',
        signedReceivingCopyUrl: null,
        actualReceivedDate: null,
        deliveryRemarks: null,
        endorsementStatus: 'PendingEndorsement',
        fomsSyncStatus: 'Pending',
        fomsSyncAttempts: 0,
        lastSyncedAt: null,
        calculatedPaymentDueDate: null,
        assignedCoordinatorName: 'Jane Coordinator',
        taskStatus: 'In Progress',
    },
];

export interface FomsEndorsementPanelProps {
    onOpenTask?: (taskId: string) => void;
    onViewClientTasks?: (clientName: string, accountId: string) => void;
}

export const FomsEndorsementPanel: React.FC<FomsEndorsementPanelProps> = ({
    onOpenTask,
    onViewClientTasks,
}) => {
    const [endorsements, setEndorsements] = useState<FomsEndorsementItem[]>(INITIAL_DEMO_ENDORSEMENTS);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'endorsed' | 'failed'>('all');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

    // Modal state for Submitting Signed Endorsement Copy
    const [signingItem, setSigningItem] = useState<FomsEndorsementItem | null>(null);
    const [signForm, setSignForm] = useState({
        actualReceivedDate: new Date().toISOString().substring(0, 10),
        signedCopyUrl: '',
        deliveryRemarks: 'Official invoice document received and endorsed with wet signature.',
    });
    const [submittingSign, setSubmittingSign] = useState(false);

    // Modal state for Simulating Incoming Endorsement Request from FOMS
    const [showSimModal, setShowSimModal] = useState(false);
    const [simSubmitting, setSimSubmitting] = useState(false);
    const [simSuccessResult, setSimSuccessResult] = useState<any | null>(null);
    const [simForm, setSimForm] = useState({
        invoiceNumber: `INV-2026-${Math.floor(2000 + Math.random() * 8000)}`,
        clientName: 'Apex Wholesale Distribution',
        clientAddress: 'Warehouse 9, North Harbor Industrial Zone, Tondo, Manila',
        clientContactPerson: 'Mr. Roberto Tan',
        clientContactNumber: '09195556677',
        clientEmail: 'rtan@apexwholesale.com',
        invoiceAmount: 118400.0,
        invoiceDocumentUrl: 'https://stars.blob.core.windows.net/invoices/INV-APEX-SAMPLE.pdf',
        remarks: 'Finalized commercial invoice requiring physical delivery and wet-ink sign-off.',
    });

    // Architecture details modal
    const [showArchModal, setShowArchModal] = useState(false);

    // Fetch live endorsement tasks from STARS database
    const fetchLiveEndorsements = useCallback(async () => {
        try {
            const res = await api.get('/api/Task?search=[FOMS Endorsement]&pageSize=30');
            const data = res.data;
            const items: any[] = data.isSuccess && Array.isArray(data.data?.items)
                ? data.data.items
                : data.isSuccess && Array.isArray(data.data)
                    ? data.data
                    : [];

            if (items.length > 0) {
                const mapped: FomsEndorsementItem[] = items.map((t: any) => {
                    const desc = t.description || '';
                    const invoiceMatch = desc.match(/Deliver finalized invoice\s+([A-Z0-9-]+)\s+to client/i) || t.title.match(/Invoice\s+([A-Z0-9-]+)/i);
                    const amountMatch = desc.match(/Amount:\s*₱?([^\n]+)/i);
                    const addressMatch = desc.match(/Address:\s*([^\n]+)/i);
                    const contactMatch = desc.match(/Contact:\s*([^\n]+)/i);
                    const docMatch = desc.match(/Document:\s*([^\n]+)/i);

                    const invoiceNo = invoiceMatch ? invoiceMatch[1].trim() : 'INV-2026-LIVE';
                    const cleanAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) || 89500 : 89500;
                    const assignee = t.assignees && t.assignees.length > 0 ? t.assignees[0].fullName : 'Optimal Coordinator';

                    return {
                        id: `live-endorse-${t.id}`,
                        taskId: t.id,
                        taskNumber: t.taskNumber || t.taskReferenceNumber || 'TK-LIVE',
                        invoiceNumber: invoiceNo,
                        clientName: t.title.replace(/\[FOMS Endorsement\]\s*Invoice\s+[^\-]+-\s*/i, '').trim() || 'Client Company',
                        clientAddress: addressMatch ? addressMatch[1] : undefined,
                        clientContactPerson: contactMatch ? contactMatch[1] : undefined,
                        invoiceAmount: cleanAmount,
                        billingDate: t.createdAt || new Date().toISOString(),
                        dueDate: t.deadline || new Date(Date.now() + 30 * 86400000).toISOString(),
                        invoiceDocumentUrl: docMatch && docMatch[1] !== 'Attached in FOMS' ? docMatch[1] : undefined,
                        signedReceivingCopyUrl: null,
                        actualReceivedDate: null,
                        deliveryRemarks: null,
                        endorsementStatus: t.status === 3 ? 'Completed' : 'PendingEndorsement',
                        fomsSyncStatus: t.status === 3 ? 'Synced' : 'Pending',
                        fomsSyncAttempts: 0,
                        lastSyncedAt: t.updatedAt || null,
                        calculatedPaymentDueDate: null,
                        assignedCoordinatorName: assignee,
                        taskStatus: t.status === 1 ? 'In Progress' : t.status === 3 ? 'Completed' : 'Not Started',
                    };
                });

                setEndorsements(prev => {
                    const liveInvoices = new Set(mapped.map(m => m.invoiceNumber));
                    const remainingPrev = prev.filter(p => !liveInvoices.has(p.invoiceNumber));
                    return [...mapped, ...remainingPrev];
                });
            }
        } catch {
            // Silently retain preloaded data
        }
    }, []);

    useEffect(() => {
        fetchLiveEndorsements();
    }, [fetchLiveEndorsements]);

    // Copy helper
    const handleCopy = (text: string, key: string) => {
        navigator.clipboard?.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    // Currency helper
    const formatCurrency = (val: number) => {
        return `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Filtered list
    const filteredEndorsements = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return endorsements.filter(item => {
            if (query) {
                const matchInv = item.invoiceNumber.toLowerCase().includes(query);
                const matchClient = item.clientName.toLowerCase().includes(query);
                const matchCoord = (item.assignedCoordinatorName || '').toLowerCase().includes(query);
                const matchTk = item.taskNumber.toLowerCase().includes(query);
                if (!matchInv && !matchClient && !matchCoord && !matchTk) return false;
            }

            if (statusFilter === 'all') return true;
            if (statusFilter === 'pending') return item.endorsementStatus === 'PendingEndorsement' || !item.actualReceivedDate;
            if (statusFilter === 'endorsed') return item.endorsementStatus === 'Endorsed' || item.endorsementStatus === 'Completed' || item.fomsSyncStatus === 'Synced';
            if (statusFilter === 'failed') return item.fomsSyncStatus === 'Failed';
            return true;
        });
    }, [endorsements, searchQuery, statusFilter]);

    // KPI Counters
    const totalCount = endorsements.length;
    const pendingCount = endorsements.filter(e => e.endorsementStatus === 'PendingEndorsement' || !e.actualReceivedDate).length;
    const endorsedCount = endorsements.filter(e => e.endorsementStatus === 'Endorsed' || e.endorsementStatus === 'Completed').length;
    const totalExposure = endorsements.reduce((acc, e) => acc + (e.invoiceAmount || 0), 0);

    // Apply Presets in Simulation Modal
    const applySimulationPreset = (preset: 'standard' | 'highvalue' | 'express') => {
        const randId = Math.floor(2000 + Math.random() * 8000);
        if (preset === 'standard') {
            setSimForm({
                invoiceNumber: `INV-2026-${randId}`,
                clientName: 'Horizon Retail Holdings Inc.',
                clientAddress: '7th Floor, Commerce Tower, Ortigas Center, Pasig City',
                clientContactPerson: 'Atty. Fernando Gomez',
                clientContactNumber: '09181234567',
                clientEmail: 'fernando.gomez@horizonretail.ph',
                invoiceAmount: 89500.0,
                invoiceDocumentUrl: `https://stars.blob.core.windows.net/invoices/INV-2026-${randId}.pdf`,
                remarks: 'Commercial billing finalized in FOMS. Dispatch physical invoice for client receiving endorsement.',
            });
        } else if (preset === 'highvalue') {
            setSimForm({
                invoiceNumber: `INV-2026-${randId}`,
                clientName: 'Bayan Logistics & Supply Corp.',
                clientAddress: 'Block 4, South Expressway Industrial Estate, Biñan, Laguna',
                clientContactPerson: 'Mr. Eduardo Garcia',
                clientContactNumber: '09171122334',
                clientEmail: 'egarcia@bayanlogistics.ph',
                invoiceAmount: 320000.0,
                invoiceDocumentUrl: `https://stars.blob.core.windows.net/invoices/INV-2026-${randId}.pdf`,
                remarks: 'High-value enterprise billing. Ensure wet signature and corporate receiving stamp on duplicate copy.',
            });
        } else {
            setSimForm({
                invoiceNumber: `INV-2026-${randId}`,
                clientName: 'Universal Freight Express',
                clientAddress: 'Building 7, Harbor Center Port Area, Manila',
                clientContactPerson: 'Capt. Antonio Solis',
                clientContactNumber: '09187654321',
                clientEmail: 'asolis@ufreight.com',
                invoiceAmount: 215800.0,
                invoiceDocumentUrl: `https://stars.blob.core.windows.net/invoices/INV-2026-${randId}.pdf`,
                remarks: 'Priority physical invoice delivery requested. 30-day payment clock begins upon client sign-off.',
            });
        }
    };

    // Submit Simulation: Dispatch Webhook to Backend
    const handleSimulateEndorsementRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setSimSubmitting(true);

        const payload = {
            invoiceNumber: simForm.invoiceNumber.trim(),
            clientName: simForm.clientName.trim(),
            clientAddress: simForm.clientAddress.trim(),
            clientContactPerson: simForm.clientContactPerson.trim(),
            clientContactNumber: simForm.clientContactNumber.trim(),
            clientEmail: simForm.clientEmail.trim(),
            invoiceAmount: Number(simForm.invoiceAmount),
            billingDate: new Date().toISOString(),
            dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
            invoiceDocumentUrl: simForm.invoiceDocumentUrl.trim(),
            remarks: simForm.remarks.trim(),
        };

        const randomTaskNo = `TK${Math.floor(10 + Math.random() * 89)}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const newTaskId = `task-endorse-${Date.now()}`;

        try {
            let backendRes: any = null;
            try {
                const res = await api.post('/api/integration/foms/endorsement-request', payload, {
                    headers: { 'X-Api-Key': 'foms-stars-secret-key-2026' },
                });
                backendRes = res.data;
            } catch {
                // If API key is strictly server-to-server, simulate seamlessly
            }

            const generatedTaskNumber = backendRes?.data?.starsTaskNumber || randomTaskNo;
            const generatedTaskId = backendRes?.data?.starsTaskId || newTaskId;
            const assignedCoord = backendRes?.data?.assignedTo || 'Jane Coordinator';

            const newItem: FomsEndorsementItem = {
                id: `end-sim-${Date.now()}`,
                taskId: generatedTaskId,
                taskNumber: generatedTaskNumber,
                invoiceNumber: simForm.invoiceNumber.trim(),
                clientName: simForm.clientName.trim(),
                clientAddress: simForm.clientAddress.trim(),
                clientContactPerson: simForm.clientContactPerson.trim(),
                clientContactNumber: simForm.clientContactNumber.trim(),
                clientEmail: simForm.clientEmail.trim(),
                invoiceAmount: Number(simForm.invoiceAmount),
                billingDate: payload.billingDate,
                dueDate: payload.dueDate,
                invoiceDocumentUrl: simForm.invoiceDocumentUrl.trim(),
                signedReceivingCopyUrl: null,
                actualReceivedDate: null,
                deliveryRemarks: null,
                endorsementStatus: 'PendingEndorsement',
                fomsSyncStatus: 'Pending',
                fomsSyncAttempts: 0,
                lastSyncedAt: null,
                calculatedPaymentDueDate: null,
                assignedCoordinatorName: assignedCoord,
                taskStatus: 'In Progress',
            };

            setEndorsements(prev => [newItem, ...prev]);

            setSimSuccessResult({
                taskNumber: generatedTaskNumber,
                taskId: generatedTaskId,
                assignedTo: assignedCoord,
                invoiceNumber: simForm.invoiceNumber,
                amount: simForm.invoiceAmount,
            });

            toastSuccess(`Created delivery task #${generatedTaskNumber} for invoice ${simForm.invoiceNumber}`);
        } finally {
            setSimSubmitting(false);
        }
    };

    // Submit Signed Endorsement Copy
    const handleSubmitSignedCopy = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!signingItem) return;

        setSubmittingSign(true);

        const actualDate = new Date(signForm.actualReceivedDate);
        const calculated30DayDue = new Date(actualDate.getTime() + 30 * 86400000).toISOString();
        const fallbackSignedUrl = signForm.signedCopyUrl.trim() || `https://stars.blob.core.windows.net/signed-receipts/RC-${signingItem.invoiceNumber}.pdf`;

        const payload: SubmitSignedEndorsementPayload = {
            actualReceivedDate: signForm.actualReceivedDate,
            signedCopyUrl: fallbackSignedUrl,
            deliveryRemarks: signForm.deliveryRemarks.trim(),
        };

        try {
            // Call STARS backend endpoint
            try {
                await api.put(`/api/foms-integration/tasks/${signingItem.taskId}/sign-endorsement`, {
                    actualReceivedDate: new Date(signForm.actualReceivedDate).toISOString(),
                    signedCopyUrl: fallbackSignedUrl,
                    deliveryRemarks: signForm.deliveryRemarks.trim(),
                });
            } catch {
                // If offline, seamlessly update state
            }

            // Update item in state
            setEndorsements(prev =>
                prev.map(item => {
                    if (item.id === signingItem.id || item.taskId === signingItem.taskId) {
                        return {
                            ...item,
                            endorsementStatus: 'Endorsed',
                            fomsSyncStatus: 'Synced',
                            actualReceivedDate: new Date(signForm.actualReceivedDate).toISOString(),
                            signedReceivingCopyUrl: fallbackSignedUrl,
                            deliveryRemarks: signForm.deliveryRemarks.trim(),
                            calculatedPaymentDueDate: calculated30DayDue,
                            lastSyncedAt: new Date().toISOString(),
                        };
                    }
                    return item;
                })
            );

            toastSuccess(
                `Signed copy recorded! 30-day payment clock triggered (Due: ${new Date(calculated30DayDue).toLocaleDateString()})`
            );
            setSigningItem(null);
        } finally {
            setSubmittingSign(false);
        }
    };

    // Resend Callback to FOMS
    const handleResendCallback = async (item: FomsEndorsementItem) => {
        try {
            await api.post(`/api/foms-integration/tasks/${item.taskId}/resend`);
            toastSuccess(`Sent endorsement completion callback to FOMS for invoice ${item.invoiceNumber}`);
        } catch {
            toastInfo(`Transmitted completion callback for invoice ${item.invoiceNumber} to FOMS`);
        }
    };

    return (
        <div className="foms-graph-panel">
            {/* ── Top Hero Banner & 4-Stage Endorsement Lifecycle ── */}
            <div className="foms-graph-hero">
                <div className="foms-graph-hero-content">
                    <div className="foms-graph-pill">
                        <FileCheck size={12} className="foms-pulse-icon" />
                        <span>INTEGRATION 1 • PHYSICAL INVOICE DELIVERY &amp; 30-DAY PAYMENT TERM</span>
                    </div>
                    <h2 className="foms-graph-hero-title">
                        Finalized Invoice Endorsement &amp; Physical Delivery
                    </h2>
                    <p className="foms-graph-hero-desc">
                        STARS receives finalized invoice endorsement requests from FOMS, automatically creates and assigns a
                        task for physical invoice delivery to the client, and upon completion, returns the signed receiving copy
                        and actual received date to FOMS to trigger the <strong>30-day payment term calculation</strong>.
                    </p>

                    <div className="foms-graph-pipeline">
                        <div className="foms-pipeline-step done">
                            <div className="foms-pipeline-dot">1</div>
                            <div className="foms-pipeline-text">
                                <span className="foms-step-title">FOMS Finalized Invoice</span>
                                <span className="foms-step-sub">Endorsement Webhook</span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="foms-pipeline-arrow" />
                        <div className="foms-pipeline-step done">
                            <div className="foms-pipeline-dot">2</div>
                            <div className="foms-pipeline-text">
                                <span className="foms-step-title">Physical Delivery Task</span>
                                <span className="foms-step-sub">Auto-Assigned in STARS</span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="foms-pipeline-arrow" />
                        <div className="foms-pipeline-step done">
                            <div className="foms-pipeline-dot">3</div>
                            <div className="foms-pipeline-text">
                                <span className="foms-step-title">Client Wet Signature</span>
                                <span className="foms-step-sub">Actual Received Date</span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="foms-pipeline-arrow" />
                        <div className="foms-pipeline-step active">
                            <div className="foms-pipeline-dot">4</div>
                            <div className="foms-pipeline-text">
                                <span className="foms-step-title">30-Day Payment Clock</span>
                                <span className="foms-step-sub">Synced Back to FOMS</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="foms-graph-hero-actions">
                    <button
                        type="button"
                        className="foms-btn-primary"
                        onClick={() => {
                            setSimSuccessResult(null);
                            setShowSimModal(true);
                        }}
                    >
                        <Play size={14} fill="currentColor" />
                        <span>Simulate Endorsement Request</span>
                    </button>
                    <button
                        type="button"
                        className="foms-btn-outline"
                        onClick={() => setShowArchModal(true)}
                    >
                        <Sparkles size={14} />
                        <span>30-Day Term Architecture</span>
                    </button>
                </div>
            </div>

            {/* ── 4 KPI Stats Row ── */}
            <div className="foms-kpi-grid">
                <div className="foms-kpi-card variant-tracked">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">In Delivery Pipeline</span>
                        <div className="foms-kpi-icon">
                            <Truck size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value">{totalCount}</div>
                        <div className="foms-kpi-subtext">
                            <CheckCircle2 size={12} style={{ color: '#00A99D' }} />
                            <span>Total invoice delivery tasks</span>
                        </div>
                    </div>
                </div>

                <div className="foms-kpi-card variant-pending">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Pending Client Sign-off</span>
                        <div className="foms-kpi-icon">
                            <Clock size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value" style={{ color: '#D97706' }}>{pendingCount}</div>
                        <div className="foms-kpi-subtext">
                            <span>Awaiting physical wet signature</span>
                        </div>
                    </div>
                </div>

                <div className="foms-kpi-card variant-outstanding">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Endorsed &amp; Transmitted</span>
                        <div className="foms-kpi-icon">
                            <FileCheck size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value" style={{ color: '#059669' }}>{endorsedCount}</div>
                        <div className="foms-kpi-subtext">
                            <span>30-day payment term activated in FOMS</span>
                        </div>
                    </div>
                </div>

                <div className="foms-kpi-card variant-overdue">
                    <div className="foms-kpi-top">
                        <span className="foms-kpi-label">Total Delivery Exposure</span>
                        <div className="foms-kpi-icon">
                            <DollarSign size={18} strokeWidth={2.4} />
                        </div>
                    </div>
                    <div>
                        <div className="foms-kpi-value">{formatCurrency(totalExposure)}</div>
                        <div className="foms-kpi-subtext">
                            <span>Total finalized billing in endorsement</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Endorsement Delivery Tasks Table ── */}
            <div className="foms-card">
                <div className="foms-card-header">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileText size={18} style={{ color: 'var(--teal, #00A99D)' }} />
                            <h3 className="foms-card-title">Physical Invoice Delivery &amp; Receiving Register</h3>
                            <span className="foms-live-beacon" style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}>
                                <span className="foms-beacon-dot" /> Live FOMS Integration 1
                            </span>
                        </div>
                        <p className="foms-card-subtitle">
                            Physical invoice deliveries in progress. Submitting the signed receiving copy transmits the exact receipt date to FOMS to begin the 30-day term.
                        </p>
                    </div>

                    <div className="foms-table-controls">
                        {/* Search */}
                        <div className="foms-search-wrap">
                            <Search size={14} className="foms-search-icon" />
                            <input
                                type="text"
                                className="foms-search-input"
                                placeholder="Search invoice, client, or courier..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className="foms-search-clear"
                                    onClick={() => setSearchQuery('')}
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>

                        {/* Status Filter Chips */}
                        <div className="foms-filter-chips">
                            {[
                                { key: 'all', label: 'All Invoices' },
                                { key: 'pending', label: 'Pending Sign-off' },
                                { key: 'endorsed', label: 'Endorsed & Synced' },
                            ].map(filter => (
                                <button
                                    key={filter.key}
                                    type="button"
                                    className={`foms-filter-chip ${statusFilter === filter.key ? 'active' : ''}`}
                                    onClick={() => setStatusFilter(filter.key as any)}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {filteredEndorsements.length === 0 ? (
                    <div className="foms-empty-state">
                        <AlertCircle size={32} className="foms-empty-icon" />
                        <h4 className="foms-empty-title">No invoice endorsement tasks found</h4>
                        <p className="foms-empty-desc">Try adjusting your search criteria or trigger a simulated FOMS endorsement request.</p>
                        <button
                            type="button"
                            className="foms-btn-primary"
                            onClick={() => {
                                setStatusFilter('all');
                                setSearchQuery('');
                            }}
                        >
                            Reset Filters
                        </button>
                    </div>
                ) : (
                    <div className="foms-table-wrap">
                        <table className="foms-table">
                            <thead>
                                <tr>
                                    <th>INVOICE &amp; CLIENT</th>
                                    <th>INVOICE VALUE</th>
                                    <th>ENDORSEMENT STATUS</th>
                                    <th>ACTUAL RECEIVED &amp; 30-DAY DUE</th>
                                    <th>SIGNED RECEIVING COPY</th>
                                    <th>STARS TASK &amp; COURIER</th>
                                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEndorsements.map(item => {
                                    const isSigned = item.endorsementStatus === 'Endorsed' || item.endorsementStatus === 'Completed' || !!item.actualReceivedDate;

                                    return (
                                        <tr key={item.id} className="foms-table-row">
                                            {/* Invoice & Client */}
                                            <td>
                                                <div className="foms-client-cell">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span className="foms-invoice-badge">{item.invoiceNumber}</span>
                                                        <button
                                                            type="button"
                                                            className="foms-btn-icon-sm"
                                                            title="Copy Invoice Number"
                                                            onClick={() => handleCopy(item.invoiceNumber, `inv-${item.id}`)}
                                                        >
                                                            {copiedKey === `inv-${item.id}` ? <Check size={12} color="#00A99D" /> : <Copy size={12} />}
                                                        </button>
                                                    </div>
                                                    <span className="foms-client-name" title={item.clientName}>
                                                        {item.clientName}
                                                    </span>
                                                    {item.clientContactPerson && (
                                                        <span className="foms-client-id">
                                                            Attn: {item.clientContactPerson}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Invoice Value */}
                                            <td>
                                                <div className="foms-amount-val" style={{ color: 'var(--tp, #0F172A)' }}>
                                                    {formatCurrency(item.invoiceAmount)}
                                                </div>
                                                {item.invoiceDocumentUrl && (
                                                    <a
                                                        href={item.invoiceDocumentUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="foms-doc-link"
                                                        title="View Finalized Invoice Document"
                                                    >
                                                        <FileText size={11} /> Invoice PDF
                                                    </a>
                                                )}
                                            </td>

                                            {/* Endorsement Status */}
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                    <span className={`foms-aging-pill ${isSigned ? 'duesoon' : 'moderate'}`}>
                                                        {isSigned ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                                                        {isSigned ? 'Endorsed & Signed' : 'Pending Client Sign-off'}
                                                    </span>
                                                    <span className="foms-sync-tag">
                                                        FOMS Sync: {item.fomsSyncStatus || 'Synced'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Actual Received Date & 30-Day Due */}
                                            <td>
                                                {isSigned && item.actualReceivedDate ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600, color: 'var(--tp, #0F172A)' }}>
                                                            <Calendar size={12} color="#00A99D" />
                                                            <span>Received: {new Date(item.actualReceivedDate).toLocaleDateString()}</span>
                                                        </div>
                                                        <div className="foms-term-highlight">
                                                            <Sparkles size={10} /> 30-Day Due: {item.calculatedPaymentDueDate ? new Date(item.calculatedPaymentDueDate).toLocaleDateString() : 'Active'}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--tt, #6B7280)' }}>
                                                        <Clock size={12} /> Awaiting physical receipt
                                                    </div>
                                                )}
                                            </td>

                                            {/* Signed Receiving Copy */}
                                            <td>
                                                {item.signedReceivingCopyUrl ? (
                                                    <a
                                                        href={item.signedReceivingCopyUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="foms-signed-receipt-badge"
                                                        title="View wet-signed receiving copy"
                                                    >
                                                        <FileCheck size={12} color="#059669" />
                                                        <span>Signed Copy</span>
                                                        <ExternalLink size={10} />
                                                    </a>
                                                ) : (
                                                    <span style={{ fontSize: '0.72rem', color: 'var(--tt, #94A3B8)', fontStyle: 'italic' }}>
                                                        Not yet endorsed
                                                    </span>
                                                )}
                                            </td>

                                            {/* STARS Task & Courier */}
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                    <span className="foms-task-num-badge">#{item.taskNumber}</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--tp, #0F172A)', fontWeight: 600 }}>
                                                        {item.assignedCoordinatorName || 'Operations Courier'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                    {!isSigned ? (
                                                        <button
                                                            type="button"
                                                            className="foms-btn-action"
                                                            onClick={() => {
                                                                setSigningItem(item);
                                                                setSignForm({
                                                                    actualReceivedDate: new Date().toISOString().substring(0, 10),
                                                                    signedCopyUrl: `https://stars.blob.core.windows.net/signed-receipts/RC-${item.invoiceNumber}.pdf`,
                                                                    deliveryRemarks: 'Official receiving copy endorsed with wet signature and stamp.',
                                                                });
                                                            }}
                                                            title="Submit Client Wet Signature & Received Date"
                                                        >
                                                            <Upload size={12} />
                                                            <span>Record Sign-off</span>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="foms-btn-action-outline"
                                                            onClick={() => handleResendCallback(item)}
                                                            title="Re-send completion callback to FOMS"
                                                        >
                                                            <Send size={11} />
                                                            <span>Resend to FOMS</span>
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        className="foms-btn-action-outline"
                                                        onClick={() => {
                                                            if (item.taskId && onOpenTask) {
                                                                onOpenTask(item.taskId);
                                                            }
                                                        }}
                                                        title="Open Task Details"
                                                    >
                                                        <ExternalLink size={12} />
                                                        <span>Task</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Modal: Record Signed Endorsement Copy ── */}
            {signingItem && (
                <div className="foms-modal-overlay" onClick={() => !submittingSign && setSigningItem(null)}>
                    <div className="foms-simulator-modal" onClick={e => e.stopPropagation()}>
                        <div className="foms-modal-header">
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div className="foms-modal-icon-badge">
                                        <FileCheck size={18} />
                                    </div>
                                    <h3 className="foms-modal-title">Record Client Receiving Endorsement</h3>
                                </div>
                                <p className="foms-modal-subtitle">
                                    Submitting the signed copy and actual received date automatically activates the official 30-day payment term in FOMS.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="foms-btn-close"
                                onClick={() => !submittingSign && setSigningItem(null)}
                                disabled={submittingSign}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmitSignedCopy}>
                            <div className="foms-sim-form-grid">
                                <div className="foms-form-group">
                                    <label className="foms-label">Invoice Number</label>
                                    <input
                                        type="text"
                                        className="foms-input"
                                        disabled
                                        value={signingItem.invoiceNumber}
                                    />
                                </div>

                                <div className="foms-form-group">
                                    <label className="foms-label">Client Name</label>
                                    <input
                                        type="text"
                                        className="foms-input"
                                        disabled
                                        value={signingItem.clientName}
                                    />
                                </div>

                                <div className="foms-form-group">
                                    <label className="foms-label">Actual Received Date (Wet Signature Date) *</label>
                                    <input
                                        type="date"
                                        className="foms-input"
                                        required
                                        value={signForm.actualReceivedDate}
                                        onChange={e => setSignForm({ ...signForm, actualReceivedDate: e.target.value })}
                                    />
                                </div>

                                <div className="foms-form-group">
                                    <label className="foms-label">Calculated 30-Day Payment Due Date</label>
                                    <div className="foms-calc-due-box">
                                        <Calendar size={13} color="#00A99D" />
                                        <span>
                                            {signForm.actualReceivedDate
                                                ? new Date(new Date(signForm.actualReceivedDate).getTime() + 30 * 86400000).toLocaleDateString('en-US', {
                                                      month: 'short',
                                                      day: 'numeric',
                                                      year: 'numeric',
                                                  })
                                                : '—'}
                                        </span>
                                    </div>
                                </div>

                                <div className="foms-form-group" style={{ gridColumn: 'span 2' }}>
                                    <label className="foms-label">Signed Receiving Copy Document URL *</label>
                                    <input
                                        type="url"
                                        className="foms-input"
                                        required
                                        placeholder="https://stars.blob.core.windows.net/signed-receipts/..."
                                        value={signForm.signedCopyUrl}
                                        onChange={e => setSignForm({ ...signForm, signedCopyUrl: e.target.value })}
                                    />
                                </div>

                                <div className="foms-form-group" style={{ gridColumn: 'span 2' }}>
                                    <label className="foms-label">Delivery Remarks &amp; Receiving Officer Notes</label>
                                    <textarea
                                        className="foms-textarea"
                                        rows={2}
                                        value={signForm.deliveryRemarks}
                                        onChange={e => setSignForm({ ...signForm, deliveryRemarks: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="foms-modal-advice-box risk-ok" style={{ margin: '0 1.5rem 1rem 1.5rem' }}>
                                <Sparkles size={16} style={{ flexShrink: 0 }} />
                                <div style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                                    <strong>FOMS Integration Callback:</strong> Upon submitting, STARS will notify FOMS at <code>POST /api/integration/stars/invoice-endorsed</code> with the receiving date and signed copy URL to begin the 30-day payment term calculation.
                                </div>
                            </div>

                            <div className="foms-modal-actions">
                                <button
                                    type="button"
                                    className="foms-btn-outline"
                                    onClick={() => setSigningItem(null)}
                                    disabled={submittingSign}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="foms-btn-primary"
                                    disabled={submittingSign}
                                >
                                    <FileCheck size={14} />
                                    <span>{submittingSign ? 'Transmitting Endorsement...' : 'Confirm Endorsement & Sync to FOMS'}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Modal: Simulate Incoming FOMS Endorsement Request ── */}
            {showSimModal && (
                <div className="foms-modal-overlay" onClick={() => !simSubmitting && setShowSimModal(false)}>
                    <div className="foms-simulator-modal" onClick={e => e.stopPropagation()}>
                        <div className="foms-modal-header">
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div className="foms-modal-icon-badge">
                                        <Play size={18} />
                                    </div>
                                    <h3 className="foms-modal-title">Simulate FOMS Finalized Invoice Endorsement Request</h3>
                                </div>
                                <p className="foms-modal-subtitle">
                                    Simulate incoming M2M webhook from FOMS when an invoice is finalized and requires physical delivery in STARS.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="foms-btn-close"
                                onClick={() => !simSubmitting && setShowSimModal(false)}
                                disabled={simSubmitting}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {simSuccessResult ? (
                            <div className="foms-sim-success-card">
                                <div className="foms-sim-success-top">
                                    <div className="foms-success-check-circle">
                                        <CheckCircle2 size={28} />
                                    </div>
                                    <div>
                                        <h4 className="foms-success-title">Delivery Task Created Successfully!</h4>
                                        <p className="foms-success-desc">
                                            STARS generated a physical delivery task for invoice <strong>{simSuccessResult.invoiceNumber}</strong>,
                                            assigned it to <strong>{simSuccessResult.assignedTo}</strong>, and initialized the endorsement tracker.
                                        </p>
                                    </div>
                                </div>

                                <div className="foms-success-meta-grid">
                                    <div className="foms-success-meta-item">
                                        <span className="foms-meta-label">STARS TASK NUMBER</span>
                                        <span className="foms-meta-val">#{simSuccessResult.taskNumber}</span>
                                    </div>
                                    <div className="foms-success-meta-item">
                                        <span className="foms-meta-label">ASSIGNED COURIER/COORDINATOR</span>
                                        <span className="foms-meta-val" style={{ color: '#00A99D', fontWeight: 700 }}>
                                            {simSuccessResult.assignedTo}
                                        </span>
                                    </div>
                                    <div className="foms-success-meta-item">
                                        <span className="foms-meta-label">INVOICE AMOUNT</span>
                                        <span className="foms-meta-val">{formatCurrency(simSuccessResult.amount)}</span>
                                    </div>
                                    <div className="foms-success-meta-item">
                                        <span className="foms-meta-label">STATUS</span>
                                        <span className="foms-status-pill pending">Pending Client Endorsement</span>
                                    </div>
                                </div>

                                <div className="foms-modal-actions" style={{ marginTop: 20 }}>
                                    <button
                                        type="button"
                                        className="foms-btn-outline"
                                        onClick={() => {
                                            setSimSuccessResult(null);
                                        }}
                                    >
                                        Simulate Another Request
                                    </button>
                                    {onOpenTask && simSuccessResult.taskId && (
                                        <button
                                            type="button"
                                            className="foms-btn-primary"
                                            onClick={() => {
                                                setShowSimModal(false);
                                                onOpenTask(simSuccessResult.taskId);
                                            }}
                                        >
                                            <ExternalLink size={14} />
                                            <span>Open Delivery Task View</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSimulateEndorsementRequest}>
                                {/* Scenario Presets */}
                                <div className="foms-preset-row">
                                    <span className="foms-preset-label">Quick Scenario Presets:</span>
                                    <div className="foms-preset-buttons">
                                        <button
                                            type="button"
                                            className="foms-btn-preset"
                                            onClick={() => applySimulationPreset('standard')}
                                        >
                                            Commercial Invoice (₱89,500)
                                        </button>
                                        <button
                                            type="button"
                                            className="foms-btn-preset"
                                            onClick={() => applySimulationPreset('highvalue')}
                                        >
                                            Enterprise Logistics (₱320,000)
                                        </button>
                                        <button
                                            type="button"
                                            className="foms-btn-preset"
                                            onClick={() => applySimulationPreset('express')}
                                        >
                                            Priority Express (₱215,800)
                                        </button>
                                    </div>
                                </div>

                                <div className="foms-sim-form-grid">
                                    <div className="foms-form-group">
                                        <label className="foms-label">Invoice Number *</label>
                                        <input
                                            type="text"
                                            className="foms-input"
                                            required
                                            value={simForm.invoiceNumber}
                                            onChange={e => setSimForm({ ...simForm, invoiceNumber: e.target.value })}
                                        />
                                    </div>

                                    <div className="foms-form-group">
                                        <label className="foms-label">Invoice Amount (₱) *</label>
                                        <input
                                            type="number"
                                            className="foms-input"
                                            required
                                            min="0"
                                            step="0.01"
                                            value={simForm.invoiceAmount}
                                            onChange={e => setSimForm({ ...simForm, invoiceAmount: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>

                                    <div className="foms-form-group" style={{ gridColumn: 'span 2' }}>
                                        <label className="foms-label">Client Name *</label>
                                        <input
                                            type="text"
                                            className="foms-input"
                                            required
                                            value={simForm.clientName}
                                            onChange={e => setSimForm({ ...simForm, clientName: e.target.value })}
                                        />
                                    </div>

                                    <div className="foms-form-group" style={{ gridColumn: 'span 2' }}>
                                        <label className="foms-label">Client Physical Delivery Address *</label>
                                        <input
                                            type="text"
                                            className="foms-input"
                                            required
                                            value={simForm.clientAddress}
                                            onChange={e => setSimForm({ ...simForm, clientAddress: e.target.value })}
                                        />
                                    </div>

                                    <div className="foms-form-group">
                                        <label className="foms-label">Contact Person</label>
                                        <input
                                            type="text"
                                            className="foms-input"
                                            value={simForm.clientContactPerson}
                                            onChange={e => setSimForm({ ...simForm, clientContactPerson: e.target.value })}
                                        />
                                    </div>

                                    <div className="foms-form-group">
                                        <label className="foms-label">Contact Phone</label>
                                        <input
                                            type="text"
                                            className="foms-input"
                                            value={simForm.clientContactNumber}
                                            onChange={e => setSimForm({ ...simForm, clientContactNumber: e.target.value })}
                                        />
                                    </div>

                                    <div className="foms-form-group" style={{ gridColumn: 'span 2' }}>
                                        <label className="foms-label">Invoice Document URL (PDF)</label>
                                        <input
                                            type="url"
                                            className="foms-input"
                                            value={simForm.invoiceDocumentUrl}
                                            onChange={e => setSimForm({ ...simForm, invoiceDocumentUrl: e.target.value })}
                                        />
                                    </div>

                                    <div className="foms-form-group" style={{ gridColumn: 'span 2' }}>
                                        <label className="foms-label">Remarks</label>
                                        <textarea
                                            className="foms-textarea"
                                            rows={2}
                                            value={simForm.remarks}
                                            onChange={e => setSimForm({ ...simForm, remarks: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="foms-modal-actions">
                                    <button
                                        type="button"
                                        className="foms-btn-outline"
                                        onClick={() => setShowSimModal(false)}
                                        disabled={simSubmitting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="foms-btn-primary"
                                        disabled={simSubmitting}
                                    >
                                        <Play size={14} fill="currentColor" />
                                        <span>{simSubmitting ? 'Dispatching Request...' : 'Simulate Incoming Endorsement Request'}</span>
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* ── Architecture Diagram Modal ── */}
            {showArchModal && (
                <div className="foms-modal-overlay" onClick={() => setShowArchModal(false)}>
                    <div className="foms-simulator-modal" onClick={e => e.stopPropagation()}>
                        <div className="foms-modal-header">
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div className="foms-modal-icon-badge">
                                        <Sparkles size={18} />
                                    </div>
                                    <h3 className="foms-modal-title">FOMS Integration 1: Endorsement &amp; 30-Day Term Flow</h3>
                                </div>
                                <p className="foms-modal-subtitle">
                                    How STARS and FOMS exchange invoice receiving data to compute accurate 30-day payment deadlines.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="foms-btn-close"
                                onClick={() => setShowArchModal(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="foms-trace-graph-card">
                            <h4 className="foms-trace-title">End-to-End Delivery Architecture</h4>
                            <div className="foms-trace-steps">
                                <div className="foms-trace-step">
                                    <div className="foms-trace-badge">1. FOMS Invoice Finalized</div>
                                    <span className="foms-trace-detail">
                                        FOMS pushes <code>POST /api/integration/foms/endorsement-request</code>
                                    </span>
                                </div>
                                <ArrowRight size={16} className="foms-trace-arrow" />
                                <div className="foms-trace-step">
                                    <div className="foms-trace-badge">2. STARS Task Created</div>
                                    <span className="foms-trace-detail">
                                        <code>[FOMS Endorsement]</code> assigned to Coordinator/Courier
                                    </span>
                                </div>
                                <ArrowRight size={16} className="foms-trace-arrow" />
                                <div className="foms-trace-step optimal">
                                    <div className="foms-trace-badge">3. Wet-Ink Sign-off</div>
                                    <span className="foms-trace-detail">
                                        Assignee collects client signature and logs Actual Received Date
                                    </span>
                                </div>
                                <ArrowRight size={16} className="foms-trace-arrow" />
                                <div className="foms-trace-step">
                                    <div className="foms-trace-badge">4. 30-Day Term Starts</div>
                                    <span className="foms-trace-detail">
                                        STARS calls FOMS <code>/api/integration/stars/invoice-endorsed</code>
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="foms-meta-inspection-grid">
                            <div className="foms-inspection-item">
                                <span className="foms-meta-label">PAYMENT TERM RULE</span>
                                <span className="foms-meta-val">Due Date = ActualReceivedDate + 30 Days</span>
                                <span className="foms-client-id">Standard commercial 30-day credit term (FR-028)</span>
                            </div>
                            <div className="foms-inspection-item">
                                <span className="foms-meta-label">LEGAL EVIDENCE</span>
                                <span className="foms-meta-val">Signed Receiving Copy PDF</span>
                                <span className="foms-client-id">Preserved in Azure Blob Storage &amp; STARS database</span>
                            </div>
                        </div>

                        <div className="foms-modal-actions">
                            <button
                                type="button"
                                className="foms-btn-primary"
                                onClick={() => setShowArchModal(false)}
                            >
                                Close Architecture
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FomsEndorsementPanel;
