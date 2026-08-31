import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssetsTooltip from '../../components/AssetsTooltip';
import CampaignAssetsModal from '../../components/CampaignAssetsModal';
import { UIContext } from '../../context/UIContext';
import { api } from '../../api/client';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  SOCKET_BASE: 'http://localhost:3000',
}));

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const mockUIContext = {
  t: (key) => key,
  language: 'en',
  theme: 'dark',
};

const renderWithContext = (component) => {
  return render(
    <UIContext.Provider value={mockUIContext}>
      {component}
    </UIContext.Provider>
  );
};

describe('AssetsTooltip Component', () => {
  it('renders children and shows portal tooltip on mouse enter with notes and files', async () => {
    const mockAssets = {
      notes: 'Important research guidelines for Q3',
      attachments: [
        { _id: 'att1', category: 'spss', fileName: 'data.sav' },
        { _id: 'att2', category: 'report', fileName: 'final.pdf' },
      ],
    };

    renderWithContext(
      <AssetsTooltip assets={mockAssets} campaignTitle="Test Campaign">
        <button data-testid="asset-trigger">📎</button>
      </AssetsTooltip>
    );

    const trigger = screen.getByTestId('asset-trigger');
    expect(trigger).toBeInTheDocument();

    // Hover trigger
    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      expect(screen.getByText(/Important research guidelines/i)).toBeInTheDocument();
      expect(screen.getByText(/SPSS Data/i)).toBeInTheDocument();
      expect(screen.getByText(/Final Report/i)).toBeInTheDocument();
    });

    // Leave trigger
    fireEvent.mouseLeave(trigger);

    await waitFor(() => {
      expect(screen.queryByText(/Important research guidelines/i)).not.toBeInTheDocument();
    });
  });
});

describe('CampaignAssetsModal Component', () => {
  const mockCampaign = {
    _id: 'camp123',
    title: 'Customer Satisfaction Survey 2026',
    assets: {
      notes: 'Initial wave notes',
      attachments: [
        {
          _id: 'att101',
          category: 'spss',
          fileName: 'wave1_data.sav',
          fileSize: 1048576, // 1MB
          fileUrl: '/uploads/campaigns/camp123/wave1_data.sav',
          uploadedAt: '2026-08-30T10:00:00Z',
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with campaign title, notes, and attachments when open', () => {
    renderWithContext(
      <CampaignAssetsModal
        isOpen={true}
        onClose={vi.fn()}
        campaign={mockCampaign}
        onAssetsUpdated={vi.fn()}
      />
    );

    expect(screen.getByText(/Customer Satisfaction Survey 2026/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Initial wave notes')).toBeInTheDocument();
    expect(screen.getByText('wave1_data.sav')).toBeInTheDocument();
  });

  it('allows editing and saving notes', async () => {
    const onAssetsUpdated = vi.fn();
    api.put.mockResolvedValueOnce({
      data: {
        success: true,
        assets: { notes: 'Updated notes', attachments: mockCampaign.assets.attachments },
      },
    });

    renderWithContext(
      <CampaignAssetsModal
        isOpen={true}
        onClose={vi.fn()}
        campaign={mockCampaign}
        onAssetsUpdated={onAssetsUpdated}
      />
    );

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated notes' } });

    const saveBtn = screen.getByRole('button', { name: /Save Notes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/admin/campaigns/camp123/notes', {
        notes: 'Updated notes',
      });
      expect(onAssetsUpdated).toHaveBeenCalledWith('camp123', {
        notes: 'Updated notes',
        attachments: mockCampaign.assets.attachments,
      });
    });
  });

  it('handles attachment deletion with confirmation', async () => {
    const onAssetsUpdated = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockResolvedValueOnce({
      data: {
        success: true,
        assets: { notes: 'Initial wave notes', attachments: [] },
      },
    });

    renderWithContext(
      <CampaignAssetsModal
        isOpen={true}
        onClose={vi.fn()}
        campaign={mockCampaign}
        onAssetsUpdated={onAssetsUpdated}
      />
    );

    const deleteBtn = screen.getByTitle('Delete');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/admin/campaigns/camp123/attachments/att101');
      expect(onAssetsUpdated).toHaveBeenCalledWith('camp123', {
        notes: 'Initial wave notes',
        attachments: [],
      });
    });
  });
});
