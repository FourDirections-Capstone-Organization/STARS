import jsPDF from 'jspdf';
import { DmsDeliveryItem } from './DmsDeliveryTab';

export interface PerformanceSummary {
    totalDeliveries: number;
    onTimeCount: number;
    lateCount: number;
    onTimePercentage: number;
}

export interface DeliveryStats {
    total: number;
    inTransit: number;
    delivered: number;
    failed: number;
}

/**
 * Downloads a complete CSV report containing all delivery details,
 * metadata, SLA rates, and driver assignments.
 */
export const downloadDeliveryCsvReport = (
    deliveries: DmsDeliveryItem[],
    performance: PerformanceSummary,
    stats: DeliveryStats,
    filterName = 'All'
) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `STARS_Delivery_Summary_Report_${timestamp}.csv`;

    // Metadata & Executive Summary section at the top
    const summaryRows = [
        ['STARS OPERATIONS - DMS DELIVERY SUMMARY REPORT'],
        ['Generated Date', new Date().toLocaleString()],
        ['Filter / Scope', filterName],
        ['Total Shipments', stats.total.toString()],
        ['Delivered (POD)', stats.delivered.toString()],
        ['Active in Transit', stats.inTransit.toString()],
        ['Delivery Exceptions', stats.failed.toString()],
        ['SLA On-Time Percentage', `${performance.onTimePercentage}%`],
        ['On-Time Count', performance.onTimeCount.toString()],
        ['Late Count', performance.lateCount.toString()],
        [], // Blank line separating summary and registry table
    ];

    // Table Header
    const headers = [
        'Waybill Number',
        'Task Reference',
        'STARS Task Title',
        'Recipient Name',
        'Recipient Contact',
        'Delivery Address',
        'Area / Region',
        'Assigned Driver ID',
        'DMS Status',
        'Sync Status',
        'Latitude',
        'Longitude',
        'Last Ping Timestamp',
        'Created Timestamp',
        'Failure Reason'
    ];

    const dataRows = deliveries.map(d => [
        d.dmsWaybillNo || 'Pending Creation',
        d.taskNumber || d.taskReferenceNumber || d.taskId,
        d.taskTitle || 'Delivery Task',
        d.recipientName || '',
        d.recipientContact || '',
        d.deliveryAddress || '',
        d.area || '',
        d.courierEmployeeId || 'Auto / Pool',
        d.dmsStatus || 'Pending',
        d.syncStatus || 'Synced',
        d.dmsLatitude !== undefined ? d.dmsLatitude.toString() : '',
        d.dmsLongitude !== undefined ? d.dmsLongitude.toString() : '',
        d.dmsLastSyncedAt ? new Date(d.dmsLastSyncedAt).toLocaleString() : '',
        d.createdAt ? new Date(d.createdAt).toLocaleString() : '',
        d.dmsFailureReason || ''
    ]);

    const formatCsvRow = (row: string[]) =>
        row.map(field => `"${String(field ?? '').replace(/"/g, '""')}"`).join(',');

    const csvContent =
        '\uFEFF' + // UTF-8 BOM for Microsoft Excel compatibility
        summaryRows.map(formatCsvRow).join('\r\n') +
        '\r\n' +
        formatCsvRow(headers) +
        '\r\n' +
        dataRows.map(formatCsvRow).join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

/**
 * Generates and downloads an executive-ready, multi-page vector PDF summary report
 * complete with brand header, KPI overview cards, status distribution, regional breakdown,
 * and paginated shipment registry.
 */
