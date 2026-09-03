import React from 'react';
import { motion } from 'framer-motion';

export default function KPICard({
  label,
  value,
  subtext,
  icon: Icon,
  iconColor = 'var(--primary)',
  iconBg = 'rgba(59, 130, 246, 0.12)',
  variants
}) {
  return (
    <motion.div
      variants={variants}
      className="kpi-card"
      style={{
        padding: '1.35rem 1.5rem',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span className="kpi-label" style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        {Icon && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: iconBg,
              color: iconColor,
              flexShrink: 0
            }}
          >
            <Icon size={18} color={iconColor} />
          </div>
        )}
      </div>

      <div style={{ margin: '0.4rem 0 0.25rem 0' }}>
        <span className="kpi-value" style={{ fontSize: '2.25rem', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em' }}>
          {value}
        </span>
      </div>

      {subtext && (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.85, fontWeight: 500 }}>
          {subtext}
        </span>
      )}
    </motion.div>
  );
}
