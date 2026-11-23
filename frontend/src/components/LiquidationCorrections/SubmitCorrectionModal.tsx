import React, { useState, useEffect } from 'react';
import { X, FileText, AlertTriangle, Link as LinkIcon, Loader2, CheckCircle2 } from 'lucide-react';
import { SubmitCorrectionModalProps, SubmitLiquidationCorrectionPayload } from './types';
import api from '../../api';
import { useToast } from '../Toast/Toast';
import './LiquidationCorrections.css';

export const SubmitCorrectionModal: React.FC<SubmitCorrectionModalProps> = ({
    isOpen,
    task,
    onClose,
    onSubmitSuccess,
}) => {
    const { success: toastSuccess, error: toastError } = useToast();

    const [receiptUrl, setReceiptUrl] = useState<string>('');
    const [remarks, setRemarks] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && task) {
            setReceiptUrl(task.correctedReceiptsUrl || '');
            setRemarks(task.resolutionRemarks || '');
            setErrorMsg(null);
            setSubmitting(false);
        } else {
            setReceiptUrl('');
            setRemarks('');
            setErrorMsg(null);
            setSubmitting(false);
        }
    }, [isOpen, task]);

    if (!isOpen || !task) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedUrl = receiptUrl.trim();
        if (!trimmedUrl) {
            setErrorMsg('Corrected receipts URL is required.');
            return;
        }

        // Basic URL check
        if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
            setErrorMsg('Receipt URL must start with http:// or https://');
            return;
        }

        setSubmitting(true);
        setErrorMsg(null);

        const payload: SubmitLiquidationCorrectionPayload = {
            correctedReceiptsUrl: trimmedUrl,
            resolutionRemarks: remarks.trim() || undefined,
            remarks: remarks.trim() || undefined,
        };

        try {
            const taskId = task.taskId || task.id;
            const res = await api.post(`/api/foms-integration/liquidation-tasks/${taskId}/submit-correction`, payload);
            const responseData = res.data;

            if (responseData && (responseData.isSuccess === false || responseData.success === false)) {
                throw new Error(responseData.message || 'Failed to submit liquidation correction.');
            }

            toastSuccess(`Corrected receipts attached successfully for ${task.requestId}.`);

            const updatedTask = {
                ...task,
                correctedReceiptsUrl: trimmedUrl,
                resolutionRemarks: remarks.trim(),
                correctionStatus: 'Corrected',
                taskStatus: 'DonePendingReview',
            };

            if (onSubmitSuccess) {
                onSubmitSuccess(updatedTask);
            }
            onClose();
        } catch (err: any) {
            const message = err?.response?.data?.message || err?.message || 'Error submitting corrected receipts to FOMS.';
            setErrorMsg(message);
            toastError(message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="liq-modal-overlay" onClick={onClose} data-testid="submit-correction-modal">
            <div className="liq-modal-dialog" onClick={e => e.stopPropagation()}>
                <div className="liq-modal-header">
                    <div className="liq-modal-title">
                        <FileText size={18} color="#2563eb" />
                        <span>Attach Corrected Receipts</span>
                    </div>
                    <button
                        type="button"
                        className="liq-modal-close-btn"
                        onClick={onClose}
                        aria-label="Close modal"
                        data-testid="modal-close-btn"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="liq-modal-body">
                        {/* Requester & Delivery Metadata Drawer */}
                        <div className="liq-meta-drawer" data-testid="requester-metadata-drawer">
                            <div className="liq-meta-row">
                                <span className="liq-meta-label">Request ID:</span>
                                <span className="liq-meta-value">{task.requestId}</span>
                            </div>
                            <div className="liq-meta-row">
                                <span className="liq-meta-label">Requester:</span>
                                <span className="liq-meta-value">
                                    {task.requester}
                                    {task.requesterEmployeeId ? ` (${task.requesterEmployeeId})` : ''}
                                </span>
                            </div>
                            {task.deliveryReference && (
                                <div className="liq-meta-row">
                                    <span className="liq-meta-label">Delivery Reference:</span>
                                    <span className="liq-meta-value" style={{ color: '#2563eb' }}>
                                        {task.deliveryReference}
                                    </span>
                                </div>
                            )}
                            {task.amount != null && (
                                <div className="liq-meta-row">
                                    <span className="liq-meta-label">Disputed Amount:</span>
                                    <span className="liq-meta-value">
                                        ₱{Number(task.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Correction Reason Callout */}
                        <div className="liq-reason-callout" data-testid="correction-reason-callout">
                            <div className="liq-reason-header">
                                <AlertTriangle size={13} />
                                <span>Finance Manager Correction Reason</span>
                            </div>
                            <div className="liq-reason-body">
                                {task.correctionReason || 'Discrepancy reported on submitted receipts.'}
                            </div>
                        </div>

                        {/* Receipt URL Input */}
                        <div className="liq-form-group">
                            <label className="liq-form-label" htmlFor="correctedReceiptsUrl">
                                <span>Corrected Receipts Reference / URL *</span>
                                <span className="liq-form-label-sub">Blob Storage, Drive or Scanned PDF/Image URL</span>
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    id="correctedReceiptsUrl"
                                    type="text"
                                    className="liq-form-input"
                                    placeholder="https://speedex.blob.core.windows.net/receipts/LIQ-receipt.pdf"
                                    value={receiptUrl}
                                    onChange={e => setReceiptUrl(e.target.value)}
                                    data-testid="corrected-receipts-url-input"
                                    required
                                />
                            </div>
                        </div>

                        {/* Resolution Remarks */}
                        <div className="liq-form-group">
                            <label className="liq-form-label" htmlFor="resolutionRemarks">
                                <span>Resolution Remarks</span>
                                <span className="liq-form-label-sub">Notes for Finance Manager upon review</span>
                            </label>
                            <textarea
                                id="resolutionRemarks"
                                className="liq-form-textarea"
                                placeholder="e.g. Obtained official duplicate BIR receipt from station."
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                                data-testid="resolution-remarks-input"
                            />
                        </div>

                        {errorMsg && (
                            <div className="liq-error-text" data-testid="submission-error-msg">
                                {errorMsg}
                            </div>
                        )}
                    </div>

                    <div className="liq-modal-footer">
                        <button
                            type="button"
                            className="liq-btn liq-btn-outline"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="liq-btn liq-btn-primary"
                            disabled={submitting}
                            data-testid="submit-correction-confirm-btn"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={14} className="spin" />
                                    <span>Submitting...</span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={14} />
                                    <span>Submit Corrected Receipts</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default SubmitCorrectionModal;
