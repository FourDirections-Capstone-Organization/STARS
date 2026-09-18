import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    UserCircle2, Users, Building, Search, CheckCircle2, AlertCircle,
    Loader2, X, Lock, Save, Lightbulb, Activity, Bell, FileText, Calendar,
    Shield, ChevronRight, ChevronLeft, Clock, Briefcase, ExternalLink,
    Brain, TrendingUp, Zap, ChevronDown, ChevronUp
} from 'lucide-react';
import './AIAssignmentView.css';
import api from '../../api';
import { useToast } from '../../components/Toast/Toast';
import FormModal from '../../components/FormModal/FormModal';
import { aiService, SlaRiskResponseDTO } from '../../services/aiService';
import { AI_ANALYTICS_ENABLED } from '../../config/features';

// ─── Types ───────────────────────────────────────────────────────────────

type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';
type TaskStatus = 'Draft' | 'Assigned' | 'Pending' | 'In Progress' | 'Pending Admin Review' | 'Done' | 'Completed' | 'Overdue';
type AssignmentScope = 'SingleEmployee' | 'Team' | 'Department';

interface AvailableEmployee {
    employeeId: string;
    employeeName: string;
    employeeNumber: string;
    role: string;
    department: string;
    departmentId: string;
    activeTaskCount: number;
    availabilityStatus: string;
    isAvailable: boolean;
}

// ─── Duplicate warning types (U-001) ───────────────────────────────────────

interface DuplicateMatchDTO {
    taskId: string;
    title: string;
    status: string;
    similarityPercentage: number;
}

interface TeamInfo {
    teamId: string;
    teamName: string;
    memberCount: number;
    memberNames: string[];
    isActive: boolean;
    departmentId: string;
    departmentName: string;
}

interface DepartmentInfo {
    departmentId: string;
    name: string;
    code: string;
    isActive: boolean;
    employeeCount: number;
    headEmployeeName: string;
}

interface NotificationPreview {
    userId: string;
    userName: string;
    notificationType: string;
    channel: string;
}

interface AuditLogEntry {
    action: string;
    entityType: string;
    entityId: string;
    details: string;
}

