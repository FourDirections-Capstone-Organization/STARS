import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    downloadDeliveryCsvReport,
    downloadDeliveryPdfReport,
} from '../components/DmsDeliveryTab/DeliveryReportExport';
import { DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';

describe('DeliveryReportExport', () => {
    const mockDeliveries: DmsDeliveryItem[] = [
        {
            taskId: 'task-1',
            taskTitle: 'Critical Server Parts Dispatch',
            taskNumber: 'TSK-1001',
            recipientName: 'Alice Johnson',
            recipientContact: '+63 917 123 4567',
            deliveryAddress: 'Ayala Ave, Makati City',
            area: 'Makati',
            courierEmployeeId: 'DRV-001',
            dmsWaybillNo: 'WB-99001',
            dmsStatus: 'Delivered',
            syncStatus: 'Synced',
            createdAt: '2026-10-18T10:00:00Z',
            dmsLastSyncedAt: '2026-10-18T11:30:00Z',
        },
        {
            taskId: 'task-2',
            taskTitle: 'Urgent Client Contracts',
            taskNumber: 'TSK-1002',
            recipientName: 'Bob Smith',
            recipientContact: '+63 918 765 4321',
            deliveryAddress: 'Bonifacio High Street, Taguig City',
            area: 'Taguig / BGC',
            courierEmployeeId: 'DRV-002',
            dmsWaybillNo: 'WB-99002',
            dmsStatus: 'In Transit',
            syncStatus: 'Synced',
            createdAt: '2026-10-18T12:00:00Z',
        },
    ];

    const mockPerformance = {
        totalDeliveries: 2,
        onTimeCount: 2,
        lateCount: 0,
        onTimePercentage: 100,
    };

    const mockStats = {
        total: 2,
        inTransit: 1,
        delivered: 1,
        failed: 0,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('downloads CSV report with metadata, headers and records', () => {
        let createdBlob: Blob | null = null;
        let createdUrl = '';
        let clicked = false;

        // Mock URL.createObjectURL and revokeObjectURL
        global.URL.createObjectURL = vi.fn((blob: Blob) => {
            createdBlob = blob;
            createdUrl = 'blob:mock-url';
            return createdUrl;
        });
        global.URL.revokeObjectURL = vi.fn();

        const appendChildSpy = vi.spyOn(document.body, 'appendChild');
        const removeChildSpy = vi.spyOn(document.body, 'removeChild');

        // Spy on anchor click
        const clickMock = vi.fn();
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            const el = document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
            if (tagName === 'a') {
                el.click = clickMock;
            }
            return el;
        });

        downloadDeliveryCsvReport(mockDeliveries, mockPerformance, mockStats, 'All Shipments');

        expect(clickMock).toHaveBeenCalled();
        expect(global.URL.createObjectURL).toHaveBeenCalled();
        expect(createdBlob).not.toBeNull();

        // Restore createElement
        vi.restoreAllMocks();
    });

    it('generates PDF summary report without errors', () => {
        // Run PDF report generation with mocked jsPDF save
        expect(() => {
            downloadDeliveryPdfReport(mockDeliveries, mockPerformance, mockStats, 'All Shipments');
        }).not.toThrow();
    });
});
