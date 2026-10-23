import React, { useMemo } from 'react';
import { Shield, Truck, FileText, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

export interface DepartmentOption {
    departmentId?: string;
    id?: string;
    name: string;
}

export interface JobPositionOption {
    jobPositionId?: string;
    id?: string;
    name: string;
    departmentId?: string;
}

export interface SystemAccessConfigCardProps {
    targetSystems: string[];
    onChangeTargetSystems: (systems: string[]) => void;
    // STARS configuration
    departmentId?: string;
    jobPositionId?: string;
    role?: string;
    onChangeDepartmentId: (deptId: string) => void;
    onChangeJobPositionId: (posId: string) => void;
    onChangeRole: (role: string) => void;
    departments: DepartmentOption[];
    jobPositions: JobPositionOption[];
    availableRoles: string[];
    loadingOrg?: boolean;
    // DMS configuration
    dmsRole?: string;
    dmsAreas?: string[];
    onChangeDmsRole: (role: string) => void;
    onChangeDmsAreas: (areas: string[]) => void;
    // FOMS configuration
    fomsRole?: string;
    onChangeFomsRole: (role: string) => void;
    // Shared state
    errors?: Record<string, string | undefined>;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    disabled?: boolean;
}

export const getRolesForPosition = (positionName?: string, allRoles: string[] = []): string[] => {
    if (!positionName || !positionName.trim()) {
        return allRoles && allRoles.length > 0 ? allRoles : ['Manager', 'Coordinator', 'Dispatcher', 'Encoder', 'Courier', 'Accountant'];
    }
    const pos = positionName.toLowerCase().trim();

    // 1. Accounting / Finance / Billing / Audit
    if (pos.includes('account') || pos.includes('finance') || pos.includes('billing') || pos.includes('audit') || pos.includes('bookkeep')) {
        if (pos.includes('head') || pos.includes('manager') || pos.includes('lead') || pos.includes('chief') || pos.includes('director')) {
            return ['Accountant', 'Manager'];
        }
        return ['Accountant'];
    }

    // 2. Courier / Driver / Rider / Fleet delivery
    if (pos.includes('courier') || pos.includes('driver') || pos.includes('rider') || pos.includes('delivery')) {
        return ['Courier'];
    }

    // 3. Dispatch / Logistics
    if (pos.includes('dispatch') || pos.includes('logistics')) {
        if (pos.includes('manager') || pos.includes('head') || pos.includes('director')) {
            return ['Dispatcher', 'Manager', 'Coordinator'];
        }
        return ['Dispatcher', 'Coordinator'];
    }

    // 4. Encoder / Clerk / Assistant / Staff
    if (pos.includes('encoder') || pos.includes('clerk') || pos.includes('assistant') || pos.includes('staff')) {
        return ['Encoder', 'Coordinator'];
    }

    // 5. Coordinator / Supervisor / Lead / Specialist
    if (pos.includes('coordinator') || pos.includes('supervisor') || pos.includes('lead') || pos.includes('specialist')) {
        return ['Coordinator', 'Manager'];
    }

    // 6. Management / Director / Executive / Admin
    if (pos.includes('manager') || pos.includes('director') || pos.includes('head') || pos.includes('admin') || pos.includes('executive')) {
        return ['Manager', 'Coordinator'];
    }

    return allRoles && allRoles.length > 0 ? allRoles : ['Coordinator', 'Encoder'];
};

export const getFomsRoleForPosition = (positionName?: string): string => {
    if (!positionName || !positionName.trim()) return 'Accountant';
    const pos = positionName.toLowerCase().trim();

    if (pos.includes('head accountant') || (pos.includes('head') && pos.includes('account'))) {
        return 'Head Accountant';
    }
    if (pos.includes('assistant financial manager') || (pos.includes('assistant') && (pos.includes('finance') || pos.includes('financial') || pos.includes('manager')))) {
        return 'Assistant Financial Manager';
    }
    if (pos.includes('financial manager') || (pos.includes('finance') && pos.includes('manager')) || (pos.includes('finance') && pos.includes('head'))) {
        return 'Financial Manager';
    }
    if (pos.includes('manager') || pos.includes('director') || pos.includes('chief executive') || pos.includes('president')) {
        return 'Financial Manager';
    }
    if (pos.includes('account') || pos.includes('billing') || pos.includes('audit') || pos.includes('payroll') || pos.includes('bookkeep')) {
        return 'Accountant';
    }
    return 'Accountant';
};

export const getDmsRoleForPosition = (positionName?: string): string => {
    if (!positionName || !positionName.trim()) return 'Encoder';
    const pos = positionName.toLowerCase().trim();

    if (pos.includes('courier') || pos.includes('driver') || pos.includes('rider') || pos.includes('delivery')) {
        return 'Driver';
    }
    if (pos.includes('manager') || pos.includes('director') || pos.includes('admin') || pos.includes('fleet head') || pos.includes('head')) {
        return 'Admin';
    }
    if (pos.includes('encoder') || pos.includes('clerk') || pos.includes('data')) {
        return 'Encoder';
    }
    return 'Encoder';
};

export const SystemAccessConfigCard: React.FC<SystemAccessConfigCardProps> = ({
    targetSystems,
    onChangeTargetSystems,
    departmentId = '',
    jobPositionId = '',
    role = '',
    onChangeDepartmentId,
    onChangeJobPositionId,
    onChangeRole,
    departments,
    jobPositions,
    availableRoles,
    loadingOrg = false,
    dmsRole = 'Encoder',
    dmsAreas = ['Manila'],
    onChangeDmsRole,
    onChangeDmsAreas,
    fomsRole = 'Accountant',
    onChangeFomsRole,
    errors = {},
    isCollapsed,
    onToggleCollapse,
    disabled = false,
}) => {
    const selectedCount = targetSystems.length;

    const matchedDept = useMemo(() => {
        if (!departmentId) return undefined;
        return departments.find(d => {
            const dId = d.departmentId ?? d.id;
            return dId && String(dId).toLowerCase() === String(departmentId).toLowerCase();
        });
    }, [departmentId, departments]);

    const selectedDeptId = matchedDept ? (matchedDept.departmentId ?? matchedDept.id ?? departmentId) : departmentId;

    const matchedPos = useMemo(() => {
        if (!jobPositionId) return undefined;
        return jobPositions.find(p => {
            const pId = p.jobPositionId ?? p.id;
            return pId && String(pId).toLowerCase() === String(jobPositionId).toLowerCase();
        });
    }, [jobPositionId, jobPositions]);

    const selectedPosId = matchedPos ? (matchedPos.jobPositionId ?? matchedPos.id ?? jobPositionId) : jobPositionId;

    const availablePositions = useMemo(() => {
        if (!selectedDeptId) return [];
        return jobPositions.filter(p => {
            const pDeptId = p.departmentId;
            return pDeptId && String(pDeptId).toLowerCase() === String(selectedDeptId).toLowerCase();
        });
    }, [selectedDeptId, jobPositions]);

    const allRolesList = useMemo(() => {
        const DEFAULT_ROLES = ['Manager', 'Coordinator', 'Dispatcher', 'Encoder', 'Courier', 'Accountant'];
        const base = availableRoles && availableRoles.length > 0 ? availableRoles : DEFAULT_ROLES;
        const set = new Set<string>();
        base.forEach(r => {
            if (r && typeof r === 'string' && r.trim()) {
                const norm = r.trim() === 'Courier/Driver' ? 'Courier' : r.trim();
                set.add(norm);
            }
        });
        DEFAULT_ROLES.forEach(r => set.add(r));
        if (role && typeof role === 'string' && role.trim()) {
            set.add(role.trim());
        }
        return Array.from(set);
    }, [availableRoles, role]);

    const starsRoleOptions = useMemo(() => {
        // 1. If position is selected, strictly filter based on that position
        if (matchedPos && matchedPos.name) {
            const posRoles = getRolesForPosition(matchedPos.name, availableRoles);
            if (role && !posRoles.includes(role)) {
                return [...posRoles, role];
            }
            return posRoles;
        }
        // 2. If no position is selected yet, all available system roles can be selected
        return allRolesList;
    }, [matchedPos, availableRoles, allRolesList, role]);

    const handleDepartmentChange = (deptId: string) => {
        onChangeDepartmentId(deptId);
        // If current position does not belong to the newly selected department, clear position
        const pos = jobPositions.find(p => {
            const pId = p.jobPositionId ?? p.id;
            return pId && selectedPosId && String(pId).toLowerCase() === String(selectedPosId).toLowerCase();
        });
        const posBelongsToDept = pos && deptId && String(pos.departmentId).toLowerCase() === String(deptId).toLowerCase();
        if (!posBelongsToDept) {
            onChangeJobPositionId('');
            const deptPositions = jobPositions.filter(p => p.departmentId && String(p.departmentId).toLowerCase() === String(deptId).toLowerCase());
            const deptRoles = Array.from(new Set(deptPositions.flatMap(p => getRolesForPosition(p.name, availableRoles))));
            if (deptRoles.length > 0 && (!role || !deptRoles.includes(role))) {
                onChangeRole(deptRoles[0]);
            }
        }
    };

    const handlePositionChange = (posId: string) => {
        onChangeJobPositionId(posId);
        if (!posId) return;

        const pos = jobPositions.find(p => {
            const pId = p.jobPositionId ?? p.id;
            return pId && String(pId).toLowerCase() === String(posId).toLowerCase();
        });
        const posName = pos?.name;
        if (posName) {
            // 1. Automatically connect to STARS operational role
            const allowed = getRolesForPosition(posName, availableRoles);
            if (allowed.length > 0 && (!role || !allowed.includes(role))) {
                onChangeRole(allowed[0]);
            }
            // 2. Automatically connect to FOMS role (e.g. Head Accountant -> Head Accountant)
            const connectedFomsRole = getFomsRoleForPosition(posName);
            if (connectedFomsRole && onChangeFomsRole) {
                onChangeFomsRole(connectedFomsRole);
            }
            // 3. Automatically connect to DMS role (e.g. Courier / Driver -> Driver)
            const connectedDmsRole = getDmsRoleForPosition(posName);
            if (connectedDmsRole && onChangeDmsRole) {
                onChangeDmsRole(connectedDmsRole);
            }
        }
    };

    const handleToggleSystem = (systemName: 'STARS' | 'DMS' | 'FOMS') => {
        if (disabled) return;
        const exists = targetSystems.includes(systemName);
        if (exists) {
            // Check if this is the last system remaining
            if (targetSystems.length <= 1) {
                // Must have at least 1 system!
                return;
            }
            const next = targetSystems.filter(s => s !== systemName);
            onChangeTargetSystems(next);
        } else {
            const next = [...targetSystems, systemName];
            onChangeTargetSystems(next);
        }
    };

    const FieldErr = ({ msg }: { msg?: string }) =>
        msg ? (
            <span
                className="field-error"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--status-failed, #ef4444)',
                    fontSize: 11,
                    marginTop: 4,
                }}
            >
                <AlertCircle size={12} /> {msg}
            </span>
        ) : null;

    const inputStyle = (hasErr?: string): React.CSSProperties => ({
        border: hasErr ? '1px solid var(--status-failed, #ef4444)' : '1px solid var(--border)',
    });

    return (
        <div
            className="fm-section"
            style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
                background: 'var(--bg-input, rgba(255, 255, 255, 0.03))',
                marginBottom: 16,
            }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-card, transparent)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: !isCollapsed ? '1px solid var(--border)' : 'none',
                }}
                onClick={onToggleCollapse}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: 'rgba(59, 130, 246, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--primary, #3b82f6)',
                        }}
                    >
                        <Shield size={16} />
                    </div>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>System Access & Role Configuration</span>
                            <span
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: 12,
                                    background: selectedCount > 0 ? 'rgba(59, 130, 246, 0.12)' : 'var(--status-pending-bg, #f1f5f9)',
                                    color: selectedCount > 0 ? 'var(--primary, #3b82f6)' : 'var(--text-secondary, #64748b)',
                                }}
                            >
                                {selectedCount} of 3 Selected
                            </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                            Authorize operational platforms and configure employee roles directly (At least 1 required)
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>
                        {isCollapsed ? 'Expand' : 'Collapse'}
                    </span>
                    {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </div>
            </div>

            {!isCollapsed && (
                <div style={{ padding: '16px' }}>
                    {/* STARS System Card */}
                    {(() => {
                        const isChecked = targetSystems.includes('STARS');
                        const isOnlyOne = isChecked && selectedCount === 1;
                        return (
                            <div
                                style={{
                                    borderRadius: 8,
                                    border: isChecked ? '1.5px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
                                    background: isChecked ? 'rgba(59, 130, 246, 0.02)' : 'var(--bg-card, transparent)',
                                    marginBottom: 12,
                                    overflow: 'hidden',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 14px',
                                        cursor: isOnlyOne ? 'not-allowed' : 'pointer',
                                        background: isChecked ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
                                        userSelect: 'none',
                                    }}
                                    title={isOnlyOne ? 'At least one operational system must remain selected.' : undefined}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            disabled={disabled || isOnlyOne}
                                            style={{
                                                width: 17,
                                                height: 17,
                                                accentColor: 'var(--primary, #3b82f6)',
                                                cursor: isOnlyOne ? 'not-allowed' : 'pointer',
                                            }}
                                            onChange={() => handleToggleSystem('STARS')}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Shield size={16} style={{ color: 'var(--primary, #3b82f6)' }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                                                    STARS <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>• Head Office & Operations Review</span>
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                                                    Task allocation, operational review, workflow control
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            padding: '2px 8px',
                                            borderRadius: 4,
                                            background: isChecked ? 'rgba(59, 130, 246, 0.15)' : 'rgba(100, 116, 139, 0.1)',
                                            color: isChecked ? 'var(--primary, #3b82f6)' : 'var(--text-secondary)',
                                        }}
                                    >
                                        {isChecked ? 'Active' : 'Not Granted'}
                                    </span>
                                </label>

                                {isChecked && (
                                    <div
                                        style={{
                                            padding: '14px 16px',
                                            borderTop: '1px solid rgba(59, 130, 246, 0.15)',
                                            background: 'var(--s0, #ffffff)',
                                        }}
                                    >
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary, #3b82f6)', marginBottom: 10 }}>
                                            STARS Role & Department Assignment
                                        </div>
                                        <div className="fm-field-grid">
                                            {/* Department */}
                                            <div className="fm-field">
                                                <label className="fm-label" htmlFor="stars-dept-select">
                                                    Department <span style={{ color: 'var(--status-failed, #ef4444)' }}>*</span>
                                                </label>
                                                <select
                                                    id="stars-dept-select"
                                                    value={selectedDeptId}
                                                    onChange={e => handleDepartmentChange(e.target.value)}
                                                    className="fm-select"
                                                    style={inputStyle(errors.departmentId)}
                                                    disabled={disabled || loadingOrg}
                                                >
                                                    <option value="">{loadingOrg ? 'Loading departments...' : 'Select a department'}</option>
                                                    {departments.map(d => {
                                                        const dId = d.departmentId ?? d.id;
                                                        return (
                                                            <option key={dId} value={dId}>
                                                                {d.name}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                                <FieldErr msg={errors.departmentId} />
                                            </div>

                                            {/* Position */}
                                            <div className="fm-field">
                                                <label className="fm-label" htmlFor="stars-position-select">
                                                    Position <span style={{ color: 'var(--status-failed, #ef4444)' }}>*</span>
                                                </label>
                                                <select
                                                    id="stars-position-select"
                                                    value={selectedPosId}
                                                    onChange={e => handlePositionChange(e.target.value)}
                                                    className="fm-select"
                                                    style={{
                                                        ...inputStyle(errors.jobPositionId),
                                                        opacity: loadingOrg ? 0.6 : 1,
                                                        cursor: !selectedDeptId ? 'not-allowed' : 'pointer',
                                                    }}
                                                    disabled={disabled || loadingOrg || !selectedDeptId}
                                                    title={!selectedDeptId ? 'Please select a department first' : undefined}
                                                >
                                                    <option value="">
                                                        {selectedDeptId ? 'Select a position' : 'Select a department first'}
                                                    </option>
                                                    {availablePositions.map(p => {
                                                        const pId = p.jobPositionId ?? p.id;
                                                        return (
                                                            <option key={pId} value={pId}>
                                                                {p.name}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                                <FieldErr msg={errors.jobPositionId} />
                                            </div>

                                            {/* Role */}
                                            <div className="fm-field" style={{ gridColumn: 'span 2' }}>
                                                <label className="fm-label" htmlFor="stars-role-select">
                                                    STARS Operational Role <span style={{ color: 'var(--status-failed, #ef4444)' }}>*</span>
                                                </label>
                                                <select
                                                    id="stars-role-select"
                                                    value={role}
                                                    onChange={e => onChangeRole(e.target.value)}
                                                    className="fm-select"
                                                    style={{
                                                        ...inputStyle(errors.role),
                                                        cursor: 'pointer',
                                                    }}
                                                    disabled={disabled || loadingOrg}
                                                >
                                                    <option value="">Select a role</option>
                                                    {starsRoleOptions.map(r => (
                                                        <option key={r} value={r}>
                                                            {r}
                                                        </option>
                                                    ))}
                                                </select>
                                                <FieldErr msg={errors.role} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* DMS System Card */}
                    {(() => {
                        const isChecked = targetSystems.includes('DMS');
                        const isOnlyOne = isChecked && selectedCount === 1;
                        return (
                            <div
                                style={{
                                    borderRadius: 8,
                                    border: isChecked ? '1.5px solid #10b981' : '1px solid var(--border)',
                                    background: isChecked ? 'rgba(16, 185, 129, 0.02)' : 'var(--bg-card, transparent)',
                                    marginBottom: 12,
                                    overflow: 'hidden',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 14px',
                                        cursor: isOnlyOne ? 'not-allowed' : 'pointer',
                                        background: isChecked ? 'rgba(16, 185, 129, 0.06)' : 'transparent',
                                        userSelect: 'none',
                                    }}
                                    title={isOnlyOne ? 'At least one operational system must remain selected.' : undefined}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            disabled={disabled || isOnlyOne}
                                            style={{
                                                width: 17,
                                                height: 17,
                                                accentColor: '#10b981',
                                                cursor: isOnlyOne ? 'not-allowed' : 'pointer',
                                            }}
                                            onChange={() => handleToggleSystem('DMS')}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Truck size={16} style={{ color: '#10b981' }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                                                    DMS <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>• Delivery & Fleet System</span>
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                                                    Driver routing, parcel dispatch, courier management
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            padding: '2px 8px',
                                            borderRadius: 4,
                                            background: isChecked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.1)',
                                            color: isChecked ? '#059669' : 'var(--text-secondary)',
                                        }}
                                    >
                                        {isChecked ? 'Active' : 'Not Granted'}
                                    </span>
                                </label>

                                {isChecked && (
                                    <div
                                        style={{
                                            padding: '14px 16px',
                                            borderTop: '1px solid rgba(16, 185, 129, 0.15)',
                                            background: 'var(--s0, #ffffff)',
                                        }}
                                    >
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#059669', marginBottom: 10 }}>
                                            DMS Fleet & Dispatch Assignment
                                        </div>
                                        <div className="fm-field-grid">
                                            <div className="fm-field">
                                                <label className="fm-label" htmlFor="dms-role-select">
                                                    DMS Operational Role <span style={{ color: 'var(--status-failed, #ef4444)' }}>*</span>
                                                </label>
                                                <select
                                                    id="dms-role-select"
                                                    value={dmsRole || 'Encoder'}
                                                    onChange={e => onChangeDmsRole(e.target.value)}
                                                    className="fm-select"
                                                    disabled={disabled}
                                                >
                                                    <option value="Admin">Admin (Fleet Administrator)</option>
                                                    <option value="Encoder">Encoder (Operations Team)</option>
                                                    <option value="Driver">Driver (Courier / Rider)</option>
                                                    <option value="Client">Client (Consignor / Order Creator)</option>
                                                </select>
                                                <FieldErr msg={errors.dmsRole} />
                                            </div>
                                            <div className="fm-field">
                                                <label className="fm-label" htmlFor="dms-areas-input">
                                                    Assigned Delivery Area / Hub <span style={{ color: 'var(--status-failed, #ef4444)' }}>*</span>
                                                </label>
                                                <input
                                                    id="dms-areas-input"
                                                    type="text"
                                                    placeholder="e.g. Manila, Quezon City, Makati"
                                                    value={dmsAreas ? dmsAreas.join(', ') : 'Manila'}
                                                    onChange={e => {
                                                        const areas = e.target.value
                                                            .split(',')
                                                            .map(s => s.trim())
                                                            .filter(Boolean);
                                                        onChangeDmsAreas(areas);
                                                    }}
                                                    className="fm-input"
                                                    style={inputStyle(errors.dmsAreas)}
                                                    disabled={disabled}
                                                />
                                                <FieldErr msg={errors.dmsAreas} />
                                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                                                    Comma-separated service hubs or delivery operational zones
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* FOMS System Card */}
                    {(() => {
                        const isChecked = targetSystems.includes('FOMS');
                        const isOnlyOne = isChecked && selectedCount === 1;
                        return (
                            <div
                                style={{
                                    borderRadius: 8,
                                    border: isChecked ? '1.5px solid #f59e0b' : '1px solid var(--border)',
                                    background: isChecked ? 'rgba(245, 158, 11, 0.02)' : 'var(--bg-card, transparent)',
                                    marginBottom: 4,
                                    overflow: 'hidden',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 14px',
                                        cursor: isOnlyOne ? 'not-allowed' : 'pointer',
                                        background: isChecked ? 'rgba(245, 158, 11, 0.06)' : 'transparent',
                                        userSelect: 'none',
                                    }}
                                    title={isOnlyOne ? 'At least one operational system must remain selected.' : undefined}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            disabled={disabled || isOnlyOne}
                                            style={{
                                                width: 17,
                                                height: 17,
                                                accentColor: '#f59e0b',
                                                cursor: isOnlyOne ? 'not-allowed' : 'pointer',
                                            }}
                                            onChange={() => handleToggleSystem('FOMS')}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <FileText size={16} style={{ color: '#f59e0b' }} />
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                                                    FOMS <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>• Finance & Billing System</span>
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                                                    Financial accounting, audits, payroll, order ledger
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            padding: '2px 8px',
                                            borderRadius: 4,
                                            background: isChecked ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.1)',
                                            color: isChecked ? '#d97706' : 'var(--text-secondary)',
                                        }}
                                    >
                                        {isChecked ? 'Active' : 'Not Granted'}
                                    </span>
                                </label>

                                {isChecked && (
                                    <div
                                        style={{
                                            padding: '14px 16px',
                                            borderTop: '1px solid rgba(245, 158, 11, 0.15)',
                                            background: 'var(--s0, #ffffff)',
                                        }}
                                    >
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#d97706', marginBottom: 10 }}>
                                            FOMS Finance & Payroll Assignment
                                        </div>
                                        <div className="fm-field-grid">
                                            <div className="fm-field">
                                                <label className="fm-label" htmlFor="foms-role-select">
                                                    FOMS Finance Role <span style={{ color: 'var(--status-failed, #ef4444)' }}>*</span>
                                                </label>
                                                <select
                                                    id="foms-role-select"
                                                    value={fomsRole || 'Accountant'}
                                                    onChange={e => onChangeFomsRole(e.target.value)}
                                                    className="fm-select"
                                                    disabled={disabled}
                                                >
                                                    <option value="Financial Manager">Financial Manager</option>
                                                    <option value="Head Accountant">Head Accountant</option>
                                                    <option value="Accountant">Accountant</option>
                                                    <option value="Assistant Financial Manager">Assistant Financial Manager</option>
                                                </select>
                                                <FieldErr msg={errors.fomsRole} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* Minimum system validation error */}
                    <FieldErr msg={errors.targetSystems} />
                    {selectedCount === 1 && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, fontStyle: 'italic' }}>
                            Note: At least one system must remain selected across Speedex.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SystemAccessConfigCard;
