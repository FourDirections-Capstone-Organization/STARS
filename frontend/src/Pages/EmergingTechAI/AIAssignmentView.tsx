import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    UserCircle2, Users, Building, Search, CheckCircle2, AlertCircle,
    Loader2, X, Lock, Save, Lightbulb, Activity, Bell, FileText, Calendar,
    Shield, ChevronRight, ChevronLeft, Clock, Briefcase, ExternalLink,
    Brain, TrendingUp, Zap, ChevronDown, ChevronUp, Plus, ArrowRight, Check
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
    teamId?: string;
    teamName?: string;
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
    memberIds?: string[];
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

const CATEGORIES = ['Operations', 'Logistics', 'IT & Admin', 'Customer Service', 'Maintenance', 'Other'];

const formatDateForInput = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const getPriorityDeadlineRange = (priority: Priority | ''): { min: string; max?: string; maxDate?: Date; helperText: string } => {
    const now = new Date();
    const minStr = formatDateForInput(now);
    
    if (priority === 'Urgent') {
        const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        return {
            min: minStr,
            max: formatDateForInput(d),
            maxDate: d,
            helperText: '🔴 Urgent SLA: Locked to 24 hours from creation.',
        };
    }
    if (priority === 'High') {
        const d = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
        return {
            min: minStr,
            max: formatDateForInput(d),
            maxDate: d,
            helperText: '🟠 High: Deadline must be 1 to 2 days only from current date.',
        };
    }
    if (priority === 'Medium') {
        const d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        return {
            min: minStr,
            max: formatDateForInput(d),
            maxDate: d,
            helperText: '🟡 Medium: Deadline must be within 1 week (7 days) from current date.',
        };
    }
    if (priority === 'Low') {
        return {
            min: minStr,
            max: undefined,
            maxDate: undefined,
            helperText: '🟢 Low: Any future date can be selected.',
        };
    }
    return {
        min: minStr,
        max: undefined,
        maxDate: undefined,
        helperText: 'Select a priority to see the allowed deadline range.',
    };
};

