import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Brain, Loader2, AlertCircle, TrendingUp, Briefcase, ChevronDown, ChevronUp, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import { aiService, SuitabilityResponseDTO, SuitabilityExplanationDTO, SlaRiskResponseDTO } from '../../services/aiService';
import './AiRecommendationPanel.css';

interface AiRecommendationPanelProps {
    taskId: string;
}

const ROLE_LABELS: Record<string, string> = {
    '0': 'Manager', '1': 'Coordinator', '2': 'Dispatcher', '3': 'Encoder', '4': 'Courier',
};

const PAGE_SIZE = 5;

const AiRecommendationPanel: React.FC<AiRecommendationPanelProps> = ({ taskId }) => {
    const [suitability, setSuitability] = useState<SuitabilityResponseDTO[]>([]);
    const [slaRisk, setSlaRisk] = useState<SlaRiskResponseDTO | null>(null);
    const [explanations, setExplanations] = useState<Record<string, SuitabilityExplanationDTO[]>>({});
    const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [slaLoading, setSlaLoading] = useState(true);

    // Pagination state
    const [pageNumber, setPageNumber] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [totalPages, setTotalPages] = useState(0);

    const fetchData = useCallback(async (page: number) => {
        setLoading(true);
        setError('');
        try {
            const res = await aiService.getSuitability(taskId, page, PAGE_SIZE);
            const json = res.data;
            if (json.isSuccess && json.data) {
                setSuitability(json.data.items ?? []);
                setTotalCount(json.data.totalCount ?? 0);
                setTotalPages(json.data.totalPages ?? 0);
            } else {
                setSuitability([]);
                setTotalCount(0);
                setTotalPages(0);
            }
        } catch {
            setError('AI recommendation temporarily unavailable.');
            setSuitability([]);
            setTotalCount(0);
            setTotalPages(0);
        } finally {
            setLoading(false);
        }
    }, [taskId]);

    const fetchSlaRisk = useCallback(async () => {
        setSlaLoading(true);
        try {
            const res = await aiService.getSlaRisk(taskId);
            setSlaRisk(res.data);
        } catch {
            setSlaRisk(null);
        } finally {
            setSlaLoading(false);
        }
    }, [taskId]);

    useEffect(() => { fetchData(pageNumber); }, [fetchData, pageNumber]);
    useEffect(() => { fetchSlaRisk(); }, [fetchSlaRisk]);

    const handlePageChange = (page: number) => {
        if (page < 1 || (totalPages > 0 && page > totalPages)) return;
        setPageNumber(page);
        setExpandedEmp(null);
    };

    const handleToggleExplain = async (empId: string) => {
        if (expandedEmp === empId) {
            setExpandedEmp(null);
            return;
        }
        if (!explanations[empId]) {
            try {
                const res = await aiService.getSuitabilityExplanation(taskId, empId);
                const json = res.data;
                if (json.isSuccess && Array.isArray(json.data)) {
                    setExplanations(prev => ({ ...prev, [empId]: json.data }));
                }
            } catch {
                setExplanations(prev => ({ ...prev, [empId]: [] }));
            }
        }
        setExpandedEmp(empId);
    };

    const getRoleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

    const topCandidateId = useMemo(() => {
        if (pageNumber !== 1 || suitability.length === 0) return null;
        const rank1 = suitability.find(s => s.rank === 1);
        return rank1 ? rank1.employeeId : suitability[0].employeeId;
    }, [pageNumber, suitability]);

    return (
        <div className="ai-panel">
            <div className="ai-header">
                <Brain size={14} className="ai-header-icon" />
                <span className="ai-title">AI Insights</span>
                <span className="ai-subtitle">Groq AI</span>
            </div>

            <div className="ai-body">
                {error && (
                    <div className="ai-error"><AlertCircle size={14} /> {error}</div>
                )}

                {/* ── SLA Risk Section ── */}
                {!slaLoading && slaRisk && (
                    <div className="ai-risk-section">
                        <div className="ai-risk-header">
                            <span className="ai-risk-label"><TrendingUp size={12} /> SLA Risk Prediction</span>
                            <span className={`ai-risk-level ai-risk-${slaRisk.riskLevel}`}>{slaRisk.riskLevel}</span>
                        </div>
                        <div className="ai-risk-confidence">
                            Confidence: {(slaRisk.confidenceScore * 100).toFixed(0)}%
                        </div>
                        {slaRisk.keyFactors.length > 0 && (
                            <div className="ai-risk-factors">
                                {slaRisk.keyFactors.map((f, i) => (
                                    <span key={i} className="ai-risk-factor">{f}</span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Suitability Rankings ── */}
                <div className="ai-section-title">
                    <Zap size={14} /> Suitable Employees
                    {totalCount > 0 && <span className="ai-section-count">{totalCount} total</span>}
                </div>

                {loading ? (
                    <div className="ai-loading"><Loader2 size={14} className="ai-spin" /> Analyzing...</div>
                ) : suitability.length === 0 && !error ? (
                    <div className="ai-empty">No suitability data available.</div>
                ) : (
                    <>
                        {suitability.map((emp, idx) => (
                            <div key={emp.employeeId}>
                                <div className="ai-rec-card">
                                    <div className="ai-rec-card-top">
                                        <div className="ai-rec-card-row">
                                            <span className="ai-rec-card-name">{emp.fullName}</span>
                                            <span className="ai-rec-card-number">{emp.employeeNumber}</span>
                                            <span className="ai-rec-card-role">{getRoleLabel(emp.role)}</span>
                                            <span className="ai-rank-badge">#{emp.rank ?? ((pageNumber - 1) * PAGE_SIZE + idx + 1)}</span>
                                            {emp.employeeId === topCandidateId && <span className="ai-best-badge"><Zap size={10} /> Best Pick</span>}
                                        </div>
                                        {emp.rationale && (
                                            <div className="ai-rec-card-rationale">
                                                <span className="ai-rationale-tag">AI Rationale:</span> {emp.rationale}
                                            </div>
                                        )}
                                        <div className="ai-rec-card-meta">
                                            <span className="ai-rec-meta-item"><Briefcase size={10} /> {emp.workload} active</span>
                                            <button className="ai-explain-btn" onClick={() => handleToggleExplain(emp.employeeId)}>
                                                {expandedEmp === emp.employeeId ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                                {expandedEmp === emp.employeeId ? 'Hide details' : 'Why this score?'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="ai-rec-card-score">
                                        <div className="ai-rec-score-value">{emp.suitabilityScore.toFixed(4)}</div>
                                        <div className="ai-rec-score-label">score</div>
                                    </div>
                                </div>

                                {expandedEmp === emp.employeeId && (
                                    <div className="ai-explain-box">
                                        {emp.rationale && (
                                            <div className="ai-explain-rationale">
                                                <strong>AI Evaluation:</strong> {emp.rationale}
                                            </div>
                                        )}
                                        {explanations[emp.employeeId]?.length > 0 ? (
                                            explanations[emp.employeeId].map((exp, i) => (
                                                <div key={i}>{exp.explanation}</div>
                                            ))
                                        ) : (
                                            <div>
                                                Score = {emp.suitabilityScore.toFixed(4)} evaluated against verified system metrics: workload ({emp.workload} active
                                                tasks), completed task experience, and performance recommendation ratings.
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* ── Pagination ── */}
                        {totalPages > 1 && (
                            <div className="ai-pagination">
                                <button
                                    className="ai-page-btn"
                                    disabled={pageNumber <= 1}
                                    onClick={() => handlePageChange(pageNumber - 1)}
                                >
                                    <ChevronLeft size={13} />
                                </button>
                                {getPageNumbers(pageNumber, totalPages).map((p, i) =>
                                    p === -1 ? (
                                        <span key={`ellipsis-${i}`} className="ai-page-ellipsis">…</span>
                                    ) : (
                                        <button
                                            key={p}
                                            className={`ai-page-btn ai-page-num${pageNumber === p ? ' active' : ''}`}
                                            onClick={() => handlePageChange(p)}
                                        >
                                            {p}
                                        </button>
                                    )
                                )}
                                <button
                                    className="ai-page-btn"
                                    disabled={pageNumber >= totalPages}
                                    onClick={() => handlePageChange(pageNumber + 1)}
                                >
                                    <ChevronRight size={13} />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="ai-unavailable">
                <AlertCircle size={12} />
                AI is advisory. Task creation works with or without these suggestions.
            </div>
        </div>
    );
};

function getPageNumbers(current: number, total: number): number[] {
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [];
    pages.push(1);
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push(-1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push(-1);
    pages.push(total);
    return pages;
}

export default AiRecommendationPanel;
