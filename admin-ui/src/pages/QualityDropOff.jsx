import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { History, TrendingDown } from 'lucide-react';
import { api } from '../api/client';
import { useLanguage } from '../hooks/useLanguage';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function QualityDropOff() {
  const { t, language } = useLanguage();
  const isRtl = language === 'ar';
  const [surveys, setSurveys] = useState([]);
  const [selectedSurvey, setSelectedSurvey] = useState('');
  const [dropOffData, setDropOffData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    const fetchSurveys = async () => {
      try {
        const res = await api.get('/admin/surveys-stats');
        setSurveys(res.data);
        if (res.data.length > 0) setSelectedSurvey(res.data[0]._id);
      } catch (err) {
        toast.error('Failed to fetch surveys');
      } finally {
        setLoading(false);
      }
    };
    fetchSurveys();
  }, []);

  useEffect(() => {
    if (!selectedSurvey) return;
    const fetchDropOff = async () => {
      setChartLoading(true);
      try {
        const res = await api.get(`/quality/drop-off/${selectedSurvey}`);
        const formattedData = res.data.map((d, i) => ({
          ...d,
          name: `Q${i + 1}`,
          dropOffRatePct: (d.dropOffRate * 100).toFixed(1),
          dropOffDisplay: `${(d.dropOffRate * 100).toFixed(1)}%`
        }));
        setDropOffData(formattedData);
      } catch (err) {
        toast.error('Failed to fetch drop-off data');
      } finally {
        setChartLoading(false);
      }
    };
    fetchDropOff();
  }, [selectedSurvey]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div dir="auto" style={{
          backgroundColor: 'var(--card-bg, #1e293b)',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
          fontSize: '0.85rem',
          color: 'var(--text-primary)'
        }}>
          <div style={{ fontWeight: 'bold', color: 'var(--primary)', marginBottom: '0.35rem' }}>
            {data.name}: {data.questionText}
          </div>
          <div style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: '0.25rem' }}>
            {t('dropOffRatePerQuestion')}: {data.dropOffDisplay}
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {t('answeredCount')}: {data.answeredCount} / {data.totalResponses}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) return <LoadingSpinner fullPage />;

  const dynamicChartWidth = Math.max(dropOffData.length * 40, 800);

  return (
    <motion.div dir="auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 0 }}>
          <TrendingDown size={32} color="var(--danger)" />
          {t('dropOffReport') || 'Drop-Off Report'}
        </h1>

        <div>
          <select 
            className="glass-input" 
            dir="auto"
            value={selectedSurvey} 
            onChange={(e) => setSelectedSurvey(e.target.value)}
            style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', minWidth: '250px' }}
          >
            {surveys.map(s => (
              <option key={s._id} value={s._id}>{s.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem' }}>{t('dropOffRatePerQuestion')}</h3>
        {chartLoading ? (
          <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner"></div>
          </div>
        ) : dropOffData.length === 0 ? (
          <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            {t('noDataFound')}
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            <div style={{ width: `${dynamicChartWidth}px`, height: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dropOffData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)' }} />
                  <YAxis stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)' }} label={{ value: 'Drop-off %', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="dropOffRatePct" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      <div className="glass-card table-responsive w-full overflow-x-auto" style={{ padding: '1.5rem', width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table dir="auto" style={{ width: '100%', minWidth: '600px', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: isRtl ? 'right' : 'left' }}>#</th>
              <th style={{ textAlign: isRtl ? 'right' : 'left' }}>{t('question')}</th>
              <th style={{ textAlign: isRtl ? 'right' : 'left' }}>{t('answeredCount')}</th>
              <th style={{ textAlign: isRtl ? 'right' : 'left' }}>{t('totalResponses')}</th>
              <th style={{ color: 'var(--danger)', textAlign: isRtl ? 'right' : 'left' }}>{t('dropOffRatePerQuestion')}</th>
            </tr>
          </thead>
          <tbody>
            {dropOffData.map((row, idx) => (
              <motion.tr key={row.questionId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }}>
                <td style={{ fontWeight: 800, color: 'var(--primary)' }}>Q{idx + 1}</td>
                <td>{row.questionText}</td>
                <td style={{ fontWeight: 700 }}>{row.answeredCount}</td>
                <td style={{ fontWeight: 700 }}>{row.totalResponses}</td>
                <td style={{ fontWeight: 800, color: 'var(--danger)' }}>{row.dropOffDisplay}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
