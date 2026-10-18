import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeliveryAnalyticsCharts from '../components/DmsDeliveryTab/DeliveryAnalyticsCharts';
import { DmsDeliveryItem } from '../components/DmsDeliveryTab/DmsDeliveryTab';

// Mock Recharts ResponsiveContainer to render children directly in jsdom
vi.mock('recharts', async () => {
    const actual: any = await vi.importActual('recharts');
    return {
        ...actual,
        ResponsiveContainer: ({ children }: any) => <div className="recharts-responsive-container">{children}</div>,
    };
});

describe('DeliveryAnalyticsCharts', () => {
    const mockDeliveries: DmsDeliveryItem[] = [
        {
            taskId: 'task-1',
            taskTitle: 'Equipment Dispatch',
            recipientName: 'Alice Johnson',
            recipientContact: '09170000000',
            deliveryAddress: 'Ayala Ave, Makati',
            area: 'Makati',
            courierEmployeeId: 'DRV-001',
            dmsWaybillNo: 'WB-001',
            dmsStatus: 'Delivered',
            syncStatus: 'Synced',
        },
        {
            taskId: 'task-2',
            taskTitle: 'Documents Delivery',
            recipientName: 'Bob Smith',
            recipientContact: '09180000000',
            deliveryAddress: 'High Street, Taguig',
            area: 'Taguig / BGC',
            courierEmployeeId: 'DRV-002',
            dmsStatus: 'In Transit',
            syncStatus: 'Synced',
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

    it('renders the analytics header and quick highlights', () => {
        render(
            <DeliveryAnalyticsCharts
                deliveries={mockDeliveries}
                performance={mockPerformance}
                stats={mockStats}
            />
        );

        expect(screen.getByText('Delivery Analytics & Visual Insights')).toBeInTheDocument();
        expect(screen.getByText('Live DMS Data')).toBeInTheDocument();
        expect(screen.getByText(/Top Delivery Area:/i)).toBeInTheDocument();
        expect(screen.getByText(/SLA Benchmark:/i)).toBeInTheDocument();
    });

    it('toggles collapse state when clicking the Hide/Show button', () => {
        render(
            <DeliveryAnalyticsCharts
                deliveries={mockDeliveries}
                performance={mockPerformance}
                stats={mockStats}
            />
        );

        const collapseBtn = screen.getByRole('button', { name: /hide graphs/i });
        fireEvent.click(collapseBtn);

        expect(screen.getByRole('button', { name: /show graphs/i })).toBeInTheDocument();
    });

    it('switches tabs to focus on specific charts', () => {
        render(
            <DeliveryAnalyticsCharts
                deliveries={mockDeliveries}
                performance={mockPerformance}
                stats={mockStats}
            />
        );

        const geoTabBtn = screen.getByRole('button', { name: /areas/i });
        fireEvent.click(geoTabBtn);

        expect(screen.getByText('Geographic Volume by Delivery Sector')).toBeInTheDocument();
    });
});