export const getQuickPickOptions = (priority: Priority | '') => {
    if (priority === 'High') {
        return [
            { label: '+1 Day (24h)', hours: 24 },
            { label: '+2 Days (48h max)', hours: 48 },
        ];
    }
    if (priority === 'Medium') {
        return [
            { label: '+2 Days', hours: 48 },
            { label: '+3 Days', hours: 72 },
            { label: '+5 Days', hours: 120 },
            { label: '+1 Week (7d max)', hours: 168 },
        ];
    }
    if (priority === 'Low') {
        return [
            { label: '+1 Week', hours: 168 },
            { label: '+2 Weeks', hours: 336 },
            { label: '+1 Month (30d)', hours: 720 },
        ];
    }
    return [];
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
        classification: 0,
        category: '',
        isConfidential: false,
    });
    
    // Cascading Assignment Selections
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

    const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
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
                teamId: emp.teamId ?? emp.TeamId ?? '',
                teamName: emp.teamName ?? emp.TeamName ?? emp.team ?? '',
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

    // Initial fetch + polling for real-time availability updates
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
                        memberNames: (t.members ?? []).map((m: any) => m.fullName ?? m.employeeName ?? m.name ?? ''),
                        memberIds: (t.members ?? []).map((m: any) => m.userId ?? m.id ?? m.accountId ?? m.employeeId ?? ''),
                        isActive: t.isActive ?? true,
                        departmentId: t.departmentId ?? t.department?.id ?? '',
                        departmentName: t.departmentName ?? t.department?.name ?? '',
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
    const availableTeamsForDept = useMemo(() => {
        if (!selectedDepartmentId) return teams;
        const selectedD = departments.find(d => d.departmentId === selectedDepartmentId);
        return teams.filter(t => t.departmentId === selectedDepartmentId || (selectedD && t.departmentName?.toLowerCase() === selectedD.name.toLowerCase()));
    }, [teams, selectedDepartmentId, departments]);

    const filteredEmployees = useMemo(() => {
        let list = employees.filter(e => e.isAvailable);
        if (selectedDepartmentId) {
            const selectedD = departments.find(d => d.departmentId === selectedDepartmentId);
            list = list.filter(e => e.departmentId === selectedDepartmentId || (selectedD && e.department?.toLowerCase() === selectedD.name.toLowerCase()));
        }
        if (selectedTeamId) {
            const selectedT = teams.find(t => t.teamId === selectedTeamId);
            list = list.filter(e =>
                e.teamId === selectedTeamId ||
                selectedT?.memberIds?.includes(e.employeeId) ||
                selectedT?.memberNames?.some(n => n.toLowerCase() === e.employeeName.toLowerCase())
            );
        }
        if (employeeSearch) {
            list = list.filter(e =>
                e.employeeName.toLowerCase().includes(employeeSearch.toLowerCase()) ||
                e.role.toLowerCase().includes(employeeSearch.toLowerCase())
            );
        }
        return list;
    }, [employees, selectedDepartmentId, selectedTeamId, employeeSearch, departments, teams]);

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

    // ── Auto-derived Assignment Scope ──
    const scope: AssignmentScope = useMemo(() => {
        if (selectedEmployeeId) return 'SingleEmployee';
        if (selectedTeamId) return 'Team';
        return 'Department';
    }, [selectedEmployeeId, selectedTeamId]);

    const targetDisplayName = useMemo(() => {
        if (selectedEmployee) return `${selectedEmployee.employeeName} (${selectedEmployee.role || 'Employee'})`;
        if (selectedTeam) return `${selectedTeam.teamName} (${selectedTeam.memberCount} members)`;
        if (selectedDepartment) return `${selectedDepartment.name} Department (${selectedDepartment.employeeCount} staff)`;
        return 'All Departments (Company-Wide)';
    }, [selectedEmployee, selectedTeam, selectedDepartment]);

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
                const now = new Date();
                if (isNaN(selected.getTime())) return 'Invalid date format.';
                if (selected.getTime() < now.getTime() - 60000) return 'Deadline must not be in the past.';
                
                if (form.priority === 'High') {
                    const maxHigh = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 300000); // 2 days + grace
                    if (selected > maxHigh) {
                        return 'For High priority, deadline must be 1 to 2 days only from current date.';
                    }
                } else if (form.priority === 'Medium') {
                    const maxMed = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 300000); // 7 days + grace
                    if (selected > maxMed) {
                        return 'For Medium priority, deadline must be within 1 week (7 days) from current date.';
                    }
                }
                return '';
            }
            case 'priority': {
                if (!value || value === -1) return 'Priority is required.';
                return '';
            }
            default:
                return '';
        }
    };

    const validateAll = (): boolean => {
        const newErrors: Record<string, string> = {};
        ['taskTitle', 'taskDescription', 'dueAt', 'priority'].forEach(key => {
            const msg = validateField(key, (form as any)[key] ?? '');
            if (msg) newErrors[key] = msg;
        });
        setErrors(newErrors);

        if (Object.keys(newErrors).length > 0) {
            const labelMap: Record<string, string> = {
                taskTitle: 'Task Title',
                taskDescription: 'Task Description',
                dueAt: 'Deadline',
                priority: 'Priority',
            };
            const missing = Object.keys(newErrors)
                .map(key => labelMap[key] ?? key)
                .join(', ');
            setFormError(`Missing or invalid required information: ${missing}. Please check the highlighted fields.`);
            return false;
        }

        return true;
    };

    // ── Destination Validation ──
    const validateDestination = (): boolean => {
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
            setValidationResult({ destinationValid: true, employeeAvailable: true, message: `Employee "${selectedEmployee.employeeName}" is active and available for assignment.` });
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
            if (selectedDepartmentId) {
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
                setValidationResult({ destinationValid: true, employeeAvailable: true, message: `Department "${dept.name}" is active (${dept.employeeCount} staff).` });
                return true;
            } else {
                setValidationResult({ destinationValid: true, employeeAvailable: true, message: 'Company-wide assignment targeting all active departments and teams.' });
                return true;
            }
        }

        return false;
    };

    // ── Build Notification Preview ──
    const buildNotificationsPreview = () => {
        const list: NotificationPreview[] = [];
        if (scope === 'SingleEmployee' && selectedEmployee) {
            list.push({
                userId: selectedEmployee.employeeId,
                userName: selectedEmployee.employeeName,
                notificationType: 'TaskAssigned',
                channel: 'In-App + Email Notification',
            });
        } else if (scope === 'Team' && selectedTeam) {
            if (selectedTeam.memberNames.length > 0) {
                selectedTeam.memberNames.forEach(name => {
                    list.push({
                        userId: name,
                        userName: name,
                        notificationType: 'TaskAssigned',
                        channel: 'In-App + Email (Team Member)',
                    });
                });
            } else {
                list.push({
                    userId: selectedTeam.teamId,
                    userName: `${selectedTeam.teamName} (All Team Members)`,
                    notificationType: 'TaskAssigned',
                    channel: 'In-App + Email (Team Broadcast)',
                });
            }
        } else if (scope === 'Department') {
            if (selectedDepartment) {
                list.push({
                    userId: selectedDepartment.departmentId,
                    userName: `${selectedDepartment.name} Department (${selectedDepartment.employeeCount} staff)`,
                    notificationType: 'TaskAssigned',
                    channel: 'In-App + Email (Department-wide)',
                });
            } else {
                list.push({
                    userId: 'all-depts',
                    userName: `All Departments (${departments.length} departments, company-wide)`,
                    notificationType: 'TaskAssigned',
                    channel: 'In-App + Email (Organization Broadcast)',
                });
            }
        }
        setNotificationsPreview(list);
    };

    // ── Build Audit Log Preview ──
    const buildAuditLogPreview = () => {
        const scopeLabel = scope === 'SingleEmployee' ? 'Single Employee' : scope === 'Team' ? 'Whole Team' : (selectedDepartmentId ? 'Whole Department' : 'All Departments (Company-Wide)');
        const destName = targetDisplayName;
        setAuditLogPreview({
            action: 'Task Created & Assigned',
            entityType: 'Task',
            entityId: `AI-${Date.now().toString(36).toUpperCase()}`,
            details: `Assignment Target: ${scopeLabel}, Destination: ${destName}, Task: "${form.taskTitle.trim()}"`,
        });
    };

    // ── Go to Summary ──
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
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // ── Submit with pre-submit availability re-validation (Req #4) ──
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
            if (onTaskCreated) onTaskCreated();
            window.scrollTo({ top: 0, behavior: 'smooth' });
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

        // Re-validate availability at submission moment
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
            assignedDepartmentId: scope === 'Department' ? (selectedDepartmentId || undefined) : undefined,
            teamId: scope === 'Team' ? selectedTeamId : undefined,
            isConfidential: form.isConfidential,
        };

        try {
            const checkRes = await api.post('/api/Duplicate/check', { title: payload.title, description: payload.description });
            const checkJson = checkRes.data;
            if (checkJson?.isSuccess && checkJson?.data?.hasDuplicates && checkJson.data.matches?.length > 0) {
                setDuplicateWarnings(checkJson.data.matches);
                setPendingPayload(payload);
                return;
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
        const existingKeys = new Set(supportingFiles.map(f => `${f.name}-${f.size}`));
        const newUnique = files.filter(f => !existingKeys.has(`${f.name}-${f.size}`));
        setSupportingFiles(prev => [...prev, ...newUnique]);
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
                {/* Stepper Header */}
                <div className="ai-stepper-header">
                    <div className="ai-stepper-step completed">
                        <div className="ai-step-num"><Check size={16} /></div>
                        <div className="ai-step-info">
                            <span className="ai-step-title">1. Task Details & Assignment</span>
                            <span className="ai-step-sub">Configured</span>
                        </div>
                    </div>
                    <div className="ai-stepper-divider completed" />
                    <div className="ai-stepper-step completed">
                        <div className="ai-step-num"><Check size={16} /></div>
                        <div className="ai-step-info">
                            <span className="ai-step-title">2. Review & Validate</span>
                            <span className="ai-step-sub">Validated</span>
                        </div>
                    </div>
                    <div className="ai-stepper-divider completed" />
                    <div className="ai-stepper-step active">
                        <div className="ai-step-num">3</div>
                        <div className="ai-step-info">
                            <span className="ai-step-title">3. Complete</span>
                            <span className="ai-step-sub">Task Assigned</span>
                        </div>
                    </div>
                </div>

                <div className="ai-success-panel">
                    <div className="ai-success-icon">
                        <CheckCircle2 size={48} />
                    </div>
                    <h2>Task Assigned Successfully</h2>
                    <p className="ai-success-subtitle">
                        The task has been created with all destination parameters and saved to the system.
                    </p>

                    <div className="ai-success-details">
                        <div className="ai-success-section">
                            <h4><FileText size={14} /> Task Details</h4>
                            <p><strong>{form.taskTitle}</strong></p>
                            <p className="ai-meta">{form.taskDescription.substring(0, 140)}{form.taskDescription.length > 140 ? '...' : ''}</p>
                        </div>

                        <div className="ai-success-section">
                            <h4><Briefcase size={14} /> Assignment Destination</h4>
                            <p>Scope: <strong>{scope === 'SingleEmployee' ? 'Single Employee' : scope === 'Team' ? 'Team' : 'Department'}</strong></p>
                            <p>Target: <strong>{targetDisplayName}</strong></p>
                        </div>

                        {notificationsPreview.length > 0 && (
                            <div className="ai-success-section">
                                <h4><Bell size={14} /> Notifications Broadcasted</h4>
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
                                <h4><Shield size={14} /> Audit Trail Logged</h4>
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

                    <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 12 }}>
                        {onBack && (
                            <button className="btn" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontSize: 13, fontWeight: 600 }}>
                                ← Back to Task List
                            </button>
                        )}
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setForm({
                                    taskTitle: '',
                                    taskDescription: '',
                                    dueAt: '',
                                    priority: '',
                                    classification: 0,
                                    category: '',
                                    isConfidential: false,
                                });
                                setSelectedDepartmentId('');
                                setSelectedTeamId('');
                                setSelectedEmployeeId('');
                                setSupportingFiles([]);
                                setStep('form');
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontSize: 13, fontWeight: 600, background: 'var(--teal, #00A99D)', borderColor: 'var(--teal, #00A99D)', color: '#fff' }}
                        >
                            <Plus size={14} /> Create Another Task
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Render: Full-Page Summary Review (Step === 'summary') ──
    if (step === 'summary') {
        const priorityRange = getPriorityDeadlineRange(form.priority);
        return (
            <div className="ai-container">
                {/* Stepper Header */}
                <div className="ai-stepper-header">
                    <div className="ai-stepper-step completed" onClick={() => setStep('form')} style={{ cursor: 'pointer' }}>
                        <div className="ai-step-num"><Check size={16} /></div>
                        <div className="ai-step-info">
                            <span className="ai-step-title">1. Task Details & Assignment</span>
                            <span className="ai-step-sub">Click to edit</span>
                        </div>
                    </div>
                    <div className="ai-stepper-divider completed" />
                    <div className="ai-stepper-step active">
                        <div className="ai-step-num">2</div>
                        <div className="ai-step-info">
                            <span className="ai-step-title">2. Review & Validate</span>
                            <span className="ai-step-sub">Final Verification</span>
                        </div>
                    </div>
                    <div className="ai-stepper-divider" />
                    <div className="ai-stepper-step">
                        <div className="ai-step-num">3</div>
                        <div className="ai-step-info">
                            <span className="ai-step-title">3. Complete</span>
                            <span className="ai-step-sub">Pending confirmation</span>
                        </div>
                    </div>
                </div>

                <div className="ai-full-summary-page">
                    {/* Top Bar */}
                    <div className="ai-summary-top-bar">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Assignment Summary & Validation Review
                                </span>
                                <span style={{ padding: '2px 8px', borderRadius: 12, background: 'rgba(0, 169, 157, 0.1)', color: 'var(--teal, #00A99D)', fontSize: 11, fontWeight: 700 }}>
                                    Ready for Assignment
                                </span>
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                Review all task parameters, destination availability, SLA compliance, and notification previews before assigning.
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button
                                type="button"
                                className="btn"
                                onClick={() => {
                                    setStep('form');
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '8px 16px', fontSize: 13 }}
                            >
                                <ChevronLeft size={14} /> Back & Edit
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleSubmit}
                                disabled={submitting}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    background: 'var(--ok, #059669)',
                                    borderColor: 'var(--ok, #059669)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    padding: '8px 20px',
                                    fontSize: 13,
                                    boxShadow: '0 4px 14px rgba(5, 150, 105, 0.3)'
                                }}
                            >
                                {submitting ? (
                                    <><Loader2 size={15} className="ai-spin" /> Confirming & Assigning...</>
                                ) : (
                                    <><Save size={15} /> Confirm & Assign Task</>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Form Error if any during submit */}
                    {formError && (
                        <div className="ai-error-banner" style={{ margin: 0 }}>
                            <AlertCircle size={15} /><span>{formError}</span>
                            <button onClick={() => setFormError('')}><X size={13} /></button>
                        </div>
                    )}

                    {/* Step 8: Destination Validation Banner */}
                    {validationResult && (
                        <div className={`ai-validation-banner ${validationResult.destinationValid && validationResult.employeeAvailable ? 'success' : 'error'}`}>
                            {validationResult.destinationValid && validationResult.employeeAvailable ? (
                                <><CheckCircle2 size={16} /> <strong>Validation Passed:</strong> {validationResult.message}</>
                            ) : (
                                <><AlertCircle size={16} /> <strong>Validation Warning:</strong> {validationResult.message}</>
                            )}
                        </div>
                    )}

                    {/* SLA Banner */}
                    {form.priority === 'Urgent' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>
                            <Lock size={16} />
                            <div>
                                <strong>Urgent Priority SLA Enforced:</strong> 24-Hour strict turnaround window. Escalation rules activate if pending coordinator review beyond SLA threshold.
                            </div>
                        </div>
                    )}

                    {/* 4-Card Structured Grid */}
                    <div className="ai-summary-cards-grid">
                        {/* Card 1: Task Details */}
                        <div className="ai-review-card">
                            <div className="ai-review-card-header">
                                <h4><FileText size={16} color="var(--primary, #00A99D)" /> 1. Task Information</h4>
                                {form.isConfidential && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: 11, fontWeight: 700 }}>
                                        <Lock size={10} /> Confidential
                                    </span>
                                )}
                            </div>
                            <div className="ai-review-card-body">
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">Title</span>
                                    <span className="ai-review-row-val" style={{ fontWeight: 700 }}>{form.taskTitle}</span>
                                </div>
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">Category</span>
                                    <span className="ai-review-row-val">{form.category || 'General Operations'}</span>
                                </div>
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">Attachments</span>
                                    <span className="ai-review-row-val">
                                        {supportingFiles.length > 0 ? `${supportingFiles.length} file(s) attached` : 'None'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                    <span className="ai-review-row-label">Description & Scope of Work</span>
                                    <div style={{ padding: '10px 12px', background: 'var(--bg-main, #f8fafc)', borderRadius: 8, border: '1px solid var(--border, #e2e8f0)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-primary)', maxHeight: 160, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                        {form.taskDescription}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Assignment & Routing Hierarchy */}
                        <div className="ai-review-card">
                            <div className="ai-review-card-header">
                                <h4><Briefcase size={16} color="var(--primary, #00A99D)" /> 2. Assignment & Routing</h4>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: 12,
                                    background: scope === 'SingleEmployee' ? 'rgba(2, 132, 199, 0.1)' : scope === 'Team' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                    color: scope === 'SingleEmployee' ? '#0284c7' : scope === 'Team' ? '#10b981' : '#f59e0b',
                                    fontSize: 11,
                                    fontWeight: 700
                                }}>
                                    {scope === 'SingleEmployee' ? 'Single Employee' : scope === 'Team' ? 'Team Scope' : 'Department Scope'}
                                </span>
                            </div>
                            <div className="ai-review-card-body">
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">Selected Department</span>
                                    <span className="ai-review-row-val">
                                        {selectedDepartment ? `${selectedDepartment.name} (${selectedDepartment.code || 'DEP'})` : 'All Departments (Company-Wide)'}
                                    </span>
                                </div>
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">Selected Team</span>
                                    <span className="ai-review-row-val">
                                        {selectedTeam ? selectedTeam.teamName : (selectedDepartmentId ? 'Whole Department (All Teams)' : 'Company-Wide')}
                                    </span>
                                </div>
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">Target Assignee</span>
                                    <span className="ai-review-row-val" style={{ fontWeight: 700, color: 'var(--teal, #00A99D)' }}>
                                        {targetDisplayName}
                                    </span>
                                </div>
                                {selectedEmployee && (
                                    <>
                                        <div className="ai-review-row">
                                            <span className="ai-review-row-label">Availability Status</span>
                                            <span className="ai-review-row-val" style={{ color: selectedEmployee.isAvailable ? '#059669' : '#dc2626' }}>
                                                ● {selectedEmployee.availabilityStatus}
                                            </span>
                                        </div>
                                        <div className="ai-review-row">
                                            <span className="ai-review-row-label">Current Workload</span>
                                            <span className="ai-review-row-val">
                                                {selectedEmployee.activeTaskCount} active task{selectedEmployee.activeTaskCount !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        {aiEnabled && aiScores[selectedEmployee.employeeId] && (
                                            <div className="ai-review-row">
                                                <span className="ai-review-row-label">AI Suitability Score</span>
                                                <span className="ai-review-row-val" style={{ color: '#0284c7', fontWeight: 700 }}>
                                                    {aiScores[selectedEmployee.employeeId].score.toFixed(4)}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Card 3: Timeline & SLA */}
                        <div className="ai-review-card">
                            <div className="ai-review-card-header">
                                <h4><Clock size={16} color="var(--primary, #00A99D)" /> 3. Timeline & SLA Rules</h4>
                                <span className={`ai-priority-hint ai-priority-${form.priority.toLowerCase()}`} style={{ margin: 0, padding: '2px 8px', fontSize: 11, borderRadius: 12 }}>
                                    {form.priority} Priority
                                </span>
                            </div>
                            <div className="ai-review-card-body">
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">Priority Level</span>
                                    <span className="ai-review-row-val">
                                        {form.priority === 'Urgent' ? '🔴 Urgent' : form.priority === 'High' ? '🟠 High' : form.priority === 'Medium' ? '🟡 Medium' : '🟢 Low'}
                                    </span>
                                </div>
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">Target Deadline</span>
                                    <span className="ai-review-row-val" style={{ fontWeight: 700 }}>
                                        {form.dueAt ? new Date(form.dueAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'None'}
                                    </span>
                                </div>
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">SLA Rule Policy</span>
                                    <span className="ai-review-row-val">
                                        {priorityRange.helperText}
                                    </span>
                                </div>
                                <div className="ai-review-row">
                                    <span className="ai-review-row-label">Overdue Escalation</span>
                                    <span className="ai-review-row-val">
                                        {form.priority === 'Urgent' ? 'Automatic (Immediate coordinator ping)' : 'Standard dashboard SLA trigger'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Card 4: Audit & Notifications */}
                        <div className="ai-review-card">
                            <div className="ai-review-card-header">
                                <h4><Shield size={16} color="var(--primary, #00A99D)" /> 4. Audit & Notifications</h4>
                                <span style={{ padding: '2px 8px', borderRadius: 12, background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', fontSize: 11, fontWeight: 700 }}>
                                    {notificationsPreview.length} Notification{notificationsPreview.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="ai-review-card-body">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <span className="ai-review-row-label">Notification Recipients</span>
                                    <div className="ai-summary-notif-list" style={{ maxHeight: 110, overflowY: 'auto' }}>
                                        {notificationsPreview.map((n, i) => (
                                            <div key={i} className="ai-summary-notif-item">
                                                <span className="ai-summary-notif-user">{n.userName}</span>
                                                <span className="ai-summary-notif-channel">{n.channel}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {auditLogPreview && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                                        <span className="ai-review-row-label">Audit Log Entry to be Recorded</span>
                                        <div className="ai-summary-audit" style={{ fontSize: 11.5, padding: '8px 10px' }}>
                                            <div className="ai-summary-audit-row">
                                                <span className="ai-audit-label">Action:</span>
                                                <span>{auditLogPreview.action}</span>
                                            </div>
                                            <div className="ai-summary-audit-row">
                                                <span className="ai-audit-label">Target:</span>
                                                <span>{targetDisplayName}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="ai-summary-footer-bar">
                        <button
                            type="button"
                            className="btn"
                            onClick={() => {
                                setStep('form');
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '9px 20px', fontSize: 13 }}
                        >
                            <ChevronLeft size={15} /> Revise Parameters
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={submitting}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: 'var(--ok, #059669)',
                                borderColor: 'var(--ok, #059669)',
                                color: '#fff',
                                fontWeight: 700,
                                padding: '9px 26px',
                                fontSize: 14,
                                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)'
                            }}
                        >
                            {submitting ? (
                                <><Loader2 size={16} className="ai-spin" /> Creating & Assigning Task...</>
                            ) : (
                                <><Save size={16} /> Confirm & Assign Task</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Render: Form View (2-Column Layout) ──
    const priorityRange = getPriorityDeadlineRange(form.priority);
    const quickPicks = getQuickPickOptions(form.priority);

    return (
        <div className="ai-container">
            {/* Stepper Header */}
            <div className="ai-stepper-header">
                <div className="ai-stepper-step active">
                    <div className="ai-step-num">1</div>
                    <div className="ai-step-info">
                        <span className="ai-step-title">1. Task Details & Assignment</span>
                        <span className="ai-step-sub">In progress</span>
                    </div>
                </div>
                <div className="ai-stepper-divider" />
                <div className="ai-stepper-step">
                    <div className="ai-step-num">2</div>
                    <div className="ai-step-info">
                        <span className="ai-step-title">2. Review & Validate</span>
                        <span className="ai-step-sub">Next step</span>
                    </div>
                </div>
                <div className="ai-stepper-divider" />
                <div className="ai-stepper-step">
                    <div className="ai-step-num">3</div>
                    <div className="ai-step-info">
                        <span className="ai-step-title">3. Complete</span>
                        <span className="ai-step-sub">Final step</span>
                    </div>
                </div>
            </div>

            <div className="ai-creation-layout">
                {/* ── LEFT COLUMN: Task Details & Cascading Assignment ── */}
                <div className="ai-creation-main">
                    {/* SECTION 1: Task Details */}
                    <div className="ai-card">
                        <div className="ai-card-header">
                            <FileText size={18} color="var(--primary, #00A99D)" />
                            <h3>Task Details</h3>
                        </div>
                        <p className="ai-card-desc">Fill in the objectives, schedule, and priority for the task.</p>

                        <div className="ai-form-grid">
                            {/* Title */}
                            <div className="ai-field ai-field-full">
                                <label>Task Title <span className="ai-required">*</span></label>
                                <input
                                    value={form.taskTitle}
                                    onChange={setFormField('taskTitle')}
                                    placeholder="e.g. Audit Q3 Inventory and Reconcile Logs"
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
                                    placeholder="Describe the task scope, requirements, expected outcomes, and any specific instructions..."
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
                                            const range = getPriorityDeadlineRange(val);
                                            let newDueAt = form.dueAt;
                                            if (val === 'Urgent') {
                                                const d = new Date();
                                                d.setHours(d.getHours() + 24);
                                                newDueAt = formatDateForInput(d);
                                            } else if (range.max && form.dueAt) {
                                                const curD = new Date(form.dueAt);
                                                const now = new Date();
                                                if (curD > range.maxDate! || curD < now) {
                                                    newDueAt = range.max;
                                                }
                                            } else if (!form.dueAt && val) {
                                                newDueAt = range.max || formatDateForInput(new Date(Date.now() + 7 * 86400000));
                                            }
                                            setForm(prev => ({
                                                ...prev,
                                                priority: val,
                                                dueAt: newDueAt,
                                            }));
                                            setFormError('');
                                            const msg = validateField('priority', val);
                                            setErrors(prev => ({ ...prev, priority: msg || '', dueAt: '' }));
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
                                            {form.priority === 'High' && '🟠 High Priority — 1 to 2 days deadline only'}
                                            {form.priority === 'Medium' && '🟡 Medium Priority — Up to 1 week (7 days)'}
                                            {form.priority === 'Low' && '🟢 Low Priority — Any future deadline'}
                                        </span>
                                    )}
                                </div>

                                <div className="ai-field">
                                    <label>
                                        Deadline <span className="ai-required">*</span>
                                        {priorityRange.max && !slaLocked && (
                                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal, #00A99D)', marginLeft: 6 }}>
                                                (Max: {new Date(priorityRange.max).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
                                            </span>
                                        )}
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={form.dueAt}
                                        onChange={slaLocked ? undefined : setFormField('dueAt')}
                                        min={priorityRange.min}
                                        max={priorityRange.max}
                                        readOnly={slaLocked}
                                        className={`${errors.dueAt ? 'ai-input-error' : ''}${slaLocked ? 'ai-sla-locked' : ''}`}
                                        style={slaLocked ? { background: '#fef2f2', cursor: 'not-allowed', opacity: 0.85 } : {}}
                                    />
                                    <FieldErr name="dueAt" />

                                    {/* Quick Pick Buttons */}
                                    {!slaLocked && form.priority && quickPicks.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Quick pick:</span>
                                            {quickPicks.map(opt => (
                                                <button
                                                    key={opt.label}
                                                    type="button"
                                                    onClick={() => {
                                                        const d = new Date(Date.now() + opt.hours * 3600000);
                                                        setForm(prev => ({ ...prev, dueAt: formatDateForInput(d) }));
                                                        setErrors(prev => ({ ...prev, dueAt: '' }));
                                                    }}
                                                    style={{
                                                        padding: '3px 8px',
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        borderRadius: 6,
                                                        border: '1px solid var(--border)',
                                                        background: '#fff',
                                                        color: 'var(--text-primary)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {slaLocked && (
                                        <span className="ai-sla-badge">
                                            <Lock size={11} /> SLA locked — 24h from creation
                                        </span>
                                    )}
                                </div>
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
                                <label>Supporting Documents <span className="ai-opt">(optional) — select files</span></label>
                                <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"
                                    onChange={handleFileChange}
                                    style={{ display: supportingFiles.length > 0 ? 'none' : 'block' }}
                                    className="ai-file-input" />
                                {supportingFiles.length > 0 && (
                                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: 'var(--primary, #0284c7)', background: 'rgba(2, 132, 199, 0.08)', border: '1px dashed rgba(2, 132, 199, 0.4)', borderRadius: 6, cursor: 'pointer' }}
                                            >
                                                <Plus size={13} /> Upload more
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSupportingFiles([]);
                                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                                }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ee5d50', padding: 4, fontSize: 11, fontWeight: 600 }}
                                            >
                                                Clear all
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* SECTION 2: Cascading Assignment Hierarchy */}
                    <div className="ai-card">
                        <div className="ai-card-header">
                            <Briefcase size={18} color="var(--primary, #00A99D)" />
                            <h3>Task Assignment Routing</h3>
                        </div>
                        <p className="ai-card-desc">
                            Select the Department, Team, and optional Single Employee. You can assign to an entire department, a whole team, or drill down to a specific employee.
                        </p>

                        <div className="ai-cascade-container">
                            {/* Step A: Department Selection */}
                            <div className={`ai-cascade-card ${selectedDepartmentId ? 'active' : ''}`}>
                                <div className="ai-cascade-header">
                                    <span className="ai-cascade-title">
                                        <Building size={14} color="var(--teal, #00A99D)" /> 1. Select Department
                                    </span>
                                    {selectedDepartmentId ? (
                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal, #00A99D)' }}>
                                            {selectedDepartment?.employeeCount} Staff
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                            Company-Wide
                                        </span>
                                    )}
                                </div>
                                <select
                                    value={selectedDepartmentId}
                                    onChange={e => {
                                        const newDept = e.target.value;
                                        setSelectedDepartmentId(newDept);
                                        setSelectedTeamId('');
                                        setSelectedEmployeeId('');
                                        setErrors(prev => ({ ...prev, destination: '' }));
                                    }}
                                    style={{
                                        padding: '9px 12px',
                                        borderRadius: 8,
                                        border: '1.5px solid var(--border, #e2e8f0)',
                                        background: 'var(--bg-surface, #fff)',
                                        color: 'var(--text-primary, #1e293b)',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="">🌐 All Departments (Company-Wide Assignment)</option>
                                    {departments.map(d => (
                                        <option key={d.departmentId} value={d.departmentId}>
                                            🏢 {d.name} ({d.employeeCount} employees) {d.code ? `[${d.code}]` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Step B: Team Selection */}
                            <div className={`ai-cascade-card ${selectedTeamId ? 'active' : ''}`}>
                                <div className="ai-cascade-header">
                                    <span className="ai-cascade-title">
                                        <Users size={14} color="var(--teal, #00A99D)" /> 2. Select Team <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>(Optional)</span>
                                    </span>
                                    {selectedTeamId && (
                                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal, #00A99D)' }}>
                                            {selectedTeam?.memberCount} Members
                                        </span>
                                    )}
                                </div>
                                <select
                                    value={selectedTeamId}
                                    onChange={e => {
                                        const newTeam = e.target.value;
                                        setSelectedTeamId(newTeam);
                                        setSelectedEmployeeId('');
                                        setErrors(prev => ({ ...prev, destination: '' }));
                                    }}
                                    style={{
                                        padding: '9px 12px',
                                        borderRadius: 8,
                                        border: '1.5px solid var(--border, #e2e8f0)',
                                        background: 'var(--bg-surface, #fff)',
                                        color: 'var(--text-primary, #1e293b)',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="">
                                        {selectedDepartmentId ? '👥 Entire Department (All Teams / Department-wide)' : '👥 All Teams / Entire Organization'}
                                    </option>
                                    {availableTeamsForDept.map(t => (
                                        <option key={t.teamId} value={t.teamId}>
                                            👥 {t.teamName} ({t.memberCount} members) {t.departmentName ? `• ${t.departmentName}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Step C: Single Employee Selection */}
                            <div className={`ai-cascade-card ${selectedEmployeeId ? 'active' : ''}`}>
                                <div className="ai-cascade-header">
                                    <span className="ai-cascade-title">
                                        <UserCircle2 size={14} color="var(--teal, #00A99D)" /> 3. Assign to Single Employee <span style={{ textTransform: 'none', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>(Optional)</span>
                                    </span>
                                    {selectedEmployeeId && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedEmployeeId('')}
                                            style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Clear Employee (Assign to Team/Dept)
                                        </button>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <div className="ai-emp-search" style={{ flex: 1 }}>
                                        <Search size={14} className="ai-search-icon" />
                                        <input
                                            type="text"
                                            placeholder="Search employee name or role to assign..."
                                            value={employeeSearch}
                                            onChange={e => setEmployeeSearch(e.target.value)}
                                        />
                                        {loadingEmployees && <Loader2 size={14} className="ai-spin" />}
                                    </div>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--status-active)', whiteSpace: 'nowrap' }}>
                                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-active)', display: 'inline-block' }} />
                                        {filteredEmployees.length} Available
                                    </span>
                                </div>

                                {/* Employee list */}
                                {loadingEmployees ? (
                                    <div className="ai-emp-loading" style={{ marginTop: 8 }}>
                                        {[1, 2, 3].map(i => <div key={i} className="ai-skeleton-row" />)}
                                    </div>
                                ) : filteredEmployees.length > 0 ? (
                                    <div className="ai-emp-list" style={{ maxHeight: 240, overflowY: 'auto', marginTop: 8 }}>
                                        {/* Option to keep scope as Whole Team or Whole Dept */}
                                        <div
                                            className={`ai-emp-row${!selectedEmployeeId ? ' selected' : ''}`}
                                            onClick={() => setSelectedEmployeeId('')}
                                            style={{ borderStyle: 'dashed' }}
                                        >
                                            <input type="radio" name="ai-emp" checked={!selectedEmployeeId} onChange={() => { }} />
                                            <div className="ai-emp-avatar" style={{ background: '#f1f5f9', color: '#64748b' }}>
                                                {selectedTeamId ? <Users size={16} /> : <Building size={16} />}
                                            </div>
                                            <div className="ai-emp-info">
                                                <span className="ai-emp-name" style={{ fontWeight: 600 }}>
                                                    {selectedTeamId ? 'Assign to Whole Team (All Members)' : (selectedDepartmentId ? 'Assign to Entire Department' : 'Assign to All Departments (Company-Wide)')}
                                                </span>
                                                <div className="ai-emp-meta">
                                                    <span>Shared collective task queue</span>
                                                </div>
                                            </div>
                                        </div>

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
                                                                {emp.role && <span className="ai-emp-role" style={{ fontSize: 11, color: '#64748b' }}>• {emp.role}</span>}
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
                                                            {aiEnabled && isBestPick && (
                                                                <span className="ai-best-badge"><Zap size={10} /> Best</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="ai-empty-state" style={{ padding: 14 }}>
                                        <UserCircle2 size={20} />
                                        <p style={{ margin: 0, fontSize: 12 }}>No available employees found matching filter.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT COLUMN: Sticky Side Summary & Review Action ── */}
                <div className="ai-creation-sidebar">
                    <div className="ai-side-summary-card">
                        <div className="ai-side-header">
                            <h4><Activity size={16} color="var(--primary, #00A99D)" /> Assignment Summary</h4>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(0, 169, 157, 0.12)', color: 'var(--teal, #00A99D)' }}>
                                Live Preview
                            </span>
                        </div>

                        {/* Summary Live Preview Items */}
                        <div className="ai-side-preview-list">
                            <div className="ai-side-preview-item">
                                <span className="ai-side-preview-label">Scope & Destination</span>
                                <span className="ai-side-preview-val" style={{ color: 'var(--teal, #00A99D)', fontWeight: 700 }}>
                                    {scope === 'SingleEmployee' ? <UserCircle2 size={13} /> : scope === 'Team' ? <Users size={13} /> : <Building size={13} />}
                                    {targetDisplayName}
                                </span>
                            </div>

                            <div className="ai-side-preview-item">
                                <span className="ai-side-preview-label">Priority & SLA Tier</span>
                                <span className="ai-side-preview-val">
                                    {form.priority ? (
                                        <span>
                                            {form.priority === 'Urgent' ? '🔴 Urgent (24h Locked)' : form.priority === 'High' ? '🟠 High (1-2 Days)' : form.priority === 'Medium' ? '🟡 Medium (Up to 7 Days)' : '🟢 Low'}
                                        </span>
                                    ) : (
                                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Not selected</span>
                                    )}
                                </span>
                            </div>

                            <div className="ai-side-preview-item">
                                <span className="ai-side-preview-label">Target Deadline</span>
                                <span className="ai-side-preview-val">
                                    {form.dueAt ? (
                                        <span><Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />{new Date(form.dueAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                    ) : (
                                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Required</span>
                                    )}
                                </span>
                            </div>

                            <div className="ai-side-preview-item">
                                <span className="ai-side-preview-label">Supporting Files</span>
                                <span className="ai-side-preview-val">
                                    {supportingFiles.length > 0 ? `${supportingFiles.length} file(s) attached` : 'None'}
                                </span>
                            </div>

                            <div className="ai-side-preview-item">
                                <span className="ai-side-preview-label">Confidentiality</span>
                                <span className="ai-side-preview-val">
                                    {form.isConfidential ? '🔒 Restricted (Coordinators only)' : 'Standard Visibility'}
                                </span>
                            </div>
                        </div>

                        {/* Error Banner */}
                        {formError && (
                            <div className="ai-error-banner" style={{ margin: 0, padding: '8px 10px', fontSize: 12 }}>
                                <AlertCircle size={13} />
                                <span>{formError}</span>
                            </div>
                        )}

                        <div className="ai-validate-note" style={{ margin: 0, padding: '8px 10px', fontSize: 11.5 }}>
                            <Shield size={13} />
                            <span>Destination and workload are validated before final submission.</span>
                        </div>

                        {/* Prominent Review Button */}
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleReview}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                padding: '12px 18px',
                                fontSize: 14,
                                fontWeight: 700,
                                background: 'var(--teal, #00A99D)',
                                borderColor: 'var(--teal, #00A99D)',
                                color: '#fff',
                                borderRadius: 8,
                                boxShadow: '0 4px 14px rgba(0, 169, 157, 0.35)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <CheckCircle2 size={16} /> Review & Validate Assignment <ArrowRight size={15} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Duplicate task warning (U-001) ── */}
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
