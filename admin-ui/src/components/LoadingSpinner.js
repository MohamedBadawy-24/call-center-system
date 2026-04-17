import React from 'react';

const LoadingSpinner = ({ fullPage = false }) => {
  const spinner = (
    <div className="spinner-container">
      <div className="spinner"></div>
    </div>
  );

  if (fullPage) {
    return (
      <div className="full-page-spinner">
        {spinner}
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;