export const downloadDeliveryPdfReport = (
    deliveries: DmsDeliveryItem[],
    performance: PerformanceSummary,
    stats: DeliveryStats,
    filterName = 'All'
) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    let currentY = 14;

    const brandTeal = { r: 0, g: 169, b: 157 }; // #00A99D
    const darkSlate = { r: 15, g: 23, b: 42 };  // #0F172A
    const textGray = { r: 100, g: 116, b: 139 }; // #64748B
    const borderGray = { r: 226, g: 232, b: 240 }; // #E2E8F0
    const cardBg = { r: 248, g: 250, b: 252 };  // #F8FAFC
    const successGreen = { r: 16, g: 185, b: 129 }; // #10B981
    const warningAmber = { r: 245, g: 158, b: 11 }; // #F59E0B
    const dangerRed = { r: 239, g: 68, b: 68 };    // #EF4444

    // Helper: Header on first page and subsequent pages
    const drawPageHeader = (isFirstPage: boolean) => {
        // Top Teal Banner
        doc.setFillColor(brandTeal.r, brandTeal.g, brandTeal.b);
        doc.rect(margin, currentY, contentWidth, isFirstPage ? 22 : 12, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(isFirstPage ? 14 : 10);
        doc.setTextColor(255, 255, 255);
        doc.text(
            'STARS OPERATIONS  |  DMS DELIVERY SUMMARY REPORT',
            margin + 6,
            currentY + (isFirstPage ? 11 : 8)
        );

        if (isFirstPage) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(230, 250, 248);
            doc.text(
                'Courier Telemetry, Proof of Delivery (POD) Tracking & SLA Compliance Audit',
                margin + 6,
                currentY + 17
            );
        }

        currentY += isFirstPage ? 26 : 16;
    };

    // Helper: Page footer
    const drawPageFooter = (pageNum: number, totalPagesPlaceholder = 'Page') => {
        doc.setDrawColor(borderGray.r, borderGray.g, borderGray.b);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(textGray.r, textGray.g, textGray.b);
        doc.text('Confidential - Generated by STARS Operations System', margin, pageHeight - 7);
        doc.text(
            `${totalPagesPlaceholder} ${pageNum}`,
            pageWidth - margin,
            pageHeight - 7,
            { align: 'right' }
        );
    };

    // --- Page 1: Header & Executive Summary ---
    drawPageHeader(true);

    // Metadata Bar
    doc.setFillColor(cardBg.r, cardBg.g, cardBg.b);
    doc.setDrawColor(borderGray.r, borderGray.g, borderGray.b);
    doc.roundedRect(margin, currentY, contentWidth, 14, 2, 2, 'DF');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(textGray.r, textGray.g, textGray.b);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin + 6, currentY + 9);
    doc.text(`Scope: ${filterName}`, margin + 70, currentY + 9);
    doc.text(`SLA Benchmark: 95.0% Target`, margin + 120, currentY + 9);

    currentY += 19;

    // --- KPI Cards Grid (4 boxes) ---
    const cardWidth = (contentWidth - 9) / 4;
    const cardHeight = 22;

    const kpiMetrics = [
        { label: 'Total Shipments', value: stats.total.toString(), color: brandTeal },
        { label: 'In Transit', value: stats.inTransit.toString(), color: warningAmber },
        { label: 'Delivered (POD)', value: stats.delivered.toString(), color: successGreen },
        { label: 'SLA On-Time Rate', value: `${performance.onTimePercentage}%`, color: performance.onTimePercentage >= 95 ? successGreen : warningAmber },
    ];

    kpiMetrics.forEach((m, idx) => {
        const x = margin + idx * (cardWidth + 3);
        doc.setFillColor(cardBg.r, cardBg.g, cardBg.b);
        doc.setDrawColor(borderGray.r, borderGray.g, borderGray.b);
        doc.roundedRect(x, currentY, cardWidth, cardHeight, 2, 2, 'DF');

        // Color accent pill on left
        doc.setFillColor(m.color.r, m.color.g, m.color.b);
        doc.rect(x, currentY, 2.5, cardHeight, 'F');

        // Label
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(textGray.r, textGray.g, textGray.b);
        doc.text(m.label.toUpperCase(), x + 6, currentY + 7);

        // Value
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
        doc.text(m.value, x + 6, currentY + 16);
    });

    currentY += cardHeight + 8;

    // --- Section: Performance & Status Distribution Breakdown ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
    doc.text('Operational Status & SLA Breakdown', margin, currentY);
    currentY += 5;

    // Table of status counts
    const statusBreakdown = [
        {
            status: 'Delivered (Proof of Delivery Confirmed)',
            count: stats.delivered,
            pct: stats.total > 0 ? ((stats.delivered / stats.total) * 100).toFixed(1) + '%' : '0%',
            slaDesc: 'Completed & Verified'
        },
        {
            status: 'In Transit / Driver Out for Delivery',
            count: stats.inTransit,
            pct: stats.total > 0 ? ((stats.inTransit / stats.total) * 100).toFixed(1) + '%' : '0%',
            slaDesc: 'Active Live Telemetry'
        },
        {
            status: 'Ready / Dispatched to DMS',
            count: Math.max(0, stats.total - (stats.delivered + stats.inTransit + stats.failed)),
            pct: stats.total > 0 ? (((stats.total - (stats.delivered + stats.inTransit + stats.failed)) / stats.total) * 100).toFixed(1) + '%' : '0%',
            slaDesc: 'Awaiting Driver Pickup'
        },
        {
            status: 'Delivery Exceptions / Failed Delivery',
            count: stats.failed,
            pct: stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) + '%' : '0%',
            slaDesc: stats.failed > 0 ? 'Requires Operations Action' : 'Optimal Zero'
        },
    ];

    // Status Table Header
    doc.setFillColor(brandTeal.r, brandTeal.g, brandTeal.b);
    doc.rect(margin, currentY, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('STATUS CATEGORY', margin + 4, currentY + 4.8);
    doc.text('COUNT', margin + 85, currentY + 4.8);
    doc.text('PERCENTAGE', margin + 115, currentY + 4.8);
    doc.text('OPERATIONAL CONTEXT', margin + 145, currentY + 4.8);
    currentY += 7;

    statusBreakdown.forEach((row, idx) => {
        const isAlt = idx % 2 === 1;
        if (isAlt) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, currentY, contentWidth, 6.5, 'F');
        }
        doc.setDrawColor(borderGray.r, borderGray.g, borderGray.b);
        doc.line(margin, currentY + 6.5, margin + contentWidth, currentY + 6.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
        doc.text(row.status, margin + 4, currentY + 4.5);
        doc.setFont('helvetica', 'bold');
        doc.text(row.count.toString(), margin + 85, currentY + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.text(row.pct, margin + 115, currentY + 4.5);
        doc.setTextColor(textGray.r, textGray.g, textGray.b);
        doc.text(row.slaDesc, margin + 145, currentY + 4.5);

        currentY += 6.5;
    });

    currentY += 8;

    // --- Section: Top Delivery Areas & Driver Workload Highlights ---
    const areaMap: Record<string, number> = {};
    const driverMap: Record<string, number> = {};
    deliveries.forEach(d => {
        const area = (d.area || 'Metro Manila Area').trim();
        areaMap[area] = (areaMap[area] || 0) + 1;
        const driver = (d.courierEmployeeId || 'Unassigned / Auto').trim();
        driverMap[driver] = (driverMap[driver] || 0) + 1;
    });

    const topAreas = Object.entries(areaMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    const topDrivers = Object.entries(driverMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4);

    // Two side-by-side summary boxes
    const halfWidth = (contentWidth - 6) / 2;

    // Left Box: Regional Density
    doc.setFillColor(cardBg.r, cardBg.g, cardBg.b);
    doc.setDrawColor(borderGray.r, borderGray.g, borderGray.b);
    doc.roundedRect(margin, currentY, halfWidth, 34, 2, 2, 'DF');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
    doc.text('Top Delivery Areas / Sectors', margin + 5, currentY + 7);

    topAreas.forEach(([area, count], i) => {
        const rowY = currentY + 13 + i * 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(textGray.r, textGray.g, textGray.b);
        const truncated = area.length > 25 ? area.substring(0, 23) + '..' : area;
        doc.text(`${i + 1}. ${truncated}`, margin + 5, rowY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
        doc.text(`${count} orders`, margin + halfWidth - 6, rowY, { align: 'right' });
    });

    // Right Box: Courier Allocations
    const rightX = margin + halfWidth + 6;
    doc.setFillColor(cardBg.r, cardBg.g, cardBg.b);
    doc.setDrawColor(borderGray.r, borderGray.g, borderGray.b);
    doc.roundedRect(rightX, currentY, halfWidth, 34, 2, 2, 'DF');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
    doc.text('Courier / Driver Volume Distribution', rightX + 5, currentY + 7);

    topDrivers.forEach(([driver, count], i) => {
        const rowY = currentY + 13 + i * 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(textGray.r, textGray.g, textGray.b);
        const truncated = driver.length > 25 ? driver.substring(0, 23) + '..' : driver;
        doc.text(`${i + 1}. ${truncated}`, rightX + 5, rowY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
        doc.text(`${count} orders`, rightX + halfWidth - 6, rowY, { align: 'right' });
    });

    currentY += 40;

    // --- Section: Detailed Delivery Registry Table ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);
    doc.text('Shipment Registry Details', margin, currentY);
    currentY += 5;

    // Column widths for registry table
    // Total = 182mm (contentWidth)
    const colWaybill = 28;
    const colTask = 38;
    const colRecipient = 34;
    const colArea = 26;
    const colDriver = 24;
    const colStatus = 32;

    const drawRegistryHeader = () => {
        doc.setFillColor(darkSlate.r, darkSlate.g, darkSlate.b);
        doc.rect(margin, currentY, contentWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);

        let cx = margin + 3;
        doc.text('WAYBILL NO', cx, currentY + 4.8);
        cx += colWaybill;
        doc.text('STARS TASK REF', cx, currentY + 4.8);
        cx += colTask;
        doc.text('RECIPIENT', cx, currentY + 4.8);
        cx += colRecipient;
        doc.text('AREA / DEST', cx, currentY + 4.8);
        cx += colArea;
        doc.text('DRIVER ID', cx, currentY + 4.8);
        cx += colDriver;
        doc.text('DMS STATUS', cx, currentY + 4.8);

        currentY += 7;
    };

    drawRegistryHeader();

    let pageNumber = 1;

    deliveries.forEach((d, idx) => {
        // Page break check (leave room for row and footer)
        if (currentY > pageHeight - 20) {
            drawPageFooter(pageNumber);
            doc.addPage();
            pageNumber++;
            currentY = 14;
            drawPageHeader(false);
            drawRegistryHeader();
        }

        const isAlt = idx % 2 === 1;
        if (isAlt) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, currentY, contentWidth, 6.5, 'F');
        }

        doc.setDrawColor(borderGray.r, borderGray.g, borderGray.b);
        doc.line(margin, currentY + 6.5, margin + contentWidth, currentY + 6.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(darkSlate.r, darkSlate.g, darkSlate.b);

        let cx = margin + 3;
        // Waybill
        const wb = d.dmsWaybillNo || 'Pending';
        doc.setFont('helvetica', 'bold');
        doc.text(wb.length > 15 ? wb.substring(0, 14) + '..' : wb, cx, currentY + 4.5);
        doc.setFont('helvetica', 'normal');

        // Task Ref / Title
        cx += colWaybill;
        const taskText = d.taskNumber ? `#${d.taskNumber}` : (d.taskTitle || 'Delivery Task');
        doc.text(taskText.length > 22 ? taskText.substring(0, 20) + '..' : taskText, cx, currentY + 4.5);

        // Recipient
        cx += colTask;
        const recip = d.recipientName || 'Operations';
        doc.text(recip.length > 20 ? recip.substring(0, 18) + '..' : recip, cx, currentY + 4.5);

        // Area
        cx += colRecipient;
        const area = d.area || (d.deliveryAddress ? d.deliveryAddress.substring(0, 16) : 'Metro Manila');
        doc.text(area.length > 16 ? area.substring(0, 15) + '..' : area, cx, currentY + 4.5);

        // Driver
        cx += colArea;
        const driver = d.courierEmployeeId || 'Auto/Pool';
        doc.text(driver.length > 14 ? driver.substring(0, 13) + '..' : driver, cx, currentY + 4.5);

        // Status
        cx += colDriver;
        const st = d.dmsStatus || 'Pending';
        if (st.toLowerCase().includes('delivered') || st.toLowerCase().includes('completed')) {
            doc.setTextColor(successGreen.r, successGreen.g, successGreen.b);
        } else if (st.toLowerCase().includes('transit') || st.toLowerCase().includes('pickup') || st.toLowerCase().includes('out')) {
            doc.setTextColor(warningAmber.r, warningAmber.g, warningAmber.b);
        } else if (st.toLowerCase().includes('fail') || st.toLowerCase().includes('cancel')) {
            doc.setTextColor(dangerRed.r, dangerRed.g, dangerRed.b);
        } else {
            doc.setTextColor(brandTeal.r, brandTeal.g, brandTeal.b);
        }
        doc.setFont('helvetica', 'bold');
        doc.text(st.length > 18 ? st.substring(0, 17) + '..' : st, cx, currentY + 4.5);

        currentY += 6.5;
    });

    // Draw final page footer
    drawPageFooter(pageNumber);

    // Save and download PDF
    const timestamp = new Date().toISOString().slice(0, 10);
    doc.save(`STARS_Delivery_Summary_Report_${timestamp}.pdf`);
};
