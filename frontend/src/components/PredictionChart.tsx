import React from 'react';

interface Props {
    title: string;
    imageSrc: string;
    description?: string;
}

const PredictionChart: React.FC<Props> = ({ title, imageSrc, description }) => {
    return (
        <div className="card prediction-card">
            <div className="card__header prediction-header">
                <span className="prediction-title">{title}</span>
                <div className="status-indicator">
                    <span className="status-dot"></span>
                    <span className="status-text">Live Forecast</span>
                </div>
            </div>
            <div className="card__body prediction-body">
                <div className="prediction-image-container">
                    <img src={imageSrc} alt={title} className="prediction-image" />
                </div>
                {description && (
                    <div className="prediction-meta">
                        {description}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PredictionChart;