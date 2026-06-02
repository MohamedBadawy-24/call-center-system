import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { History, TrendingDown } from 'lucide-react';
import { api } from '../api/client';
import { UIContext } from '../context/UIContext';
import { toast } from 'react-toastify';
import LoadingSpinner from '../components/LoadingSpinner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts';

export default function QualityDropOff() {
  const { t } = useContext(UIContext);
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

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: 0 }}>
          <TrendingDown size={32} color="var(--danger)" />
          {t('dropOffReport') || 'Drop-Off Report'}
        </h1>

        <div>
          <select 
            className="glass-input" 
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
        <h3 style={{ marginBottom: '1.5rem' }}>Drop-Off Rate per Question</h3>
        {chartLoading ? (
          <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner"></div>
          </div>
        ) : dropOffData.length === 0 ? (
          <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            No data available for this survey.
          </div>
        ) : (
          <div style={{ height: '400px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dropOffData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)' }} />
                <YAxis stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)' }} label={{ value: 'Drop-off %', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--card-bg)', border: 'var(--glass-border)', borderRadius: '8px' }}
                  labelStyle={{ color: 'var(--primary)', fontWeight: 'bold' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  formatter={(value, name, props) => {
                    if (name === 'dropOffRatePct') return [`${value}%`, 'Drop-off Rate'];
                    return [value, name];
                  }}
                />
                <Bar dataKey="dropOffRatePct" fill="var(--danger)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="dropOffDisplay" position="top" fill="var(--text-primary)" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="glass-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.5rem' }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Question Text</th>
              <th>Answered Count</th>
              <th>Total Responses</th>
              <th style={{ color: 'var(--danger)' }}>Drop-Off Rate</th>
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
