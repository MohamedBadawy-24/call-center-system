import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Download, Search, Filter } from 'lucide-react';
import { api } from '../api/client';
import { useLanguage } from '../hooks/useLanguage';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';

export default function QualityAgentStats() {
  const { t, language } = useLanguage();
  const isRtl = language === 'ar';
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('daily');
  const [search, setSearch] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/quality/agent-stats?period=${period}`);
      setStats(res.data);
    } catch (err) {
      toast.error('Failed to fetch agent stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [period]);

  const handleExport = async () => {
    try {
      const response = await api.get(`/quality/export-agent-stats?period=${period}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Agent_Stats_${period}_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error('Failed to export stats');
    }
  };

  const filteredStats = stats.filter(s => s.agentName.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <motion.div dir="auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 0 }}>
          <Filter size={32} color="var(--primary)" />
          {t('agentStats') || 'Agent Stats'}
        </h1>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select 
            dir="auto"
            className="glass-input" 
            value={period} 
            onChange={(e) => setPeriod(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)' }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          
          <button dir="auto" className="btn-primary" onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={16} /> {t('exportData') || 'Export to Excel'}
          </button>
        </div>
      </div>

      <div className="search-container" style={{ marginBottom: '2rem' }}>
        <Search className="search-icon" size={20} />
        <input 
          dir="auto"
          type="text" 
          placeholder={t('searchPlaceholder') || 'Search by agent name...'} 
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
        <table dir="auto" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: isRtl ? 'right' : 'left' }}>{t('date')}</th>
              <th style={{ textAlign: isRtl ? 'right' : 'left' }}>{t('agentName')}</th>
              <th style={{ textAlign: isRtl ? 'right' : 'left' }}>{t('totalCalls')}</th>
              <th style={{ color: 'var(--success)', textAlign: isRtl ? 'right' : 'left' }}>{t('completed')}</th>
              <th style={{ color: 'var(--warning)', textAlign: isRtl ? 'right' : 'left' }}>{t('partial')}</th>
              <th style={{ color: 'var(--danger)', textAlign: isRtl ? 'right' : 'left' }}>{t('disqualified')}</th>
              <th style={{ color: 'var(--accent)', textAlign: isRtl ? 'right' : 'left' }}>{t('refused') || 'Refused'}</th>
              <th style={{ textAlign: isRtl ? 'right' : 'left' }}>{t('avgDuration')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredStats.map((row, idx) => {
              const mins = Math.floor(row.avgDurationSecs / 60);
              const secs = row.avgDurationSecs % 60;
              const durationStr = isRtl ? `${mins} دقيقة ${secs} ثانية` : `${mins}m ${secs}s`;
              
              return (
                <motion.tr key={`${row.agentId}-${row.date}-${idx}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <td style={{ fontWeight: 800, color: 'var(--primary)' }}>{row.date}</td>
                  <td style={{ fontWeight: 800 }}>{row.agentName}</td>
                  <td style={{ fontWeight: 700 }}>{row.totalCalls}</td>
                  <td style={{ fontWeight: 700, color: 'var(--success)' }}>{row.completedSurveys}</td>
                  <td style={{ fontWeight: 700, color: 'var(--warning)' }}>{row.partialSurveys}</td>
                  <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{row.disqualifiedCalls}</td>
                  <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{row.refusedCalls}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{durationStr}</td>
                </motion.tr>
              );
            })}
            {filteredStats.length === 0 && (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>{t('noDataFound')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
