import api from '../api';

const STORAGE_KEY = 'stars_created_dms_orders';

export const getCreatedDmsOrderKeys = (): Set<string> => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
};

export const recordCreatedDmsOrder = (orderId?: number | string, waybillNo?: string): void => {
    try {
        const set = getCreatedDmsOrderKeys();
        if (orderId && String(orderId) !== '0') {
            set.add(String(orderId));
        }
        if (waybillNo && waybillNo.trim()) {
            set.add(waybillNo.trim().toLowerCase());
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch {
        // Storage access fallback
    }
};

/**
 * Synchronizes delivery status when a STARS validation task is completed.
 * 1. Best-effort triggers /resend (if still Pending/unsynced) so DMS receives the completed task payload
 *    even when completed via status transition rather than /review.
 * 2. Updates delivery-details with dmsStatus = 'Pending for Delivery' if DMS status is still Pending / Pending Approval,
 *    ensuring STARS accurately reflects that the order is awaiting courier delivery in DMS instead of prematurely 'Delivered'.
 */
export const syncDmsTaskCompleted = async (taskId: string): Promise<void> => {
    if (!taskId) return;
    try {
        const res = await api.get<any>(`/api/dms-integration/tasks/${taskId}/delivery-details`);
        let data = res?.data?.data ?? res?.data;
        if (!data || (!data.recipientName && !data.dmsWaybillNo && !data.dmsOrderId)) {
            return;
        }

        if (data.dmsOrderId || data.dmsWaybillNo) {
            recordCreatedDmsOrder(data.dmsOrderId, data.dmsWaybillNo);
        }

        const currentStatus = String(data.dmsStatus || '').toLowerCase();
        const isAlreadyFinalOrTransit =
            currentStatus.includes('delivered') ||
            currentStatus.includes('completed') ||
            currentStatus.includes('transit') ||
            currentStatus.includes('out for delivery');

        if (!isAlreadyFinalOrTransit) {
            try {
                const resendRes = await api.post<any>(`/api/dms-integration/tasks/${taskId}/resend`, {});
                const resendData = resendRes?.data?.data ?? resendRes?.data;
                if (resendData) {
                    data = { ...data, ...resendData };
                }
            } catch {
                // Outbound DMS call may fail in offline/local or unconfigured environments; continue local sync
            }
        }

        const postResendStatus = String(data.dmsStatus || '').toLowerCase();
        if (!postResendStatus.includes('delivered') && !postResendStatus.includes('completed') && !postResendStatus.includes('transit') && !postResendStatus.includes('out for delivery')) {
            let taskType = data.taskType;
            let packageType = data.packageType;
            let weight = data.weight;
            let itemCount = data.itemCount;

            if (!itemCount || itemCount <= 1 || !taskType || !packageType || !weight) {
                try {
                    const pendingRes = await api.get<any>('/api/dms-integration/pending-orders');
                    const pList = pendingRes?.data?.data ?? pendingRes?.data;
                    if (Array.isArray(pList)) {
                        const matched = pList.find((p: any) =>
                            (data.dmsWaybillNo && p.waybillNo && String(p.waybillNo).toLowerCase() === String(data.dmsWaybillNo).toLowerCase()) ||
                            (data.dmsOrderId && p.orderId && p.orderId === data.dmsOrderId)
                        );
                        if (matched) {
                            if (matched.itemCount && (!itemCount || itemCount <= 1)) itemCount = matched.itemCount;
                            if (matched.taskType && (!taskType || taskType === 'Standard Delivery')) taskType = matched.taskType;
                            if (matched.packageType && (!packageType || packageType === 'Parcel')) packageType = matched.packageType;
                            if (matched.weight && (!weight || weight === '—' || weight === '1.0 kg')) weight = matched.weight;
                        }
                    }
                } catch {
                    // Non-blocking lookup
                }
            }

            await api.put(`/api/dms-integration/tasks/${taskId}/delivery-details`, {
                recipientName: data.recipientName || 'Operations Dispatch',
                recipientContact: data.recipientContact || '09123456789',
                deliveryAddress: data.deliveryAddress || 'Metro Manila',
                area: data.area || '',
                packageDescription: data.packageDescription || '',
                senderAddress: data.senderAddress || 'STARS Operations Office',
                specialInstructions: data.specialInstructions || '',
                courierEmployeeId: data.courierEmployeeId || '',
                courierFullName: data.courierFullName || '',
                taskType: taskType || data.taskType,
                packageType: packageType || data.packageType,
                weight: weight || data.weight,
                itemCount: itemCount ?? data.itemCount,
                dmsOrderId: data.dmsOrderId,
                dmsWaybillNo: data.dmsWaybillNo,
                dmsStatus: 'Pending for Delivery',
            });
        }
    } catch {
        // Silently ignore if task has no delivery details
    }
};
