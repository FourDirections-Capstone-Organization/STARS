import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnnouncementsTab, {
    getArchivedStorageKey,
    getArchivedAnnouncementIds,
    archiveAnnouncementId,
    unarchiveAnnouncementId
} from '../components/AnnouncementsTab/AnnouncementsTab';
import AnnouncementDetailModal, { AnnouncementItem } from '../components/AnnouncementsTab/AnnouncementDetailModal';
import api from '../api';

vi.mock('../api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        upload: vi.fn(),
    },
}));

describe('Announcement Expiration & Archiving / Deletion (Frontend-Only Fix)', () => {
    const mockAnnouncements: AnnouncementItem[] = [
        {
            id: 'ann-1-no-expiry',
            title: 'Critical Safety Protocol Notice',
            content: 'Please ensure all field vehicles are inspected daily before dispatch.',
            effectiveDate: '2026-11-01T08:00:00Z',
            expiryDate: undefined, // NO expiration date (legacy notice)
            priority: 'Urgent',
            isPublic: true,
            createdById: 'user-manager-1',
            createdByName: 'John Doe',
            createdByRole: 'Manager',
            createdAt: '2026-11-01T08:00:00Z',
            isAcknowledged: false,
            acknowledgmentCount: 3,
            acknowledgments: [],
            comments: [],
        },
        {
            id: 'ann-2-with-expiry',
            title: 'Office Holiday Schedule',
            content: 'Offices will be closed on Thanksgiving Day.',
            effectiveDate: '2026-11-15T08:00:00Z',
            expiryDate: '2026-11-30T23:59:00Z', // HAS expiration date
            priority: 'Normal',
            isPublic: false,
            targetRoles: 'All Users',
            createdById: 'user-manager-1',
            createdByName: 'Jane Smith',
            createdByRole: 'Coordinator',
            createdAt: '2026-11-15T08:00:00Z',
            isAcknowledged: true,
            acknowledgmentCount: 5,
            acknowledgments: [],
            comments: [],
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        (api.get as any).mockResolvedValue({
            data: {
                isSuccess: true,
                data: mockAnnouncements,
            },
        });
    });

    afterEach(() => {
        localStorage.clear();
    });

    describe('Storage Utility Functions', () => {
        it('manages archived IDs in localStorage correctly', () => {
            const userId = 'test-user-123';
            expect(getArchivedAnnouncementIds(userId)).toEqual([]);

            // Archive
            const updated = archiveAnnouncementId('ann-1-no-expiry', userId);
            expect(updated).toEqual(['ann-1-no-expiry']);
            expect(getArchivedAnnouncementIds(userId)).toEqual(['ann-1-no-expiry']);

            // Idempotent archive
            const reArchived = archiveAnnouncementId('ann-1-no-expiry', userId);
            expect(reArchived).toEqual(['ann-1-no-expiry']);

            // Unarchive
            const unarchived = unarchiveAnnouncementId('ann-1-no-expiry', userId);
            expect(unarchived).toEqual([]);
            expect(getArchivedAnnouncementIds(userId)).toEqual([]);
        });
    });

    describe('AnnouncementsTab List & Filtering with Archive Action', () => {
        it('renders "Archive" button ONLY on announcements without an expiration date', async () => {
            render(<AnnouncementsTab canCreate={true} />);

            await waitFor(() => {
                expect(screen.getByText('Critical Safety Protocol Notice')).toBeInTheDocument();
                expect(screen.getByText('Office Holiday Schedule')).toBeInTheDocument();
            });

            // The one without expiry date displays "No Expiry Date" and "Archive" button
            expect(screen.getByText('No Expiry Date')).toBeInTheDocument();
            const archiveBtn = screen.getByRole('button', { name: /^archive$/i });
            expect(archiveBtn).toBeInTheDocument();

            // The one with expiry date has expiry info and does NOT have an archive button
            const allCardArchiveBtns = document.querySelectorAll('.ann-btn-archive');
            expect(allCardArchiveBtns).toHaveLength(1);
        });

        it('archives the announcement when clicking "Archive", removing it from active notices', async () => {
            render(<AnnouncementsTab canCreate={true} />);

            await waitFor(() => {
                expect(screen.getByText('Critical Safety Protocol Notice')).toBeInTheDocument();
            });

            // Click Archive button on the non-expiring announcement
            const archiveBtn = screen.getByRole('button', { name: /^archive$/i });
            fireEvent.click(archiveBtn);

            // Notice is removed from active cards list
            await waitFor(() => {
                expect(screen.queryByText('Critical Safety Protocol Notice')).not.toBeInTheDocument();
            });

            // The other announcement with expiry date is still displayed
            expect(screen.getByText('Office Holiday Schedule')).toBeInTheDocument();

            // The "Archived" chip shows count (1)
            expect(screen.getByRole('button', { name: /archived \(1\)/i })).toBeInTheDocument();
        });

        it('displays archived announcements in "Archived" tab and allows restoring them', async () => {
            render(<AnnouncementsTab canCreate={true} />);

            await waitFor(() => {
                expect(screen.getByText('Critical Safety Protocol Notice')).toBeInTheDocument();
            });

            // Archive it
            const archiveBtn = screen.getByRole('button', { name: /^archive$/i });
            fireEvent.click(archiveBtn);

            await waitFor(() => {
                expect(screen.queryByText('Critical Safety Protocol Notice')).not.toBeInTheDocument();
            });

            // Switch to Archived filter
            const archivedTab = screen.getByRole('button', { name: /^archived/i });
            fireEvent.click(archivedTab);

            // Now the archived announcement appears with "Restore Notice" button
            await waitFor(() => {
                expect(screen.getByText('Critical Safety Protocol Notice')).toBeInTheDocument();
            });
            const restoreBtn = screen.getByRole('button', { name: /restore notice/i });
            expect(restoreBtn).toBeInTheDocument();

            // Click Restore Notice
            fireEvent.click(restoreBtn);

            // In Archived view, it is now removed (empty)
            await waitFor(() => {
                expect(screen.queryByText('Critical Safety Protocol Notice')).not.toBeInTheDocument();
            });

            // Switch back to "All Notices" tab
            const allNoticesTab = screen.getByRole('button', { name: /all notices/i });
            fireEvent.click(allNoticesTab);

            // Restored notice is visible again in active notices
            await waitFor(() => {
                expect(screen.getByText('Critical Safety Protocol Notice')).toBeInTheDocument();
            });
        });
    });

    describe('Create Announcement Modal - Expiry Date Requirement', () => {
        it('validates that Expiry Date is strictly required during creation', async () => {
            render(<AnnouncementsTab canCreate={true} />);

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /new announcement/i })).toBeInTheDocument();
            });

            // Open creation modal
            fireEvent.click(screen.getByRole('button', { name: /new announcement/i }));

            expect(screen.getByText('Create Announcement')).toBeInTheDocument();

            // Fill title and content but leave Expiry Date empty
            const titleInput = screen.getByPlaceholderText(/e\.g\. Critical System Maintenance/i);
            const contentInput = screen.getByPlaceholderText(/Write your announcement details here/i);

            fireEvent.change(titleInput, { target: { value: 'Mandatory Policy Update' } });
            fireEvent.change(contentInput, { target: { value: 'All personnel must review the updated guidelines.' } });

            // Click publish
            const publishBtn = screen.getByRole('button', { name: /publish announcement/i });
            fireEvent.click(publishBtn);

            // Form error is displayed requiring expiry date
            await waitFor(() => {
                expect(screen.getByText('Announcement expiry date is required.')).toBeInTheDocument();
            });

            // API upload must NOT be called
            expect(api.upload).not.toHaveBeenCalled();
        });

        it('validates that Expiry Date must not precede the Effective Date', async () => {
            render(<AnnouncementsTab canCreate={true} />);

            await waitFor(() => {
                fireEvent.click(screen.getByRole('button', { name: /new announcement/i }));
            });

            const titleInput = screen.getByPlaceholderText(/e\.g\. Critical System Maintenance/i);
            const contentInput = screen.getByPlaceholderText(/Write your announcement details here/i);
            fireEvent.change(titleInput, { target: { value: 'Testing Date Bounds' } });
            fireEvent.change(contentInput, { target: { value: 'Testing date bounds validation.' } });

            // Find datetime inputs: first is effectiveDate, second is expiryDate
            const dateInputs = document.querySelectorAll('input[type="datetime-local"]');
            expect(dateInputs.length).toBe(2);

            const effectiveInput = dateInputs[0];
            const expiryInput = dateInputs[1];

            // Set effective date in future and expiry date before effective date
            fireEvent.change(effectiveInput, { target: { value: '2026-12-10T10:00' } });
            fireEvent.change(expiryInput, { target: { value: '2026-12-05T10:00' } });

            const publishBtn = screen.getByRole('button', { name: /publish announcement/i });
            fireEvent.click(publishBtn);

            await waitFor(() => {
                expect(screen.getByText('Expiry date must not precede the effective date.')).toBeInTheDocument();
            });
            expect(api.upload).not.toHaveBeenCalled();
        });

        it('populates Expiry Date using quick-pick buttons (+3d, +7d, +14d, +30d) and submits successfully', async () => {
            (api.upload as any).mockResolvedValue({
                data: {
                    isSuccess: true,
                    data: { id: 'new-ann-id' },
                },
            });

            render(<AnnouncementsTab canCreate={true} />);

            await waitFor(() => {
                fireEvent.click(screen.getByRole('button', { name: /new announcement/i }));
            });

            const titleInput = screen.getByPlaceholderText(/e\.g\. Critical System Maintenance/i);
            const contentInput = screen.getByPlaceholderText(/Write your announcement details here/i);
            fireEvent.change(titleInput, { target: { value: 'Valid Future Announcement' } });
            fireEvent.change(contentInput, { target: { value: 'Details of the announcement.' } });

            // Click +7d quick-pick button
            const plus7dBtn = screen.getByRole('button', { name: '+7d' });
            fireEvent.click(plus7dBtn);

            const dateInputs = document.querySelectorAll('input[type="datetime-local"]');
            const expiryInput = dateInputs[1] as HTMLInputElement;
            expect(expiryInput.value).not.toBe('');

            // Click publish
            const publishBtn = screen.getByRole('button', { name: /publish announcement/i });
            fireEvent.click(publishBtn);

            await waitFor(() => {
                expect(api.upload).toHaveBeenCalledTimes(1);
            });

            // Verify FormData contains expiryDate
            const uploadCall = (api.upload as any).mock.calls[0];
            expect(uploadCall[0]).toBe('/api/Announcement');
            const formDataArg: FormData = uploadCall[1];
            expect(formDataArg.get('title')).toBe('Valid Future Announcement');
            expect(formDataArg.get('expiryDate')).toBeTruthy();
        });
    });

    describe('AnnouncementDetailModal', () => {
        it('renders "No Expiry Date" and allows archiving from the detail modal for non-expiring notice', () => {
            const onToggleArchive = vi.fn();
            render(
                <AnnouncementDetailModal
                    announcement={mockAnnouncements[0]} // no expiry
                    isArchived={false}
                    onClose={vi.fn()}
                    onToggleArchive={onToggleArchive}
                />
            );

            expect(screen.getByText('No Expiry Date')).toBeInTheDocument();
            const archiveBtn = screen.getByRole('button', { name: /archive notice/i });
            expect(archiveBtn).toBeInTheDocument();

            fireEvent.click(archiveBtn);
            expect(onToggleArchive).toHaveBeenCalledWith('ann-1-no-expiry', false);
        });

        it('does NOT render Archive button in detail modal when announcement has an expiration date', () => {
            const onToggleArchive = vi.fn();
            render(
                <AnnouncementDetailModal
                    announcement={mockAnnouncements[1]} // has expiry date
                    isArchived={false}
                    onClose={vi.fn()}
                    onToggleArchive={onToggleArchive}
                />
            );

            expect(screen.queryByRole('button', { name: /archive notice/i })).not.toBeInTheDocument();
            expect(screen.getByText(/Expires:/i)).toBeInTheDocument();
        });
    });
});