const DEPARTMENTS_MOCK: DepartmentInfo[] = [
    { departmentId: 'dept-001', name: 'Operations', code: 'OPS', isActive: true, employeeCount: 24, headEmployeeName: 'Maria Santos' },
    { departmentId: 'dept-002', name: 'Logistics', code: 'LOG', isActive: true, employeeCount: 18, headEmployeeName: 'Juan dela Cruz' },
    { departmentId: 'dept-003', name: 'IT & Admin', code: 'ITA', isActive: true, employeeCount: 12, headEmployeeName: 'Ana Reyes' },
    { departmentId: 'dept-004', name: 'Inactive Dept', code: 'INA', isActive: false, employeeCount: 0, headEmployeeName: '' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

const getInitials = (name: string): string => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
};

const PRIORITY_LEVELS: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
const PRIORITY_MAP: Record<string, number> = { Urgent: 3, High: 2, Medium: 1, Low: 0 };

const CLASSIFICATION_OPTIONS = [
    { label: 'Routine Daily Task', value: 0 },
    { label: 'Special Task', value: 1 },
];

const CATEGORIES = ['Operations', 'Logistics', 'IT & Admin', 'Customer Service', 'Maintenance', 'Other'];

const formatDateForInput = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// ─── Component ────────────────────────────────────────────────────────────

interface AIAssignmentViewProps {
    onBack?: () => void;
    onTaskCreated?: () => void;
}

const AIAssignmentView: React.FC<AIAssignmentViewProps> = ({ onBack, onTaskCreated }) => {
    const { success, error } = useToast();

    // ── Form State ──
    const [step, setStep] = useState<'form' | 'summary' | 'submitted'>('form');
    const [form, setForm] = useState({
        taskTitle: '',
        taskDescription: '',
        dueAt: '',
        priority: '' as Priority | '',
        classification: -1 as number,
        category: '',
        isConfidential: false,
    });
    const [scope, setScope] = useState<AssignmentScope | null>(null);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState('');

    // ── Data State ──
    const [employees, setEmployees] = useState<AvailableEmployee[]>([]);
    const [departments, setDepartments] = useState<DepartmentInfo[]>(DEPARTMENTS_MOCK);
    const [teams, setTeams] = useState<TeamInfo[]>([]);
    const [loadingTeams, setLoadingTeams] = useState(false);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [loadingDepartments, setLoadingDepartments] = useState(false);
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ── Duplicate task warning (U-001) ────────────────────────────────────────
    const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateMatchDTO[]>([]);
    const [pendingPayload, setPendingPayload] = useState<any>(null);
    const [aiEnabled, setAiEnabled] = useState(false);

    // AI & Analytics is disabled for the meantime — force the AI assistance off.
    useEffect(() => {
        if (!AI_ANALYTICS_ENABLED) setAiEnabled(false);
    }, []);

    // ── Validation & Summary State ──
    const [validationResult, setValidationResult] = useState<{
        destinationValid: boolean;
        employeeAvailable: boolean;
        message: string;
    } | null>(null);
    const [notificationsPreview, setNotificationsPreview] = useState<NotificationPreview[]>([]);
    const [auditLogPreview, setAuditLogPreview] = useState<AuditLogEntry | null>(null);

    const isUrgent = form.priority === 'Urgent';
    const slaLocked = isUrgent;

    // ── AI State ──
    const [aiScores, setAiScores] = useState<Record<string, { score: number; workload: number }>>({});
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiSlaRisk, setAiSlaRisk] = useState<SlaRiskResponseDTO | null>(null);
    const [aiExplainedEmp, setAiExplainedEmp] = useState<string | null>(null);
    const [aiExplanations, setAiExplanations] = useState<Record<string, string>>({});

    // ── Fetch Data ──
    const fetchEmployees = useCallback(async () => {
        try {
            const res = await api.get('/api/Task/assignable-users?pageNumber=1&pageSize=100');
            const json = res.data;
            const list: any[] = json.isSuccess && Array.isArray(json.data?.items)
                ? json.data.items
                : json.isSuccess && Array.isArray(json.data)
                    ? json.data
                    : [];
            const mapped: AvailableEmployee[] = list.map((emp: any) => ({
                employeeId: emp.userId ?? emp.UserId ?? emp.id ?? emp.accountId ?? '',
                employeeName: emp.fullName ?? emp.FullName ?? emp.employeeName ?? '',
                employeeNumber: emp.employeeNumber ?? '',
                role: emp.role ?? emp.Role ?? '',
                department: emp.department ?? emp.Department ?? '',
                departmentId: emp.departmentId ?? '',
                activeTaskCount: typeof emp.workload === 'number' ? emp.workload : 0,
                availabilityStatus: emp.availabilityStatus ?? emp.AvailabilityStatus ?? 'Active',
                isAvailable: emp.isAvailable ?? emp.IsAvailable ?? true,
            }));
            setEmployees(mapped.filter(e => e.employeeName));
        } catch {
            console.warn('[AIAssignment] Failed to fetch employees, using empty list');
            setEmployees([]);
        }
    }, []);

    // Initial fetch + polling for real-time availability updates (Req #5)
    useEffect(() => {
        const initialFetch = async () => {
            setLoadingEmployees(true);
            try {
                await fetchEmployees();
            } finally {
                setLoadingEmployees(false);
            }
        };
        initialFetch();
        const interval = setInterval(fetchEmployees, 20000);
        return () => clearInterval(interval);
    }, [fetchEmployees]);

    useEffect(() => {
        const fetchDepartments = async () => {
            setLoadingDepartments(true);
            try {
                const res = await api.get('/api/Department');
                const json = res.data;
                if (json.isSuccess && json.data?.items) {
                    const mapped: DepartmentInfo[] = json.data.items.map((d: any) => ({
                        departmentId: d.id ?? d.departmentId,
                        name: d.name ?? d.departmentName,
                        code: d.code ?? '',
                        isActive: d.isActive ?? d.status === 'Active',
                        employeeCount: d.userCount ?? d.employeeCount ?? 0,
                        headEmployeeName: d.headEmployeeName ?? '',
                    }));
                    setDepartments(mapped.length > 0 ? mapped : DEPARTMENTS_MOCK);
                } else {
                    setDepartments(DEPARTMENTS_MOCK);
                }
            } catch {
                console.warn('[AIAssignment] Failed to fetch departments, using mock');
                setDepartments(DEPARTMENTS_MOCK);
            } finally {
                setLoadingDepartments(false);
            }
        };

        fetchDepartments();
    }, []);

    // ── Fetch real teams (from Team Management) ──
    useEffect(() => {
        const fetchTeams = async () => {
            setLoadingTeams(true);
            try {
                const res = await api.get('/api/Team?pageNumber=1&pageSize=100');
                const json = res.data;
                if (json.isSuccess && json.data?.items) {
                    const mapped: TeamInfo[] = json.data.items.map((t: any) => ({
                        teamId: t.id ?? t.teamId,
                        teamName: t.name ?? t.teamName,
                        memberCount: t.memberCount ?? t.members?.length ?? 0,
                        memberNames: (t.members ?? []).map((m: any) => m.fullName ?? ''),
                        isActive: t.isActive ?? true,
                        departmentId: t.departmentId ?? '',
                        departmentName: t.departmentName ?? '',
                    }));
                    setTeams(mapped.filter(t => t.isActive));
                } else {
                    setTeams([]);
                }
            } catch {
                console.warn('[AIAssignment] Failed to fetch teams');
                setTeams([]);
            } finally {
                setLoadingTeams(false);
            }
        };

        fetchTeams();
    }, []);

    // ── Fetch AI suitability when enabled ──
    useEffect(() => {
        if (!aiEnabled) { setAiScores({}); setAiSlaRisk(null); setAiError(''); return; }
        let cancelled = false;
        setAiLoading(true);
        setAiError('');

        const classification = form.classification >= 0 ? form.classification : 0;

        if (selectedDepartmentId) {
            // Fetch for selected department
            const url = `/api/suitability/preview?departmentId=${selectedDepartmentId}&classification=${classification}&pageNumber=1&pageSize=50`;
            api.get(url).then((res: any) => {
                if (cancelled) return;
                const json = res.data;
                if (json.isSuccess && json.data?.items) {
                    const scores: Record<string, { score: number; workload: number }> = {};
                    json.data.items.forEach((item: any) => {
                        scores[item.employeeId] = { score: item.suitabilityScore, workload: item.workload };
                    });
                    setAiScores(scores);
                    setAiError('');
                } else {
                    setAiError('AI recommendation temporarily unavailable.');
                }
            }).catch(() => { if (!cancelled) setAiError('AI recommendation temporarily unavailable.'); })
              .finally(() => { if (!cancelled) setAiLoading(false); });
        } else {
            // No department selected — fetch for ALL departments and merge
            const deptIds = [...new Set(employees.filter(e => e.isAvailable).map(e => e.departmentId).filter(Boolean))];
            if (deptIds.length === 0) { setAiLoading(false); return; }

            const results: Record<string, { score: number; workload: number }> = {};
            let completed = 0;
            let anyFailed = false;

            deptIds.forEach((deptId: string) => {
                const url = `/api/suitability/preview?departmentId=${deptId}&classification=${classification}&pageNumber=1&pageSize=50`;
                api.get(url).then((res: any) => {
                    if (cancelled) return;
                    const json = res.data;
                    if (json.isSuccess && json.data?.items) {
                        json.data.items.forEach((item: any) => {
                            results[item.employeeId] = { score: item.suitabilityScore, workload: item.workload };
                        });
                    } else {
                        anyFailed = true;
                    }
                }).catch(() => { anyFailed = true; }).finally(() => {
                    completed++;
                    if (!cancelled && completed >= deptIds.length) {
                        setAiScores(results);
                        setAiError(anyFailed ? 'Some AI recommendations unavailable. Results may be incomplete.' : '');
                        setAiLoading(false);
                    }
                });
            });
        }

        // SLA risk based on priority
        if (isUrgent) {
            setAiSlaRisk({ taskId: '', riskLevel: 'Medium', confidenceScore: 0.6, keyFactors: ['Urgent priority task'] });
        } else {
            setAiSlaRisk({ taskId: '', riskLevel: 'Low', confidenceScore: 0.8, keyFactors: ['Non-urgent priority'] });
        }

        return () => { cancelled = true; };
    }, [selectedDepartmentId, form.classification, isUrgent, employees, aiEnabled]);

    // ── Derived Data ──
    const filteredEmployees = useMemo(() => {
        const available = employees.filter(e => e.isAvailable);
        if (!employeeSearch) return available;
        return available.filter(e =>
            e.employeeName.toLowerCase().includes(employeeSearch.toLowerCase())
        );
    }, [employees, employeeSearch]);

    const selectedEmployee = useMemo(() =>
        employees.find(e => e.employeeId === selectedEmployeeId),
        [employees, selectedEmployeeId]
    );

    const selectedTeam = useMemo(() =>
        teams.find(t => t.teamId === selectedTeamId),
        [teams, selectedTeamId]
    );

    const selectedDepartment = useMemo(() =>
        departments.find(d => d.departmentId === selectedDepartmentId),
        [departments, selectedDepartmentId]
    );

    // ── Validation ──
    const validateField = (key: string, value: string | number): string => {
        switch (key) {
            case 'taskTitle': {
                const v = String(value).trim();
                if (!v) return 'Task title is required.';
                if (v.length < 3) return 'Title must be at least 3 characters.';
                if (v.length > 150) return 'Title must not exceed 150 characters.';
                return '';
            }
            case 'taskDescription': {
                const v = String(value).trim();
                if (!v) return 'Task description is required.';
                if (v.length > 2000) return 'Description must not exceed 2,000 characters.';
                return '';
            }
            case 'dueAt': {
                if (slaLocked) return '';
                if (!value) return 'Deadline is required.';
                const selected = new Date(String(value));
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (selected < today) return 'Deadline must not be in the past.';
                return '';
            }
            case 'priority': {
                if (!value || value === -1) return 'Priority is required.';
                return '';
            }
            case 'classification': {
                const v = Number(value);
                if (v !== 0 && v !== 1) return 'Classification is required.';
                return '';
            }
            default:
                return '';
        }
    };

    const validateAll = (): boolean => {
        const newErrors: Record<string, string> = {};
        ['taskTitle', 'taskDescription', 'dueAt', 'priority', 'classification'].forEach(key => {
            const msg = validateField(key, (form as any)[key] ?? '');
            if (msg) newErrors[key] = msg;
        });
        if (!scope) {
            newErrors.scope = 'Please select an assignment scope.';
        }
        if (scope === 'SingleEmployee' && !selectedEmployeeId) {
            newErrors.destination = 'Please select an employee.';
        }
        if (scope === 'Team' && !selectedTeamId) {
            newErrors.destination = 'Please select a team.';
        }
        if (scope === 'Department' && !selectedDepartmentId) {
            newErrors.destination = 'Please select a department.';
        }
        setErrors(newErrors);

        if (Object.keys(newErrors).length > 0) {
            // Surface a visible alert listing what is still missing so the
            // user knows the review was blocked. Cleared on the next attempt
            // or when validation passes.
            const labelMap: Record<string, string> = {
                taskTitle: 'Task Title',
                taskDescription: 'Task Description',
                dueAt: 'Deadline',
                priority: 'Priority',
                classification: 'Classification',
                scope: 'Assignment Scope',
                destination: 'Select Employee',
            };
            const missing = Object.keys(newErrors)
                .map(key => labelMap[key] ?? key)
                .join(', ');
            setFormError(`Missing required information: ${missing}. Please complete the highlighted fields.`);
            return false;
        }

        return true;
    };

    // ── Destination Validation (Step 8) ──
    const validateDestination = (): boolean => {
        if (!scope) {
            setFormError('No scope selected.');
            return false;
        }

        if (scope === 'SingleEmployee') {
            if (!selectedEmployee) {
                setFormError('Selected employee does not exist.');
                setValidationResult({ destinationValid: false, employeeAvailable: false, message: 'Employee not found.' });
                return false;
            }
            const isActive = employees.some(e => e.employeeId === selectedEmployeeId);
            if (!isActive) {
                setFormError('Employee record is inactive or does not exist.');
                setValidationResult({ destinationValid: false, employeeAvailable: false, message: 'Employee is inactive or does not exist.' });
                return false;
            }
            if (!selectedEmployee.isAvailable) {
                setFormError(`${selectedEmployee.employeeName} is currently ${selectedEmployee.availabilityStatus} and cannot be assigned.`);
                setValidationResult({ destinationValid: true, employeeAvailable: false, message: `${selectedEmployee.employeeName} is ${selectedEmployee.availabilityStatus}.` });
                return false;
            }
            setValidationResult({ destinationValid: true, employeeAvailable: true, message: 'Employee is active and available.' });
            return true;
        }

        if (scope === 'Team') {
            const team = teams.find(t => t.teamId === selectedTeamId);
            if (!team) {
                setFormError('Selected team does not exist.');
                setValidationResult({ destinationValid: false, employeeAvailable: false, message: 'Team not found.' });
                return false;
            }
            if (!team.isActive) {
                setFormError(`Team "${team.teamName}" is inactive and cannot be assigned to.`);
                setValidationResult({ destinationValid: false, employeeAvailable: false, message: 'Team is inactive.' });
                return false;
            }
            setValidationResult({ destinationValid: true, employeeAvailable: true, message: `Team "${team.teamName}" is active (${team.memberCount} members).` });
            return true;
        }

        if (scope === 'Department') {
            const dept = departments.find(d => d.departmentId === selectedDepartmentId);
            if (!dept) {
                setFormError('Selected department does not exist.');
                setValidationResult({ destinationValid: false, employeeAvailable: false, message: 'Department not found.' });
                return false;
            }
            if (!dept.isActive) {
                setFormError(`Department "${dept.name}" is inactive and cannot be assigned to.`);
                setValidationResult({ destinationValid: false, employeeAvailable: false, message: 'Department is inactive.' });
                return false;
            }
            setValidationResult({ destinationValid: true, employeeAvailable: true, message: `Department "${dept.name}" is active (${dept.employeeCount} employees).` });
            return true;
        }

        return false;
    };

    // ── Build Notification Preview (Step 10) ──
    const buildNotificationsPreview = () => {
        const list: NotificationPreview[] = [];
        if (scope === 'SingleEmployee' && selectedEmployee) {
            list.push({
                userId: selectedEmployee.employeeId,
                userName: selectedEmployee.employeeName,
                notificationType: 'TaskAssigned',
                channel: 'In-App + Email',
            });
        }
        if (scope === 'Team' && selectedTeam) {
            selectedTeam.memberNames.forEach(name => {
                list.push({
                    userId: name,
                    userName: name,
                    notificationType: 'TaskAssigned',
                    channel: 'In-App + Email',
                });
            });
        }
        if (scope === 'Department' && selectedDepartment) {
            list.push({
                userId: selectedDepartment.departmentId,
                userName: `${selectedDepartment.name} (${selectedDepartment.employeeCount} employees)`,
                notificationType: 'TaskAssigned',
                channel: 'In-App + Email (Department-wide)',
            });
        }
        setNotificationsPreview(list);
    };

    // ── Build Audit Log Preview (Step 11) ──
    const buildAuditLogPreview = () => {
        const scopeLabel = scope === 'SingleEmployee' ? 'Single Employee' : scope === 'Team' ? 'Team' : 'Department';
        const destName = selectedEmployee?.employeeName || selectedTeam?.teamName || selectedDepartment?.name || 'Unknown';
        setAuditLogPreview({
            action: 'Task Created & Assigned',
            entityType: 'Task',
            entityId: `AI-${Date.now().toString(36).toUpperCase()}`,
            details: `Assignment Scope: ${scopeLabel}, Destination: ${destName}, Task: "${form.taskTitle.trim()}"`,
        });
    };

    // ── Go to Summary (Step 7 → 8) ──
    const handleReview = () => {
        setFormError('');
        setValidationResult(null);
        setNotificationsPreview([]);
        setAuditLogPreview(null);

        if (!validateAll()) return;

        // Run destination validation
        const isValid = validateDestination();
        if (!isValid) return;

        // Build previews
        buildNotificationsPreview();
        buildAuditLogPreview();
        setStep('summary');
    };

    // ── Submit (Step 9) with pre-submit availability re-validation (Req #4) ──
    // ── U-001: record the coordinator's duplicate-warning decision ──────────
    const recordDupDecision = async (decision: 'continue' | 'cancel', payload: any) => {
        try {
            await api.post('/api/Duplicate/decision', {
                title: payload.title,
                description: payload.description,
                decision,
                matchCount: duplicateWarnings.length,
                topSimilarity: duplicateWarnings[0]?.similarityPercentage ?? null,
                matchedTaskIds: duplicateWarnings.map(d => d.taskId),
            });
        } catch {
            // audit logging must never break the flow
        }
    };

    const handleDupContinue = async () => {
        const payload = pendingPayload;
        setPendingPayload(null);
        setDuplicateWarnings([]);
        if (payload) {
            await recordDupDecision('continue', payload);
            await submitTask(payload);
        }
    };

    const handleDupCancel = async () => {
        const payload = pendingPayload;
        setPendingPayload(null);
        setDuplicateWarnings([]);
        if (payload) await recordDupDecision('cancel', payload);
        setSubmitting(false);
    };

    const submitTask = async (payload: any) => {
        setSubmitting(true);
        try {
            const res = await api.post('/api/Task', payload);
            const created = res.data;
            const taskId = created?.data?.id ?? created?.id ?? created?.data?.Id;

            // Upload supporting documents (one or more files) if provided
            if (taskId && supportingFiles.length > 0) {
                const results = await Promise.allSettled(supportingFiles.map(async (file) => {
                    const fileFormData = new FormData();
                    fileFormData.append('file', file);
                    await api.upload(`/api/tasks/${taskId}/attachments`, fileFormData);
                }));
                const failed = results.filter(r => r.status === 'rejected').length;
                const uploaded = results.length - failed;
                setSupportingFiles([]);
                if (failed > 0) {
                    error(`${uploaded} attachment(s) uploaded, ${failed} failed.`);
                }
            }
            const createdTitle = created?.data?.title ?? created?.title ?? created?.data?.Title ?? payload.title;
            setStep('submitted');
            success(`Task "${createdTitle}" assigned successfully — Neo4j graph updated, notifications sent, audit log recorded.`);
            // Notify the parent dashboard so the Task List tab refreshes immediately
            if (onTaskCreated) onTaskCreated();
        } catch (err: any) {
            const status = err.response?.status;
            const serverMsg = err.response?.data?.message || err.response?.data?.Message || err.response?.data?.title || '';
            const detail = err.response?.data?.errors ? Object.values(err.response.data.errors).flat().join('. ') : '';
            const fallback = status === 500 ? 'Server error. Please check task data and try again.' : 'Failed to create task assignment.';
            setFormError(serverMsg || detail || fallback);
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async () => {
        setFormError('');

        // Re-validate availability at submission moment — status may have changed since review
        if (scope === 'SingleEmployee' && selectedEmployeeId) {
            const freshEmp = employees.find(e => e.employeeId === selectedEmployeeId);
            if (!freshEmp) {
                setFormError('Selected employee no longer exists. Please go back and re-select.');
                setSubmitting(false);
                return;
            }
            if (!freshEmp.isAvailable) {
                setFormError(`${freshEmp.employeeName} is now ${freshEmp.availabilityStatus} and cannot be assigned. Availability changed since review.`);
                setSubmitting(false);
                return;
            }
        }

        setSubmitting(true);

        const scopeNum = scope === 'SingleEmployee' ? 0 : scope === 'Team' ? 1 : 2;

        const payload = {
            title: form.taskTitle.trim(),
            description: form.taskDescription.trim(),
            priorityLevel: PRIORITY_MAP[form.priority as Priority] ?? 1,
            classification: form.classification,
            assignmentScope: scopeNum,
            deadline: form.dueAt ? new Date(form.dueAt).toISOString() : null,
            assignedUserIds: scope === 'SingleEmployee' ? [selectedEmployeeId] : [],
            assignedDepartmentId: scope === 'Department' ? selectedDepartmentId : undefined,
            teamId: scope === 'Team' ? selectedTeamId : undefined,
            isConfidential: form.isConfidential,
        };

        // U-001 steps 3-5: analyze title/description for similarity against
        // existing tasks and flag potential duplicates before creating.
        try {
            const checkRes = await api.post('/api/Duplicate/check', { title: payload.title, description: payload.description });
            const checkJson = checkRes.data;
            if (checkJson?.isSuccess && checkJson?.data?.hasDuplicates && checkJson.data.matches?.length > 0) {
                setDuplicateWarnings(checkJson.data.matches);
                setPendingPayload(payload);
                return; // wait for the coordinator's decision (steps 6-9)
            }
        } catch {
            // duplicate check failed — proceed with creation
        }

        await submitTask(payload);
    };

    // ── Event Handlers ──
    const setFormField = (key: keyof typeof form) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
            const val = e.target.value;
            setForm(prev => ({ ...prev, [key]: val }));
            setFormError('');
            const msg = validateField(key, val);
            setErrors(prev => ({ ...prev, [key]: msg }));
        };

    const handleScopeSelect = (s: AssignmentScope) => {
        setScope(s);
        setSelectedEmployeeId('');
        setSelectedTeamId('');
        setSelectedDepartmentId('');
        setErrors(prev => ({ ...prev, scope: '', destination: '' }));
        setValidationResult(null);
        setNotificationsPreview([]);
        setAuditLogPreview(null);
        setStep('form');
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (e.target.value) e.target.value = '';
        if (files.length === 0) return;
        const allowed = ['pdf', 'docx', 'xlsx', 'jpg', 'jpeg', 'png'];
        for (const file of files) {
            const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
            if (!allowed.includes(ext)) {
                setFormError('Invalid file format. Allowed: PDF, DOCX, XLSX, JPG, PNG.');
                return;
            }
            if (file.size > 20 * 1024 * 1024) {
                setFormError('File size must not exceed 20MB.');
                return;
            }
        }
        setFormError('');
        setSupportingFiles(files);
    };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const minDateTime = formatDateForInput(todayStart);

    const getSlaDeadline = () => {
        const d = new Date();
        d.setHours(d.getHours() + 24);
        return d;
    };

    // ── Render: Field Error ──
    const FieldErr = ({ name }: { name: string }) =>
        errors[name] ? (
            <span className="ai-field-error">
                <AlertCircle size={11} />{errors[name]}
            </span>
        ) : null;

    const CharCount = ({ value, max }: { value: string; max: number }) => (
        <span className={`ai-char-count${value.length > max * 0.9 ? ' warn' : ''}${value.length >= max ? ' error' : ''}`}>
            {value.length}/{max}
        </span>
    );

    // ── Render: Submitted State ──
    if (step === 'submitted') {
        return (
            <div className="ai-container">
                <div className="ai-success-panel">
                    <div className="ai-success-icon">
                        <CheckCircle2 size={48} />
                    </div>
                    <h2>Task Assigned Successfully</h2>
                    <p className="ai-success-subtitle">
                        The task has been created with the assignment scope and destination.
                    </p>

                    <div className="ai-success-details">
                        <div className="ai-success-section">
                            <h4><FileText size={14} /> Task</h4>
                            <p><strong>{form.taskTitle}</strong></p>
                            <p className="ai-meta">{form.taskDescription.substring(0, 100)}</p>
                        </div>

                        <div className="ai-success-section">
                            <h4><Briefcase size={14} /> Assignment</h4>
                            <p>Scope: <strong>{scope === 'SingleEmployee' ? 'Single Employee' : scope === 'Team' ? 'Team' : 'Department'}</strong></p>
                            <p>Destination: <strong>
                                {selectedEmployee?.employeeName || selectedTeam?.teamName || selectedDepartment?.name}
                            </strong></p>
                        </div>

                        {notificationsPreview.length > 0 && (
                            <div className="ai-success-section">
                                <h4><Bell size={14} /> Notifications Sent</h4>
                                <div className="ai-notif-list">
                                    {notificationsPreview.map((n, i) => (
                                        <div key={i} className="ai-notif-item">
                                            <span className="ai-notif-user">{n.userName}</span>
                                            <span className="ai-notif-type">{n.notificationType}</span>
                                            <span className="ai-notif-channel">{n.channel}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {auditLogPreview && (
                            <div className="ai-success-section">
                                <h4><Shield size={14} /> Audit Log Recorded</h4>
                                <div className="ai-audit-entry">
                                    <div className="ai-audit-row">
                                        <span className="ai-audit-label">Action:</span>
                                        <span>{auditLogPreview.action}</span>
                                    </div>
                                    <div className="ai-audit-row">
                                        <span className="ai-audit-label">Entity:</span>
                                        <span>{auditLogPreview.entityType} #{auditLogPreview.entityId}</span>
                                    </div>
                                    <div className="ai-audit-row">
                                        <span className="ai-audit-label">Details:</span>
                                        <span>{auditLogPreview.details}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {onBack && (
                        <div style={{ marginTop: 20, textAlign: 'center' }}>
                            <button className="btn" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '8px 20px', fontSize: 13 }}>
                                ← Back to Task List
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── Render ──
    return (
        <div className="ai-container">

            {/* ── SECTION 1: Task Details (Step 1) ── */}
            <div className="ai-card">
                <div className="ai-card-header">
                    <h3>Task Details</h3>
                </div>
                <p className="ai-card-desc">Fill in the details for the AI task you want to assign.</p>

                <div className="ai-form-grid">
                    {/* Title */}
                    <div className="ai-field ai-field-full">
                        <label>Task Title <span className="ai-required">*</span></label>
                        <input
                            value={form.taskTitle}
                            onChange={setFormField('taskTitle')}
                            placeholder="e.g. Train NLP model on customer queries"
                            className={errors.taskTitle ? 'ai-input-error' : ''}
                            maxLength={150}
                        />
                        <div className="ai-field-bottom">
                            <FieldErr name="taskTitle" />
                            {!errors.taskTitle && form.taskTitle.trim().length >= 3 && (
                                <span className="ai-valid-feedback">✓ Looks good</span>
                            )}
                            <CharCount value={form.taskTitle} max={150} />
                        </div>
                    </div>

                    {/* Description */}
                    <div className="ai-field ai-field-full">
                        <label>Description <span className="ai-required">*</span></label>
                        <textarea
                            value={form.taskDescription}
                            onChange={setFormField('taskDescription')}
                            placeholder="Describe the AI task objectives, expected outcomes, and any relevant context..."
                            rows={3}
                            className={errors.taskDescription ? 'ai-input-error' : ''}
                            maxLength={2000}
                        />
                        <div className="ai-field-bottom">
                            <FieldErr name="taskDescription" />
                            <CharCount value={form.taskDescription} max={2000} />
                        </div>
                    </div>

                    {/* Priority + Due Date */}
                    <div className="ai-field-row">
                        <div className="ai-field">
                            <label>Priority <span className="ai-required">*</span></label>
                            <select
                                value={form.priority}
                                onChange={e => {
                                    const val = e.target.value as Priority;
                                    setForm(prev => ({
                                        ...prev,
                                        priority: val,
                                        dueAt: val === 'Urgent' ? formatDateForInput(getSlaDeadline()) : prev.dueAt,
                                    }));
                                    setFormError('');
                                    const msg = validateField('priority', val);
                                    setErrors(prev => ({ ...prev, priority: msg || '' }));
                                }}
                                className={errors.priority ? 'ai-input-error' : ''}
                            >
                                <option value="">Select priority</option>
                                {PRIORITY_LEVELS.map(p => (
                                    <option key={p} value={p}>{p === 'Urgent' ? '🔴' : p === 'High' ? '🟠' : p === 'Medium' ? '🟡' : '🟢'} {p}</option>
                                ))}
                            </select>
                            <FieldErr name="priority" />
                            {form.priority && (
                                <span className={`ai-priority-hint ai-priority-${form.priority.toLowerCase()}`}>
                                    {form.priority === 'Urgent' && '🔴 SLA enforced — 24h deadline locked'}
                                    {form.priority === 'High' && '🟠 Requires timely attention'}
                                    {form.priority === 'Medium' && '🟡 Standard priority'}
                                    {form.priority === 'Low' && '🟢 Non-critical'}
                                </span>
                            )}
                        </div>

                        <div className="ai-field">
                            <label>Deadline <span className="ai-required">*</span></label>
                            <input
                                type="datetime-local"
                                value={form.dueAt}
                                onChange={slaLocked ? undefined : setFormField('dueAt')}
                                min={minDateTime}
                                readOnly={slaLocked}
                                className={`${errors.dueAt ? 'ai-input-error' : ''}${slaLocked ? 'ai-sla-locked' : ''}`}
                                style={slaLocked ? { background: '#fef2f2', cursor: 'not-allowed', opacity: 0.85 } : {}}
                            />
                            <FieldErr name="dueAt" />
                            {slaLocked && (
                                <span className="ai-sla-badge">
                                    <Lock size={11} /> SLA locked — 24h from creation
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Classification */}
                    <div className="ai-field ai-field-full">
                        <label>Classification <span className="ai-required">*</span></label>
                        <div className="ai-classification-row">
                            {CLASSIFICATION_OPTIONS.map(opt => (
                                <label
                                    key={opt.value}
                                    className={`ai-class-option${form.classification === opt.value ? ' active' : ''}`}
                                    onClick={() => {
                                        setForm(prev => ({ ...prev, classification: opt.value }));
                                        setErrors(prev => ({ ...prev, classification: '' }));
                                    }}
                                >
                                    <input type="radio" name="classification" value={opt.value}
                                        checked={form.classification === opt.value}
                                        onChange={() => { }} />
                                    {opt.label}
                                </label>
                            ))}
                        </div>
                        <FieldErr name="classification" />
                    </div>

                    {/* Category */}
                    <div className="ai-field">
                        <label>Category <span className="ai-opt">(optional)</span></label>
                        <select value={form.category} onChange={setFormField('category')}>
                            <option value="">Select category</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    {/* Confidential Toggle */}
                    <div className="ai-field ai-field-full">
                        <label className={`ai-conf-card${form.isConfidential ? ' active' : ''}`}>
                            <input type="checkbox" checked={form.isConfidential}
                                onChange={e => setForm(prev => ({ ...prev, isConfidential: e.target.checked }))} />
                            <div className="ai-conf-body">
                                <span className="ai-conf-icon"><Lock size={14} /></span>
                                <span className="ai-conf-title">Confidential Task</span>
                                {form.isConfidential && <span className="ai-conf-badge">Restricted</span>}
                                <span className="ai-conf-desc">
                                    {form.isConfidential
                                        ? 'Only Coordinators & Manager can view this task'
                                        : 'Restrict visibility to Coordinators and Manager only'}
                                </span>
                            </div>
                        </label>
                    </div>

                    {/* Supporting Document */}
                    <div className="ai-field ai-field-full">
                        <label>Supporting Document <span className="ai-opt">(optional) — select one or more files</span></label>
                        <input type="file" multiple accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
                            onChange={handleFileChange}
                            className="ai-file-input" />
                        {supportingFiles.length > 0 && (
                            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {supportingFiles.map((file, idx) => (
                                    <span key={`${file.name}-${idx}`} className="ai-file-badge">
                                        ✓ {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                                        <button
                                            onClick={() => setSupportingFiles(supportingFiles.filter((_, i) => i !== idx))}
                                            className="ai-file-remove"
                                            aria-label={`Remove ${file.name}`}
                                        >
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                                <span className="ai-opt" style={{ fontSize: 11 }}>
                                    {supportingFiles.length} file{supportingFiles.length === 1 ? '' : 's'} selected — uploaded after the task is created.
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── SECTION 2: Assignment Scope (Step 2) ── */}
            <div className="ai-card">
                <div className="ai-card-header">
                    <h3>Assignment Scope</h3>
                </div>
                <p className="ai-card-desc">Select exactly one scope for this task assignment.</p>

                <div className="ai-scope-selector">
                    {(['SingleEmployee', 'Team', 'Department'] as const).map(s => (
                        <label
                            key={s}
                            className={`ai-scope-option${scope === s ? ' active' : ''}`}
                            onClick={() => handleScopeSelect(s)}
                        >
                            <input type="radio" name="scope" value={s}
                                checked={scope === s} onChange={() => { }} />
                            {s === 'SingleEmployee' ? <UserCircle2 size={20} /> : s === 'Team' ? <Users size={20} /> : <Building size={20} />}
                            <span className="ai-scope-label">{s === 'SingleEmployee' ? 'Single Employee' : s === 'Team' ? 'Team' : 'Department'}</span>
                            <span className="ai-scope-desc">
                                {s === 'SingleEmployee' ? 'Assign to one specific employee' : s === 'Team' ? 'Assign to a team from Team Management' : 'Assign to an entire department'}
                            </span>
                        </label>
                    ))}
                </div>
                <FieldErr name="scope" />

                {scope && (
                    <div className="ai-neo4j-badge">
                        <Activity size={12} />
                        {AI_ANALYTICS_ENABLED
                            ? (aiEnabled ? 'AI recommendations active. Scores from Neo4j graph + ML.' : 'Standard assignment — no AI recommendations.')
                            : 'Standard assignment — no AI recommendations.'}
                        {AI_ANALYTICS_ENABLED && (
                            <button
                                type="button"
                                onClick={() => setAiEnabled(!aiEnabled)}
                                style={{
                                    marginLeft: 'auto',
                                    padding: '2px 10px',
                                    borderRadius: 12,
                                    border: '1px solid var(--teal, #00A99D)',
                                    background: aiEnabled ? 'var(--teal, #00A99D)' : 'transparent',
                                    color: aiEnabled ? '#fff' : 'var(--teal, #00A99D)',
                                    fontSize: 10,
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                {aiEnabled ? 'AI On' : 'AI Off'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* ── SECTION 3: Destination Selection (Steps 4-7) ── */}
            {scope && (
                <div className="ai-card">
                    <div className="ai-card-header">
                        <h3>
                            {scope === 'SingleEmployee' ? 'Select Employee' : scope === 'Team' ? 'Select Team' : 'Select Department'}
                        </h3>
                    </div>
                    <p className="ai-card-desc">
                        {scope === 'SingleEmployee'
                            ? (AI_ANALYTICS_ENABLED
                                ? (aiEnabled
                                    ? 'Employees ranked by AI suitability score. Toggle AI Off to see basic active task counts instead.'
                                    : 'Select an employee to assign. Toggle AI On for AI-powered suitability recommendations.')
                                : 'Select an employee to assign.')
                            : scope === 'Team'
                                ? 'Select from active teams available for assignment.'
                                : 'Select from the defined departments.'}
                    </p>

                    {/* ── Single Employee Picker (Step 4) ── */}
                    {scope === 'SingleEmployee' && (
                        <div className="ai-emp-picker">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="ai-emp-search" style={{ flex: 1 }}>
                                    <Search size={14} className="ai-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Search available employees..."
                                        value={employeeSearch}
                                        onChange={e => setEmployeeSearch(e.target.value)}
                                    />
                                    {loadingEmployees && <Loader2 size={14} className="ai-spin" />}
                                </div>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--status-active)', whiteSpace: 'nowrap' }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-active)', display: 'inline-block' }} />
                                    Live
                                </span>
                            </div>

                            {/* ── AI SLA Risk Badge ── */}
                            {aiEnabled && aiError && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', marginTop: 8, borderRadius: 6, fontSize: 11, background: '#fef2f2', border: '1px solid #fecaca', color: '#DC2626' }}>
                                    <AlertCircle size={12} />
                                    {aiError}
                                </div>
                            )}
                            {aiEnabled && !aiError && aiSlaRisk && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginTop: 8, borderRadius: 6, fontSize: 11, background: aiSlaRisk.riskLevel === 'High' ? '#fef2f2' : aiSlaRisk.riskLevel === 'Medium' ? '#fffbeb' : '#f0fdf4', border: '1px solid ' + (aiSlaRisk.riskLevel === 'High' ? '#fecaca' : aiSlaRisk.riskLevel === 'Medium' ? '#fde68a' : '#bbf7d0') }}>
                                    <TrendingUp size={13} />
                                    <span style={{ fontWeight: 600 }}>SLA Risk: {aiSlaRisk.riskLevel}</span>
                                    <span style={{ color: '#666' }}>— {(aiSlaRisk.confidenceScore * 100).toFixed(0)}% confidence</span>
                                </div>
                            )}

                            {/* ── AI Score Legend ── */}
                            {aiEnabled && aiSlaRisk && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', marginTop: 6, fontSize: 10, color: '#6B7280', background: '#F9FAFB', borderRadius: 6, border: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 600 }}>Score Guide:</span>
                                    <span style={{ color: '#059669' }}>● ≥ 0.5 Excellent</span>
                                    <span style={{ color: '#0284C7' }}>● ≥ 0.0 Good</span>
                                    <span style={{ color: '#D97706' }}>● ≥ -1.0 Fair</span>
                                    <span style={{ color: '#DC2626' }}>● &lt; -1.0 Overloaded</span>
                                    <span style={{ color: '#6B7280', fontStyle: 'italic' }}>— Lower = higher workload relative to max</span>
                                </div>
                            )}

                            {loadingEmployees ? (
                                <div className="ai-emp-loading">
                                    {[1, 2, 3].map(i => <div key={i} className="ai-skeleton-row" />)}
                                </div>
                            ) : filteredEmployees.length > 0 ? (
                                <div className="ai-emp-list">
                                    {filteredEmployees.map((emp, idx) => {
                                        const ai = aiScores[emp.employeeId];
                                        const isBestPick = ai && idx === 0 && !employeeSearch;
                                        return (
                                            <div key={emp.employeeId}>
                                                <div
                                                    className={`ai-emp-row${selectedEmployeeId === emp.employeeId ? ' selected' : ''}`}
                                                    onClick={() => {
                                                        setSelectedEmployeeId(emp.employeeId);
                                                        setErrors(prev => ({ ...prev, destination: '' }));
                                                        setValidationResult(null);
                                                        setStep('form');
                                                    }}
                                                >
                                                    <input type="radio" name="ai-emp"
                                                        checked={selectedEmployeeId === emp.employeeId}
                                                        onChange={() => { }} />
                                                    <div className="ai-emp-avatar">{getInitials(emp.employeeName)}</div>
                                                    <div className="ai-emp-info">
                                                        <span className="ai-emp-name">{emp.employeeName}</span>
                                                        <div className="ai-emp-meta">
                                                            <span className={`ai-emp-dot ${emp.isAvailable ? 'active' : 'inactive'}`} />
                                                            <span>{emp.availabilityStatus}</span>
                                                            <span className="ai-emp-dept">{emp.department}</span>
                                                        </div>
                                                    </div>
                                                    <div className="ai-emp-workload">
                                                        {ai && aiEnabled ? (
                                                            <>
                                                                <span className="ai-emp-count" style={{
                                                                    color: ai.score >= 0.5 ? '#059669' : ai.score >= 0 ? '#0284C7' : ai.score >= -1 ? '#D97706' : '#DC2626'
                                                                }}>
                                                                    {ai.score.toFixed(4)}
                                                                </span>
                                                                <span className="ai-emp-count-label">score</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="ai-emp-count">{emp.activeTaskCount}</span>
                                                                <span className="ai-emp-count-label">active</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="ai-emp-badges">
                                                        {ai && aiEnabled && !aiLoading && (
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#6B7280' }}>
                                                                <Briefcase size={10} /> {emp.activeTaskCount}
                                                            </span>
                                                        )}
                                                        {aiEnabled && isBestPick && (
                                                            <span className="ai-best-badge"><Zap size={10} /> Best</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* ── AI Explanation Toggle ── */}
                                                {ai && aiEnabled && (
                                                    <div style={{ padding: '0 8px 4px 52px' }}>
                                                        <button
                                                            style={{ fontSize: 10, color: 'var(--teal, #00A99D)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (aiExplainedEmp === emp.employeeId) {
                                                                    setAiExplainedEmp(null);
                                                                } else {
                                                                    setAiExplainedEmp(emp.employeeId);
                                                                    if (!aiExplanations[emp.employeeId]) {
                                                                        const workloadFactor = Math.max(0, 1.0 - ai.workload / 10);
                                                                        const explanationText = ai.workload > 10
                                                                            ? `Score ${ai.score.toFixed(4)} — workload ${ai.workload} exceeds max (10), causing negative score. Admin can increase MaxWorkload in Expert System Config for better accuracy.`
                                                                            : `Score ${ai.score.toFixed(4)} = workload factor ${workloadFactor.toFixed(2)} × 0.35 + experience × 0.25 + rec score × 0.40`;
                                                                        setAiExplanations(prev => ({ ...prev, [emp.employeeId]: explanationText }));
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            {aiExplainedEmp === emp.employeeId ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                                            {aiExplainedEmp === emp.employeeId ? 'Hide details' : 'Why this score?'}
                                                        </button>
                                                        {aiExplainedEmp === emp.employeeId && aiExplanations[emp.employeeId] && (
                                                            <div style={{ marginTop: 4, padding: '6px 8px', fontSize: 11, color: '#374151', background: '#f0fdf4', borderRadius: 4, lineHeight: 1.4 }}>
                                                                {aiExplanations[emp.employeeId]}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="ai-empty-state">
                                    <UserCircle2 size={24} />
                                    <p>No available employees found{employeeSearch ? ' matching your search' : ''}.</p>
                                </div>
                            )}

                            <FieldErr name="destination" />
                            {selectedEmployeeId && selectedEmployee && (
                                <div className="ai-selected-confirm">
                                    <CheckCircle2 size={14} />
                                    Selected: <strong>{selectedEmployee.employeeName}</strong> — {selectedEmployee.availabilityStatus}
                                    {aiEnabled && aiScores[selectedEmployeeId] && (
                                        <span> — Score: <strong>{aiScores[selectedEmployeeId].score.toFixed(4)}</strong></span>
                                    )}
                                    {!aiEnabled && selectedEmployee.activeTaskCount > 0 && (
                                        <span> — {selectedEmployee.activeTaskCount} active task{(selectedEmployee.activeTaskCount > 1 ? 's' : '')}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Team Picker (Step 5) ── */}
                    {scope === 'Team' && (
                        <div className="ai-team-picker">
                            {loadingTeams ? (
                                <div className="ai-emp-loading">
                                    {[1, 2, 3].map(i => <div key={i} className="ai-skeleton-row" />)}
                                </div>
                            ) : teams.length > 0 ? (
                                <div className="ai-team-grid">
                                    {teams.map(team => {
                                        const disabled = !team.isActive;
                                        return (
                                            <div
                                                key={team.teamId}
                                                className={`ai-team-card${selectedTeamId === team.teamId ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                                                onClick={() => {
                                                    if (disabled) return;
                                                    setSelectedTeamId(team.teamId);
                                                    setErrors(prev => ({ ...prev, destination: '' }));
                                                    setValidationResult(null);
                                                    setStep('form');
                                                }}
                                            >
                                                <div className="ai-team-top">
                                                    <input type="radio" name="ai-team"
                                                        checked={selectedTeamId === team.teamId}
                                                        disabled={disabled}
                                                        onChange={() => { }} />
                                                    <span className="ai-team-name">{team.teamName}</span>
                                                    {!team.isActive && <span className="ai-badge ai-badge-inactive">Inactive</span>}
                                                </div>
                                                <div className="ai-team-meta">
                                                    <Users size={12} />
                                                    <span>{team.memberCount} member{team.memberCount !== 1 ? 's' : ''}</span>
                                                </div>
                                                {team.memberNames.length > 0 && (
                                                    <div className="ai-team-members">
                                                        {team.memberNames.map(m => (
                                                            <span key={m} className="ai-team-member-chip">{getInitials(m)}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="ai-team-dept">{team.departmentName}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="ai-empty-state">
                                    <Users size={24} />
                                    <p>None — no teams have been created yet in Team Management.</p>
                                </div>
                            )}
                            <FieldErr name="destination" />
                            {selectedTeamId && selectedTeam && (
                                <div className="ai-selected-confirm">
                                    <CheckCircle2 size={14} />
                                    Selected team: <strong>{selectedTeam.teamName}</strong> ({selectedTeam.memberCount} members)
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Department Picker (Step 6) ── */}
                    {scope === 'Department' && (
                        <div className="ai-dept-picker">
                            {loadingDepartments ? (
                                <div className="ai-emp-loading">
                                    {[1, 2, 3].map(i => <div key={i} className="ai-skeleton-row" />)}
                                </div>
                            ) : departments.length > 0 ? (
                                <div className="ai-dept-grid">
                                    {departments.map(dept => {
                                        const disabled = !dept.isActive;
                                        return (
                                            <div
                                                key={dept.departmentId}
                                                className={`ai-dept-card${selectedDepartmentId === dept.departmentId ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                                                onClick={() => {
                                                    if (disabled) return;
                                                    setSelectedDepartmentId(dept.departmentId);
                                                    setErrors(prev => ({ ...prev, destination: '' }));
                                                    setValidationResult(null);
                                                    setStep('form');
                                                }}
                                            >
                                                <div className="ai-dept-top">
                                                    <input type="radio" name="ai-dept"
                                                        checked={selectedDepartmentId === dept.departmentId}
                                                        disabled={disabled}
                                                        onChange={() => { }} />
                                                    <div className="ai-dept-info">
                                                        <span className="ai-dept-name">{dept.name}</span>
                                                        <span className="ai-dept-code">{dept.code}</span>
                                                    </div>
                                                    {!dept.isActive && <span className="ai-badge ai-badge-inactive">Inactive</span>}
                                                    {dept.isActive && <span className="ai-badge ai-badge-active">Active</span>}
                                                </div>
                                                <div className="ai-dept-stats">
                                                    <div className="ai-dept-stat">
                                                        <UserCircle2 size={14} />
                                                        <span>{dept.employeeCount} employees</span>
                                                    </div>
                                                    {dept.headEmployeeName && (
                                                        <div className="ai-dept-stat">
                                                            <span>Head: {dept.headEmployeeName}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="ai-empty-state">
                                    <Building size={24} />
                                    <p>No departments available.</p>
                                </div>
                            )}
                            <FieldErr name="destination" />
                            {selectedDepartmentId && selectedDepartment && (
                                <div className="ai-selected-confirm">
                                    <CheckCircle2 size={14} />
                                    Selected department: <strong>{selectedDepartment.name}</strong> ({selectedDepartment.employeeCount} employees)
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── SECTION 4: Validation & Summary + Review Button ── */}
            {scope && (
                <div className="ai-actions">
                    {formError && (
                        <div className="ai-error-banner">
                            <AlertCircle size={14} /><span>{formError}</span>
                            <button onClick={() => setFormError('')}><X size={12} /></button>
                        </div>
                    )}

                    {step === 'summary' && validationResult && (
                        <div className="ai-summary-panel">
                            <div className="ai-summary-header">
                                <h3><CheckCircle2 size={18} className="ai-summary-icon" /> Assignment Summary</h3>
                            </div>

                            {/* Step 8: Destination Validation */}
                            <div className={`ai-validation-banner ${validationResult.destinationValid && validationResult.employeeAvailable ? 'success' : 'error'}`}>
                                {validationResult.destinationValid && validationResult.employeeAvailable ? (
                                    <><CheckCircle2 size={14} /> {validationResult.message}</>
                                ) : (
                                    <><AlertCircle size={14} /> {validationResult.message}</>
                                )}
                            </div>

                            <div className="ai-summary-grid">
                                <div className="ai-summary-item">
                                    <span className="ai-summary-label">Scope</span>
                                    <span className="ai-summary-value">
                                        {scope === 'SingleEmployee' ? 'Single Employee' : scope === 'Team' ? 'Team' : 'Department'}
                                    </span>
                                </div>
                                <div className="ai-summary-item">
                                    <span className="ai-summary-label">Destination</span>
                                    <span className="ai-summary-value">
                                        {selectedEmployee?.employeeName || selectedTeam?.teamName || selectedDepartment?.name || '—'}
                                    </span>
                                </div>
                                <div className="ai-summary-item">
                                    <span className="ai-summary-label">Task</span>
                                    <span className="ai-summary-value">{form.taskTitle}</span>
                                </div>
                                <div className="ai-summary-item">
                                    <span className="ai-summary-label">Priority</span>
                                    <span className="ai-summary-value">{form.priority || '—'}</span>
                                </div>
                                <div className="ai-summary-item" style={{ gridColumn: '1 / -1' }}>
                                    <span className="ai-summary-label">Description</span>
                                    <span className="ai-summary-value" style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                                        {form.taskDescription || '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Step 10: Notification Preview */}
                            {notificationsPreview.length > 0 && (
                                <div className="ai-summary-section">
                                    <h4><Bell size={14} /> Users to Notify</h4>
                                    <div className="ai-summary-notif-list">
                                        {notificationsPreview.map((n, i) => (
                                            <div key={i} className="ai-summary-notif-item">
                                                <span className="ai-summary-notif-user">{n.userName}</span>
                                                <span className="ai-summary-notif-type">{n.notificationType}</span>
                                                <span className="ai-summary-notif-channel">{n.channel}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Step 11: Audit Log Preview */}
                            {auditLogPreview && (
                                <div className="ai-summary-section">
                                    <h4><Shield size={14} /> Audit Log Entry</h4>
                                    <div className="ai-summary-audit">
                                        <div className="ai-summary-audit-row">
                                            <span className="ai-audit-label">Action:</span>
                                            <span>{auditLogPreview.action}</span>
                                        </div>
                                        <div className="ai-summary-audit-row">
                                            <span className="ai-audit-label">Entity:</span>
                                            <span>{auditLogPreview.entityType} #{auditLogPreview.entityId}</span>
                                        </div>
                                        <div className="ai-summary-audit-row">
                                            <span className="ai-audit-label">Details:</span>
                                            <span>{auditLogPreview.details}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="ai-summary-actions">
                                <button
                                    className="btn"
                                    onClick={() => setStep('form')}
                                    style={{
                                        background: 'var(--warn-bg, rgba(217, 119, 6, 0.12))',
                                        color: 'var(--warn, #D97706)',
                                        borderColor: 'var(--warn, #D97706)',
                                        fontWeight: 700,
                                    }}
                                >
                                    <ChevronLeft size={14} /> Revise
                                </button>
                                <button
                                    className="btn"
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    style={{
                                        background: 'var(--ok, #059669)',
                                        color: '#fff',
                                        borderColor: 'var(--ok, #059669)',
                                        fontWeight: 700,
                                        boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)',
                                    }}
                                >
                                    {submitting ? (
                                        <><Loader2 size={14} className="ai-spin" /> Assigning...</>
                                    ) : (
                                        <><Save size={14} /> Assign Task</>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'form' && (
                        <div className="ai-review-section">
                            <div className="ai-validate-note">
                                <Shield size={14} />
                                <span>The system will validate that the destination exists, is active, and that the employee is currently available.</span>
                            </div>
                            <button className="btn btn-primary" onClick={handleReview}
                                style={{ background: 'var(--teal, #00A99D)', borderColor: 'var(--teal, #00A99D)', color: '#fff', boxShadow: '0 4px 14px rgba(0, 169, 157, 0.3)' }}>
                                <CheckCircle2 size={14} /> Review & Validate Assignment
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── U-001: Duplicate task warning ─────────────────────────────── */}
            {duplicateWarnings.length > 0 && pendingPayload && (
                <FormModal
                    isOpen
                    onClose={handleDupCancel}
                    title="Potential duplicate task detected."
                    subtitle={`The system found ${duplicateWarnings.length} similar task${duplicateWarnings.length !== 1 ? 's' : ''} in existing records. Review the matches below.`}
                    size="lg"
                    footer={
                        <div className="modal-actions" style={{ width: '100%', justifyContent: 'flex-end' }}>
                            <button className="btn" onClick={handleDupCancel}><X size={13} /> Cancel</button>
                            <button className="btn btn-primary" onClick={handleDupContinue}>
                                <CheckCircle2 size={13} /> Continue Anyway
                            </button>
                        </div>
                    }
                >
                    <div style={{ margin: '4px 0 12px', padding: '10px 12px', background: 'rgba(2, 132, 199, 0.06)', border: '1px solid rgba(2, 132, 199, 0.25)', borderRadius: 8, fontSize: 13 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>New task: {pendingPayload.title}</div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{pendingPayload.description}</div>
                        <div style={{ marginTop: 6, fontSize: 11, color: '#0284c7' }}>
                            💡 <strong>Auto-numbering rule:</strong> If an existing task shares the exact title, the new task title will automatically receive an increment number upon creation (e.g., &quot;Title 1&quot;, &quot;Title 2&quot;).
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto', margin: '8px 0 4px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                                    <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)', width: 110 }}>Similarity</th>
                                    <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Existing Task</th>
                                    <th style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--text-secondary)' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {duplicateWarnings.map(m => (
                                    <tr key={m.taskId} style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                        <td style={{ padding: '8px', fontWeight: 700, color: m.similarityPercentage >= 90 ? 'var(--status-failed)' : m.similarityPercentage >= 80 ? '#c05c00' : m.similarityPercentage >= 70 ? '#9a6e00' : 'var(--text-primary)' }}>
                                            {m.similarityPercentage}%
                                        </td>
                                        <td style={{ padding: '8px', color: 'var(--text-primary)' }}>{m.title}</td>
                                        <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{m.status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </FormModal>
            )}
        </div>
    );
};

export default AIAssignmentView;
